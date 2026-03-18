import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type StyleName = 'coastal' | 'japandi' | 'bohemian' | 'mid_century' | 'minimalist';

const VALID_STYLES: StyleName[] = ['coastal', 'japandi', 'bohemian', 'mid_century', 'minimalist'];

const STYLE_PROMPTS: Record<StyleName, string> = {
  coastal:
    'coastal style, light natural textures, white and blue palette, natural driftwood, linen fabrics, nautical accents, airy and bright',
  japandi:
    'japandi style, clean minimal lines, natural wood and stone, muted earth tones, zen calm atmosphere, functional simplicity',
  bohemian:
    'bohemian style, rich warm colors, layered textiles, mixed patterns, plants and natural elements, eclectic collected feel',
  mid_century:
    'mid-century modern style, clean organic shapes, warm wood tones, bold accent colors, retro-futurist furniture',
  minimalist:
    'minimalist style, pure clean lines, neutral white and grey palette, maximum negative space, hidden storage, serene',
};

const NEGATIVE_PROMPT =
  'blurry, low quality, distorted, ugly, bad proportions, watermark, cartoon, anime, painting, drawing';

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

    // 2. Parse body
    const { room_id, style, quality_tier, scene_snapshot_url } = await req.json();

    // 3. Validate style
    if (!VALID_STYLES.includes(style)) {
      return new Response(
        JSON.stringify({ error: 'invalid_style', message: `Style must be one of: ${VALID_STYLES.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 4. Determine token cost
    const tokenCost = quality_tier === 'hd' ? 3 : 2;

    // 5. Check token balance
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('token_balance')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (userData.token_balance < tokenCost) {
      return new Response(
        JSON.stringify({
          error: 'insufficient_tokens',
          required: tokenCost,
          available: userData.token_balance,
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 6. Rate limiting — max 10 renders per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentRenders } = await supabase
      .from('renders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', oneHourAgo);

    if ((recentRenders ?? 0) >= 10) {
      return new Response(
        JSON.stringify({ error: 'rate_limited', message: 'Maximum 10 renders per hour.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 7. Call Replicate API
    const replicateResp = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${Deno.env.get('REPLICATE_API_TOKEN')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
        input: {
          prompt: STYLE_PROMPTS[style as StyleName],
          negative_prompt: NEGATIVE_PROMPT,
          num_inference_steps: quality_tier === 'hd' ? 50 : 30,
          guidance_scale: 7.5,
          width: 1024,
          height: 1024,
        },
      }),
    });

    if (!replicateResp.ok) {
      const replicateError = await replicateResp.text();
      console.error('Replicate API error:', replicateError);
      return new Response(
        JSON.stringify({ error: 'render_service_unavailable', message: 'AI rendering service is temporarily unavailable.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const prediction = await replicateResp.json();

    // 8. Insert job record
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        user_id: user.id,
        job_type: 'render',
        status: 'processing',
        replicate_id: prediction.id,
        input_params: { style, quality_tier, scene_snapshot_url },
      })
      .select()
      .single();

    if (jobError || !job) {
      console.error('Job insert error:', jobError);
      return new Response(JSON.stringify({ error: 'internal_error', message: 'Failed to create job record.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 9. Insert render record
    const { data: render, error: renderError } = await supabase
      .from('renders')
      .insert({
        room_id,
        user_id: user.id,
        style_applied: style,
        quality_tier,
        status: 'processing',
        replicate_prediction_id: prediction.id,
        prompt_used: STYLE_PROMPTS[style as StyleName],
        tokens_charged: tokenCost,
      })
      .select()
      .single();

    if (renderError || !render) {
      console.error('Render insert error:', renderError);
      return new Response(JSON.stringify({ error: 'internal_error', message: 'Failed to create render record.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 10. Deduct tokens atomically
    const { error: deductError } = await supabase.rpc('deduct_tokens_atomic', {
      p_user_id: user.id,
      p_amount: tokenCost,
      p_reason: `render_${render.id}`,
    });

    if (deductError) {
      console.error('Token deduction error:', deductError);
      // Mark render as failed and clean up
      await supabase.from('renders').update({ status: 'failed' }).eq('id', render.id);
      await supabase.from('jobs').update({ status: 'failed', error_message: 'Token deduction failed' }).eq('id', job.id);
      return new Response(
        JSON.stringify({ error: 'insufficient_tokens', required: tokenCost, available: userData.token_balance }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 11. Return success
    return new Response(
      JSON.stringify({
        render_id: render.id,
        job_id: job.id,
        status: 'processing',
        tokens_charged: tokenCost,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('render-room error:', err);
    return new Response(
      JSON.stringify({ error: 'internal_error', message: 'An unexpected error occurred.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
