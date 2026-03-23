import { corsHeaders } from '../_shared/cors.ts';

type QualityHint = 'single_shot' | 'multi_angle';

async function submitDepthPrediction(imageBase64: string): Promise<string> {
  const resp = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${Deno.env.get('REPLICATE_API_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: 'b239ea33cff32bb7abb5db39ffe9a09c14cbc2894331d1ef66fe096eed88ebd4',
      input: { image: imageBase64.startsWith('data:') ? imageBase64 : 'data:image/jpeg;base64,' + imageBase64 },
    }),
  });
  if (!resp.ok) {
    throw new Error(`Replicate submit failed: ${await resp.text()}`);
  }
  const prediction = await resp.json();
  return prediction.id as string;
}

async function pollUntilComplete(predictionId: string): Promise<string> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500));
    const resp = await fetch(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      { headers: { Authorization: `Token ${Deno.env.get('REPLICATE_API_TOKEN')}` } },
    );
    const status = await resp.json();

    if (status.status === 'succeeded') {
      const outputUrl: string = Array.isArray(status.output)
        ? status.output[0]
        : status.output;
      const imgResp = await fetch(outputUrl);
      const bytes = new Uint8Array(await imgResp.arrayBuffer());
      let binary = '';
      const CHUNK = 8192;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      const base64 = btoa(binary);
      return `data:image/png;base64,${base64}`;
    }

    if (status.status === 'failed' || status.status === 'canceled') {
      throw new Error(
        `Depth prediction ${status.status}: ${status.error ?? 'unknown'}`,
      );
    }
  }
  throw new Error('Depth prediction timed out after 90s');
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
      // Submit all predictions in parallel, then poll all in parallel
      const predictionIds = await Promise.all(
        clamped.map(submitDepthPrediction),
      );
      const depthMaps = await Promise.all(
        predictionIds.map(pollUntilComplete),
      );
      depthMapBase64 = await averageDepthMaps(depthMaps);
    } else {
      const src = image_base64 ?? images?.[0];
      if (!src) {
        return new Response(JSON.stringify({ error: 'No image provided' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const predictionId = await submitDepthPrediction(src);
      depthMapBase64 = await pollUntilComplete(predictionId);
    }

    return new Response(
      JSON.stringify({ depth_map_base64: depthMapBase64 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('generate-depth-map error:', err);
    return new Response(
      JSON.stringify({
        error: 'depth_generation_failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
