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
import { buildFluxPrompt, buildAnchorFallbackPrompt } from "@/lib/ai/flux";
import { fetchTopStyleReference } from "@/lib/ai/style-references";
import { TIMEOUTS } from "@/lib/config/timeouts";
import {
  analyzeRoomArchitecture,
  type RoomArchitecture,
} from "@/lib/ai/room-analyzer";
import { runDesignDirector, type DesignDirectorOutput } from "@/lib/ai/design-director";
import { assembleDifferentialMap } from "@/lib/ai/mask-assembly";
import { fetchScoredStyleReferences } from "@/lib/unsplash";
import { getCuratedReferences } from "@/lib/ai/curated-references";
import { getLorasFromFluxPrompt } from "@/lib/ai/lora-registry";
import { getLoraStackFromBlend, getDnaTriggerFromBlend } from "@/lib/styles/lora-registry";
import { STYLE_DISPLAY_NAMES } from "@/lib/ai/anchor-display";
import type { StyleFingerprint } from "@/types/fingerprint";
import type { RenderContext } from "@/lib/types/area2";
import { logger } from "@/lib/logger";
import { LogEvents } from "@/lib/logEvents";

interface KeepRemoveDecision {
  id: number;
  name: string;
  category: string;
  decision: "keep" | "remove" | null;
}

import type { DesignBrief } from "@/lib/ai/design-director";

interface RoomRow {
  render_context: RenderContext | null;
  room_type: string | null;
  style_blend: Record<string, number> | null;
  original_image_url: string | null;
  original_photo_url: string | null;
  preprocessed_image_url: string | null;
  empty_room_url: string | null;
  personalization: Record<string, unknown> | null;
  keep_remove_decisions: KeepRemoveDecision[] | null;
  user_id: string;
  generation_seed: number | null;
  redesign_status: string | null;
  design_brief: DesignBrief | null;
  personalization_context: Record<string, unknown> | null;
}

