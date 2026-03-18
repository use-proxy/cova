import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type StyleName = 'coastal' | 'japandi' | 'bohemian' | 'mid_century' | 'minimalist';

const STYLE_PROMPTS: Record<StyleName, string> = {
  coastal: 'coastal style, light natural textures, white and blue palette, natural driftwood, linen fabrics, nautical accents, airy and bright',
  japandi: 'japandi style, clean minimal lines, natural wood and stone, muted earth tones, zen calm atmosphere, functional simplicity',
  bohemian: 'bohemian style, rich warm colors, layered textiles, mixed patterns, plants and natural elements, eclectic collected feel',
  mid_century: 'mid-century modern style, clean organic shapes, warm wood tones, bold accent colors, retro-futurist furniture',
  minimalist: 'minimalist style, pure clean lines, neutral white and grey palette, maximum negative space, hidden storage, serene',
};

function buildPrompt(styleBlend: Record<string, number>, roomType: string): string {
  const sorted = Object.entries(styleBlend)
    .filter(([key]) => key in STYLE_PROMPTS)
    .sort(([, a], [, b]) => b - a);

  if (sorted.length === 0) return `Photorealistic interior photograph, ${roomType.replace(/_/g, ' ')}, professional architectural photography, 8k resolution, perfect soft lighting, warm natural light through windows`;

  const primary = STYLE_PROMPTS[sorted[0][0] as StyleName];
  let styleDesc = primary;
  if (sorted.length > 1 && sorted[1][1] > 0.1) {
    const secondaryName = sorted[1][0] as StyleName;
    styleDesc += `, with subtle ${secondaryName.replace(/_/g, ' ')} influences`;
  }

  return `Photorealistic interior photograph, ${roomType.replace(/_/g, ' ')}, ${styleDesc}, professional architectural photography, 8k resolution, perfect soft lighting, warm natural light through windows`;
}

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

    const { room_id, image_base64, depth_map_base64, style_blend, room_type, render_type } = await req.json();

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('token_balance, tokens_enabled')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokenCost = render_type === 'hd' ? 3 : 2;

    if (userData.tokens_enabled && userData.token_balance < tokenCost) {
      return new Response(
        JSON.stringify({ error: 'Insufficient tokens', required: tokenCost, available: userData.token_balance }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const constructedPrompt = buildPrompt(style_blend ?? {}, room_type ?? 'living room');

    const replicateResp = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${Deno.env.get('REPLICATE_API_TOKEN')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: 'xlabs-ai/flux-dev-controlnet:latest',
        input: {
          prompt: constructedPrompt,
          control_image: depth_map_base64 ?? image_base64,
          control_type: 'depth',
          num_inference_steps: render_type === 'hd' ? 40 : 28,
          guidance_scale: 3.5,
          controlnet_conditioning_scale: 0.6,
          width: 1024,
          height: 1024,
        },
      }),
    });

    if (!replicateResp.ok) {
      const err = await replicateResp.text();
      console.error('Replicate API error:', err);
      return new Response(
        JSON.stringify({ error: 'render_service_unavailable', message: 'AI rendering service is temporarily unavailable.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const prediction = await replicateResp.json();

    const { data: render, error: renderError } = await supabase
      .from('renders')
      .insert({
        room_id,
        user_id: user.id,
        status: 'processing',
        render_type,
        replicate_prediction_id: prediction.id,
        prompt_used: constructedPrompt,
        tokens_used: 0,
      })
      .select()
      .single();

    if (renderError || !render) {
      console.error('Render insert error:', renderError);
      return new Response(
        JSON.stringify({ error: 'internal_error', message: 'Failed to create render record.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (userData.tokens_enabled) {
      await supabase
        .from('users')
        .update({ token_balance: userData.token_balance - tokenCost })
        .eq('id', user.id);

      await supabase
        .from('token_transactions')
        .insert({
          user_id: user.id,
          amount: -tokenCost,
          type: render_type === 'hd' ? 'render_hd' : 'render_draft',
          render_id: render.id,
        });
    }

    return new Response(
      JSON.stringify({ render_id: render.id, prediction_id: prediction.id, status: 'processing' }),
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
