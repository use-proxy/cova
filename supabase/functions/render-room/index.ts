// render-room Edge Function
// Runtime: Deno — NO Node.js imports (no fs, path, crypto, buffer)
// Pipeline:
//   1. Auth + token gate
//   2. Depth Pro (garg-aayush/ml-depth-pro) → metric depth map
//      └─ FALLBACK: depth-anything/depth-anything-v2-large
//   3. Start FLUX ControlNet Union Pro 2.0 (depth + canny dual conditioning)
//      └─ FALLBACK: black-forest-labs/flux-depth-pro (single depth)
//   4. Insert renders row with prediction_id → client polls get-render-status
//
// ⚠️ ASSERTION: render-room blocks on Depth Pro (max 45s) then fires FLUX async.
//   Total wall-clock time must stay under Supabase's 150s edge function limit.
//   FLUX completion is polled by get-render-status, not here.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ── Types ────────────────────────────────────────────────────────────────────

type StyleName = 'coastal' | 'japandi' | 'bohemian' | 'mid_century' | 'minimalist';

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output: unknown;
  error: string | null;
}

// ── Prompt construction ───────────────────────────────────────────────────────

const STYLE_PROMPTS: Record<StyleName, string> = {
  coastal:     'coastal style, light natural textures, white and blue palette, natural driftwood, linen fabrics, nautical accents, airy and bright',
  japandi:     'japandi style, clean minimal lines, natural wood and stone, muted earth tones, zen calm atmosphere, functional simplicity',
  bohemian:    'bohemian style, rich warm colors, layered textiles, mixed patterns, plants and natural elements, eclectic collected feel',
  mid_century: 'mid-century modern style, clean organic shapes, warm wood tones, bold accent colors, retro-futurist furniture',
  minimalist:  'minimalist style, pure clean lines, neutral white and grey palette, maximum negative space, hidden storage, serene',
};

function buildPrompt(styleBlend: Record<string, number>, roomType: string): string {
  const sorted = Object.entries(styleBlend)
    .filter(([key]) => key in STYLE_PROMPTS)
    .sort(([, a], [, b]) => (b as number) - (a as number));

  const base = `Photorealistic interior photograph, ${roomType.replace(/_/g, ' ')}, professional architectural photography, 8k resolution, perfect soft lighting, warm natural light through windows`;

  if (sorted.length === 0) return base;

  const primary = STYLE_PROMPTS[sorted[0][0] as StyleName];
  const secondary = sorted.length > 1 && (sorted[1][1] as number) > 0.1
    ? `, with subtle ${sorted[1][0].replace(/_/g, ' ')} influences`
    : '';

  return `${base}, ${primary}${secondary}`;
}

// ── Replicate helpers ─────────────────────────────────────────────────────────

// Start a prediction via /models/{owner}/{name}/predictions (uses latest deployment)
async function startPrediction(
  owner: string,
  name: string,
  input: Record<string, unknown>,
  token: string,
): Promise<string> {
  const res = await fetch(
    `https://api.replicate.com/v1/models/${owner}/${name}/predictions`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait', // ask Replicate to hold connection for fast models
      },
      body: JSON.stringify({ input }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Replicate ${owner}/${name} start failed (${res.status}): ${body}`);
  }
  const pred = await res.json() as ReplicatePrediction;
  // If 'Prefer: wait' resolved it already, return a sentinel so caller knows
  if (pred.status === 'succeeded') return `__done__:${pred.id}`;
  if (pred.status === 'failed') throw new Error(`Replicate ${owner}/${name} failed immediately: ${pred.error ?? 'unknown'}`);
  return pred.id;
}

// Poll a prediction ID until terminal state, with exponential backoff
// ⚠️ ASSERTION: timeoutMs must leave headroom for the calling function's total budget.
async function pollPrediction(
  predictionId: string,
  token: string,
  timeoutMs: number,
): Promise<ReplicatePrediction> {
  const deadline = Date.now() + timeoutMs;
  let delay = 2000;

  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, delay));

    const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { 'Authorization': `Token ${token}` },
    });
    if (!res.ok) throw new Error(`Replicate poll failed (${res.status})`);

    const pred = await res.json() as ReplicatePrediction;
    if (pred.status === 'succeeded') return pred;
    if (pred.status === 'failed' || pred.status === 'canceled') {
      throw new Error(`Prediction ${pred.status}: ${pred.error ?? 'unknown error'}`);
    }

    // Exponential backoff: 2s → 3s → 4.5s → cap at 8s
    delay = Math.min(Math.floor(delay * 1.5), 8000);
  }

  throw new Error('Prediction timed out');
}

// Run a prediction and wait for its output URL
async function runAndWait(
  owner: string,
  name: string,
  input: Record<string, unknown>,
  token: string,
  timeoutMs: number,
): Promise<ReplicatePrediction> {
  const predId = await startPrediction(owner, name, input, token);

  // Prediction already resolved via 'Prefer: wait'
  if (predId.startsWith('__done__:')) {
    const realId = predId.replace('__done__:', '');
    const res = await fetch(`https://api.replicate.com/v1/predictions/${realId}`, {
      headers: { 'Authorization': `Token ${token}` },
    });
    return await res.json() as ReplicatePrediction;
  }

  return await pollPrediction(predId, token, timeoutMs);
}

