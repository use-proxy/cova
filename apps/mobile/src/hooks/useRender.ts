import { useAppStore } from '../store';
import { supabase, callEdgeFunction } from '../lib/supabase';
import type { StyleBlend, RoomType, Render, Product } from '@cova/shared';

interface RenderParams {
  roomId: string;
  roomType: RoomType;
  styleBlend: StyleBlend;
  imageBase64: string;
  renderType: 'draft' | 'hd';
}

export function useRender() {
  const {
    setCurrentRender, setRenderStatus, setRenderError,
    setRenderProgressStage, setRenderProgress, setMatchedProducts,
    currentRender, renderStatus, renderProgressStage, renderProgress, renderError,
  } = useAppStore();

  const fetchMatchedProducts = async (imageUrl: string, roomType: RoomType, styleBlend: StyleBlend, budget: number) => {
    try {
      const embedRes = await callEdgeFunction<{ embedding: number[] }>('clip-embed', { image_url: imageUrl });
      const matchRes = await callEdgeFunction<{ products: Product[] }>('match-products', {
        render_embedding: embedRes.embedding,
        room_type: roomType,
        style_blend: styleBlend,
        budget,
        limit: 15,
      });
      setMatchedProducts(matchRes.products ?? []);
    } catch (e) {
      console.warn('Product matching failed:', e);
    }
  };

  const pollRenderStatus = async (renderId: string, roomType: RoomType, styleBlend: StyleBlend, budget: number) => {
    setRenderStatus('processing');
    const startTime = Date.now();
    const interval = setInterval(async () => {
      try {
        const elapsed = (Date.now() - startTime) / 1000;
        setRenderProgress(Math.min(95, (elapsed / 40) * 100));
        if (elapsed < 5) setRenderProgressStage('Analyzing your room...');
        else if (elapsed < 15) setRenderProgressStage('Applying your style...');
        else if (elapsed < 30) setRenderProgressStage('Generating render...');
        else if (elapsed < 50) setRenderProgressStage('Adding finishing touches...');
        else setRenderProgressStage('Almost there...');

        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
        const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${supabaseUrl}/functions/v1/get-render-status?render_id=${renderId}`, {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': supabaseAnonKey,
          },
        });
        const data = await res.json();

        if (data.status === 'completed') {
          clearInterval(interval);
          setRenderStatus('completed');
          setRenderProgress(100);
          setRenderProgressStage('');
          setCurrentRender({ id: renderId, image_url: data.image_url } as Render);
          await fetchMatchedProducts(data.image_url, roomType, styleBlend, budget);
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setRenderStatus('failed');
          setRenderError('Render failed. Please try again.');
        } else if (elapsed > 120) {
          clearInterval(interval);
          setRenderStatus('failed');
          setRenderError('Render timed out. Please try again.');
        }
      } catch {
        clearInterval(interval);
        setRenderStatus('failed');
        setRenderError('Something went wrong. Please try again.');
      }
    }, 3000);
  };

  const startRender = async (params: RenderParams) => {
    try {
      setRenderStatus('processing');
      setRenderError(null);
      setRenderProgress(0);
      setRenderProgressStage('Analyzing your room...');
      const res = await callEdgeFunction<{ render_id: string; prediction_id: string }>('render-room', {
        room_id: params.roomId,
        image_base64: params.imageBase64,
        style_blend: params.styleBlend,
        room_type: params.roomType,
        render_type: params.renderType,
      });
      setRenderProgressStage('Applying your style...');
      await pollRenderStatus(res.render_id, params.roomType, params.styleBlend, 250000);
    } catch (e: unknown) {
      setRenderStatus('failed');
      setRenderError(e instanceof Error ? e.message : 'Failed to start render.');
    }
  };

  return { startRender, currentRender, renderStatus, renderProgressStage, renderProgress, renderError };
}
