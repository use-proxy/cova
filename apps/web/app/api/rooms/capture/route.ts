import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import sharp from 'sharp'

// Auto-rotate based on EXIF orientation data.
// Fixes sideways images from phone cameras before upload to Supabase Storage.
async function correctImageOrientation(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer)
      .rotate()  // honors EXIF orientation tag
      .jpeg({ quality: 90, progressive: true })
      .toBuffer()
  } catch {
    return buffer  // return original if sharp fails
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const photo = formData.get('photo') as File | null
    const roomId = formData.get('room_id') as string | null

    if (!photo) {
      return NextResponse.json({ error: 'photo is required' }, { status: 400 })
    }

    if (photo.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Photo must be under 10MB' }, { status: 400 })
    }

    const admin = createAdminSupabaseClient()

    // Always output as jpg after EXIF correction
    const fileName = `${user.id}/${Date.now()}.jpg`

    const arrayBuffer = await photo.arrayBuffer()
    const rawBuffer = Buffer.from(arrayBuffer)
    const buffer = await correctImageOrientation(rawBuffer)

    const { error: uploadError } = await admin.storage
      .from('room-photos')
      .upload(fileName, buffer, {
        contentType: 'image/jpeg',
        upsert: false,
      })

    if (uploadError) {
      throw new Error(`Photo upload failed: ${uploadError.message}`)
    }

    const { data: publicUrlData } = admin.storage.from('room-photos').getPublicUrl(fileName)

    const photoUrl = publicUrlData.publicUrl

    let finalRoomId = roomId

    if (!finalRoomId) {
      const { data: room, error: roomError } = await admin
        .from('rooms')
        .insert({
          user_id: user.id,
          original_photo_url: photoUrl,
        })
        .select('id')
        .single()

      if (roomError) {
        throw new Error(`Failed to create room: ${roomError.message}`)
      }

      finalRoomId = room.id
    } else {
      await admin
        .from('rooms')
        .update({ original_photo_url: photoUrl })
        .eq('id', finalRoomId)
    }

    return NextResponse.json({
      room_id: finalRoomId,
      photo_url: photoUrl,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
