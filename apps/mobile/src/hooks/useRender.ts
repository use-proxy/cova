import { useRef, useEffect } from 'react';
import { useAppStore } from '../store';
import { callEdgeFunction } from '../lib/supabase';
import { Sentry, captureProductError } from '../lib/sentry';
import type { StyleBlend, RoomType, Render, Product, RoomDimensions } from '@cova/shared';

interface RenderParams {
  roomId: string;
  roomType: RoomType;
  styleBlend: StyleBlend;
  imageBase64: string;
  renderType: 'draft' | 'hd';
  dimensions?: RoomDimensions;
}

const LOADING_STAGES = [
  'Analyzing your room',
  'Applying your style',
  'Generating render...',
  'Adding finishing touches...',
  'Almost there...',
  'Done!',
] as const;

export function useRender() {
  const {
    setCurrentRender, setRenderStatus, setRenderError,
    setRenderProgressStage, setRenderProgress, setMatchedProducts,
    currentRender, renderStatus, renderProgressStage, renderProgress, renderError,
  } = useAppStore();

  // Holds the next scheduled poll timeout — cleared on unmount to prevent state updates
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

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
    const startTime = Date.now();
    // Exponential backoff: 3s → 6s → 12s → 24s → cap at 24s
    const BACKOFF = [3000, 6000, 12000, 24000];
    let attemptIndex = 0;

    const poll = async () => {
      const elapsed = (Date.now() - startTime) / 1000;

      // Update progress stage based on elapsed time (§8.3 timing)
      if (elapsed < 5)  setRenderProgressStage(LOADING_STAGES[0]);
      else if (elapsed < 15) setRenderProgressStage(LOADING_STAGES[1]);
      else if (elapsed < 25) setRenderProgressStage(LOADING_STAGES[2]);
      else if (elapsed < 40) setRenderProgressStage(LOADING_STAGES[3]);
      else if (elapsed < 55) setRenderProgressStage(LOADING_STAGES[4]);
      setRenderProgress(Math.min(95, (elapsed / 55) * 100));

      if (elapsed > 120) {
        setRenderStatus('failed');
        setRenderError('Render timed out. Please try again.');
        return;
      }

      try {
        const data = await callEdgeFunction<{ status: string; image_url?: string; error?: string }>(
          'get-render-status',
          { render_id: renderId },
        );

        if (data.status === 'completed' && data.image_url) {
          setRenderStatus('completed');
          setRenderProgress(100);
          setRenderProgressStage(LOADING_STAGES[5]);
          setCurrentRender({ id: renderId, image_url: data.image_url } as Render);
          await fetchMatchedProducts(data.image_url, roomType, styleBlend, budget);
          return;
        }

        if (data.status === 'failed') {
          setRenderStatus('failed');
          setRenderError(data.error ?? 'Render failed. Please try again.');
          return;
        }

        // Still processing — schedule next poll with backoff
        const delay = BACKOFF[Math.min(attemptIndex, BACKOFF.length - 1)];
        attemptIndex++;
        pollTimeoutRef.current = setTimeout(poll, delay);
      } catch {
        setRenderStatus('failed');
        setRenderError('Something went wrong. Please try again.');
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
        });
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
