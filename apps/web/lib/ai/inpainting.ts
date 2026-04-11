/**
 * Server-side inpainting mask generator.
 *
 * Produces a PNG where:
 *   Black (0)   = preserve — regions the user marked keep: true
 *   White (255) = regenerate — everything else
 *
 * When a SAM mask_url is present on REMOVE/UNDECIDED items, that combined
 * segmentation mask is downloaded and used as the source mask, with
 * post-processing: binary threshold → 9×9 dilation → 7px Gaussian blur → threshold.
 * KEEP items are zeroed out (blacked out) in the final mask regardless.
 *
 * Fallback: if no mask_url is present on any item, the existing bounding-box
 * rectangle approach is used.
 */

import { deflateSync } from "zlib";
import sharp from "sharp";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { KeepMaskItem } from "@/lib/store/room";

// ── Minimal PNG encoder ───────────────────────────────────────────────────────

const CRC32_TABLE: number[] = (function buildTable() {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (CRC32_TABLE[(crc ^ (buf[i] ?? 0)) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32BE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, false);
}

function concat(...arrays: (Uint8Array | Buffer)[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function pngChunk(type: string, data: Uint8Array | Buffer): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(4 + 4 + data.length + 4);
  const view = new DataView(out.buffer);
  writeUint32BE(view, 0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const forCrc = concat(typeBytes, data);
  writeUint32BE(view, 8 + data.length, crc32(forCrc));
  return out;
}

function encodePng(
  width: number,
  height: number,
  blackRects: Array<{ x: number; y: number; w: number; h: number }>,
): Uint8Array {
  const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  writeUint32BE(ihdrView, 0, width);
  writeUint32BE(ihdrView, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 0;

  const rowStride = 1 + width;
  const raw = new Uint8Array(height * rowStride).fill(255);
  for (let y = 0; y < height; y++) {
    raw[y * rowStride] = 0;
  }

  for (const r of blackRects) {
    const y0 = Math.max(0, Math.round(r.y));
    const y1 = Math.min(height, Math.round(r.y + r.h));
    const x0 = Math.max(0, Math.round(r.x));
    const x1 = Math.min(width, Math.round(r.x + r.w));
    for (let py = y0; py < y1; py++) {
      raw.fill(0, py * rowStride + 1 + x0, py * rowStride + 1 + x1);
    }
  }

  const compressed = new Uint8Array(deflateSync(raw));
  return concat(
    PNG_SIG,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", new Uint8Array(0)),
  );
}

// ── SAM mask post-processing ──────────────────────────────────────────────────

// Decode the SAM mask using sharp — handles PNG, JPEG, WebP, and any other
// format that Replicate's CDN might serve, regardless of Content-Type.
async function downloadAndDecodeMask(
  maskUrl: string,
  targetWidth: number,
  targetHeight: number,
): Promise<Uint8Array | null> {
  try {
    const res = await fetch(maskUrl);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());

    const { data } = await sharp(buffer)
      .resize(targetWidth, targetHeight, { kernel: "nearest" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return new Uint8Array(data);
  } catch (err) {
    console.error("[inpainting] mask decode error:", err);
    return null;
  }
}

function postProcessMask(
  pixels: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  // Step 1: Binary threshold
  const binary = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i++) {
    binary[i] = (pixels[i] ?? 0) > 127 ? 255 : 0;
  }

  // Step 2: Dilation — 9×9 kernel (radius 4)
  const dilated = new Uint8Array(binary.length);
  const dilateRadius = 4;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let maxVal = 0;
      for (let ky = -dilateRadius; ky <= dilateRadius; ky++) {
        for (let kx = -dilateRadius; kx <= dilateRadius; kx++) {
          const ny = y + ky;
          const nx = x + kx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            const v = binary[ny * width + nx] ?? 0;
            if (v > maxVal) maxVal = v;
          }
        }
      }
      dilated[y * width + x] = maxVal;
    }
  }

  // Step 3: Gaussian blur approximated with 3 box filter passes (kernel radius 3)
  let blurred = new Uint8Array(dilated);
  const boxRadius = 3;
  for (let pass = 0; pass < 3; pass++) {
    const temp = new Uint8Array(blurred.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0,
          count = 0;
        for (let kx = -boxRadius; kx <= boxRadius; kx++) {
          const nx = x + kx;
          if (nx >= 0 && nx < width) {
            sum += blurred[y * width + nx] ?? 0;
            count++;
          }
        }
        temp[y * width + x] = count > 0 ? Math.round(sum / count) : 0;
      }
    }
    const temp2 = new Uint8Array(temp.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0,
          count = 0;
        for (let ky = -boxRadius; ky <= boxRadius; ky++) {
          const ny = y + ky;
          if (ny >= 0 && ny < height) {
            sum += temp[ny * width + x] ?? 0;
            count++;
          }
        }
        temp2[y * width + x] = count > 0 ? Math.round(sum / count) : 0;
      }
    }
    blurred = temp2;
  }

  // Step 4: Binary threshold again
  const result = new Uint8Array(blurred.length);
  for (let i = 0; i < blurred.length; i++) {
    result[i] = (blurred[i] ?? 0) > 127 ? 255 : 0;
  }
  return result;
}

