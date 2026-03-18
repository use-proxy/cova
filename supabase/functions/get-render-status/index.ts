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
    const render_id = url.searchParams.get('render_id');
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
      const imageUrl = prediction.output?.[0];
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
        return new Response(
          JSON.stringify({ status: 'failed', error: 'Failed to save rendered image.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const { data: signedUrlData } = await supabase.storage
        .from('renders')
        .createSignedUrl(storagePath, 3600);

      const signedUrl = signedUrlData?.signedUrl ?? '';

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

      await supabase.rpc('increment_rooms_render_count', { room_id: render.room_id }).catch(async () => {
        // RPC fallback — direct increment
        const { data: room } = await supabase
          .from('rooms')
          .select('render_count')
          .eq('id', render.room_id)
          .single();
        if (room) {
          await supabase
            .from('rooms')
            .update({ render_count: (room.render_count ?? 0) + 1 })
            .eq('id', render.room_id);
        }
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
