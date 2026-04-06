// apps/web/lib/ai/renderCrop.ts

import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export interface BoundingBox {
  x: number  // fraction 0-1
  y: number  // fraction 0-1
  w: number  // fraction 0-1
  h: number  // fraction 0-1
}

// Fetch image dimensions from URL without downloading full image
async function getImageDimensions(
  url: string,
): Promise<{ width: number; height: number }> {
  // Fetch only first 64KB to get image header
  const response = await fetch(url, {
    headers: { Range: 'bytes=0-65535' },
  })
  const buffer = await response.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  // Try JPEG — look for SOF0 or SOF2 markers
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let i = 2; i < bytes.length - 8; i++) {
      if (bytes[i] === 0xff && (bytes[i + 1] === 0xc0 || bytes[i + 1] === 0xc2)) {
        const height = ((bytes[i + 5] ?? 0) << 8) | (bytes[i + 6] ?? 0)
        const width = ((bytes[i + 7] ?? 0) << 8) | (bytes[i + 8] ?? 0)
        if (width > 0 && height > 0) return { width, height }
      }
    }
  }

  // Try PNG — dimensions at bytes 16-23
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const width =
      ((bytes[16] ?? 0) << 24) | ((bytes[17] ?? 0) << 16) |
      ((bytes[18] ?? 0) << 8)  |  (bytes[19] ?? 0)
    const height =
      ((bytes[20] ?? 0) << 24) | ((bytes[21] ?? 0) << 16) |
      ((bytes[22] ?? 0) << 8)  |  (bytes[23] ?? 0)
    if (width > 0 && height > 0) return { width, height }
  }

  // Fallback: assume 1024×1024
  return { width: 1024, height: 1024 }
}

/**
 * Crop render image to bounding box and upload to Supabase Storage.
 * Returns public URL of the cropped image, or falls back to the full render
 * URL if sharp is unavailable or upload fails.
 *
 * Adds 10% padding around the item for visual context in CLIP matching.
 */
export async function cropAndUploadRenderRegion(
  renderUrl: string,
  bbox: BoundingBox,
  roomId: string,
  itemId: string,
): Promise<string> {
  let sharp: typeof import('sharp') | null = null
  try {
    sharp = (await import('sharp')).default
  } catch {
    console.warn('[renderCrop] sharp not available — using full render URL')
    return renderUrl
  }

  try {
    const { width: imgW, height: imgH } = await getImageDimensions(renderUrl)

    // Convert fractional bbox to pixel coordinates with 10% padding
    const padding = 0.10
    const px = Math.max(0, Math.floor((bbox.x - padding * bbox.w) * imgW))
    const py = Math.max(0, Math.floor((bbox.y - padding * bbox.h) * imgH))
    const pw = Math.min(imgW - px, Math.ceil((bbox.w + 2 * padding * bbox.w) * imgW))
    const ph = Math.min(imgH - py, Math.ceil((bbox.h + 2 * padding * bbox.h) * imgH))

    // Fetch the full render image
    const imageResponse = await fetch(renderUrl)
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())

    // Crop with sharp
    const croppedBuffer = await sharp(imageBuffer)
      .extract({
        left: px,
        top: py,
        width: Math.max(1, pw),
        height: Math.max(1, ph),
      })
      .jpeg({ quality: 90 })
      .toBuffer()

    // Upload to Supabase Storage (admin client — no RLS for server writes)
    const admin = createAdminSupabaseClient()
    const path = `render-crops/${roomId}/${itemId}-${Date.now()}.jpg`

    const { error } = await admin.storage
      .from('room-photos')
      .upload(path, croppedBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      })

    if (error) {
      console.error('[renderCrop] Upload failed:', error.message)
      return renderUrl
    }

    const { data } = admin.storage.from('room-photos').getPublicUrl(path)
    return data.publicUrl
  } catch (err) {
    console.error('[renderCrop] Crop failed:', err)
    return renderUrl
  }
}
