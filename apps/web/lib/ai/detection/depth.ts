/**
 * Depth Pro — Apple's metric depth model on Replicate.
 *
 * Produces sharp-boundary metric depth in meters, ~2.25MP resolution,
 * roughly 0.3s inference.
 */

// LICENSE VERIFICATION REQUIRED BEFORE PRODUCTION
// Apple Depth Pro (apple/ml-depth-pro) license status must be confirmed
// before this ships to users. Check: https://github.com/apple/ml-depth-pro
// If non-commercial: replace with Depth Anything V2 Small (Apache-2.0).
// Fallback is already implemented below. Do NOT remove this comment until
// license is confirmed and documented in PRODUCT_TRUTH.md.
// Verified by: [name] on [date]

import { inflateSync } from "zlib";
import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const DEPTH_PRO_MODEL =
  "garg-aayush/ml-depth-pro:63efd78f11d91e3236df416c894f5b49e996271c3f96f98ac806288a5da59db8" as const;

// Apache-2.0 licensed fallback — confirmed safe for commercial use.
const DEPTH_ANYTHING_V2_MODEL =
  "chenxwh/depth-anything-v2:45a7c7a37cef40ad4aa29cc1fbe3e78a9e5c23c8f61e0e53a5869adcd28f98b6" as const;

export interface DepthResult {
  depthMapUrl: string;
  // 2D metric depth. First index is row, second is column. Values normalised 0–1.
  // Downsampled 4× in each dimension to keep JSON size sane.
  // Full-res is available via depthMapUrl.
  depthMap: number[][];
}

type DepthOutput =
  | string
  | string[]
  | { depth?: unknown; output?: unknown; [k: string]: unknown };

async function extractUrl(out: DepthOutput): Promise<string | null> {
  if (typeof out === "string" && out.startsWith("http")) return out;
  if (Array.isArray(out) && out.length > 0) {
    const s = String(out[0]);
    if (s.startsWith("http")) return s;
  }
  if (out && typeof out === "object") {
    for (const key of ["depth", "depth_map", "output"]) {
      const v = (out as Record<string, unknown>)[key];
      if (!v) continue;
      const s = String(v);
      if (s.startsWith("http")) return s;
      if (typeof (v as { url?: () => URL }).url === "function") {
        return (v as { url: () => URL }).url().href;
      }
    }
  }
  return null;
}

// ── PNG decoder ───────────────────────────────────────────────────────────────
// Decodes 8-bit or 16-bit grayscale PNG into a normalised 0–1 float grid.
// Handles all 5 PNG filter types. Downsamples by DECODE_STEP in each axis
// to keep memory usage sane for 2+ MP depth maps. Uses Node.js built-in
// zlib (inflateSync) — no additional dependencies needed.

const DECODE_STEP = 4; // 4× downsample in each axis → 16× total reduction

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePngGrayscale(buf: Buffer): number[][] {
  const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== PNG_SIG[i]) return [];
  }

  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 0;
  const idatChunks: Uint8Array[] = [];
  let pos = 8;

  while (pos + 12 <= buf.length) {
    const chunkLen = buf.readUInt32BE(pos);
    const chunkType = buf.subarray(pos + 4, pos + 8).toString("ascii");
    const chunkData = buf.subarray(pos + 8, pos + 8 + chunkLen);

    if (chunkType === "IHDR") {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8]!;
      colorType = chunkData[9]!;
    } else if (chunkType === "IDAT") {
      idatChunks.push(new Uint8Array(chunkData));
    } else if (chunkType === "IEND") {
      break;
    }

    pos += 12 + chunkLen;
  }

  if (!width || !height || idatChunks.length === 0) return [];

  // samplesPerPixel: grayscale=1, grayscale+alpha=2, RGB=3, RGB+alpha=4
  const samplesPerPixel =
    colorType === 0 ? 1 : colorType === 4 ? 2 : colorType === 2 ? 3 : 4;
  const bytesPerSample = bitDepth <= 8 ? 1 : 2;
  const bpp = samplesPerPixel * bytesPerSample;
  const maxVal = bitDepth === 16 ? 65535 : 255;

  let rawData: Buffer;
  try {
    const totalLen = idatChunks.reduce((s, c) => s + c.length, 0);
    const combined = new Uint8Array(totalLen);
    let off = 0;
    for (const c of idatChunks) {
      combined.set(c, off);
      off += c.length;
    }
    rawData = inflateSync(combined);
  } catch {
    return [];
  }

  const stride = 1 + width * bpp;
  const result: number[][] = [];
  const prevRow = new Uint8Array(width * bpp);

  for (let y = 0; y < height; y++) {
    const rowBase = y * stride;
    const filterType = rawData[rowBase]!;
    const recon = new Uint8Array(width * bpp);

    for (let i = 0; i < width * bpp; i++) {
      const rawByte = rawData[rowBase + 1 + i]!;
      const a = i >= bpp ? recon[i - bpp]! : 0;
      const b = prevRow[i]!;
      const c = i >= bpp ? prevRow[i - bpp]! : 0;
      switch (filterType) {
        case 0:
          recon[i] = rawByte;
          break;
        case 1:
          recon[i] = (rawByte + a) & 0xff;
          break;
        case 2:
          recon[i] = (rawByte + b) & 0xff;
          break;
        case 3:
          recon[i] = (rawByte + Math.floor((a + b) / 2)) & 0xff;
          break;
        case 4:
          recon[i] = (rawByte + paethPredictor(a, b, c)) & 0xff;
          break;
        default:
          recon[i] = rawByte;
      }
    }
    prevRow.set(recon);

    if (y % DECODE_STEP === 0) {
      const row: number[] = [];
      for (let x = 0; x < width; x += DECODE_STEP) {
        const idx = x * bpp;
        let val: number;
        if (bitDepth === 16) {
          val = ((recon[idx]! << 8) | recon[idx + 1]!) / maxVal;
        } else {
          val = recon[idx]! / maxVal;
        }
        row.push(val);
      }
      result.push(row);
    }
  }

  if (result.length === 0) return [];

  // Sanity check: flat depth map almost certainly indicates a decode failure.
  let min = Infinity;
  let max = -Infinity;
  for (const row of result) {
    for (const v of row) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (max - min < 0.01) {
    console.warn(
      "[depth-decode] WARNING: depth map appears flat — possible decode failure",
    );
  }

  return result;
}

