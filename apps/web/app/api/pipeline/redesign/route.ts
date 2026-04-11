/**
 * Pipeline 2 — Redesign
 * Fires on step-7d page mount after all personalization is complete.
 * Calls the Modal redesign_webhook to run FLUX Kontext Pro on the room panorama.
 *
 * Input:  { room_id: string, user_id: string }
 * Output: { status, room_id, redesigned_pano_url, perspective_render_url, ... }
 * Saves:  rooms.redesign_pano_url, rooms.perspective_render_url,
 *         rooms.redesign_status ("kontext_processing" -> "kontext_complete")
 *         (all written by the Modal pipeline directly to Supabase)
 *
 * Client should poll /api/rooms/status?roomId=X every 3s for redesign_status.
 * Navigate to step-8a when redesign_status reaches "kontext_complete" or later.
 * Timeout: 5 minutes.
 */

export const maxDuration = 300;

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { compilePromptWithClaude } from "@/lib/ai/prompt-compiler";
import { buildFluxPrompt, buildAnchorFallbackPrompt } from "@/lib/ai/flux";
import { fetchTopStyleReference } from "@/lib/ai/style-references";
import {
  analyzeRoomArchitecture,
  type RoomArchitecture,
} from "@/lib/ai/room-analyzer";
import type { StyleFingerprint } from "@/types/fingerprint";
import type { RenderContext } from "@/lib/types/area2";

interface RoomRow {
  render_context: RenderContext | null;
  room_type: string | null;
  style_blend: Record<string, number> | null;
  original_image_url: string | null;
  original_photo_url: string | null;
  user_id: string;
}

interface UserRow {
  style_fingerprint: StyleFingerprint | Record<string, number> | null;
}

interface RedesignBody {
  room_id?: string;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as RedesignBody;
  const { room_id } = body;

  if (!room_id) {
    return NextResponse.json({ error: "room_id is required" }, { status: 400 });
  }

