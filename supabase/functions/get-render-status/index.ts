import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ── Types ────────────────────────────────────────────────────────────────────

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output: unknown;
  error: string | null;
}

// Extract the image URL from a Replicate prediction output.
// FLUX models may return a string URL, an array of URLs, or an object.
function extractImageUrl(output: unknown): string | undefined {
  if (typeof output === 'string') return output;
  if (Array.isArray(output) && typeof output[0] === 'string') return output[0];
  return undefined;
}

// Upload an image from a URL to Supabase storage and return a long-lived signed URL.
// Falls back to a public URL if signed URL generation fails.
async function uploadAndSign(
  supabase: ReturnType<typeof createClient>,
  imageUrl: string,
  storagePath: string,
  userId: string,
  renderId: string,
): Promise<string> {
  const imageResp = await fetch(imageUrl);
  const imageBytes = new Uint8Array(await imageResp.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from('renders')
    .upload(storagePath, imageBytes, { contentType: 'image/jpeg', upsert: true });

  if (uploadError) {
    throw new Error(`Storage upload error: ${uploadError.message}`);
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from('renders')
    .createSignedUrl(storagePath, 31536000);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const fallbackUrl = `${supabaseUrl}/storage/v1/object/public/renders/${storagePath}`;

  if (signedUrlError || !signedUrlData?.signedUrl) {
    console.warn('Signed URL generation failed, using public fallback URL:', signedUrlError);
    return fallbackUrl;
  }

  return signedUrlData.signedUrl;
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    let render_id: string | null = url.searchParams.get('render_id');
    if (!render_id && req.method === 'POST') {
      try {
        const body = await req.json();
        render_id = body.render_id ?? null;
      } catch { /* ignore parse errors */ }
    }
    if (!render_id) {
      return new Response(JSON.stringify({ error: 'render_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: render, error: renderError } = await supabase
      .from('renders')
      .select('*')
      .eq('id', render_id)
      .eq('user_id', user.id)
      .single();

    if (renderError || !render) {
      console.error('Render lookup failed:', JSON.stringify({ render_id, user_id: user.id, error: renderError }));
      return new Response(JSON.stringify({ error: 'Render not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Poll:', JSON.stringify({ render_id, status: render.status, has_image: !!render.image_url, has_pano_pred: !!render.panoramic_prediction_id }));

    // ── Watchdog: fail renders stuck processing > 10 minutes ──
    if (render.status === 'processing' || render.status === 'pending') {
      const createdAt = new Date(render.created_at as string).getTime();
      const elapsedMs = Date.now() - createdAt;
      const TEN_MINUTES = 10 * 60 * 1000;
      if (elapsedMs > TEN_MINUTES) {
        await supabase
          .from('renders')
          .update({ status: 'failed' })
          .eq('id', render_id);
        return new Response(
          JSON.stringify({ status: 'failed', error: 'Render timed out after 10 minutes. Please try again.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // ── Already completed — return both URLs ──────────────────────────────
    if (render.status === 'completed') {
      return new Response(
        JSON.stringify({
          status: 'completed',
          image_url: render.image_url,
          panoramic_url: render.panoramic_url ?? null,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (render.status === 'failed') {
      return new Response(
        JSON.stringify({ status: 'failed', error: 'Render failed.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const replicateToken = Deno.env.get('REPLICATE_API_TOKEN')!;

    // ── Stage 2 polling: panoramic LoRA conversion ──────────────────────
    // If Stage 2 has been kicked off (panoramic_prediction_id exists), poll that.
    if (render.panoramic_prediction_id) {
      const panoResp = await fetch(
        `https://api.replicate.com/v1/predictions/${render.panoramic_prediction_id}`,
        { headers: { 'Authorization': `Token ${replicateToken}` } },
      );

      if (!panoResp.ok) {
        console.error('Replicate panoramic poll failed:', await panoResp.text());
        return new Response(
          JSON.stringify({
            status: 'processing',
            image_url: render.image_url,
            panoramic_url: null,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const panoPrediction = await panoResp.json() as ReplicatePrediction;

      if (panoPrediction.status === 'succeeded') {
        const panoImageUrl = extractImageUrl(panoPrediction.output);
        let panoramicUrl: string | null = null;

        if (panoImageUrl) {
          try {
            const panoStoragePath = `${user.id}/${render_id}_panoramic.jpg`;
            panoramicUrl = await uploadAndSign(supabase, panoImageUrl, panoStoragePath, user.id, render_id);
          } catch (uploadErr) {
            console.error('Panoramic upload failed:', uploadErr);
          }
        }

        // Use image_url from the DB row (set during Stage 1)
        const flatImageUrl = render.image_url as string;

        // Mark completed with both URLs
        const { error: updateErr } = await supabase
          .from('renders')
          .update({ status: 'completed', panoramic_url: panoramicUrl })
          .eq('id', render_id);
        if (updateErr) console.error('renders update failed:', JSON.stringify(updateErr));

        const { error: roomErr } = await supabase
          .from('rooms')
          .update({ latest_render_url: flatImageUrl, updated_at: new Date().toISOString() })
          .eq('id', render.room_id);
        if (roomErr) console.error('rooms update failed:', JSON.stringify(roomErr));

        try {
          const { error: rpcErr } = await supabase.rpc('increment_rooms_render_count', { room_id: render.room_id });
          if (rpcErr) console.warn('increment_rooms_render_count RPC failed:', rpcErr.message);
        } catch (rpcCatchErr) {
          console.warn('increment_rooms_render_count RPC unavailable:', rpcCatchErr);
        }

        console.log('Stage 2 complete:', JSON.stringify({ render_id, image_url: flatImageUrl, panoramic_url: panoramicUrl }));

        return new Response(
          JSON.stringify({ status: 'completed', image_url: flatImageUrl, panoramic_url: panoramicUrl }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (panoPrediction.status === 'failed' || panoPrediction.status === 'canceled') {
        console.warn('Stage 2 failed:', panoPrediction.error);
        const flatImageUrl = render.image_url as string;

        const { error: updateErr } = await supabase
          .from('renders')
          .update({ status: 'completed', panoramic_url: null })
          .eq('id', render_id);
        if (updateErr) console.error('renders update failed:', JSON.stringify(updateErr));

        const { error: roomErr } = await supabase
          .from('rooms')
          .update({ latest_render_url: flatImageUrl, updated_at: new Date().toISOString() })
          .eq('id', render.room_id);
        if (roomErr) console.error('rooms update failed:', JSON.stringify(roomErr));

        try {
          const { error: rpcErr } = await supabase.rpc('increment_rooms_render_count', { room_id: render.room_id });
          if (rpcErr) console.warn('increment_rooms_render_count RPC failed:', rpcErr.message);
        } catch (rpcCatchErr) {
          console.warn('increment_rooms_render_count RPC unavailable:', rpcCatchErr);
        }

        console.log('Stage 2 fallback (flat only):', JSON.stringify({ render_id, image_url: flatImageUrl }));

        return new Response(
          JSON.stringify({ status: 'completed', image_url: flatImageUrl, panoramic_url: null }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Still processing Stage 2
      return new Response(
        JSON.stringify({
          status: 'processing',
          image_url: render.image_url,
          panoramic_url: null,
          stage: 'panoramic',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Stage 1 polling: FLUX flat render ────────────────────────────────
    const replicateResp = await fetch(
      `https://api.replicate.com/v1/predictions/${render.replicate_prediction_id}`,
      {
        headers: { 'Authorization': `Token ${replicateToken}` },
      },
    );

    if (!replicateResp.ok) {
      console.error('Replicate poll failed:', await replicateResp.text());
      return new Response(
        JSON.stringify({ status: 'processing', image_url: null, panoramic_url: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const prediction = await replicateResp.json() as ReplicatePrediction;

    if (prediction.status === 'succeeded') {
      const rawOutput = prediction.output;
      const imageUrl = extractImageUrl(rawOutput);
      if (!imageUrl) {
        await supabase.from('renders').update({ status: 'failed' }).eq('id', render_id);
        return new Response(
          JSON.stringify({ status: 'failed', error: 'Render produced no output.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Upload Stage 1 flat render to storage
      let finalUrl: string;
      try {
        const storagePath = `${user.id}/${render_id}.jpg`;
        finalUrl = await uploadAndSign(supabase, imageUrl, storagePath, user.id, render_id);
      } catch (uploadErr) {
        console.error('Storage upload error:', uploadErr);
        await supabase.from('renders').update({ status: 'failed' }).eq('id', render_id);
        return new Response(
          JSON.stringify({ status: 'failed', error: 'Failed to save rendered image.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Save Stage 1 URL on the render row
      const { error: stage1UpdateErr } = await supabase
        .from('renders')
        .update({ image_url: finalUrl })
        .eq('id', render_id);
      if (stage1UpdateErr) console.error('Stage 1 image_url update failed:', JSON.stringify(stage1UpdateErr));
      else console.log('Stage 1 image saved:', finalUrl.slice(0, 80));

      // ── Stage 2: Start panoramic LoRA conversion if configured ────────
      // LoRA model: pgoel813/cova-interior-360-lora (trained on 150 Poly Haven equirectangular interiors)
      // Trigger word: COVAINTERIOR360
      // Secrets: REPLICATE_LORA_MODEL_ID, REPLICATE_LORA_VERSION
      const loraModelId = Deno.env.get('REPLICATE_LORA_MODEL_ID');
      const loraVersion = Deno.env.get('REPLICATE_LORA_VERSION');

      if (render.is_panoramic && loraModelId && loraVersion) {
        try {
          const originalPrompt = (render.prompt_used as string) ?? '';
          const panoramicPrompt = `COVAINTERIOR360 equirectangular 360 degree panorama interior room, ${originalPrompt}`;

          const stage2Body = {
            version: loraVersion,
            input: {
              prompt: panoramicPrompt,
              image: finalUrl,
              num_outputs: 1,
              aspect_ratio: '2:1',
              output_format: 'jpg',
              output_quality: 90,
              num_inference_steps: 28,
              guidance_scale: 2.5,
              lora_scale: 1.0,
              prompt_strength: 0.7,
            },
          };

          console.log('Stage 2 starting — sending to LoRA:', JSON.stringify({
            model: loraModelId, version: loraVersion,
            prompt_preview: panoramicPrompt.slice(0, 100),
            image_preview: finalUrl.slice(0, 80),
          }));

          const panoRes = await fetch(
            'https://api.replicate.com/v1/predictions',
            {
              method: 'POST',
              headers: {
                'Authorization': `Token ${replicateToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(stage2Body),
            },
          );

          if (panoRes.ok) {
            const panoPred = await panoRes.json() as ReplicatePrediction;
            const panoPredId = panoPred.id;

            const { error: panoUpdateErr } = await supabase
              .from('renders')
              .update({ panoramic_prediction_id: panoPredId })
              .eq('id', render_id);
            if (panoUpdateErr) console.error('Stage 2 prediction ID save failed:', JSON.stringify(panoUpdateErr));

            console.log('Stage 2 prediction started:', panoPredId);

            return new Response(
              JSON.stringify({ status: 'processing', image_url: finalUrl, panoramic_url: null, stage: 'panoramic' }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          } else {
            const errBody = await panoRes.text();
            console.error('Stage 2 failed — LoRA returned HTTP', panoRes.status, ':', errBody);
          }
        } catch (panoErr) {
          console.error('Stage 2 failed — exception:', panoErr instanceof Error ? panoErr.message : String(panoErr));
        }
      } else {
        console.log('Stage 2 skipped:', JSON.stringify({ is_panoramic: render.is_panoramic, has_model: !!loraModelId, has_version: !!loraVersion }));
      }

      // No Stage 2 or Stage 2 failed to start — complete with flat render only
      const { error: completeErr } = await supabase
        .from('renders')
        .update({ status: 'completed', image_url: finalUrl })
        .eq('id', render_id);
      if (completeErr) console.error('renders complete update failed:', JSON.stringify(completeErr));

      const { error: roomUpdateErr } = await supabase
        .from('rooms')
        .update({ latest_render_url: finalUrl, updated_at: new Date().toISOString() })
        .eq('id', render.room_id);
      if (roomUpdateErr) console.error('rooms update failed:', JSON.stringify(roomUpdateErr));

      await supabase.rpc('increment_rooms_render_count', { room_id: render.room_id }).catch((err: unknown) => {
        console.warn('increment_rooms_render_count RPC unavailable:', err);
      });

      console.log('Render complete (flat only):', JSON.stringify({ render_id, image_url: finalUrl }));

      return new Response(
        JSON.stringify({ status: 'completed', image_url: finalUrl, panoramic_url: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      console.error('Replicate prediction failed:', JSON.stringify({
        prediction_id: render.replicate_prediction_id,
        status: prediction.status,
        error: prediction.error,
        render_id,
      }));
      await supabase
        .from('renders')
        .update({ status: 'failed' })
        .eq('id', render_id);

      return new Response(
        JSON.stringify({ status: 'failed', error: prediction.error ?? 'Render failed on provider.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ status: 'processing', image_url: null, panoramic_url: null, stage: 'rendering' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('get-render-status error:', err);
    return new Response(
      JSON.stringify({ error: 'internal_error', message: 'An unexpected error occurred.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
