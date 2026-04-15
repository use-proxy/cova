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

interface DetectedItem {
  label: string;
  category: string;
  azimuth_degrees: number;
  elevation_degrees: number;
  is_fixed: boolean;
  confidence: number;
}

interface SegmentMasksBody {
  room_id?: string;
}

// Type for the fal.ai EVF-SAM response
interface EvfSamResult {
  image?: { url: string };
  output?: { url: string };
  url?: string;
}

/**
 * Call fal-ai/evf-sam for a single item.
 * Returns the mask URL or null if it fails.
 */
async function segmentItem(
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
        text_prompt: label.toLowerCase(),
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      console.warn(`[segment-masks] EVF-SAM failed for "${label}": ${response.status} ${text.slice(0, 100)}`);
      return null;
    }

    const result = (await response.json()) as EvfSamResult;
    // fal.ai EVF-SAM returns the mask in result.image.url or result.output.url
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
  const preDetectionResult = (room as Record<string, unknown>).pre_detection_result as
    | { items?: DetectedItem[]; furniture?: DetectedItem[] }
    | null;

  const detectedItems: DetectedItem[] = (
    preDetectionResult?.items ??
    preDetectionResult?.furniture ??
    []
  ) as DetectedItem[];

  if (detectedItems.length === 0) {
    return NextResponse.json({
      status: "no_items",
      room_id,
      maskCount: 0,
      itemMasks: {},
    });
  }

  // Call EVF-SAM2 for each item in parallel (cap at 12 items to stay within timeout)
  const itemsToSegment = detectedItems.slice(0, 12);
  console.log(`[segment-masks] Segmenting ${itemsToSegment.length} items for room ${room_id}`);

  const segmentResults = await Promise.all(
    itemsToSegment.map((item) =>
      segmentItem(photoUrl, item.label, falKey).then((maskUrl) => ({
        label: item.label,
        maskUrl,
      })),
    ),
  );

  // Build the itemMasks map (only include successful results)
  const itemMasks: Record<string, string> = {};
  let successCount = 0;
  for (const { label, maskUrl } of segmentResults) {
    if (maskUrl) {
      itemMasks[label.toLowerCase()] = maskUrl;
      successCount++;
    }
  }

  console.log(
    `[segment-masks] Segmentation complete: ${successCount}/${itemsToSegment.length} masks obtained`,
  );

  // Persist itemMasks into rooms.render_context.itemMasks (fire-and-forget write)
  const existingCtx =
    ((room as Record<string, unknown>).render_context as Record<string, unknown>) ?? {};

  await admin
    .from("rooms")
    .update({
      render_context: {
        ...existingCtx,
        itemMasks,
      },
    })
    .eq("id", room_id)
    .then(({ error }) => {
      if (error) console.error("[segment-masks] render_context write failed:", error);
      else console.log(`[segment-masks] itemMasks stored for room ${room_id}`);
    });

  return NextResponse.json({
    status: "complete",
    room_id,
    maskCount: successCount,
    itemMasks,
  });
}
