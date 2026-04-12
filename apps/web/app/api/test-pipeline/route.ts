/**
 * Test-only proxy for the redesign pipeline.
 * Bypasses browser auth by using the service role key.
 * Only works in development — returns 404 in production.
 */

export const maxDuration = 300;

import { NextResponse } from "next/server";
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

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const serviceRoleHeader = request.headers.get("x-supabase-service-role");
  if (!serviceRoleHeader || serviceRoleHeader !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Invalid service role key" }, { status: 403 });
  }

  const body = (await request.json()) as { room_id?: string };
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

  const admin = createAdminSupabaseClient();

  // Read room and user data
  const { data: room, error: roomErr } = await admin
    .from("rooms")
    .select(
      "user_id, render_context, room_type, style_blend, original_image_url, original_photo_url",
    )
    .eq("id", room_id)
    .single();

  if (roomErr || !room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const userId = room.user_id as string;
  const renderContext = (room.render_context ?? null) as RenderContext | null;
  const roomType = (room.room_type as string) ?? "room";

  const { data: userRow } = await admin
    .from("users")
    .select("style_fingerprint")
    .eq("id", userId)
    .single();

  // Resolve fingerprint
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

  // Persist fingerprint back
  if (fingerprint && room_id) {
    void admin
      .from("rooms")
      .update({
        render_context: {
          ...(renderContext ?? {}),
          fingerprint,
        },
      } as Record<string, unknown>)
      .eq("id", room_id);
  }

  // Fetch style reference
  let anchorPrompt: string | null = null;
  let styleReferenceUrl: string | null = null;
  if (fingerprint) {
    const styleRef = await fetchTopStyleReference(fingerprint, roomType).catch(
      () => null,
    );
    anchorPrompt = styleRef?.flux_prompt ?? null;
    styleReferenceUrl = styleRef?.image_url ?? null;
  }

  // Gemini room analysis
  let roomAnalysis: RoomArchitecture | null = null;
  try {
    const originalPhotoUrl =
      (room.original_image_url as string) ??
      (room.original_photo_url as string) ??
      null;
    if (originalPhotoUrl) {
      roomAnalysis = await analyzeRoomArchitecture(originalPhotoUrl);
    }
  } catch (err) {
    console.error("[test-pipeline] Gemini analysis failed:", err);
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
      null,
    ).catch(() => null);

    if (!compiledPrompt) {
      const styleBlendRaw =
        renderContext?.styleBlend ?? (room.style_blend as Record<string, number> | null) ?? null;
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
    void buildFluxPrompt;
  }

  console.warn(
    "[test-pipeline] compiled_prompt length:",
    compiledPrompt?.length ?? 0,
  );

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_id,
        user_id: userId,
        compiled_prompt: compiledPrompt ?? null,
        anchor_prompt: anchorPrompt ?? null,
        style_reference_url: styleReferenceUrl ?? null,
        chat_context: renderContext?.tabStates ?? null,
      }),
      signal: AbortSignal.timeout(295_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      console.error("[test-pipeline] Modal webhook error:", response.status, text);
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
    console.error("[test-pipeline] Unexpected error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
