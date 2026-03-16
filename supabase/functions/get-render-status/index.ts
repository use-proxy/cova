import { createClient } from 'npm:@supabase/supabase-js@2';
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

    // 1. Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Parse query params
    const url = new URL(req.url);
    const render_id = url.searchParams.get('render_id');
    const job_id = url.searchParams.get('job_id');

    if (!render_id) {
      return new Response(JSON.stringify({ error: 'render_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Fetch render record (scoped to this user)
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

    // 4. If already complete, return immediately
    if (render.status === 'complete') {
      return new Response(
        JSON.stringify({ status: 'complete', image_url: render.image_url, render_id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 5. If already failed, return immediately
    if (render.status === 'failed') {
      return new Response(
        JSON.stringify({ status: 'failed', error: 'Render failed. Tokens have been refunded.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 6. Poll Replicate for current status
    const replicateResp = await fetch(
      `https://api.replicate.com/v1/predictions/${render.replicate_prediction_id}`,
      {
        headers: {
          'Authorization': `Token ${Deno.env.get('REPLICATE_API_TOKEN')}`,
        },
      },
    );

    if (!replicateResp.ok) {
      console.error('Replicate status check failed:', await replicateResp.text());
      return new Response(
        JSON.stringify({ status: 'processing', estimated_seconds_remaining: 15 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const prediction = await replicateResp.json();

    // 7. Replicate succeeded — download image, upload to Storage, update records
    if (prediction.status === 'succeeded') {
      const imageUrl = prediction.output?.[0];
      if (!imageUrl) {
        return new Response(
          JSON.stringify({ status: 'failed', error: 'Render produced no output.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Download the rendered image
      const imageResp = await fetch(imageUrl);
      const imageBlob = await imageResp.blob();

      // Upload to Supabase Storage
      const storagePath = `${user.id}/${render_id}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('renders')
        .upload(storagePath, imageBlob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        return new Response(
          JSON.stringify({ status: 'failed', error: 'Failed to save rendered image.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('renders')
        .getPublicUrl(storagePath);

      const publicUrl = urlData.publicUrl;

      // Update render record
      await supabase
        .from('renders')
        .update({ status: 'complete', image_url: publicUrl })
        .eq('id', render_id);

      // Update job record
      if (job_id) {
        await supabase
          .from('jobs')
          .update({
            status: 'complete',
            result_url: publicUrl,
            completed_at: new Date().toISOString(),
          })
          .eq('id', job_id);
      }

      return new Response(
        JSON.stringify({ status: 'complete', image_url: publicUrl, render_id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 8. Replicate failed — refund tokens
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      // Update render record
      await supabase
        .from('renders')
        .update({ status: 'failed' })
        .eq('id', render_id);

      // Update job record
      if (job_id) {
        await supabase
          .from('jobs')
          .update({
            status: 'failed',
            error_message: prediction.error || 'Render failed on Replicate',
          })
          .eq('id', job_id);
      }

      // Refund tokens atomically (negative amount = credit)
      const tokensToRefund = render.tokens_charged ?? 0;
      if (tokensToRefund > 0) {
        await supabase.rpc('deduct_tokens_atomic', {
          p_user_id: user.id,
          p_amount: -tokensToRefund,
          p_reason: `refund_failed_render_${render_id}`,
        });
      }

      return new Response(
        JSON.stringify({ status: 'failed', error: 'Render failed. Tokens refunded.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 9. Still processing
    return new Response(
      JSON.stringify({ status: 'processing', estimated_seconds_remaining: 15 }),
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
