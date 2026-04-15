/**
 * Dev-only: trigger a full pipeline re-run for an existing room
 * without authentication. Resets redesign state then calls the
 * redesign route via service-role bypass.
 *
 * Usage:
 *   curl -X POST http://localhost:3001/api/dev/rerun \
 *     -H "Content-Type: application/json" \
 *     -d '{"room_id": "<uuid>"}'
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Dev only" }, { status: 403 });
  }

  const { room_id } = (await req.json()) as { room_id?: string };
  if (!room_id) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  const { data: room } = await admin
    .from("rooms")
    .select("user_id")
    .eq("id", room_id)
    .single();

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  // Reset redesign state so the pipeline starts fresh
  await admin
    .from("rooms")
    .update({
      redesign_status: "pending",
      flux_prompt: null,
      design_brief: null,
      negative_prompt: null,
    })
    .eq("id", room_id);

  const baseUrl = `http://localhost:${process.env.PORT ?? 3001}`;

  const response = await fetch(`${baseUrl}/api/pipeline/redesign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-dev-bypass": process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    },
    body: JSON.stringify({ room_id }),
  });

  const result = (await response.json()) as unknown;
  return NextResponse.json({
    triggered: true,
    room_id,
    status: response.status,
    result,
  });
}
