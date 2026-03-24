import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

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
      return new Response(JSON.stringify({ error: 'Render not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (render.status === 'completed') {
      return new Response(
        JSON.stringify({ status: 'completed', image_url: render.image_url }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (render.status === 'failed') {
      return new Response(
        JSON.stringify({ status: 'failed', error: 'Render failed.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const replicateResp = await fetch(
      `https://api.replicate.com/v1/predictions/${render.replicate_prediction_id}`,
      {
        headers: { 'Authorization': `Token ${Deno.env.get('REPLICATE_API_TOKEN')}` },
      },
    );

    if (!replicateResp.ok) {
      console.error('Replicate poll failed:', await replicateResp.text());
      return new Response(
        JSON.stringify({ status: 'processing', image_url: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const prediction = await replicateResp.json();

    if (prediction.status === 'succeeded') {
      // FLUX models return either a string URL or an array of URLs depending on the model version.
      const rawOutput = prediction.output;
      const imageUrl: string | undefined =
        Array.isArray(rawOutput) && typeof rawOutput[0] === 'string'
          ? rawOutput[0]
          : typeof rawOutput === 'string'
            ? rawOutput
            : undefined;
      if (!imageUrl) {
        await supabase.from('renders').update({ status: 'failed' }).eq('id', render_id);
        return new Response(
          JSON.stringify({ status: 'failed', error: 'Render produced no output.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const imageResp = await fetch(imageUrl);
      const imageBytes = new Uint8Array(await imageResp.arrayBuffer());

      const storagePath = `${user.id}/${render_id}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('renders')
        .upload(storagePath, imageBytes, { contentType: 'image/jpeg', upsert: true });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        await supabase.from('renders').update({ status: 'failed' }).eq('id', render_id);
        return new Response(
          JSON.stringify({ status: 'failed', error: 'Failed to save rendered image.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('renders')
        .createSignedUrl(storagePath, 3600);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error('Failed to create signed URL:', signedUrlError);
        await supabase.from('renders').update({ status: 'failed' }).eq('id', render_id);
        return new Response(
          JSON.stringify({ status: 'failed', error: 'Failed to generate render URL.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const signedUrl = signedUrlData.signedUrl;

      await supabase
        .from('renders')
        .update({ status: 'completed', image_url: signedUrl })
        .eq('id', render_id);

      await supabase
        .from('rooms')
        .update({ 
          latest_render_url: signedUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', render.room_id);

      // Increment render_count atomically via RPC.
      // If the RPC doesn't exist yet the error is suppressed — render completion is not affected.
      await supabase.rpc('increment_rooms_render_count', { room_id: render.room_id }).catch((err) => {
        console.warn('increment_rooms_render_count RPC unavailable:', err);
      });

      return new Response(
        JSON.stringify({ status: 'completed', image_url: signedUrl }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
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
      JSON.stringify({ status: 'processing', image_url: null }),
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
