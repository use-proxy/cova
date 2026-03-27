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

// Style descriptors — each style has multiple descriptors that can be selected
// proportionally based on the blend ratio.
const STYLE_DESCRIPTORS: Record<StyleName, string[]> = {
  coastal: [
    'coastal style', 'light natural textures', 'white and blue palette',
    'natural driftwood accents', 'linen fabrics', 'nautical design elements',
    'airy and bright atmosphere', 'sea-inspired decor', 'weathered wood finishes',
    'sandy neutral tones',
  ],
  japandi: [
    'japandi style', 'clean minimal lines', 'natural wood and stone surfaces',
    'muted earth tones', 'zen calm atmosphere', 'functional simplicity',
    'wabi-sabi imperfection', 'low-profile furniture', 'organic ceramic accents',
    'paper lantern lighting',
  ],
  bohemian: [
    'bohemian style', 'rich warm colors', 'layered textiles and throws',
    'mixed global patterns', 'plants and natural elements', 'eclectic collected feel',
    'macrame wall hangings', 'vintage kilim rugs', 'rattan and wicker furniture',
    'jewel tone accents',
  ],
  mid_century: [
    'mid-century modern style', 'clean organic shapes', 'warm wood tones',
    'bold accent colors', 'retro-futurist furniture', 'hairpin and tapered legs',
    'geometric patterns', 'sunburst wall decor', 'molded plywood chairs',
    'brass and walnut finishes',
  ],
  minimalist: [
    'minimalist style', 'pure clean lines', 'neutral white and grey palette',
    'maximum negative space', 'hidden storage solutions', 'serene uncluttered atmosphere',
    'monochromatic color scheme', 'simple geometric forms', 'matte surface finishes',
    'streamlined furniture silhouettes',
  ],
};

// Total descriptor slots available in the prompt
const TOTAL_DESCRIPTOR_SLOTS = 10;

function buildPrompt(
  styleBlend: Record<string, number>,
  roomType: string,
  pinnedProducts?: Array<{ name: string; description?: string }>,
): string {
  const sorted = Object.entries(styleBlend)
    .filter(([key]) => key in STYLE_DESCRIPTORS)
    .sort(([, a], [, b]) => (b as number) - (a as number));

  // Allocate descriptor slots proportionally to blend ratio
  // e.g. 60% coastal = 6 coastal descriptors, 40% japandi = 4 japandi descriptors
  const selectedDescriptors: string[] = [];
  if (sorted.length > 0) {
    const total = sorted.reduce((sum, [, v]) => sum + (v as number), 0);
    let slotsRemaining = TOTAL_DESCRIPTOR_SLOTS;

    for (let i = 0; i < sorted.length; i++) {
      const [styleName, weight] = sorted[i];
      const ratio = total > 0 ? (weight as number) / total : 0;
      // Last style gets remaining slots to avoid rounding gaps
      const slots = i === sorted.length - 1
        ? slotsRemaining
        : Math.max(1, Math.round(ratio * TOTAL_DESCRIPTOR_SLOTS));
      const descriptors = STYLE_DESCRIPTORS[styleName as StyleName];
      for (let j = 0; j < Math.min(slots, descriptors.length); j++) {
        selectedDescriptors.push(descriptors[j]);
      }
      slotsRemaining -= slots;
      if (slotsRemaining <= 0) break;
    }
  }

  const styleLanguage = selectedDescriptors.length > 0
    ? selectedDescriptors.join(', ')
    : 'contemporary interior design';

  const structuralPreservation = 'preserve original wall colors, preserve ceiling height, preserve window positions, preserve door positions, preserve room architecture';

  let pinnedLanguage = '';
  if (pinnedProducts && pinnedProducts.length > 0) {
    const items = pinnedProducts
      .map((p) => `must include ${p.description ?? p.name}`)
      .join(', ');
    pinnedLanguage = `, ${items}`;
  }

  return `${styleLanguage}, ${roomType.replace(/_/g, ' ')} interior, ${structuralPreservation}${pinnedLanguage}, photorealistic, 8k, interior photography`;
}

// ── Replicate helpers ─────────────────────────────────────────────────────────

