import { corsHeaders } from '../_shared/cors.ts';

type QualityHint = 'single_shot' | 'multi_angle';

// ── Depth model submission — /v1/models/ endpoint (no version pinning) ────────

// PRIMARY: Apple Depth Pro — metric depth, real-world metre values, no camera intrinsics
async function submitDepthProPrediction(imageBase64: string, token: string): Promise<string> {
  const resp = await fetch('https://api.replicate.com/v1/models/garg-aayush/ml-depth-pro/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: { image: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` },
    }),
  });
  if (!resp.ok) {
    throw new Error(`Depth Pro submit failed (${resp.status}): ${await resp.text()}`);
  }
  const prediction = await resp.json();
  return prediction.id as string;
}

// FALLBACK: Depth Anything V2 Large — relative depth (0–1 normalised)
async function submitDepthAnythingV2Prediction(imageBase64: string, token: string): Promise<string> {
  const resp = await fetch('https://api.replicate.com/v1/models/depth-anything/depth-anything-v2-large/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: { image: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` },
    }),
  });
  if (!resp.ok) {
    throw new Error(`Depth Anything V2 submit failed (${resp.status}): ${await resp.text()}`);
  }
  const prediction = await resp.json();
  return prediction.id as string;
}

// Poll with exponential backoff: 3s → 6s → 12s → 24s cap, deadline 90s
async function pollUntilComplete(predictionId: string, token: string): Promise<string> {
  const deadline = Date.now() + 90_000;
  const BACKOFF = [3000, 6000, 12000, 24000];
  let backoffIdx = 0;

  while (Date.now() < deadline) {
    const delay = BACKOFF[Math.min(backoffIdx, BACKOFF.length - 1)];
    backoffIdx++;
    await new Promise((r) => setTimeout(r, delay));

    const resp = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Token ${token}` },
    });
    const status = await resp.json();

    if (status.status === 'succeeded') {
      // Depth Pro output: { depth_colored: url, focallength_pixels: number }
      // Depth Anything V2 output: string URL or array of strings
      const out = status.output;
      let depthUrl: string | null = null;
      if (typeof out === 'string') {
        depthUrl = out;
      } else if (Array.isArray(out) && out.length > 0) {
        depthUrl = out[0] as string;
      } else if (out && typeof out === 'object') {
        depthUrl = (out as Record<string, string>).depth_colored
          ?? (out as Record<string, string>).depth
          ?? null;
      }
      if (!depthUrl) {
        throw new Error(`Depth prediction output missing depth URL: ${JSON.stringify(out)}`);
      }
      // Download depth map and return as base64 data URI
      const imgResp = await fetch(depthUrl);
      const bytes = new Uint8Array(await imgResp.arrayBuffer());
      let binary = '';
      const CHUNK = 8192;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      return `data:image/png;base64,${btoa(binary)}`;
    }

    if (status.status === 'failed' || status.status === 'canceled') {
      throw new Error(`Depth prediction ${status.status}: ${status.error ?? 'unknown'}`);
    }
    // still starting/processing — continue polling
  }
  throw new Error('Depth prediction timed out after 90s');
}

// PRIMARY → FALLBACK depth generation for a single image
async function generateSingleDepthMap(imageBase64: string, token: string): Promise<string> {
  // PRIMARY: Depth Pro
  try {
    const predictionId = await submitDepthProPrediction(imageBase64, token);
    const result = await pollUntilComplete(predictionId, token);
    console.log('generate-depth-map: Depth Pro succeeded');
    return result;
  } catch (err) {
    console.error(
      'SENTRY_CAPTURE: depth_pro_failed',
      { error: err instanceof Error ? err.message : String(err) },
    );
    console.warn('⚠️ Depth Pro failed, falling back to Depth Anything V2:', err instanceof Error ? err.message : err);
  }

  // FALLBACK: Depth Anything V2 Large
  try {
    const predictionId = await submitDepthAnythingV2Prediction(imageBase64, token);
    const result = await pollUntilComplete(predictionId, token);
    console.log('generate-depth-map: Depth Anything V2 succeeded (fallback)');
    return result;
  } catch (err) {
    console.error(
      'SENTRY_CAPTURE: depth_anything_v2_failed',
      { error: err instanceof Error ? err.message : String(err) },
    );
    throw new Error(
      `Both depth models failed. Last error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// Pixel-level average of multiple grayscale depth maps.
// Uses imagescript for PNG/JPEG decoding in the Deno runtime.
async function averageDepthMaps(depthMapBase64s: string[]): Promise<string> {
  if (depthMapBase64s.length === 1) return depthMapBase64s[0];

  const { Image } = await import(
    'https://deno.land/x/imagescript@1.2.15/mod.ts'
  );

  const images = await Promise.all(
    depthMapBase64s.map(async (b64) => {
      const raw = b64.replace(/^data:image\/\w+;base64,/, '');
      const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
      return Image.decode(bytes);
    }),
  );

  const { width: w, height: h } = images[0];
  const result = new Image(w, h);
  const n = images.length;

  for (let y = 1; y <= h; y++) {
    for (let x = 1; x <= w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const img of images) {
        const px = img.getPixelAt(x, y);
        r += (px >>> 24) & 0xff;
        g += (px >>> 16) & 0xff;
        b += (px >>> 8) & 0xff;
        a += px & 0xff;
      }
      result.setPixelAt(
        x,
        y,
        Image.rgbaToColor(
          Math.round(r / n),
          Math.round(g / n),
          Math.round(b / n),
          Math.round(a / n),
        ),
      );
    }
  }

  const encoded = await result.encode(1); // 1 = PNG
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < encoded.length; i += CHUNK) {
    binary += String.fromCharCode(...encoded.subarray(i, i + CHUNK));
  }
  const base64 = btoa(binary);
  return `data:image/png;base64,${base64}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const token = Deno.env.get('REPLICATE_API_TOKEN');
  if (!token) {
    console.error('SENTRY_CAPTURE: missing_replicate_token', {});
    return new Response(
      JSON.stringify({ error: 'configuration_error', message: 'REPLICATE_API_TOKEN not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const {
      image_base64,
      images,
      quality_hint,
    }: {
      image_base64?: string;
      // multi_angle: up to 3 images whose depth maps are pixel-averaged
      images?: string[];
      quality_hint?: QualityHint;
    } = await req.json();

    const hint: QualityHint = quality_hint ?? 'single_shot';

    let depthMapBase64: string;

    if (hint === 'multi_angle' && images && images.length > 1) {
      const clamped = images.slice(0, 3);
      // Run Depth Pro → Depth Anything V2 fallback for each image, then pixel-average results
      const depthMaps = await Promise.all(
        clamped.map((img) => generateSingleDepthMap(img, token)),
      );
      depthMapBase64 = await averageDepthMaps(depthMaps);
    } else {
      const src = image_base64 ?? images?.[0];
      if (!src) {
        return new Response(JSON.stringify({ error: 'no_image', message: 'No image provided' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      depthMapBase64 = await generateSingleDepthMap(src, token);
    }

    return new Response(
      JSON.stringify({ depth_map_base64: depthMapBase64 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error(
      'SENTRY_CAPTURE: generate_depth_map_unhandled_error',
      { error: err instanceof Error ? err.message : 'Unknown error' },
    );
    return new Response(
      JSON.stringify({
        error: 'depth_generation_failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
