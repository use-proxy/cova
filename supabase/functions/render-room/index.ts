// render-room Edge Function
// Runtime: Deno — NO Node.js imports (no fs, path, crypto, buffer)
// Pipeline:
//   1. Auth + token gate
//   2. Depth Pro (garg-aayush/ml-depth-pro) → metric depth map
//      └─ FALLBACK: original image as flat depth (Depth Anything V2 endpoint is dead)
//   3. Start FLUX render via black-forest-labs/flux-depth-pro (depth ControlNet)
//      └─ FALLBACK: black-forest-labs/flux-2-pro (prompt-only, no ControlNet)
//   4. Insert renders row with prediction_id → client polls get-render-status
//
// ⚠️ ASSERTION: render-room blocks on Depth Pro (max 45s) then fires FLUX async.
//   Total wall-clock time must stay under Supabase's 150s edge function limit.
//   FLUX completion is polled by get-render-status, not here.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ── Structured error logger ───────────────────────────────────────────────────
// Edge Functions run server-side on Deno — the React Native Sentry SDK cannot
// reach them. logError() writes structured JSON to stdout so errors appear in
// the Supabase dashboard under Edge Functions → Logs with full context.
// View at: https://supabase.com/dashboard/project/xdeacbmkdwqrwxonqaqh/functions
function logError(context: string, error: unknown, extra?: Record<string, unknown>): void {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({
    level:     'error',
    service:   'render-room',
    context,
    message:   msg,
    extra:     extra ?? {},
    timestamp: new Date().toISOString(),
  }));
}

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

// Start a prediction via /models/{owner}/{name}/predictions (official models with latest deployment)
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
        'Prefer': 'wait',
      },
      body: JSON.stringify({ input }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Replicate ${owner}/${name} start failed (${res.status}): ${body}`);
  }
  const pred = await res.json() as ReplicatePrediction;
  if (pred.status === 'succeeded') return `__done__:${pred.id}`;
  if (pred.status === 'failed') throw new Error(`Replicate ${owner}/${name} failed immediately: ${pred.error ?? 'unknown'}`);
  return pred.id;
}

// Start a prediction via /v1/predictions + explicit version hash (community models)
async function startPredictionWithVersion(
  versionHash: string,
  input: Record<string, unknown>,
  token: string,
  label: string,
): Promise<string> {
  const res = await fetch(
    'https://api.replicate.com/v1/predictions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify({ version: versionHash, input }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Replicate ${label} start failed (${res.status}): ${body}`);
  }
  const pred = await res.json() as ReplicatePrediction;
  if (pred.status === 'succeeded') return `__done__:${pred.id}`;
  if (pred.status === 'failed') throw new Error(`Replicate ${label} failed immediately: ${pred.error ?? 'unknown'}`);
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