// Start a prediction via /models/{owner}/{name}/predictions (official models).
// wait=true uses 'Prefer: wait' to hold connection until done (use for models whose
// output is needed before returning). wait=false returns the prediction ID immediately.
async function startPrediction(
  owner: string,
  name: string,
  input: Record<string, unknown>,
  token: string,
  wait = false,
): Promise<string> {
  const headers: Record<string, string> = {
    'Authorization': `Token ${token}`,
    'Content-Type': 'application/json',
  };
  if (wait) headers['Prefer'] = 'wait';

  const res = await fetch(
    `https://api.replicate.com/v1/models/${owner}/${name}/predictions`,
    { method: 'POST', headers, body: JSON.stringify({ input }) },
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

// Start a prediction via /v1/predictions + explicit version hash (community models).
// Never uses 'Prefer: wait' — returns the prediction ID immediately, caller polls.
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

  // Poll for depth result. Budget: 90s max, leaving headroom for FLUX start + DB writes.
  const pred = await resolvePrediction(predId, token, 90_000);

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
  anchorImageUrl?: string | null,
): Promise<string> { // returns Replicate prediction ID

  // PRIMARY: FLUX Depth Pro (depth ControlNet conditioning)
  // ⚠️ wait=false — just create the prediction and return the ID immediately.
  // get-render-status handles polling. NEVER block the edge function on FLUX.
  try {
    const fluxInput: Record<string, unknown> = {
      prompt,
      control_image:       depthMapUrl,
      num_inference_steps: numSteps,
      guidance_scale:      3.5,
      width:               1024,
      height:              1024,
    };
    // If an anchor render exists, pass it as the image reference with moderate strength
    if (anchorImageUrl) {
      fluxInput.image = anchorImageUrl;
      fluxInput.image_prompt_strength = 0.6;
      console.log('Using anchor image as style reference:', anchorImageUrl);
    }
    const predId = await startPrediction(
      'black-forest-labs', 'flux-depth-pro',
      fluxInput,
      token,
      false, // do NOT wait — return prediction ID immediately
    );
    console.log('FLUX prediction started (flux-depth-pro):', predId);
    return predId.replace('__done__:', '');
  } catch (err) {
    console.warn('⚠️ flux-depth-pro unavailable, activating fallback (flux-2-pro):', (err as Error).message);
  }

  // FALLBACK: FLUX 2 Pro (prompt-only — no depth conditioning, still produces styled rooms)
  const fallbackInput: Record<string, unknown> = {
    prompt,
    num_inference_steps: numSteps,
    guidance_scale:      3.5,
    width:               1024,
    height:              1024,
  };
  if (anchorImageUrl) {
    fallbackInput.image = anchorImageUrl;
    fallbackInput.image_prompt_strength = 0.6;
  }
  const fallbackPredId = await startPrediction(
    'black-forest-labs', 'flux-2-pro',
    fallbackInput,
    token,
    false, // do NOT wait
  );

  console.log('FLUX prediction started (flux-2-pro fallback):', fallbackPredId);
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
      pinned_products,
    } = await req.json() as {
      room_id: string;
      image_base64: string;
      style_blend: Record<string, number>;
      room_type: string;
      render_type: 'draft' | 'hd';
      pinned_products?: Array<{ name: string; description?: string }>;
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
    const prompt = buildPrompt(style_blend ?? {}, room_type ?? 'living_room', pinned_products);
    // Derive primary style for the style_applied NOT NULL column
    const style_applied = Object.entries(style_blend ?? {})
      .sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] ?? 'minimalist';

    // Normalise image to data URI (Replicate accepts both data URIs and URLs)
    const imageDataUri = image_base64.startsWith('data:')
      ? image_base64
      : `data:image/jpeg;base64,${image_base64}`;

    console.log('render-room called, image_base64 length:', image_base64?.length ?? 0);

    // ── Anchor render lookup ────────────────────────────────────────────
    // Find the closest anchor render (by cosine similarity on style_weights)
    // to use as a style reference image for the FLUX generation.
    let anchorImageUrl: string | null = null;
    try {
      const { data: anchors } = await supabase
        .from('anchor_renders')
        .select('style_weights, image_url')
        .eq('room_type', room_type ?? 'living_room');

      if (anchors && anchors.length > 0 && style_blend) {
        const blendKeys = ['coastal', 'japandi', 'bohemian', 'mid_century', 'minimalist'];
        let bestScore = -1;
        let bestUrl: string | null = null;
        for (const anchor of anchors) {
          const aw = anchor.style_weights as Record<string, number>;
          // Cosine similarity
          let dot = 0, magA = 0, magB = 0;
          for (const k of blendKeys) {
            const a = (style_blend as Record<string, number>)[k] ?? 0;
            const b = aw[k] ?? 0;
            dot += a * b;
            magA += a * a;
            magB += b * b;
          }
          const denom = Math.sqrt(magA) * Math.sqrt(magB);
          const score = denom > 0 ? dot / denom : 0;
          if (score > bestScore) {
            bestScore = score;
            bestUrl = anchor.image_url;
          }
        }
        if (bestUrl && bestScore > 0.5) {
          anchorImageUrl = bestUrl;
          console.log(`Anchor render found (similarity: ${bestScore.toFixed(3)}): ${bestUrl}`);
        }
      }
    } catch (anchorErr) {
      console.warn('Anchor render lookup failed (non-fatal):', anchorErr);
    }

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
        anchorImageUrl,
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
        is_panoramic:             true,
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
