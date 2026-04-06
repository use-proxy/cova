/**
 * Server-side inpainting mask generator.
 *
 * Produces a PNG where:
 *   Black (0)   = preserve — regions the user marked keep: true
 *   White (255) = regenerate — everything else
 *
 * Implemented with Node.js built-ins only (zlib + Uint8Array/DataView).
 * No native dependencies — safe for Vercel serverless.
 */

import { deflateSync } from 'zlib'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { KeepMaskItem } from '@/lib/store/room'

// ── Minimal PNG encoder ───────────────────────────────────────────────────────

const CRC32_TABLE: number[] = (function buildTable() {
  const table: number[] = []
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
    }
    table.push(c >>> 0)
  }
  return table
})()

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = (CRC32_TABLE[(crc ^ (buf[i] ?? 0)) & 0xff]! ^ (crc >>> 8)) >>> 0
  }
  return (crc ^ 0xffffffff) >>> 0
}

function writeUint32BE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, false /* big-endian */)
}

function concat(...arrays: (Uint8Array | Buffer)[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) {
    out.set(a, offset)
    offset += a.length
  }
  return out
}

function pngChunk(type: string, data: Uint8Array | Buffer): Uint8Array {
  const typeBytes = new TextEncoder().encode(type) // always 4 bytes for valid PNG chunk types
  const out = new Uint8Array(4 + 4 + data.length + 4)
  const view = new DataView(out.buffer)
  writeUint32BE(view, 0, data.length)
  out.set(typeBytes, 4)
  out.set(data, 8)
  // CRC covers type + data
  const forCrc = concat(typeBytes, data)
  writeUint32BE(view, 8 + data.length, crc32(forCrc))
  return out
}

/**
 * Encode a grayscale black-and-white PNG.
 * @param width  - canvas width in pixels
 * @param height - canvas height in pixels
 * @param blackRects - pixel-coordinate rectangles to fill black (preserved)
 */
function encodePng(
  width: number,
  height: number,
  blackRects: Array<{ x: number; y: number; w: number; h: number }>,
): Uint8Array {
  const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR — grayscale 8-bit, no interlace
  const ihdr = new Uint8Array(13)
  const ihdrView = new DataView(ihdr.buffer)
  writeUint32BE(ihdrView, 0, width)
  writeUint32BE(ihdrView, 4, height)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 0  // color type: grayscale
  // bytes 10-12 (compression/filter/interlace) default to 0

  // Raw scanlines: 1 filter byte + width pixel bytes, init white
  const rowStride = 1 + width
  const raw = new Uint8Array(height * rowStride).fill(255)
  for (let y = 0; y < height; y++) {
    raw[y * rowStride] = 0 // filter type None
  }

  // Fill preserved regions black
  for (const r of blackRects) {
    const y0 = Math.max(0, Math.round(r.y))
    const y1 = Math.min(height, Math.round(r.y + r.h))
    const x0 = Math.max(0, Math.round(r.x))
    const x1 = Math.min(width, Math.round(r.x + r.w))
    for (let py = y0; py < y1; py++) {
      raw.fill(0, py * rowStride + 1 + x0, py * rowStride + 1 + x1)
    }
  }

  const compressed = deflateSync(raw)

  return concat(
    PNG_SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', new Uint8Array(0)),
  )
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Mask resolution — model will scale this to match the input image. */
const MASK_SIZE = 1024

/**
 * Generate an inpainting mask from a keep mask and upload it to Supabase.
 *
 * Returns the public URL of the uploaded mask PNG, or null if:
 *   - No items are marked keep === true (no mask needed; regenerate all)
 *   - Upload fails (non-fatal; caller proceeds without a mask)
 *
 * Mask convention:
 *   Black (0)   = preserve this region
 *   White (255) = regenerate this region
 *
 * NOTE: flux-kontext-pro does not officially document a `mask` input parameter.
 * The mask URL is stored in the prediction input for future use once model support
 * is confirmed against the Replicate schema. See: /api/render/route.ts
 */
export async function generateInpaintingMask(
  _photoUrl: string,
  keepMask: KeepMaskItem[],
  roomId: string,
): Promise<string | null> {
  const keptItems = keepMask.filter((item) => item.keep === true)
  if (keptItems.length === 0) return null

  // bbox format from grounding.ts / detect route: [x, y, w, h] all normalized 0–1
  const blackRects = keptItems.map((item) => ({
    x: item.bbox[0] * MASK_SIZE,
    y: item.bbox[1] * MASK_SIZE,
    w: item.bbox[2] * MASK_SIZE,
    h: item.bbox[3] * MASK_SIZE,
  }))

  const pngData = encodePng(MASK_SIZE, MASK_SIZE, blackRects)

  try {
    const admin = createAdminSupabaseClient()
    const storagePath = `inpainting-masks/${roomId}-${Date.now()}.png`

    const { error: uploadError } = await admin.storage
      .from('room-photos')
      .upload(storagePath, pngData, {
        contentType: 'image/png',
        upsert: false,
      })

    if (uploadError) {
      console.error('[inpainting] Upload failed:', uploadError.message)
      return null
    }

    const { data: publicUrlData } = admin.storage
      .from('room-photos')
      .getPublicUrl(storagePath)

    return publicUrlData.publicUrl ?? null
  } catch (err) {
    console.error('[inpainting] Unexpected error:', err)
    return null
  }
}