/**
 * Fetches the depth map PNG from a URL and decodes it into a coarse 2D float grid.
 * Downsampled 4× in each axis (16× total) to keep JSON size manageable.
 * Returns [] on any fetch or parse failure — non-fatal, depth features degrade gracefully.
 */
async function coarseDecodeDepth(url: string): Promise<number[][]> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(
        `[depth-decode] Failed to fetch depth map: HTTP ${res.status}`,
      );
      return [];
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return decodePngGrayscale(buf);
  } catch (err) {
    console.warn(
      "[depth-decode] Failed to decode depth map:",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}

async function runWithModel(
  modelId: `${string}/${string}:${string}`,
  imageUrl: string,
): Promise<DepthResult | null> {
  const output = (await replicate.run(modelId, {
    input: { image: imageUrl },
  })) as DepthOutput;

  const url = await extractUrl(output);
  if (!url) {
    console.warn("[depth] No URL in depth model output");
    return null;
  }

  const depthMap = await coarseDecodeDepth(url);
  return { depthMapUrl: url, depthMap };
}

export async function runDepthPro(
  imageUrl: string,
): Promise<DepthResult | null> {
  try {
    return await runWithModel(
      DEPTH_PRO_MODEL as `${string}/${string}:${string}`,
      imageUrl,
    );
  } catch (primaryErr) {
    console.warn(
      "[depth] Depth Pro failed — trying Depth Anything V2 fallback:",
      primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
    );
    try {
      return await runWithModel(
        DEPTH_ANYTHING_V2_MODEL as `${string}/${string}:${string}`,
        imageUrl,
      );
    } catch (fallbackErr) {
      console.warn(
        "[depth] Depth Anything V2 fallback also failed (non-fatal):",
        fallbackErr instanceof Error
          ? fallbackErr.message
          : String(fallbackErr),
      );
      return null;
    }
  }
}

/**
 * Returns the median depth (0–1 normalised) within the bbox region, or 0 if the
 * depth map is empty/unavailable.
 */
export function sampleDepthAtBbox(
  depthMap: number[][],
  bbox: [number, number, number, number],
): number {
  if (!depthMap || depthMap.length === 0) return 0;
  const [x, y, w, h] = bbox;
  const rows = depthMap.length;
  const cols = depthMap[0]?.length ?? 0;
  if (cols === 0) return 0;

  const samples: number[] = [];
  const startRow = Math.max(0, Math.floor(y * rows));
  const endRow = Math.min(rows, Math.floor((y + h) * rows));
  const startCol = Math.max(0, Math.floor(x * cols));
  const endCol = Math.min(cols, Math.floor((x + w) * cols));

  for (let r = startRow; r < endRow; r += 2) {
    for (let c = startCol; c < endCol; c += 2) {
      const row = depthMap[r];
      if (!row) continue;
      const v = row[c];
      if (typeof v === "number" && v > 0) samples.push(v);
    }
  }
  if (samples.length === 0) return 0;
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] ?? 0;
}