// ── Depth estimation ──────────────────────────────────────────────────────────

// Step 1: Generate a depth map from the room photo.
// PRIMARY:  Apple Depth Pro — metric depth, no camera intrinsics needed.
//           Outputs real-world meter values; best for indoor rooms.
// FALLBACK: Depth Anything V2 — relative depth (0–1 normalised).
//           ControlNet conditioning still works; room dimensions will be
//           estimated, not metric. Flag this in function logs.
async function generateDepthMap(imageDataUri: string, token: string): Promise<string> {
  // PRIMARY: Depth Pro
  try {
    const pred = await runAndWait(
      'garg-aayush', 'ml-depth-pro',
      { image: imageDataUri },
      token,
      45_000, // 45s budget — leaves room for FLUX start within 150s limit
    );

    // Depth Pro output shape: { depth_colored: url, focallength_pixels: number }
    // Guard against API shape changes
    const out = pred.output as Record<string, unknown> | null;
    const depthUrl = (out?.depth_colored ?? out?.depth ?? out?.output) as string | undefined;
    if (depthUrl && typeof depthUrl === 'string') {
      console.log('Depth Pro succeeded:', depthUrl.slice(0, 80));
      return depthUrl;
    }
    throw new Error(`Depth Pro output missing depth_colored. Got: ${JSON.stringify(out)}`);
  } catch (err) {
    console.warn('⚠️ Depth Pro failed, activating Level 2 fallback (Depth Anything V2):', (err as Error).message);
  }

  // LEVEL 2 FALLBACK: Depth Anything V2 Large
  const fallbackPred = await runAndWait(
    'depth-anything', 'depth-anything-v2-large',
    { image: imageDataUri },
    token,
    45_000,
  );

  const fallbackOut = fallbackPred.output;
  const fallbackUrl = typeof fallbackOut === 'string'
    ? fallbackOut
    : Array.isArray(fallbackOut)
      ? (fallbackOut[0] as string)
      : (fallbackOut as Record<string, string>)?.depth ?? null;

  if (!fallbackUrl) {
    throw new Error('Both Depth Pro and Depth Anything V2 produced no output');
  }

  console.log('Using Depth Anything V2 fallback depth map');
  return fallbackUrl;
}

// ── FLUX render ───────────────────────────────────────────────────────────────

