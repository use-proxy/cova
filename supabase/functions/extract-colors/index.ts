// extract-colors — Sprint 5, Item 1
// Samples wall regions from a rendered room image and returns dominant wall color.
// Called after render completes to sync 3D viewer wall color with the AI render.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Sample a rectangular region from raw RGBA pixel data and return average RGB
function sampleRegion(
  pixels: Uint8ClampedArray,
  imgW: number,
  imgH: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { r: number; g: number; b: number } {
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  const cx0 = Math.max(0, Math.floor(x0 * imgW));
  const cy0 = Math.max(0, Math.floor(y0 * imgH));
  const cx1 = Math.min(imgW - 1, Math.floor(x1 * imgW));
  const cy1 = Math.min(imgH - 1, Math.floor(y1 * imgH));
  // Sample every 4th pixel for speed
  for (let y = cy0; y <= cy1; y += 4) {
    for (let x = cx0; x <= cx1; x += 4) {
      const idx = (y * imgW + x) * 4;
      rSum += pixels[idx];
      gSum += pixels[idx + 1];
      bSum += pixels[idx + 2];
      count++;
    }
  }
  if (count === 0) return { r: 245, g: 240, b: 235 }; // fallback
  return {
    r: Math.round(rSum / count),
    g: Math.round(gSum / count),
    b: Math.round(bSum / count),
  };
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Decode JPEG using imagescript (Deno-compatible, no Node.js deps)
async function decodeImagePixels(
  buf: Uint8Array,
): Promise<{ pixels: Uint8ClampedArray; width: number; height: number } | null> {
  try {
    // @ts-expect-error Deno URL import — no TS types available
    const { Image } = await import('https://deno.land/x/imagescript@1.2.15/mod.ts');
    const img = await Image.decode(buf);
    const rgba = new Uint8ClampedArray(img.width * img.height * 4);
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const [r, g, b, a] = img.getRGBA(x, y);
        const i = (y * img.width + x) * 4;
        rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a;
      }
    }
    return { pixels: rgba, width: img.width, height: img.height };
  } catch (e) {
    console.warn('imagescript decode failed:', e);
    return null;
  }
}

// @ts-expect-error Deno.serve global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify JWT
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseClient = createClient(
      // @ts-expect-error Deno env
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-expect-error Deno env
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { error: authError } = await supabaseClient.auth.getUser();
    if (authError) return respond({ error: 'Unauthorized' }, 401);

    const { render_url, room_id } = await req.json() as {
      render_url: string;
      room_id?: string;
    };

    if (!render_url) return respond({ error: 'render_url required' }, 400);

    // Download the render image
    const imageRes = await fetch(render_url);
    if (!imageRes.ok) {
      return respond({ wall_color: '#F5F0EB', fallback: true });
    }
    const buf = new Uint8Array(await imageRes.arrayBuffer());

    const decoded = await decodeImagePixels(buf);
    if (!decoded) {
      return respond({ wall_color: '#F5F0EB', fallback: true });
    }

    const { pixels, width: imgW, height: imgH } = decoded;

    // Sample wall regions:
    // Back wall center: avoid furniture clutter, sample top 30% center strip
    const backWall = sampleRegion(pixels, imgW, imgH, 0.35, 0.1, 0.65, 0.4);
    // Left wall: left 15%, middle vertical strip
    const leftWall = sampleRegion(pixels, imgW, imgH, 0.02, 0.2, 0.17, 0.65);
    // Right wall: right 15%, middle vertical strip
    const rightWall = sampleRegion(pixels, imgW, imgH, 0.83, 0.2, 0.98, 0.65);

    // Average the three wall samples — weight back wall more
    const r = Math.round((backWall.r * 2 + leftWall.r + rightWall.r) / 4);
    const g = Math.round((backWall.g * 2 + leftWall.g + rightWall.g) / 4);
    const b = Math.round((backWall.b * 2 + leftWall.b + rightWall.b) / 4);
    const wallColor = toHex(r, g, b);

    // Optionally persist to rooms table
    if (room_id) {
      const serviceClient = createClient(
        // @ts-expect-error Deno env
        Deno.env.get('SUPABASE_URL') ?? '',
        // @ts-expect-error Deno env
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );
      await serviceClient
        .from('rooms')
        .update({ wall_color_extracted: wallColor })
        .eq('id', room_id);
    }

    return respond({ wall_color: wallColor });
  } catch (e) {
    console.error('extract-colors error:', e);
    return respond({ wall_color: '#F5F0EB', fallback: true });
  }
});
