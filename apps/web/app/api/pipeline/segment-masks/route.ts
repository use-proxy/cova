/**
 * Pipeline — EVF-SAM2 Item Segmentation
 *
 * Reads pre_detection_result from a room, calls fal-ai/evf-sam for each detected
 * item in parallel, and stores mask URLs in rooms.render_context.itemMasks.
 *
 * Called from step-7c after pre_detection_result is loaded, before showing keep/remove UI.
 * Non-fatal: if any individual mask fails, the others are stored. UI proceeds without masks.
 *
 * Input:  { room_id: string }
 * Output: { status, room_id, maskCount, itemMasks: Record<label, maskUrl> }
 *
 * itemMasks are referenced by the redesign API to build the differential diffusion change map.
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

// Structural categories are preserved via the change map, not EVF-SAM masks.
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

async function getImageDimensions(url: string): Promise<{width: number, height: number}> {
  try {
    const resp = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000)
    })
    void resp
    const partialResp = await fetch(url, {
      headers: { Range: 'bytes=0-32767' },
      signal: AbortSignal.timeout(15000)
    })
    const buffer = await partialResp.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
      for (let i = 2; i < bytes.length - 8; i++) {
        if (bytes[i] === 0xFF && (bytes[i+1] === 0xC0 || bytes[i+1] === 0xC2)) {
          const height = ((bytes[i+5] ?? 0) << 8) | (bytes[i+6] ?? 0)
          const width = ((bytes[i+7] ?? 0) << 8) | (bytes[i+8] ?? 0)
          if (width > 0 && height > 0) {
            console.log('[segment-masks] Image dimensions from JPEG header:', width, 'x', height)
            return { width, height }
          }
        }
      }
    }

    if (bytes[0] === 0x89 && bytes[1] === 0x50) {
      const width = ((bytes[16] ?? 0) << 24) | ((bytes[17] ?? 0) << 16) | ((bytes[18] ?? 0) << 8) | (bytes[19] ?? 0)
      const height = ((bytes[20] ?? 0) << 24) | ((bytes[21] ?? 0) << 16) | ((bytes[22] ?? 0) << 8) | (bytes[23] ?? 0)
      if (width > 0 && height > 0) {
        console.log('[segment-masks] Image dimensions from PNG header:', width, 'x', height)
        return { width, height }
      }
    }
  } catch (e) {
    console.warn('[segment-masks] Could not fetch image dimensions, using 1024x1024 fallback:', e)
  }
  return { width: 1024, height: 1024 }
}

// Type for the fal.ai EVF-SAM response
interface EvfSamResult {
  image?: { url: string };
  output?: { url: string };
  url?: string;
}

interface Sam2Result {
  image?: { url: string; width?: number; height?: number };
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
    const maskUrl =
      result?.image?.url ??
      result?.output?.url ??
      (typeof result?.url === "string" ? result.url : null);

    if (!maskUrl) {
      console.warn(`[segment-masks] No mask URL in EVF-SAM response for "${label}"`);
      return null;
    }

    return maskUrl;
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
      const text = await response.text().catch(() => response.statusText);
      console.warn(`[segment-masks] SAM2 failed for "${label}": ${response.status} ${text.slice(0, 100)}`);
      return null;
    }

    const result = (await response.json()) as Sam2Result;
    const maskUrl = result?.image?.url ?? null;

    if (!maskUrl) {
      console.warn(`[segment-masks] No mask URL in SAM2 response for "${label}"`);
      return null;
    }

    return maskUrl;
  } catch (err) {
    console.warn(`[segment-masks] SAM2 error for "${label}":`, err);
    return null;
  }
}

/**
 * Two-stage segmentation:
 *   Stage 1: Use estimated_bbox_pct (if present) to compute integer pixel coordinates,
 *            then call SAM2 directly for a pixel-perfect mask.
 *   Fallback: If no bbox, call EVF-SAM with a text prompt.
 */
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
      const box = { x_min, y_min, x_max, y_max };
      console.log(
        `[segment-masks] SAM2 for "${label}" box with size:`,
        item.size_in_room,
        box,
      );
      return callSam2(imageUrl, box, label, falKey);
    }
  }

  console.log(`[segment-masks] EVF-SAM fallback for "${label}" (no bbox)`);
  return callEvfSam(imageUrl, label, falKey);
}

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

  // Get the room photo URL
  const photoUrl =
    (room as Record<string, unknown>).original_image_url as string | null ??
    (room as Record<string, unknown>).original_photo_url as string | null;

  if (!photoUrl) {
    return NextResponse.json(
      { error: "No photo URL found for room" },
      { status: 422 },
    );
  }

  // Parse pre_detection_result to get detected items
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

  // Only call EVF-SAM for movable, non-structural items. Structural elements
  // (walls, floor, ceiling, windows, doors, built-ins) are preserved via the
  // change map directly, so segmenting them wastes API calls.
  const itemsToSegment = detectedItems
    .filter((item) => {
      const cat = (item.category ?? "").toLowerCase().replace(/\s+/g, "_");
      if (STRUCTURAL_CATEGORIES.has(cat)) return false;
      return true;
    })
    .slice(0, 12);
  console.log(`[segment-masks] Segmenting ${itemsToSegment.length} items for room ${room_id}`);

  console.log('[segment-masks] Starting segmentation, falKey present:', !!falKey, 'items count:', itemsToSegment.length, 'photo URL:', photoUrl?.slice(0,80))

  const itemMasks: Record<string, string> = {};
  let successCount = 0;

  const groundedUrl = process.env.GROUNDED_SAM2_URL;
  let usedGrounded = false;

  if (groundedUrl) {
    try {
      console.log('[segment-masks] Calling Grounded-SAM2 endpoint');
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
        if (gJson.error) {
          console.warn('[segment-masks] Grounded-SAM2 returned error, falling back:', gJson.error);
        } else if (gJson.masks && typeof gJson.masks === "object") {
          for (const [label, url] of Object.entries(gJson.masks)) {
            if (typeof url === "string" && url.length > 0) {
              itemMasks[label.toLowerCase()] = url;
              successCount++;
            }
          }
          usedGrounded = successCount > 0;
          console.log(`[segment-masks] Grounded-SAM2 returned ${successCount} masks`);
        }
      } else {
        const text = await gResp.text().catch(() => gResp.statusText);
        console.warn('[segment-masks] Grounded-SAM2 HTTP error, falling back:', gResp.status, text.slice(0, 200));
      }
    } catch (err) {
      console.warn('[segment-masks] Grounded-SAM2 exception, falling back:', err);
    }
  }

  if (!usedGrounded) {
    const imageDimensions = await getImageDimensions(photoUrl)
    console.log('[segment-masks] Detected dimensions:', imageDimensions.width, 'x', imageDimensions.height)

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
  }

  console.log(
    `[segment-masks] Segmentation complete: ${successCount}/${itemsToSegment.length} masks obtained`,
  );

  // Persist itemMasks into rooms.render_context.itemMasks.
  // Read fresh render_context first to avoid clobbering concurrent writes and
  // to defend against render_context being null (can't spread null).
  const { data: freshRoom } = await admin
    .from("rooms")
    .select("render_context")
    .eq("id", room_id)
    .single();

  const existingCtx =
    ((freshRoom?.render_context as Record<string, unknown> | null) ?? {});

  const { error: writeError } = await admin
    .from("rooms")
    .update({
      render_context: {
        ...existingCtx,
        itemMasks,
        masksReady: true,
        masksCompletedAt: new Date().toISOString(),
      },
    })
    .eq("id", room_id);

  if (writeError) {
    console.error(
      "[segment-masks] CRITICAL: render_context write failed:",
      writeError.message,
    );
  } else {
    console.log(
      `[segment-masks] render_context written successfully for room ${room_id}, keys:`,
      Object.keys(itemMasks),
    );
  }

  return NextResponse.json({
    status: "complete",
    room_id,
    maskCount: successCount,
    itemMasks,
  });
}