function applyKeepRects(
  pixels: Uint8Array,
  width: number,
  height: number,
  keepRects: Array<{ x: number; y: number; w: number; h: number }>,
): void {
  for (const r of keepRects) {
    const y0 = Math.max(0, Math.round(r.y));
    const y1 = Math.min(height, Math.round(r.y + r.h));
    const x0 = Math.max(0, Math.round(r.x));
    const x1 = Math.min(width, Math.round(r.x + r.w));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        pixels[y * width + x] = 0;
      }
    }
  }
}

function encodePixelsToPng(
  pixels: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  writeUint32BE(ihdrView, 0, width);
  writeUint32BE(ihdrView, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 0;

  const rowStride = 1 + width;
  const raw = new Uint8Array(height * rowStride);
  for (let y = 0; y < height; y++) {
    raw[y * rowStride] = 0;
    for (let x = 0; x < width; x++) {
      raw[y * rowStride + 1 + x] = pixels[y * width + x] ?? 0;
    }
  }

  const compressed = new Uint8Array(deflateSync(raw));
  return concat(
    PNG_SIG,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", new Uint8Array(0)),
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateInpaintingMask(
  photoUrl: string,
  keepMask: KeepMaskItem[],
  roomId: string,
): Promise<string | null> {
  // Get actual image dimensions — FLUX Fill requires mask to match input exactly
  const imageBuffer = await fetch(photoUrl).then((r) => r.arrayBuffer());
  const { width: imgW, height: imgH } = await sharp(
    Buffer.from(imageBuffer),
  ).metadata();
  const maskWidth = imgW ?? 1024;
  const maskHeight = imgH ?? 1024;

  const keptItems = keepMask.filter((item) => item.keep === true);
  const removeItems = keepMask.filter(
    (item) => item.keep !== true && item.type === "furniture",
  );

  const samMaskUrl = removeItems.find((item) => item.maskUrl)?.maskUrl;

  let pngData: Uint8Array;

  if (samMaskUrl) {
    const rawPixels = await downloadAndDecodeMask(
      samMaskUrl,
      maskWidth,
      maskHeight,
    );

    if (rawPixels) {
      const processed = postProcessMask(rawPixels, maskWidth, maskHeight);

      const keepRects = keptItems.map((item) => ({
        x: item.bbox[0] * maskWidth,
        y: item.bbox[1] * maskHeight,
        w: item.bbox[2] * maskWidth,
        h: item.bbox[3] * maskHeight,
      }));
      applyKeepRects(processed, maskWidth, maskHeight, keepRects);

      pngData = encodePixelsToPng(processed, maskWidth, maskHeight);
    } else {
      console.warn("[inpainting] SAM decode failed, falling back to bbox mask");
      if (keptItems.length === 0) return null;
      const blackRects = keptItems.map((item) => ({
        x: item.bbox[0] * maskWidth,
        y: item.bbox[1] * maskHeight,
        w: item.bbox[2] * maskWidth,
        h: item.bbox[3] * maskHeight,
      }));
      pngData = encodePng(maskWidth, maskHeight, blackRects);
    }
  } else {
    if (keptItems.length === 0) return null;
    const blackRects = keptItems.map((item) => ({
      x: item.bbox[0] * maskWidth,
      y: item.bbox[1] * maskHeight,
      w: item.bbox[2] * maskWidth,
      h: item.bbox[3] * maskHeight,
    }));
    pngData = encodePng(maskWidth, maskHeight, blackRects);
  }

  try {
    const admin = createAdminSupabaseClient();
    const storagePath = `inpainting-masks/${roomId}-${Date.now()}.png`;

    const { error: uploadError } = await admin.storage
      .from("room-photos")
      .upload(storagePath, pngData, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      console.error("[inpainting] Upload failed:", uploadError.message);
      return null;
    }

    const { data: publicUrlData } = admin.storage
      .from("room-photos")
      .getPublicUrl(storagePath);

    return publicUrlData.publicUrl ?? null;
  } catch (err) {
    console.error("[inpainting] Unexpected error:", err);
    return null;
  }
}
