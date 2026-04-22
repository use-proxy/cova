/**
 * Input normalization for the V3 empty-room pipeline.
 *
 * Claude Vision (called inside the Modal service) rejects base64 payloads
 * over 5 MB. Phone camera shots routinely exceed that, so before handing
 * the image URL off to Modal we fetch it, resize to a Vision-safe size,
 * and re-upload to fal's CDN to get a fresh URL Modal can fetch.
 *
 * Budget: ≤1536 px longest edge, JPEG q=85 → consistently <1 MB in
 * practice (the 1152×1536 smoke-test input produced ~310 KB).
 */

import sharp from "sharp";
import { fal } from "@fal-ai/client";

const MAX_EDGE = 1536;
const JPEG_QUALITY = 85;

// Re-configure on import using direct credentials. apps/web/lib/fal.ts
// sets a client-side proxy, which is the wrong shape for server-side
// route handlers; here we want unmediated server-to-fal calls.
if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

export interface NormalizeResult {
  /** CDN URL of the resized image, safe to hand to Modal. */
  url: string;
  /** Size of the resized payload in bytes (for logging / P0 monitoring). */
  sizeBytes: number;
  /** Resized width × height in pixels. */
  width: number;
  height: number;
}

export async function normalizeInputImage(sourceUrl: string): Promise<NormalizeResult> {
  const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw new Error(`normalize: fetch ${sourceUrl} failed: ${res.status}`);
  }
  const input = Buffer.from(await res.arrayBuffer());

  const pipeline = sharp(input, { failOn: "error" })
    .rotate() // honor EXIF orientation
    .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  // fal.storage.upload takes a File / Blob. Buffer works via the File
  // constructor (Node 20+ ships a WHATWG-compliant File global).
  const file = new File([data], "normalized.jpg", { type: "image/jpeg" });
  const url = await fal.storage.upload(file);

  return { url, sizeBytes: data.length, width: info.width, height: info.height };
}
