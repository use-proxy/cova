import { useRef, useEffect } from 'react';
import { useAppStore } from '../store';
import { callEdgeFunction } from '../lib/supabase';
import type { StyleBlend, RoomType, Render, Product, RoomDimensions } from '@cova/shared';

interface RenderParams {
  roomId: string;
  roomType: RoomType;
  styleBlend: StyleBlend;
  imageBase64: string;
  renderType: 'draft' | 'hd';
  dimensions?: RoomDimensions;
}

// §8.3 — exactly 6 stages in this order
const LOADING_STAGES = [
  'Analyzing your room...',
  'Measuring depth...',
  'Applying your style...',
  'Generating render...',
  'Adding finishing touches...',
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
    try {
      setRenderStatus('processing');
      setRenderError(null);
      setRenderProgress(0);
      setRenderProgressStage('Analyzing your room...');

      // render-room generates its own depth map server-side (Depth Pro → Depth Anything V2 fallback).
      // Sending a client-side depth_map_base64 is redundant and adds ~30s of latency.
      const res = await callEdgeFunction<{ render_id: string; prediction_id: string }>('render-room', {
        room_id: params.roomId,
        image_base64: params.imageBase64,
        style_blend: params.styleBlend,
        room_type: params.roomType,
        render_type: params.renderType,
        room_dimensions: params.dimensions,
      });
      setRenderProgressStage('Applying your style...');
      // Step 3: Persist calibrated dimensions to the room record (only after server confirms)
      if (params.dimensions) {
        useAppStore.getState().updateRoom(params.roomId, { dimensions: params.dimensions });
      }
      const roomBudget = useAppStore.getState().budget_max;
      await pollRenderStatus(res.render_id, params.roomType, params.styleBlend, roomBudget);
    } catch (e: unknown) {
      setRenderStatus('failed');
      setRenderError(e instanceof Error ? e.message : 'Failed to start render.');
    }
  };

  return { startRender, currentRender, renderStatus, renderProgressStage, renderProgress, renderError };
}
