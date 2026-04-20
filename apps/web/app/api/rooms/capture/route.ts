import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import sharp from "sharp";

// Auto-rotate based on EXIF orientation data.
// Fixes sideways images from phone cameras before upload to Supabase Storage.
async function correctImageOrientation(buffer: Buffer): Promise<Buffer> {
  console.log("[capture] input buffer size:", buffer.length); // eslint-disable-line no-console
  try {
    const result = await sharp(buffer)
      .rotate()
      .jpeg({ quality: 90, progressive: true })
      .toBuffer();
    console.log("[capture] sharp output size:", result.length); // eslint-disable-line no-console
    return result;
  } catch (err) {
    console.warn("[capture] sharp failed:", err);
    return buffer;
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const photo = formData.get("photo") as File | null;
    const roomId = formData.get("room_id") as string | null;
    const roomType = (formData.get("room_type") as string | null) || null;

    if (!photo) {
      return NextResponse.json({ error: "photo is required" }, { status: 400 });
    }

    if (photo.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Photo must be under 10MB" },
        { status: 400 },
      );
    }

    const admin = createAdminSupabaseClient();

    // Always output as jpg after EXIF correction
    const fileName = `${user.id}/${Date.now()}.jpg`;

    const arrayBuffer = await photo.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);
    const buffer = await correctImageOrientation(rawBuffer);

    const { error: uploadError } = await admin.storage
      .from("room-photos")
      .upload(fileName, buffer, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Photo upload failed: ${uploadError.message}`);
    }

    const { data: publicUrlData } = admin.storage
      .from("room-photos")
      .getPublicUrl(fileName);

    const photoUrl = publicUrlData.publicUrl;

    let finalRoomId = roomId;

    if (!finalRoomId) {
      const { data: room, error: roomError } = await admin
        .from("rooms")
        .insert({
          user_id: user.id,
          original_photo_url: photoUrl,
          ...(roomType ? { room_type: roomType } : {}),
        })
        .select("id")
        .single();

      if (roomError) {
        throw new Error(`Failed to create room: ${roomError.message}`);
      }

      finalRoomId = room.id;
    } else {
      const { data: owned } = await admin
        .from("rooms")
        .select("id")
        .eq("id", finalRoomId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!owned) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      await admin
        .from("rooms")
        .update({
          original_photo_url: photoUrl,
          ...(roomType ? { room_type: roomType } : {}),
        })
        .eq("id", finalRoomId)
        .eq("user_id", user.id);
    }

    return NextResponse.json({
      room_id: finalRoomId,
      photo_url: photoUrl,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