// Step 2: Start FLUX render prediction (non-blocking — caller stores pred ID for polling).
// PRIMARY:  FLUX ControlNet Union Pro 2.0 — dual conditioning: depth + Canny.
//           The Union model handles Canny extraction internally when
//           control_type_2 = 'canny' and the original photo is passed.
// FALLBACK: black-forest-labs/flux-depth-pro — single depth ControlNet.
async function startFluxPrediction(
  depthMapUrl: string,
  originalDataUri: string,
  prompt: string,
  numSteps: number,
  token: string,
): Promise<string> { // returns Replicate prediction ID

  // PRIMARY: FLUX ControlNet Union Pro 2.0 (dual: depth + canny)
  try {
    const predId = await startPrediction(
      'xlabs-ai', 'flux-controlnet-union-pro-2',
      {
        prompt,
        control_image_1:              depthMapUrl,
        control_type_1:               'depth',
        control_conditioning_scale_1: 0.6,
        control_image_2:              originalDataUri,
        control_type_2:               'canny',
        control_conditioning_scale_2: 0.4,
        num_inference_steps:          numSteps,
        guidance_scale:               3.5,
        width:                        1024,
        height:                       1024,
      },
      token,
    );
    // Strip the __done__ sentinel — get-render-status will re-fetch if needed
    return predId.replace('__done__:', '');
  } catch (err) {
    console.warn('⚠️ FLUX Union Pro 2.0 unavailable, activating Level 2 fallback (flux-depth-pro):', (err as Error).message);
  }

  // LEVEL 2 FALLBACK: black-forest-labs/flux-depth-pro (single depth ControlNet)
  const fallbackPredId = await startPrediction(
    'black-forest-labs', 'flux-depth-pro',
    {
      prompt,
      control_image:       depthMapUrl,
      num_inference_steps: numSteps,
      guidance_scale:      3.5,
      width:               1024,
      height:              1024,
    },
    token,
  );

  console.log('Using flux-depth-pro fallback render model');
  return fallbackPredId.replace('__done__:', '');
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Auth ───────────────────────────────────────────────────────────────
    // ⚠️ ASSERTION: JWT must be verified before ANY processing begins.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    const {
      room_id,
      image_base64,
      style_blend,
      room_type,
      render_type,
    } = await req.json() as {
      room_id: string;
      image_base64: string;
      style_blend: Record<string, number>;
      room_type: string;
      render_type: 'draft' | 'hd';
    };

    // ── Token gate (V1: tokens_enabled always false — this is a no-op) ─────
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('token_balance, tokens_enabled')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return new Response(JSON.stringify({ error: 'user_not_found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokenCost = render_type === 'hd' ? 3 : 2;
    if (userData.tokens_enabled && userData.token_balance < tokenCost) {
      return new Response(
        JSON.stringify({ error: 'insufficient_tokens', required: tokenCost, available: userData.token_balance }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Prepare inputs ─────────────────────────────────────────────────────
    const replicateToken = Deno.env.get('REPLICATE_API_TOKEN')!;
    const numSteps = render_type === 'hd' ? 40 : 28;
    const prompt = buildPrompt(style_blend ?? {}, room_type ?? 'living_room');

    // Normalise image to data URI (Replicate accepts both data URIs and URLs)
    const imageDataUri = image_base64.startsWith('data:')
      ? image_base64
      : `data:image/jpeg;base64,${image_base64}`;

    // ── Step 1: Depth estimation ───────────────────────────────────────────
    // Separate try/catch so we can return a clear 503 if both models fail.
    let depthMapUrl: string;
    try {
      depthMapUrl = await generateDepthMap(imageDataUri, replicateToken);
    } catch (depthErr) {
      console.error('Depth estimation failed (both models):', depthErr);
      return new Response(
        JSON.stringify({
          error: 'depth_estimation_failed',
          message: 'Could not analyze room depth. Please try again.',
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Step 2: Start FLUX render (async — returns prediction ID) ──────────
    // Separate try/catch so we can return a clear 503 if both FLUX models fail.
    let fluxPredictionId: string;
    try {
      fluxPredictionId = await startFluxPrediction(
        depthMapUrl,
        imageDataUri,
        prompt,
        numSteps,
        replicateToken,
      );
    } catch (fluxErr) {
      console.error('FLUX render start failed (both models):', fluxErr);
      return new Response(
        JSON.stringify({
          error: 'render_start_failed',
          message: 'AI rendering service is temporarily unavailable. Please try again.',
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Step 3: Insert renders row ─────────────────────────────────────────
    const { data: render, error: renderError } = await supabase
      .from('renders')
      .insert({
        room_id,
        user_id:                  user.id,
        status:                   'processing',
        quality_tier:             render_type ?? 'draft',
        replicate_prediction_id:  fluxPredictionId,
        prompt_used:              prompt,
        tokens_charged:           0,
      })
      .select()
      .single();

    if (renderError || !render) {
      console.error('Render row insert failed:', renderError);
      return new Response(
        JSON.stringify({ error: 'internal_error', message: 'Failed to create render record.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Step 4: Deduct tokens if enabled (no-op in V1) ────────────────────
    if (userData.tokens_enabled) {
      await supabase
        .from('users')
        .update({ token_balance: userData.token_balance - tokenCost })
        .eq('id', user.id);

      await supabase
        .from('token_transactions')
        .insert({
          user_id:   user.id,
          amount:    -tokenCost,
          type:      render_type === 'hd' ? 'render_hd' : 'render_draft',
          render_id: render.id,
        });
    }

    // Client now polls get-render-status with this render_id
    return new Response(
      JSON.stringify({
        render_id:     render.id,
        prediction_id: fluxPredictionId,
        status:        'processing',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('render-room unhandled error:', err);
    return new Response(
      JSON.stringify({ error: 'internal_error', message: 'An unexpected error occurred.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