  const webhookUrl = process.env.REDESIGN_PIPELINE_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "REDESIGN_PIPELINE_WEBHOOK_URL not configured" },
      { status: 503 },
    );
  }

  // Read personalization data
  const admin = createAdminSupabaseClient();

  let room: RoomRow | null = null;
  let userRow: UserRow | null = null;
  try {
    const [roomRes, userRes] = await Promise.all([
      admin
        .from("rooms")
        .select(
          "user_id, render_context, room_type, style_blend, original_image_url, original_photo_url",
        )
        .eq("id", room_id)
        .eq("user_id", user.id)
        .single(),
      admin
        .from("users")
        .select("style_fingerprint")
        .eq("id", user.id)
        .single(),
    ]);
    room = (roomRes.data ?? null) as RoomRow | null;
    userRow = (userRes.data ?? null) as UserRow | null;
  } catch (err) {
    console.error("[redesign] DB read failed:", err);
    // continue — compiled_prompt will be null, Modal uses Python fallback
  }

  if (!room) {
    return NextResponse.json(
      { error: "Room not found or access denied" },
      { status: 404 },
    );
  }

  const renderContext: RenderContext | null = room?.render_context ?? null;
  const roomType = room?.room_type ?? "room"; // never assume room type; "room" is a safe generic fallback

  // Resolve fingerprint — render_context first, then users fallback
  let fingerprint: StyleFingerprint | null = null;
  if (
    renderContext?.fingerprint &&
    typeof renderContext.fingerprint === "object" &&
    "dimensions" in renderContext.fingerprint
  ) {
    fingerprint = renderContext.fingerprint as StyleFingerprint;
  } else if (
    userRow?.style_fingerprint &&
    typeof userRow.style_fingerprint === "object" &&
    "dimensions" in (userRow.style_fingerprint as object)
  ) {
    fingerprint = userRow.style_fingerprint as StyleFingerprint;
  }

  // Persist the full StyleFingerprint back to rooms.render_context so
  // downstream stages always see { dimensions, covariance, confidence }
  // rather than a bare dimensions record. Fire-and-forget.
  if (fingerprint && room_id) {
    void admin
      .from("rooms")
      .update({
        render_context: {
          ...(renderContext ?? {}),
          fingerprint,
        },
      } as Record<string, unknown>)
      .eq("id", room_id)
      .then(({ error }) => {
        if (error)
          console.error("[redesign] render_context write failed:", error);
      });
  }

  // Fetch style reference anchor
  let anchorPrompt: string | null = null;
  let styleReferenceUrl: string | null = null;
  if (fingerprint) {
    const styleRef = await fetchTopStyleReference(fingerprint, roomType).catch(
      () => null,
    );
    anchorPrompt = styleRef?.flux_prompt ?? null;
    styleReferenceUrl = styleRef?.image_url ?? null;
  }

  // Gemini room architecture analysis (non-blocking)
  let roomAnalysis: RoomArchitecture | null = null;
  try {
    const originalPhotoUrl =
      room?.original_image_url ?? room?.original_photo_url ?? null;
    if (originalPhotoUrl) {
      roomAnalysis = await analyzeRoomArchitecture(originalPhotoUrl);
    }
  } catch (err) {
    console.error("[redesign] Gemini analysis failed:", err);
  }

  // Compile prompt
  let compiledPrompt: string | null = null;
  if (fingerprint) {
    compiledPrompt = await compilePromptWithClaude(
      renderContext,
      roomType,
      fingerprint,
      anchorPrompt,
      roomAnalysis,
    ).catch(() => null);

    // Fallback: anchor-strategy prompt if Claude compile fails. This
    // MUST frame kept items as anchors and removed items as vacated zones,
    // matching the Rules 1-4 strategy in prompt-compiler.ts. The old
    // buildFluxPrompt path ignored kept items and over-edited. Do not
    // route through it.
    if (!compiledPrompt) {
      const styleBlendRaw =
        renderContext?.styleBlend ?? room?.style_blend ?? null;
      compiledPrompt = buildAnchorFallbackPrompt({
        fingerprint,
        roomType,
        context: renderContext,
        styleBlend: styleBlendRaw,
        anchorPrompt,
        cameraAngle: roomAnalysis?.cameraAngle ?? undefined,
        focalLength: roomAnalysis?.focalLength ?? undefined,
      });
    }
    // Silence unused-import warning for legacy buildFluxPrompt until
    // validation-renders route is re-audited.
    void buildFluxPrompt;
  }

  console.warn(
    "[redesign] compiled_prompt length:",
    compiledPrompt?.length ?? 0,
  );
  console.warn("[redesign] prompt preview:", compiledPrompt?.slice(0, 120));

  try {
    // Fire-and-forget style: send the request to Modal but don't wait for the full
    // pipeline to complete. The Modal function writes directly to Supabase, so the
    // client polls /api/rooms/status for progress.
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_id,
        user_id: user.id,
        compiled_prompt: compiledPrompt ?? null,
        anchor_prompt: anchorPrompt ?? null,
        style_reference_url: styleReferenceUrl ?? null,
      }),
      signal: AbortSignal.timeout(295_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      console.error("[redesign] Modal webhook error:", response.status, text);
      return NextResponse.json(
        { error: "Redesign pipeline failed", detail: text },
        { status: 502 },
      );
    }

    const result = (await response.json()) as {
      status: string;
      room_id?: string;
      redesigned_pano_url?: string;
      perspective_render_url?: string | null;
      prompt?: string;
      dominant_styles?: string[];
      error?: string;
    };

    if (result.status === "error") {
      console.error("[redesign] Pipeline error:", result.error);
      return NextResponse.json(
        { error: result.error ?? "Redesign pipeline failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      status: result.status,
      room_id: result.room_id,
      redesigned_pano_url: result.redesigned_pano_url ?? null,
      perspective_render_url: result.perspective_render_url ?? null,
      dominant_styles: result.dominant_styles ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[redesign] Unexpected error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
