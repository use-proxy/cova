import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { submitRender, submitFillRender } from '@/lib/ai/flux'

interface TweakRequestBody {
  room_id: string
  render_url: string
  tweak_type: 'color' | 'furniture' | 'accessory' | 'lighting'
  instruction: string
  target_bbox?: [number, number, number, number]
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as TweakRequestBody
    const { room_id, render_url, tweak_type, instruction, target_bbox } = body

    if (!room_id || !render_url || !tweak_type || !instruction) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (tweak_type === 'furniture' && target_bbox) {
      // FLUX Fill Pro inpainting — generate mask from bbox
      const maskUrl = await generateBboxMask(render_url, target_bbox, room_id)
      if (!maskUrl) {
        return NextResponse.json({ error: 'Failed to generate inpainting mask' }, { status: 500 })
      }

      const stylePrompt = `${instruction}. Photorealistic interior design, professional photography, high quality.`
      const predictionId = await submitFillRender(render_url, maskUrl, stylePrompt)

      return NextResponse.json({
        prediction_id: predictionId,
        tweak_type,
        estimated_cost: 0.050,
      })
    }

    // Kontext Pro for color, lighting, and accessory tweaks
    let prompt: string
    if (tweak_type === 'color' || tweak_type === 'lighting') {
      prompt = `Keep everything exactly the same. ${instruction}`
    } else {
      // accessory
      prompt = `Keep everything the same. Add: ${instruction}`
    }

    const predictionId = await submitRender(render_url, [], prompt)

    return NextResponse.json({
      prediction_id: predictionId,
      tweak_type,
      estimated_cost: 0.040,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Generate a white-on-black mask image for the given bbox region.
 * Uploads to Supabase Storage under room-photos bucket, returns public URL.
 * Identical logic to the swap route — white = inpaint, black = preserve.
 */
async function generateBboxMask(
  renderUrl: string,
  bbox: [number, number, number, number],
  roomId: string,
): Promise<string | null> {
  try {
    const { deflateSync } = await import('zlib')
    const { createAdminSupabaseClient } = await import('@/lib/supabase/admin')

    const resp = await fetch(renderUrl, { headers: { Range: 'bytes=0-65535' } })
    const buf = new Uint8Array(await resp.arrayBuffer())
    let imgW = 1024, imgH = 1024
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      for (let i = 2; i < buf.length - 8; i++) {
        if (buf[i] === 0xff && (buf[i + 1] === 0xc0 || buf[i + 1] === 0xc2)) {
          const h = ((buf[i + 5] ?? 0) << 8) | (buf[i + 6] ?? 0)
          const w = ((buf[i + 7] ?? 0) << 8) | (buf[i + 8] ?? 0)
          if (w > 0 && h > 0) { imgW = w; imgH = h; break }
        }
      }
    }

    const [bx, by, bw, bh] = bbox
    const px = Math.max(0, Math.floor(bx * imgW))
    const py = Math.max(0, Math.floor(by * imgH))
    const pw = Math.min(imgW - px, Math.ceil(bw * imgW))
    const ph = Math.min(imgH - py, Math.ceil(bh * imgH))

    const rowStride = 1 + imgW
    const raw = new Uint8Array(imgH * rowStride).fill(0)
    for (let y = 0; y < imgH; y++) raw[y * rowStride] = 0

    const y0 = Math.max(0, py), y1 = Math.min(imgH, py + ph)
    const x0 = Math.max(0, px), x1 = Math.min(imgW, px + pw)
    for (let y = y0; y < y1; y++) {
      raw.fill(255, y * rowStride + 1 + x0, y * rowStride + 1 + x1)
    }

    const compressed = new Uint8Array(deflateSync(raw))

    const CRC32_TABLE = (() => {
      const t: number[] = []
      for (let i = 0; i < 256; i++) {
        let c = i
        for (let j = 0; j < 8; j++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
        t.push(c >>> 0)
      }
      return t
    })()

    const crc32 = (b: Uint8Array): number => {
      let crc = 0xffffffff
      for (let i = 0; i < b.length; i++) crc = (CRC32_TABLE[(crc ^ (b[i] ?? 0)) & 0xff]! ^ (crc >>> 8)) >>> 0
      return (crc ^ 0xffffffff) >>> 0
    }

    const chunk = (type: string, data: Uint8Array): Uint8Array => {
      const tb = new TextEncoder().encode(type)
      const out = new Uint8Array(4 + 4 + data.length + 4)
      const v = new DataView(out.buffer)
      v.setUint32(0, data.length, false)
      out.set(tb, 4)
      out.set(data, 8)
      const forCrc = new Uint8Array(tb.length + data.length)
      forCrc.set(tb); forCrc.set(data, tb.length)
      v.setUint32(8 + data.length, crc32(forCrc), false)
      return out
    }

    const ihdr = new Uint8Array(13)
    const iv = new DataView(ihdr.buffer)
    iv.setUint32(0, imgW, false); iv.setUint32(4, imgH, false)
    ihdr[8] = 8; ihdr[9] = 0

    const pngSig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    const idat = chunk('IDAT', compressed)
    const iend = chunk('IEND', new Uint8Array(0))
    const ihdrChunk = chunk('IHDR', ihdr)

    const pngSize = pngSig.length + ihdrChunk.length + idat.length + iend.length
    const png = new Uint8Array(pngSize)
    let off = 0
    for (const part of [pngSig, ihdrChunk, idat, iend]) {
      png.set(part, off); off += part.length
    }

    const admin = createAdminSupabaseClient()
    const path = `tweak-masks/${roomId}-${Date.now()}.png`
    const { error } = await admin.storage.from('room-photos').upload(path, png, {
      contentType: 'image/png',
      upsert: true,
    })
    if (error) {
      console.error('[tweak] mask upload failed:', error.message)
      return null
    }
    const { data } = admin.storage.from('room-photos').getPublicUrl(path)
    return data.publicUrl
  } catch (err) {
    console.error('[tweak] generateBboxMask failed:', err)
    return null
  }
}
