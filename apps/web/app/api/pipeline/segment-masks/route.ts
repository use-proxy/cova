/**
 * Pipeline — Layered Segmentation (SAM3 + OneFormer primary, EVF-SAM2 fallback)
 *
 * Primary path: Calls cova-segmentation Modal endpoint (OneFormer + SAM3 + depth).
 *   Returns pixel-perfect architecture mask + per-instance furniture masks.
 *
 * Fallback path: If Modal endpoint fails or is unconfigured, falls back to
 *   per-item EVF-SAM2/SAM2 segmentation (original behavior).
 *
 * Reads pre_detection_result from a room, stores mask URLs in
 * rooms.render_context.itemMasks + archMaskUrl.
 *
 * Called from step-7c after pre_detection_result is loaded, before showing keep/remove UI.
 * Non-fatal: if any individual mask fails, the others are stored. UI proceeds without masks.
 *
 * Input:  { room_id: string }
 * Output: { status, room_id, maskCount, itemMasks: Record<label, maskUrl>, archMaskUrl? }
 */

export const maxDuration = 120;

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

interface BBoxPct {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DetectedItem {
  label: string;
  category: string;
  azimuth_degrees?: number;
  elevation_degrees?: number;
  is_fixed: boolean;
  confidence: number;
  estimated_bbox_pct?: BBoxPct | null;
  size_in_room?: "large" | "medium" | "small" | null;
}

function sizeToDims(size: DetectedItem["size_in_room"]): { w: number; h: number } {
  switch (size) {
    case "large":
      return { w: 0.5, h: 0.45 };
    case "medium":
      return { w: 0.3, h: 0.3 };
    case "small":
      return { w: 0.18, h: 0.18 };
    default:
      return { w: 0.25, h: 0.25 };
  }
}

// Structural categories are preserved via the architecture mask, not instance masks.
const STRUCTURAL_CATEGORIES = new Set([
  "ceiling",
  "wall",
  "floor",
  "door",
  "built_in_shelving",
  "radiator",
  "fireplace",
  "built_in_wardrobe",
]);

interface SegmentMasksBody {
  room_id?: string;
}

// ---------------------------------------------------------------------------
// Layered segmentation — Modal endpoint (primary path)
// ---------------------------------------------------------------------------

interface LayeredSegmentationResult {
  arch_mask_url?: string;
  instance_masks?: Record<string, string>;
  depth_url?: string;
  error?: string;
}

async function tryLayeredSegmentation(
  roomId: string,
  photoUrl: string,
  detectedItems: DetectedItem[],
): Promise<LayeredSegmentationResult | null> {
  const segmentationUrl = process.env.LAYERED_SEGMENTATION_URL;
  if (!segmentationUrl) {
    console.log("[segment-masks] LAYERED_SEGMENTATION_URL not set — skipping layered path");
    return null;
  }

  try {
    console.log("[segment-masks] Calling layered segmentation (OneFormer + SAM3)...");
    const resp = await fetch(segmentationUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_id: roomId,
        photo_url: photoUrl,
        detected_items: detectedItems,
      }),
      signal: AbortSignal.timeout(110_000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      console.warn(
        `[segment-masks] Layered segmentation HTTP ${resp.status}: ${text.slice(0, 200)}`,
      );
      return null;
    }

    const result = (await resp.json()) as LayeredSegmentationResult;
    if (result.error) {
      console.warn("[segment-masks] Layered segmentation returned error:", result.error);
      return null;
    }

    const maskCount = Object.keys(result.instance_masks ?? {}).length;
    console.log(
      `[segment-masks] Layered segmentation OK: ${maskCount} instance masks, ` +
      `arch_mask: ${result.arch_mask_url ? "yes" : "no"}, ` +
      `depth: ${result.depth_url ? "yes" : "no"}`,
    );

    return result;
  } catch (err) {
    console.warn("[segment-masks] Layered segmentation failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// SAM3 direct path (called when Modal is unavailable but SAM3 is desired)
// ---------------------------------------------------------------------------

async function trySam3Direct(
  photoUrl: string,
  falKey: string,
  items: DetectedItem[],
): Promise<Record<string, string> | null> {
  try {
    const { callSam3, resetSessionCost } = await import("@/lib/ai/segmentation");
    resetSessionCost();

    console.log(`[segment-masks] Trying SAM3 direct per-item × ${items.length}...`);

    // SAM3 needs one call per object — multi-class prompts return only 1 mask
    const results = await Promise.all(
      items.map(async (item) => {
        try {
          const instances = await callSam3(photoUrl, item.label.toLowerCase(), falKey, 3);
          if (instances.length > 0) {
            // Take highest-scoring mask
            const best = instances.reduce((a, b) => (a.score > b.score ? a : b));
            return { label: item.label.toLowerCase(), maskUrl: best.maskUrl };
          }
          return null;
        } catch {
          return null;
        }
      }),
    );

    const masks: Record<string, string> = {};
    for (const r of results) {
      if (r?.maskUrl) {
        masks[r.label] = r.maskUrl;
      }
    }

    console.log(`[segment-masks] SAM3 direct returned ${Object.keys(masks).length} masks`);
    return Object.keys(masks).length > 0 ? masks : null;
  } catch (err) {
    console.warn("[segment-masks] SAM3 direct failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// EVF-SAM2 fallback path (original behavior)
// ---------------------------------------------------------------------------

interface EvfSamResult {
  image?: { url: string };
  output?: { url: string };
  url?: string;
}

interface Sam2Result {
  image?: { url: string; width?: number; height?: number };
}

async function getImageDimensions(url: string): Promise<{width: number, height: number}> {
  try {
    const partialResp = await fetch(url, {
      headers: { Range: 'bytes=0-32767' },
      signal: AbortSignal.timeout(15000)
    });
    const buffer = await partialResp.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
      for (let i = 2; i < bytes.length - 8; i++) {
        if (bytes[i] === 0xFF && (bytes[i+1] === 0xC0 || bytes[i+1] === 0xC2)) {
          const height = ((bytes[i+5] ?? 0) << 8) | (bytes[i+6] ?? 0);
          const width = ((bytes[i+7] ?? 0) << 8) | (bytes[i+8] ?? 0);
          if (width > 0 && height > 0) {
            return { width, height };
          }
        }
      }
    }

    if (bytes[0] === 0x89 && bytes[1] === 0x50) {
      const width = ((bytes[16] ?? 0) << 24) | ((bytes[17] ?? 0) << 16) | ((bytes[18] ?? 0) << 8) | (bytes[19] ?? 0);
      const height = ((bytes[20] ?? 0) << 24) | ((bytes[21] ?? 0) << 16) | ((bytes[22] ?? 0) << 8) | (bytes[23] ?? 0);
      if (width > 0 && height > 0) {
        return { width, height };
      }
    }
  } catch (e) {
    console.warn('[segment-masks] Could not fetch image dimensions:', e);
  }
  return { width: 1024, height: 1024 };
}

async function callEvfSam(
  imageUrl: string,
  label: string,
  falKey: string,
): Promise<string | null> {
  try {
    const response = await fetch("https://fal.run/fal-ai/evf-sam", {
      method: "POST",
      headers: {
        Authorization: `Key ${falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: imageUrl,
        prompt: label.toLowerCase(),
        mask_only: true,
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      console.warn(`[segment-masks] EVF-SAM failed for "${label}": ${response.status} ${text.slice(0, 100)}`);
      return null;
    }

    const result = (await response.json()) as EvfSamResult;
    return result?.image?.url ?? result?.output?.url ?? (typeof result?.url === "string" ? result.url : null);
  } catch (err) {
    console.warn(`[segment-masks] EVF-SAM error for "${label}":`, err);
    return null;
  }
}

async function callSam2(
  imageUrl: string,
  box: { x_min: number; y_min: number; x_max: number; y_max: number },
  label: string,
  falKey: string,
): Promise<string | null> {
  try {
    const response = await fetch("https://fal.run/fal-ai/sam2/image", {
      method: "POST",
      headers: {
        Authorization: `Key ${falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: imageUrl,
        box_prompts: [box],
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      return null;
    }

    const result = (await response.json()) as Sam2Result;
    return result?.image?.url ?? null;
  } catch (err) {
    console.warn(`[segment-masks] SAM2 error for "${label}":`, err);
    return null;
  }
}

async function segmentItem(
  imageUrl: string,
  label: string,
  falKey: string,
  item: DetectedItem,
  imageDimensions: { width: number; height: number } = { width: 1024, height: 1024 },
): Promise<string | null> {
  const bbox = item.estimated_bbox_pct;
  if (bbox && typeof bbox === "object") {
    const { width, height } = imageDimensions;
    const padding = 20;

    const center_x = (bbox.x + bbox.w / 2) * width;
    const center_y = (bbox.y + bbox.h / 2) * height;

    const { w: size_w, h: size_h } = sizeToDims(item.size_in_room);
    const half_w = (size_w / 2) * width;
    const half_h = (size_h / 2) * height;

    const x_min = Math.max(0, Math.floor(center_x - half_w) - padding);
    const y_min = Math.max(0, Math.floor(center_y - half_h) - padding);
    const x_max = Math.min(width, Math.floor(center_x + half_w) + padding);
    const y_max = Math.min(height, Math.floor(center_y + half_h) + padding);

    if (x_max > x_min && y_max > y_min) {
      return callSam2(imageUrl, { x_min, y_min, x_max, y_max }, label, falKey);
    }
  }

  return callEvfSam(imageUrl, label, falKey);
}

// ---------------------------------------------------------------------------
// Main POST handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SegmentMasksBody;
  const { room_id } = body;

  if (!room_id) {
    return NextResponse.json({ error: "room_id is required" }, { status: 400 });
  }

  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    return NextResponse.json({ error: "FAL_KEY not configured" }, { status: 503 });
  }

  const admin = createAdminSupabaseClient();

  // Read the room record
  const { data: room, error: roomError } = await admin
    .from("rooms")
    .select("user_id, original_image_url, original_photo_url, pre_detection_result, render_context")
    .eq("id", room_id)
    .eq("user_id", user.id)
    .single();

  if (roomError || !room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const photoUrl =
    (room as Record<string, unknown>).original_image_url as string | null ??
    (room as Record<string, unknown>).original_photo_url as string | null;

  if (!photoUrl) {
    return NextResponse.json(
      { error: "No photo URL found for room" },
      { status: 422 },
    );
  }

  // Parse pre_detection_result
  const raw = (room as Record<string, unknown>).pre_detection_result;
  const detectedItems: DetectedItem[] = Array.isArray(raw)
    ? (raw as DetectedItem[])
    : Array.isArray((raw as Record<string, unknown>)?.items)
      ? ((raw as Record<string, unknown>).items as DetectedItem[])
      : Array.isArray((raw as Record<string, unknown>)?.furniture)
        ? ((raw as Record<string, unknown>).furniture as DetectedItem[])
        : [];

  if (detectedItems.length === 0) {
    return NextResponse.json({
      status: "no_items",
      room_id,
      maskCount: 0,
      itemMasks: {},
    });
  }

  // Filter to non-structural items for segmentation
  const itemsToSegment = detectedItems
    .filter((item) => {
      const cat = (item.category ?? "").toLowerCase().replace(/\s+/g, "_");
      return !STRUCTURAL_CATEGORIES.has(cat);
    })
    .slice(0, 20); // Increased from 12 — SAM3 handles more items efficiently

  console.log(
    `[segment-masks] Segmenting ${itemsToSegment.length} items for room ${room_id}`,
  );

  let itemMasks: Record<string, string> = {};
  let archMaskUrl: string | undefined;
  let depthUrl: string | undefined;
  let successCount = 0;
  let segmentationMethod = "none";

  // ── Strategy 1: Layered segmentation (OneFormer + SAM3 on Modal) ──
  const layeredResult = await tryLayeredSegmentation(room_id, photoUrl, itemsToSegment);

  if (layeredResult && layeredResult.instance_masks) {
    itemMasks = layeredResult.instance_masks;
    archMaskUrl = layeredResult.arch_mask_url;
    depthUrl = layeredResult.depth_url;
    successCount = Object.keys(itemMasks).length;
    segmentationMethod = "layered_oneformer_sam3";
    console.log(`[segment-masks] Layered segmentation: ${successCount} masks`);
  }

  // ── Strategy 2: SAM3 direct via fal.ai (no Modal needed) ──
  if (successCount === 0) {
    const sam3Masks = await trySam3Direct(photoUrl, falKey, itemsToSegment);
    if (sam3Masks) {
      itemMasks = sam3Masks;
      successCount = Object.keys(itemMasks).length;
      segmentationMethod = "sam3_direct";
      console.log(`[segment-masks] SAM3 direct: ${successCount} masks`);
    }
  }

  // ── Strategy 3: Grounded-SAM2 Modal endpoint ──
  if (successCount === 0) {
    const groundedUrl = process.env.GROUNDED_SAM2_URL;
    if (groundedUrl) {
      try {
        console.log("[segment-masks] Trying Grounded-SAM2...");
        const gResp = await fetch(groundedUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_id,
            photo_url: photoUrl,
            detected_items: itemsToSegment,
          }),
          signal: AbortSignal.timeout(110_000),
        });

        if (gResp.ok) {
          const gJson = (await gResp.json()) as { masks?: Record<string, string>; error?: string };
          if (!gJson.error && gJson.masks) {
            for (const [label, url] of Object.entries(gJson.masks)) {
              if (typeof url === "string" && url.length > 0) {
                itemMasks[label.toLowerCase()] = url;
                successCount++;
              }
            }
            if (successCount > 0) segmentationMethod = "grounded_sam2";
          }
        }
      } catch (err) {
        console.warn("[segment-masks] Grounded-SAM2 failed:", err);
      }
    }
  }

  // ── Strategy 4: Per-item EVF-SAM2/SAM2 fallback ──
  if (successCount === 0) {
    console.log("[segment-masks] All primary methods failed — falling back to per-item EVF-SAM2");
    const imageDimensions = await getImageDimensions(photoUrl);

    const segmentResults = await Promise.all(
      itemsToSegment.map((item) =>
        segmentItem(photoUrl, item.label, falKey, item, imageDimensions).then((maskUrl) => ({
          label: item.label,
          maskUrl,
        })),
      ),
    );

    for (const { label, maskUrl } of segmentResults) {
      if (maskUrl) {
        itemMasks[label.toLowerCase()] = maskUrl;
        successCount++;
      }
    }
    if (successCount > 0) segmentationMethod = "evf_sam2_per_item";
  }

  console.log(
    `[segment-masks] Segmentation complete: ${successCount} masks via ${segmentationMethod}`,
  );

  // Persist results to render_context
  const { data: freshRoom } = await admin
    .from("rooms")
    .select("render_context")
    .eq("id", room_id)
    .single();

  const existingCtx =
    ((freshRoom?.render_context as Record<string, unknown> | null) ?? {});

  const updatedCtx: Record<string, unknown> = {
    ...existingCtx,
    itemMasks,
    masksReady: true,
    masksCompletedAt: new Date().toISOString(),
    segmentationMethod,
  };

  // Store architecture mask URL if available (from layered segmentation)
  if (archMaskUrl) {
    updatedCtx.archMaskUrl = archMaskUrl;
  }

  // Store depth URL if available
  if (depthUrl) {
    updatedCtx.depthUrl = depthUrl;
  }

  const { error: writeError } = await admin
    .from("rooms")
    .update({ render_context: updatedCtx })
    .eq("id", room_id);

  if (writeError) {
    console.error(
      "[segment-masks] CRITICAL: render_context write failed:",
      writeError.message,
    );
  } else {
    console.log(
      `[segment-masks] render_context written for room ${room_id}: ` +
      `${Object.keys(itemMasks).length} masks, method=${segmentationMethod}`,
    );
  }

  return NextResponse.json({
    status: "complete",
    room_id,
    maskCount: successCount,
    itemMasks,
    archMaskUrl: archMaskUrl ?? null,
    segmentationMethod,
  });
}
