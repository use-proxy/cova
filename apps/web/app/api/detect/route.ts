/**
 * Area 2 — detection pipeline route.
 *
 * POST body: { imageUrl: string, roomId: string }
 *
 * Orchestrates RAM++ → GroundingDINO → SAM2 + Depth Pro + Claude Vision
 * room context in parallel, writes the result to the `rooms` row, and
 * returns a compact JSON response for the client to proceed through
 * screens A → B.
 */

export const maxDuration = 300;

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { runDetectionPipeline } from "@/lib/ai/detection";

interface DetectRequestBody {
  imageUrl?: string;
  roomId?: string;
  // Legacy callers may send these — still supported.
  photo_url?: string;
  room_id?: string;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  const body = (await request.json()) as DetectRequestBody;
  const imageUrl = body.imageUrl ?? body.photo_url;
  const roomId = body.roomId ?? body.room_id;
  if (!imageUrl || !roomId) {
    return NextResponse.json(
      { error: "imageUrl and roomId are required" },
      { status: 400 },
    );
  }

  // Mark detection as running.
  await supabase
    .from("rooms")
    .update({ detection_status: "running" })
    .eq("id", roomId)
    .eq("user_id", user.id);

  try {
    const result = await runDetectionPipeline(imageUrl, roomId);

    await supabase
      .from("rooms")
      .update({
        detection_status: "complete",
        keep_mask: result.keepMask,
        room_context: result.roomContext,
        detection_metadata: {
          errors: result.errors,
          objectCount: result.objects.length,
          confidenceDistribution: result.confidenceDistribution,
          ranAt: new Date().toISOString(),
        },
        design_step: 1,
      })
      .eq("id", roomId)
      .eq("user_id", user.id);

    return NextResponse.json({
      success: true,
      objectCount: result.objects.length,
      roomContext: result.roomContext,
      keepMask: result.keepMask,
      errors: result.errors,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("rooms")
      .update({
        detection_status: "failed",
        detection_metadata: {
          fatalError: message,
          ranAt: new Date().toISOString(),
        },
      })
      .eq("id", roomId)
      .eq("user_id", user.id);

    // Non-fatal at the route level — surface an empty shape so the UI
    // can still proceed manually.
    return NextResponse.json({
      success: false,
      fatalError: message,
      objectCount: 0,
      roomContext: null,
      keepMask: null,
    });
  }
}
