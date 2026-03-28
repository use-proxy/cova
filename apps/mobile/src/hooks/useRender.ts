import { useRef, useEffect } from 'react';
import { AppState } from 'react-native';
import { useAppStore } from '../store';
import { callEdgeFunction } from '../lib/supabase';
import { Sentry, captureProductError } from '../lib/sentry';
import { track } from '../lib/posthog';
import type { StyleBlend, RoomType, Render, Product, RoomDimensions } from '@cova/shared';

interface RenderParams {
  roomId: string;
  roomType: RoomType;
  styleBlend: StyleBlend;
  imageBase64: string;
  renderType: 'draft' | 'hd';
  dimensions?: RoomDimensions;
  pinnedProducts?: Array<{ name: string; description?: string }>;
}

const LOADING_STAGES = [
  'Analyzing your room...',
  'Building your style...',
  'Creating your panorama...',
  'Almost ready...',
  'Your design is ready!',
] as const;

export function useRender() {
  const {
    setCurrentRender, setRenderStatus, setRenderError,
    setRenderProgressStage, setRenderProgress, setMatchedProducts,
    currentRender, renderStatus, renderProgressStage, renderProgress, renderError,
  } = useAppStore();

  // Holds the next scheduled poll timeout — cleared on unmount to prevent state updates
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderStartTimeRef = useRef<number>(0);
  const activeRenderRef = useRef<{ renderId: string; roomType: RoomType; styleBlend: StyleBlend; budget: number } | null>(null);

  useEffect(() => {
    // AppState listener: resume polling when app returns to foreground
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && activeRenderRef.current) {
        const { renderId, roomType, styleBlend, budget } = activeRenderRef.current;
        // Clear any stale timeout and re-poll immediately
        if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
        pollRenderStatus(renderId, roomType, styleBlend, budget);
      }
    });

    return () => {
      subscription.remove();
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMatchedProducts = async (imageUrl: string, roomType: RoomType, styleBlend: StyleBlend, budget: number) => {
    try {
      const embedRes = await callEdgeFunction<{ embedding: number[] }>('clip-embed', { image_url: imageUrl });
      const matchRes = await callEdgeFunction<{ products: Product[] }>('match-products', {
        render_embedding: embedRes.embedding,
        room_type: roomType,
        style_blend: styleBlend,
        max_price: budget,
        limit: 15,
      });
      setMatchedProducts(matchRes.products ?? []);
    } catch (e) {
      // TODO: replace with logging service
      console.error('Product matching failed:', e);
    }
  };

  const pollRenderStatus = (renderId: string, roomType: RoomType, styleBlend: StyleBlend, budget: number) => {
    setRenderStatus('processing');
    activeRenderRef.current = { renderId, roomType, styleBlend, budget };
    const startTime = Date.now();
    // Exponential backoff: 3s → 6s → 12s → 24s → cap at 24s
    const BACKOFF = [3000, 6000, 12000, 24000];
    let attemptIndex = 0;

    const poll = async () => {
      const elapsed = (Date.now() - startTime) / 1000;

      // Update progress stage based on elapsed time and server stage
      if (elapsed < 15) { setRenderProgressStage(LOADING_STAGES[0]); setRenderProgress(Math.min(15, (elapsed / 15) * 15)); }
      else if (elapsed < 45) { setRenderProgressStage(LOADING_STAGES[1]); setRenderProgress(15 + Math.min(25, ((elapsed - 15) / 30) * 25)); }
      else if (elapsed < 90) { setRenderProgressStage(LOADING_STAGES[2]); setRenderProgress(40 + Math.min(40, ((elapsed - 45) / 45) * 40)); }
      else { setRenderProgressStage(LOADING_STAGES[3]); setRenderProgress(Math.min(95, 80 + ((elapsed - 90) / 30) * 15)); }

      if (elapsed > 180) {
        setRenderStatus('failed');
        setRenderError('Render timed out. Please try again.');
        return;
      }

      try {
        const data = await callEdgeFunction<{ status: string; image_url?: string; panoramic_url?: string; error?: string; stage?: string }>(
          'get-render-status',
          { render_id: renderId },
        );

        // Use server-reported stage to set more accurate progress labels
        if (data.stage === 'panoramic') {
          setRenderProgressStage(LOADING_STAGES[2]); // "Creating your panorama..."
          setRenderProgress(50);
        } else if (data.stage === 'rendering') {
          setRenderProgressStage(LOADING_STAGES[1]); // "Building your style..."
        }

        if (data.status === 'completed' && data.image_url) {
          activeRenderRef.current = null;
          setRenderStatus('completed');
          setRenderProgress(100);
          setRenderProgressStage(LOADING_STAGES[4]); // "Your design is ready!"
          setCurrentRender({
            id: renderId,
            image_url: data.image_url,
            panoramic_url: data.panoramic_url ?? null,
          } as Render);
          track('render_completed', {
            room_id: renderId,
            duration_ms: Date.now() - renderStartTimeRef.current,
            success: true,
          });
          await fetchMatchedProducts(data.image_url, roomType, styleBlend, budget);
          return;
        }

        if (data.status === 'failed') {
          activeRenderRef.current = null;
          setRenderStatus('failed');
          setRenderError(data.error ?? 'Render failed. Please try again.');
          track('render_completed', {
            room_id: renderId,
            duration_ms: Date.now() - renderStartTimeRef.current,
            success: false,
          });
          return;
        }

        // Still processing — schedule next poll with backoff
        const delay = BACKOFF[Math.min(attemptIndex, BACKOFF.length - 1)];
        attemptIndex++;
        pollTimeoutRef.current = setTimeout(poll, delay);
      } catch (pollErr) {
        const msg = pollErr instanceof Error ? pollErr.message : String(pollErr);
        console.error('Render poll error:', msg);
        setRenderStatus('failed');
        setRenderError(msg || 'Something went wrong. Please try again.');
      }
    };

    // Start first poll after 3 seconds
    pollTimeoutRef.current = setTimeout(poll, BACKOFF[0]);
  };

  const startRender = async (params: RenderParams) => {
    // Guard: empty imageBase64 means capturedImageUri was unavailable — depth will always fail.
    // Length check (< 100 chars) catches empty string and bare "data:image/jpeg;base64," with no payload.
    if (!params.imageBase64 || params.imageBase64.length < 100) {
      Sentry.addBreadcrumb({ message: 'startRender: imageBase64 empty — aborting before server call', level: 'warning' });
      captureProductError(new Error('startRender called with empty imageBase64'), 'FEATURE_6');
      setRenderStatus('failed');
      setRenderError('Could not analyze room depth. Please try a clearer photo.');
      return;
    }

    Sentry.addBreadcrumb({ message: `startRender: begin — roomId=${params.roomId} roomType=${params.roomType}`, level: 'info' });
    renderStartTimeRef.current = Date.now();
    track('render_started', {
      room_id: params.roomId,
      style_blend: params.styleBlend,
      render_type: params.renderType,
    });

    setRenderStatus('processing');
    setRenderError(null);
    setRenderProgress(0);
    setRenderProgressStage('Analyzing your room...');

    // render-room generates its own depth map server-side (Depth Pro → Depth Anything V2 fallback).
    // Retry once on failure — transient Replicate errors and cold starts can cause the first attempt to fail.
    let res: { render_id: string; prediction_id: string } | null = null;
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        Sentry.addBreadcrumb({ message: `startRender: attempt ${attempt + 1} — retrying after error`, level: 'warning' });
      }
      try {
        Sentry.addBreadcrumb({ message: `startRender: calling render-room edge function (attempt ${attempt + 1})`, level: 'info' });
        res = await callEdgeFunction<{ render_id: string; prediction_id: string }>('render-room', {
          room_id:          params.roomId,
          image_base64:     params.imageBase64,
          style_blend:      params.styleBlend,
          room_type:        params.roomType,
          render_type:      params.renderType,
          room_dimensions:  params.dimensions,
          pinned_products:  params.pinnedProducts,
        }, 120000); // 120s timeout — render-room blocks on depth map (up to 45s) + FLUX start
        Sentry.addBreadcrumb({ message: `startRender: render-room returned render_id=${res.render_id}`, level: 'info' });
        break; // success — exit retry loop
      } catch (e: unknown) {
        lastError = e;
        Sentry.addBreadcrumb({ message: `startRender: attempt ${attempt + 1} failed — ${e instanceof Error ? e.message : String(e)}`, level: 'error' });
        if (attempt === 0) {
          // Brief pause before retry so transient errors can clear
          await new Promise<void>((r) => setTimeout(r, 2000));
        }
      }
    }

    if (!res) {
      // Both attempts failed — map error code to user-friendly message and capture in Sentry
      const errMsg = lastError instanceof Error ? lastError.message : '';
      console.error('[useRender] render-room failed after 2 attempts:', errMsg, lastError);
      const isDepthError = errMsg.toLowerCase().includes('depth');
      captureProductError(
        lastError instanceof Error ? lastError : new Error(errMsg || 'render-room failed after 2 attempts'),
        'FEATURE_6',
      );
      setRenderStatus('failed');
      setRenderError(
        isDepthError
          ? 'Could not analyze room depth. Please try a clearer photo.'
          : (errMsg || 'Failed to start render.'),
      );
      return;
    }

    Sentry.addBreadcrumb({ message: 'startRender: render started, beginning poll', level: 'info' });
    setRenderProgressStage('Applying your style...');
    // Persist calibrated dimensions to the room record (only after server confirms)
    if (params.dimensions) {
      useAppStore.getState().updateRoom(params.roomId, { dimensions: params.dimensions });
    }
    const roomBudget = useAppStore.getState().budget_max;
    pollRenderStatus(res.render_id, params.roomType, params.styleBlend, roomBudget);
  };

  return { startRender, pollRenderStatus, currentRender, renderStatus, renderProgressStage, renderProgress, renderError };
}
