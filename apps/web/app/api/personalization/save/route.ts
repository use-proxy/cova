import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  validateManifest,
  type PersonalizationManifest,
} from "@/lib/types/personalization";
import { compileManifest } from "@/lib/ai/personalization-compiler";

export const maxDuration = 30;

interface SaveBody {
  room_id?: string;
  manifest?: unknown;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SaveBody;
  if (!body.room_id) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }
  if (!validateManifest(body.manifest)) {
    return NextResponse.json(
      { error: "Invalid manifest (must be version 2.0 schema_version 2)" },
      { status: 400 },
    );
  }
  const manifest = body.manifest as PersonalizationManifest;

  const admin = createAdminSupabaseClient();
  const { data: room, error: roomErr } = await admin
    .from("rooms")
    .select("id, user_id, room_type")
    .eq("id", body.room_id)
    .eq("user_id", user.id)
    .single();
  if (roomErr || !room) {
    return NextResponse.json(
      { error: "Room not found or access denied" },
      { status: 404 },
    );
  }

  const compiled = await compileManifest(
    manifest,
    room.room_type ?? manifest.room_type,
  );

  const { error: updateErr } = await admin
    .from("rooms")
    .update({
      personalization: compiled as unknown as Record<string, unknown>,
      design_step: 7,
    })
    .eq("id", body.room_id);
  if (updateErr) {
    console.error("[personalization/save] update failed:", updateErr);
    return NextResponse.json(
      { error: "Failed to save personalization" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    compiled_additions: compiled._compiled,
  });
}