// Extract a flat chat history string from rooms.render_context.tabStates
function extractChatHistoryString(
  tabStates: Record<string, unknown> | null | undefined,
): string | null {
  if (!tabStates) return null;
  const lines: string[] = [];
  for (const [tabKey, tab] of Object.entries(tabStates)) {
    const tabObj = tab as Record<string, unknown> | undefined;
    if (!tabObj) continue;
    const messages = (tabObj.messages ?? tabObj.conversation ?? []) as Array<{
      role: string;
      content: string;
    }>;
    const userMsgs = messages
      .filter((m) => m.role === "user")
      .map((m) => (m.content ?? "").trim())
      .filter(Boolean);
    if (userMsgs.length > 0) {
      lines.push(`[${tabKey} tab]`);
      lines.push(...userMsgs.map((m) => `User: ${m}`));
    }
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

interface UserRow {
  style_fingerprint: StyleFingerprint | Record<string, number> | null;
}

interface RedesignBody {
  room_id?: string;
  chat_context?: Record<string, Array<{ role: string; content: string }>> | null;
  explicit_retry?: boolean;
}

export async function POST(request: Request) {
  const body = (await request.json()) as RedesignBody;
  const { room_id, chat_context } = body;

  if (!room_id) {
    return NextResponse.json({ error: "room_id is required" }, { status: 400 });
  }

  let userId: string | null = null;

  // Test bypass — development only
  if (process.env.NODE_ENV !== 'production') {
    const serviceRoleHeader = request.headers.get('x-supabase-service-role');
    const devBypassHeader = request.headers.get('x-dev-bypass');
    const bypassToken = serviceRoleHeader ?? devBypassHeader;
    if (bypassToken && bypassToken === process.env.SUPABASE_SERVICE_ROLE_KEY && room_id) {
      const admin = createAdminSupabaseClient();
      const { data: testRoom } = await admin
        .from('rooms')
        .select('user_id')
        .eq('id', room_id)
        .single();
      if (testRoom) {
        userId = testRoom.user_id;
      }
    }
  }

  if (!userId) {
    // Normal auth path
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
  }

  // V9 redesign service: COVA_REDESIGN_URL is the only supported route.
  // Legacy V8 orchestrator fallback removed in P01a M3 (phase-1a-m3) — the
  // cova-redesign-pipeline orchestrator source was archived and the
  // corresponding Modal app was stopped on 2026-05-02.
  const v9RedesignUrl = process.env.COVA_REDESIGN_URL;
  if (!v9RedesignUrl) {
    return NextResponse.json(
      { error: "No redesign webhook configured (COVA_REDESIGN_URL)" },
      { status: 503 },
    );
  }
  const webhookUrl = `${v9RedesignUrl.replace(/\/$/, "")}/v1/generate_redesign`;

  // Read personalization data
  const admin = createAdminSupabaseClient();

  let room: RoomRow | null = null;
  let userRow: UserRow | null = null;
  try {
    const [roomRes, userRes] = await Promise.all([
      admin
        .from("rooms")
        .select(
          "user_id, render_context, room_type, style_blend, original_image_url, original_photo_url, preprocessed_image_url, empty_room_url, personalization, keep_remove_decisions, generation_seed, redesign_status, design_brief, personalization_context",
        )
        .eq("id", room_id)
        .eq("user_id", userId)
        .single(),
      admin
        .from("users")
        .select("style_fingerprint")
        .eq("id", userId)
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

  const renderContextRaw: RenderContext | null = room?.render_context ?? null;
  // Merge personalization_context (from step-7e/7f/7g/7h) into render context
  // so the Design Director can read it via ctxRaw.personalization_context
  const renderContext: RenderContext | null = renderContextRaw
    ? {
        ...renderContextRaw,
        ...(room?.personalization_context
          ? { personalization_context: room.personalization_context }
          : {}),
      } as RenderContext
    : null;
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

  // Preprocessing — DarkIR (if dark) + OpenCV corrections
  // Resolve the best available photo URL, then run preprocessing.
  // The preprocessed URL is stored in rooms.preprocessed_image_url by the
  // Modal function itself. We read it back here so all downstream steps use it.
  const rawPhotoUrl =
    room?.original_image_url ?? room?.original_photo_url ?? null;

  // Professionalization pass removed 2026-04-13 — dispatch original photo directly.
  const photoUrlForPipeline: string | null = rawPhotoUrl;

  // Fetch style reference anchor (used by design director and fallback paths)
  let anchorPrompt: string | null = null;
  if (fingerprint) {
    const styleRef = await fetchTopStyleReference(fingerprint, roomType).catch(
      () => null,
    );
    anchorPrompt = styleRef?.flux_prompt ?? null;
  }

  // Gemini room architecture analysis (used by fallback prompt compiler)
  let roomAnalysis: RoomArchitecture | null = null;
  try {
    if (photoUrlForPipeline) {
      roomAnalysis = await analyzeRoomArchitecture(photoUrlForPipeline);
    }
  } catch (err) {
    console.error("[redesign] Gemini analysis failed:", err);
  }

  // Derive style anchor display name for design director
  function deriveStyleAnchorDisplay(
    blend: Record<string, number> | null | undefined,
  ): string {
    if (!blend) return "Balanced Contemporary";
    const topKey = Object.entries(blend)
      .filter(([, v]) => typeof v === "number")
      .sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0];
    if (!topKey) return "Balanced Contemporary";
    // Match case-insensitively against STYLE_DISPLAY_NAMES keys
    const normalised = topKey.trim().toLowerCase();
    const match = Object.entries(STYLE_DISPLAY_NAMES).find(
      ([k]) => k.toLowerCase() === normalised,
    );
    return match ? match[1] : "Balanced Contemporary";
  }

  // Resolve budget range from render context
  const budgetMin = renderContext?.budget?.rangeMin ?? 500;
  const budgetMax = renderContext?.budget?.rangeMax ?? 2000;
  const styleBlendForAnchor = renderContext?.styleBlend ?? room?.style_blend ?? null;
  const styleAnchorDisplay = deriveStyleAnchorDisplay(styleBlendForAnchor);

  // ── Design Director (primary prompt path) ──────────────────────────────────
  // Call 1: vision + fingerprint → staging JSON (design_brief)
  // Call 2: staging JSON → FLUX script 80-120 words (flux_prompt)
  let compiledPrompt: string | null = null;
  let promptSource: "design-director" | "claude-compiled" | "fallback" = "fallback";
  let unsplashReferences: string[] = [];
  let designDirectorResult: DesignDirectorOutput | null = null;

  // Extract keep/remove labels from step-7c user decisions
  const keepRemoveDecisions = (room?.keep_remove_decisions ?? []) as KeepRemoveDecision[];
  const removeItems = keepRemoveDecisions
    .filter((d) => d.decision === "remove")
    .map((d) => d.name)
    .filter(Boolean);
  const keepItems = keepRemoveDecisions
    .filter((d) => d.decision === "keep")
    .map((d) => d.name)
    .filter(Boolean);

  // Extract chat history as a flat formatted string (highest priority signal for design director)
  // Try renderContext.tabStates first, fall back to chat_context from POST body
  const tabStates = renderContext?.tabStates as Record<string, unknown> | null | undefined;
  const chatHistory = extractChatHistoryString(tabStates)
    ?? extractChatHistoryString(chat_context as Record<string, unknown> | null | undefined);

  if (fingerprint && photoUrlForPipeline) {
    try {
      // Resolve LoRA trigger from style blend using COVA* registry
      const loraTrigger = getDnaTriggerFromBlend(styleBlendForAnchor);

      // F3-BLEND-CTX.1 — inject style_blend into the RenderContext so the
      // Director's `buildLorasFromBlend` path activates. Precedence:
      //   1. renderContext.style_blend (populated by assembler for v3 fps)
      //   2. rooms.style_blend DB column (legacy, quiz-written)
      // Without this, every Director call falls back to single-primary LoRA.
      const directorContext: RenderContext | null = renderContext
        ? ({
            ...renderContext,
            style_blend:
              renderContext.style_blend ??
              renderContext.styleBlend ??
              (room?.style_blend ?? undefined),
          } as RenderContext)
        : null;

      const ddResult = await runDesignDirector({
        imageUrl: photoUrlForPipeline,
        fingerprint,
        roomType,
        styleAnchor: styleAnchorDisplay,
        loraTrigger,
        budgetMin,
        budgetMax,
        context: directorContext,
        removeItems,
        keepItems,
        chatHistory,
        roomId: room_id,
      });

      // Merge required_objects with any previously identified ones (refinement runs).
      // Never discard prior named products — only add new ones.
      const priorRequired = (room.design_brief?.required_objects ?? []) as string[];
      const freshRequired = ddResult.stagingJson.required_objects ?? [];
      if (priorRequired.length > 0 || freshRequired.length > 0) {
        const seen = new Set<string>();
        const merged: string[] = [];
        for (const o of [...priorRequired, ...freshRequired]) {
          const key = o.trim().toLowerCase();
          if (key && !seen.has(key)) {
            seen.add(key);
            merged.push(o);
          }
        }
        ddResult.stagingJson.required_objects = merged;
      }

      designDirectorResult = ddResult;
      compiledPrompt = ddResult.fluxPrompt;
      promptSource = "design-director";

      // Persist design_brief and flux_prompt to rooms table (fire-and-forget)
      void admin
        .from("rooms")
        .update({
          design_brief: ddResult.stagingJson as unknown as Record<string, unknown>,
          flux_prompt: compiledPrompt,
        })
        .eq("id", room_id)
        .then(({ error }) => {
          if (error)
            console.error("[redesign] design_brief/flux_prompt write failed:", error);
          else
            console.log("[redesign] design_brief + flux_prompt stored for room", room_id);
        });

      // Fetch quality-scored Unsplash references for IP-Adapter conditioning
      // Scores each candidate on orientation, resolution, engagement, and style keyword match.
      // Returns top 3 by score; index 0 is the single best reference used at scale 0.40.
      unsplashReferences = await fetchScoredStyleReferences(styleAnchorDisplay, 3).catch(
        () => [] as string[],
      );
      console.log(`[redesign] Unsplash references scored: ${unsplashReferences.length}`);

      if (unsplashReferences.length < 3) {
        // Detect mood from staging JSON palette hex values
        const stagingJson = ddResult?.stagingJson;
        const primaryHex = stagingJson?.palette?.primary_hex ?? "";
        const isDark = primaryHex.length >= 7 && (() => {
          const r = parseInt(primaryHex.slice(1, 3), 16);
          const g = parseInt(primaryHex.slice(3, 5), 16);
          const b = parseInt(primaryHex.slice(5, 7), 16);
          return (r * 299 + g * 587 + b * 114) / 1000 < 100;
        })();
        const isWarm = (stagingJson?.lighting?.color_temp_k ?? 4000) <= 3500;

        const moodKey = isDark && isWarm ? "dark_warm" :
                        isWarm ? "warm_natural" :
                        "bright_airy";

        const curated = getCuratedReferences(loraTrigger, moodKey);

        // Fill up to 5 total: keep any live refs first, pad with curated
        unsplashReferences = [
          ...unsplashReferences,
          ...curated.filter(u => !unsplashReferences.includes(u))
        ].slice(0, 5);

        console.log(
          `[redesign] Padded with curated refs — total: ${unsplashReferences.length} (mood: ${moodKey}, trigger: ${loraTrigger})`
        );
      }

      // Persist unsplash_references to rooms table for refinement continuity (FIX 3)
      void admin
        .from("rooms")
        .update({ unsplash_references: unsplashReferences })
        .eq("id", room_id)
        .then(({ error }) => {
          if (error) console.error("[redesign] unsplash_references write failed:", error);
          else console.log("[redesign] unsplash_references stored:", unsplashReferences.length);
        });

      // Extract design_memory and store in render_context for refinement continuity (ADDITION 4)
      const allFurniture = [
        ...(ddResult.stagingJson.depth_zones?.foreground ?? []),
        ...(ddResult.stagingJson.depth_zones?.midground ?? []),
        ...(ddResult.stagingJson.depth_zones?.background ?? []),
      ];
      const designMemoryObj = {
        room_type: ddResult.stagingJson.room_type,
        style_anchor: styleAnchorDisplay,
        dominant_material: ddResult.stagingJson.materials?.[0] ?? "natural materials",
        color_palette: {
          dominant: ddResult.stagingJson.palette?.primary_hex ?? "neutral",
          secondary: ddResult.stagingJson.palette?.secondary_hex ?? "neutral",
          accent: ddResult.stagingJson.palette?.accent_hex ?? "neutral",
        },
        key_furniture: allFurniture.slice(0, 3),
        lighting_spec: ddResult.stagingJson.lighting
          ? `${ddResult.stagingJson.lighting.direction}, ${ddResult.stagingJson.lighting.color_temp_k}K`
          : "natural light",
        lora_trigger: loraTrigger,
      };
      void admin
        .from("rooms")
        .select("render_context")
        .eq("id", room_id)
        .single()
        .then(async ({ data }) => {
          const existingRc = (data?.render_context ?? {}) as Record<string, unknown>;
          const { error: dmError } = await admin
            .from("rooms")
            .update({ render_context: { ...existingRc, design_memory: designMemoryObj } })
            .eq("id", room_id);
          if (dmError) console.error("[redesign] design_memory write failed:", dmError);
          else console.log("[redesign] design_memory stored for room", room_id);
        });

      console.log(
        `[redesign] Design Director complete — ${ddResult.fluxPrompt.split(/\s+/).length} words`,
      );
    } catch (ddErr) {
      console.error("[redesign] Design Director failed — FULL ERROR:", ddErr);
      console.error("[redesign] DD error stack:", ddErr instanceof Error ? ddErr.stack : String(ddErr));
      console.error("[redesign] DD inputs — imageUrl:", photoUrlForPipeline, "fingerprint keys:", Object.keys(fingerprint?.dimensions ?? {}));
    }
  }

  // ── Fallback: existing Claude prompt compiler ───────────────────────────────
  if (!compiledPrompt && fingerprint) {
    compiledPrompt = buildAnchorFallbackPrompt({
      fingerprint,
      roomType,
      context: renderContext,
      styleBlend: styleBlendForAnchor,
      anchorPrompt,
      cameraAngle: roomAnalysis?.cameraAngle ?? undefined,
      focalLength: roomAnalysis?.focalLength ?? undefined,
    });

    if (compiledPrompt) promptSource = "fallback";

    // Silence unused-import warning for legacy buildFluxPrompt until
    // validation-renders route is re-audited.
    void buildFluxPrompt;
  }

  console.warn(
    "[redesign] compiled_prompt length:",
    compiledPrompt?.length ?? 0,
    "| source:", promptSource,
  );
  console.warn("[redesign] prompt preview:", compiledPrompt?.slice(0, 120));

  // Log the FLUX prompt for observability
  if (compiledPrompt) {
    logger.info("RENDER", LogEvents.RENDER_FLUX_PROMPT_BUILT,
      "FLUX prompt built and dispatched to Modal", {
        roomId: room_id,
        data: {
          promptWordCount: compiledPrompt.split(/\s+/).length,
          promptPreview: compiledPrompt.substring(0, 300),
          fullPrompt: compiledPrompt,
          promptSource,
          styleBlend: styleAnchorDisplay,
        },
      },
    );
  }

  // ── LoRA stack resolution ─────────────────────────────────────────────────
  // Resolves COVA* trained LoRAs from the style blend.
  // V9 path: trigger words in the prompt are the primary mechanism — Modal's
  // cova-redesign service extracts them and applies the LoRA stack server-side.
  // (Legacy V8 fallback that serialized lorasJson into the request body was
  // removed in P01a M3 along with the orchestrator archival.)
  const covaLoraStack = getLoraStackFromBlend(styleBlendForAnchor);

  if (covaLoraStack.length > 0) {
    console.log(
      `[redesign] COVA LoRA stack: ${covaLoraStack.map((l) => `${l.name}@${l.scale.toFixed(2)}`).join(" + ")}`,
    );
  } else {
    // DB-based lookup via flux_prompt trigger extraction (logging only).
    try {
      const loraResult = await getLorasFromFluxPrompt(compiledPrompt, admin);
      console.log(
        `[redesign] LoRA stack (DB fallback): ${loraResult.loras.map((l) => `${l.name}@${l.scale}`).join(" + ")}`,
      );
    } catch (loraErr) {
      console.error("[redesign] LoRA resolution failed — no LoRAs:", loraErr);
    }
  }

  // ── Seed management ──────────────────────────────────────────────────────
  // Failed/retry renders get seed+1 so they produce different output.
  // New renders get a fresh random seed.
  // Explicit retry is detected via redesign_status.
  const isRetry =
    room?.redesign_status === "failed" ||
    room?.redesign_status === "error" ||
    body.explicit_retry === true;

  let generationSeed: number;
  if (isRetry && room?.generation_seed) {
    // Increment seed so retry produces different quality output
    generationSeed = room.generation_seed + 1;
    console.log(`[redesign] Retry detected — incrementing seed to: ${generationSeed}`);
  } else if (room?.generation_seed && !isRetry) {
    generationSeed = room.generation_seed;
    console.log(`[redesign] Reusing existing seed: ${generationSeed}`);
  } else {
    generationSeed = Math.floor(Math.random() * 999999) + 1;
    console.log(`[redesign] Generated new seed: ${generationSeed}`);
  }

  void admin
    .from("rooms")
    .update({ generation_seed: generationSeed })
    .eq("id", room_id)
    .then(({ error }) => {
      if (error) console.error("[redesign] generation_seed write failed:", error);
    });

  // ── Change map assembly for differential diffusion ────────────────────────
  // Read kept item mask URLs from render_context.itemMasks (written by segment-masks endpoint).
  // segment-masks fires fire-and-forget from step-7c, so by the time redesign runs (from step-7d)
  // the masks may or may not be in the DB. We handle both cases:
  //   1. Re-read render_context from DB — picks up masks that completed after initial fetch.
  //   2. If still missing and keepItems exist — call EVF-SAM2 inline (blocking) so change map
  //      always has mask input when the user explicitly kept items.
  let changeMapUrl: string | null = null;
  let keptItemMaskUrls: string[] = [];

  // Step 1: re-read render_context to get the freshest itemMasks
  let effectiveItemMasks: Record<string, string> | null = null;
  try {
    const { data: freshRow } = await admin
      .from("rooms")
      .select("render_context")
      .eq("id", room_id)
      .single();
    const freshCtx = (freshRow?.render_context as Record<string, unknown>) ?? {};
    const freshMasks = freshCtx?.itemMasks;
    if (freshMasks && typeof freshMasks === "object" && Object.keys(freshMasks).length > 0) {
      effectiveItemMasks = freshMasks as Record<string, string>;
      console.log(`[redesign] itemMasks from DB: ${Object.keys(effectiveItemMasks).length} masks`);
    }
  } catch (rcErr) {
    console.warn("[redesign] Failed to re-read render_context:", rcErr);
  }

  // Step 2: if masks still missing and there are kept items, call EVF-SAM2 inline (blocks until done)
  if (keepItems.length > 0 && (!effectiveItemMasks || Object.keys(effectiveItemMasks).length === 0)) {
    const falKey = process.env.FAL_KEY;
    if (falKey && photoUrlForPipeline) {
      console.log(
        `[redesign] itemMasks missing — calling EVF-SAM2 inline for ${keepItems.length} kept items`,
      );
      const inlineMasks: Record<string, string> = {};
      await Promise.all(
        keepItems.map(async (label) => {
          try {
            const resp = await fetch("https://fal.run/fal-ai/evf-sam", {
              method: "POST",
              headers: {
                Authorization: `Key ${falKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                image_url: photoUrlForPipeline,
                text_prompt: label.toLowerCase(),
              }),
              signal: AbortSignal.timeout(30_000),
            });
            if (!resp.ok) {
              console.warn(`[redesign] EVF-SAM inline failed for "${label}": ${resp.status}`);
              return;
            }
            const result = (await resp.json()) as {
              image?: { url: string };
              output?: { url: string };
              url?: string;
            };
            const maskUrl =
              result?.image?.url ??
              result?.output?.url ??
              (typeof result?.url === "string" ? result.url : null);
            if (maskUrl) inlineMasks[label.toLowerCase()] = maskUrl;
          } catch (evfErr) {
            console.warn(`[redesign] EVF-SAM inline error for "${label}":`, evfErr);
          }
        }),
      );

      if (Object.keys(inlineMasks).length > 0) {
        effectiveItemMasks = inlineMasks;
        console.log(
          `[redesign] EVF-SAM inline complete: ${Object.keys(inlineMasks).length}/${keepItems.length} masks`,
        );
        // Persist inline masks to render_context so future runs can skip this step
        void (async () => {
          try {
            const { data: latestRow } = await admin
              .from("rooms")
              .select("render_context")
              .eq("id", room_id)
              .single();
            const latestCtx = (latestRow?.render_context as Record<string, unknown>) ?? {};
            await admin
              .from("rooms")
              .update({ render_context: { ...latestCtx, itemMasks: inlineMasks } })
              .eq("id", room_id);
            console.log("[redesign] itemMasks persisted inline to render_context");
          } catch (persistErr) {
            console.warn("[redesign] itemMasks inline persist failed:", persistErr);
          }
        })();
      }
    } else {
      console.warn("[redesign] FAL_KEY missing or no photo URL — cannot call EVF-SAM inline");
    }
  }

  if (effectiveItemMasks && typeof effectiveItemMasks === "object") {
    // Get masks for kept items (from keep_remove_decisions)
    keptItemMaskUrls = keepItems
      .map((label) => effectiveItemMasks![label.toLowerCase()] ?? effectiveItemMasks![label])
      .filter((url): url is string => typeof url === "string" && url.startsWith("https://"));

    console.log(
      `[redesign] Keep item masks found: ${keptItemMaskUrls.length}/${keepItems.length}`,
    );

    if (keptItemMaskUrls.length > 0) {
      try {
        changeMapUrl = await assembleDifferentialMap({
          imageWidth: 1024,
          imageHeight: 1024,
          keepItemMasks: keptItemMaskUrls,
          removeItemMasks: [],
          roomId: room_id,
        });
        console.log(`[redesign] Change map assembled: ${changeMapUrl.slice(0, 80)}`);
      } catch (cmErr) {
        console.warn("[redesign] Change map assembly failed — proceeding without it:", cmErr);
        changeMapUrl = null;
      }
    }
  }

  // ── Empty room validation gate (Claude Vision) ─────────────────────────────
  // Verify the empty room is actually empty before spending $1.50 on redesign.
  const emptyRoomUrlForValidation = room?.empty_room_url ?? photoUrlForPipeline ?? null;
  if (emptyRoomUrlForValidation) {
    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const valResponse = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 50,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "url", url: emptyRoomUrlForValidation },
              },
              {
                type: "text",
                text: "Is this room completely empty of all furniture, rugs, wall decorations, personal items, and objects? Only bare walls, floor, ceiling, windows, and fixed architecture should remain. Answer with ONLY the word EMPTY or NOT_EMPTY.",
              },
            ],
          },
        ],
      });
      const answer =
        valResponse.content[0].type === "text"
          ? valResponse.content[0].text.trim().toUpperCase()
          : "";
      if (answer !== "EMPTY") {
        console.warn(
          "[redesign] Empty room validation FAILED — room not empty, proceeding anyway but logging warning",
        );
      } else {
        console.log("[redesign] Empty room validation passed");
      }
    } catch (valErr) {
      console.error("[redesign] Empty room validation failed:", valErr);
      // Fail open — don't block render if Vision call fails
    }
  }

  // Read wall/floor change preferences from the *fresh* Design Director result.
  // The previous implementation read from room.design_brief, which was fetched
  // before the Design Director ran — on first render that snapshot is null,
  // so walls always changed. Reading from designDirectorResult uses the brief
  // produced by the current run. (Wall/floor change flags were consumed by the
  // archived V8 legacy body; V9 service derives them server-side.)
  void designDirectorResult;

  try {
    // V9 body: matches modal_pipeline/redesign.py Block 2 rewrite.
    const v9Body = {
      room_id,
      user_id: userId,
      empty_room_url: room?.empty_room_url ?? photoUrlForPipeline ?? null,
      room_type: roomType,
      style_blend: room?.style_blend ?? renderContext?.styleBlend ?? null,
      style_fingerprint: fingerprint ?? null,
      personalization: room?.personalization ?? {},
      budget_max: budgetMax,
      seed: generationSeed,
    };
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v9Body),
      // Phase 2.0c.3 — Modal V3 pipeline budget: ~3-5 min realistic runtime
      // (FLUX Pass 1, IC-Light, refinement, Sonnet calls). 7 minutes gives
      // ~2 min buffer for slow fal queues. Verified production timeout at
      // 295s on 2026-04-28 01:02 — route returned 500 while Modal still ran.
      signal: AbortSignal.timeout(TIMEOUTS.REDESIGN_MODAL),
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
      status?: string;
      room_id?: string;
      render_url?: string;             // V3 (cova-redesign-v3) returns this
      redesigned_pano_url?: string;    // legacy paths return this
      perspective_render_url?: string | null;
      prompt?: string;
      dominant_styles?: string[];
      error?: string;
      qa?: Record<string, unknown>;
    };

    if (result.status === "error") {
      console.error("[redesign] Pipeline error:", result.error);
      return NextResponse.json(
        { error: result.error ?? "Redesign pipeline failed" },
        { status: 500 },
      );
    }

    const finalRenderUrl = result.render_url ?? result.redesigned_pano_url ?? null;

    if (finalRenderUrl) {
      const { error: persistErr } = await admin
        .from("rooms")
        .update({
          redesign_pano_url: finalRenderUrl,
          render_url: finalRenderUrl,
          redesign_status: "complete",
        })
        .eq("id", room_id);

      if (persistErr) {
        console.error("[redesign] CRITICAL: render produced but persist failed:", persistErr);
        return NextResponse.json(
          {
            error: "Render produced but failed to persist",
            render_url: finalRenderUrl,
            persist_error: persistErr.message,
          },
          { status: 500 },
        );
      }
      console.log("[redesign] persisted render_url to rooms.redesign_pano_url:", finalRenderUrl.slice(0, 80));
    } else {
      console.error("[redesign] CRITICAL: Modal returned 200 but no render_url in response:", result);
      await admin
        .from("rooms")
        .update({ redesign_status: "failed" })
        .eq("id", room_id);
      return NextResponse.json(
        { error: "Modal pipeline returned no render_url", detail: result },
        { status: 502 },
      );
    }

    return NextResponse.json({
      status: "complete",
      room_id: result.room_id ?? room_id,
      render_url: finalRenderUrl,
      redesigned_pano_url: finalRenderUrl,
      perspective_render_url: result.perspective_render_url ?? null,
      dominant_styles: result.dominant_styles ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[redesign] Unexpected error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