// Resolve a prediction ID (possibly already done via Prefer:wait) to final output
async function resolvePrediction(
  predId: string,
  token: string,
  timeoutMs: number,
): Promise<ReplicatePrediction> {
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

// Depth Pro version hash (community model — requires /v1/predictions + version)
const DEPTH_PRO_VERSION = '63efd78f11d91e3236df416c894f5b49e996271c3f96f98ac806288a5da59db8';

// Step 1: Generate a depth map from the room photo.
// PRIMARY:  Apple Depth Pro (garg-aayush/ml-depth-pro) — metric depth, no intrinsics.
// FALLBACK: original image as flat depth (Depth Anything V2 endpoint is no longer available).
async function generateDepthMap(imageDataUri: string, token: string): Promise<string> {
  const predId = await startPredictionWithVersion(
    DEPTH_PRO_VERSION,
    { image: imageDataUri },
    token,
    'garg-aayush/ml-depth-pro',
  );

  const pred = await resolvePrediction(predId, token, 45_000);

  // Depth Pro output varies: plain string URL, object { depth_colored }, or array
  const output = pred.output;
  let depthUrl: string | undefined;
  if (typeof output === 'string') {
    depthUrl = output;
  } else if (output && typeof output === 'object' && !Array.isArray(output) && (output as Record<string, unknown>).depth_colored) {
    depthUrl = (output as Record<string, unknown>).depth_colored as string;
  } else if (Array.isArray(output) && typeof output[0] === 'string') {
    depthUrl = output[0];
  }
  if (depthUrl) {
    console.log('Depth Pro succeeded:', depthUrl.slice(0, 80));
    return depthUrl;
  }
  throw new Error(`Depth Pro output unrecognized format: ${JSON.stringify(output)}`);
}

// ── FLUX render ───────────────────────────────────────────────────────────────

// Step 2: Start FLUX render prediction (non-blocking — caller stores pred ID for polling).
// PRIMARY:  black-forest-labs/flux-depth-pro — single depth ControlNet.
// FALLBACK: black-forest-labs/flux-2-pro — prompt-only (no ControlNet, no depth).
async function startFluxPrediction(
  depthMapUrl: string,
  _originalImageUrl: string,
  prompt: string,
  numSteps: number,
  token: string,
): Promise<string> { // returns Replicate prediction ID

  // PRIMARY: FLUX Depth Pro (depth ControlNet conditioning)
  try {
    const predId = await startPrediction(
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
    console.log('Using flux-depth-pro as primary render model');
    return predId.replace('__done__:', '');
  } catch (err) {
    console.warn('⚠️ flux-depth-pro unavailable, activating fallback (flux-2-pro):', (err as Error).message);
  }

  // FALLBACK: FLUX 2 Pro (prompt-only — no depth conditioning, still produces styled rooms)
  const fallbackPredId = await startPrediction(
    'black-forest-labs', 'flux-2-pro',
    {
      prompt,
      num_inference_steps: numSteps,
      guidance_scale:      3.5,
      width:               1024,
      height:              1024,
    },
    token,
  );

  console.log('Using flux-2-pro fallback render model (no depth conditioning)');
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
    // Derive primary style for the style_applied NOT NULL column
    const style_applied = Object.entries(style_blend ?? {})
      .sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] ?? 'minimalist';

    // Normalise image to data URI (Replicate accepts both data URIs and URLs)
    const imageDataUri = image_base64.startsWith('data:')
      ? image_base64
      : `data:image/jpeg;base64,${image_base64}`;

    console.log('render-room called, image_base64 length:', image_base64?.length ?? 0);

    // ── Step 0: Upload photo to room-photos bucket (§8.1 step 3) ─────────
    // FLUX ControlNet fails with large inline data URIs for control images.
    // Upload to storage and pass the signed URL instead.
    let originalImageUrl: string = imageDataUri; // fallback if upload fails
    try {
      const rawBase64 = image_base64.startsWith('data:')
        ? image_base64.split(',')[1]
        : image_base64;
      const binaryStr = atob(rawBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      const storagePath = `${user.id}/${room_id}/${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('room-photos')
        .upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: true });

      if (uploadErr) {
        console.warn('room-photos upload failed, using data URI fallback:', uploadErr.message);
      } else {
        const { data: signedData } = await supabase.storage
          .from('room-photos')
          .createSignedUrl(storagePath, 3600); // 1 hour — plenty for FLUX
        if (signedData?.signedUrl) {
          originalImageUrl = signedData.signedUrl;
          console.log('Room photo uploaded, using signed URL for FLUX');
        }
      }

      // Also store the URL on the room record
      if (originalImageUrl !== imageDataUri) {
        await supabase
          .from('rooms')
          .update({ original_image_url: originalImageUrl })
          .eq('id', room_id);
      }
    } catch (uploadCatchErr) {
      logError('room_photo_upload_failed', uploadCatchErr, { room_id });
      console.warn('room-photos upload exception, using data URI fallback');
    }

    // ── Step 1: Depth estimation ───────────────────────────────────────────
    // Try Depth Pro → Depth Anything V2 fallback (inside generateDepthMap).
    // If both models fail, degrade gracefully: pass the original photo as the
    // ControlNet depth input. FLUX with a non-depth image is less 3D-precise
    // but still produces a valid styled render — a degraded render beats a 503.
    let depthMapUrl: string;
    try {
      depthMapUrl = await generateDepthMap(imageDataUri, replicateToken);
    } catch (depthErr) {
      logError('depth_estimation_failed', depthErr, { room_id, user_id: user.id });
      console.warn('⚠️ Depth estimation failed — proceeding with original image as flat depth fallback');
      // Use the uploaded photo URL (or data URI fallback) as the ControlNet conditioning image.
      // This is the "flat depth" fallback: no metric depth, but render still runs.
      depthMapUrl = originalImageUrl;
    }

    // ── Step 2: Start FLUX render (async — returns prediction ID) ──────────
    // Separate try/catch so we can return a clear 503 if both FLUX models fail.
    let fluxPredictionId: string;
    try {
      fluxPredictionId = await startFluxPrediction(
        depthMapUrl,
        originalImageUrl,
        prompt,
        numSteps,
        replicateToken,
      );
    } catch (fluxErr) {
      logError('flux_render_start_failed', fluxErr, { room_id, user_id: user.id });
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
        style_applied,
        quality_tier:             render_type ?? 'draft',
        replicate_prediction_id:  fluxPredictionId,
        prompt_used:              prompt,
        tokens_charged:           0,
      })
      .select()
      .single();

    if (renderError || !render) {
      logError('render_row_insert_failed', renderError ?? new Error('unknown'), { room_id, user_id: user.id });
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
    logError('render_room_unhandled_error', err);
    return new Response(
      JSON.stringify({ error: 'internal_error', message: 'An unexpected error occurred.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
