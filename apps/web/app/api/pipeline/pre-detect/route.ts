/**
 * Pipeline 1 — Pre-Detection
 * Fires when user uploads a room photo in step-6 and clicks "Analyze My Room".
 * Calls the Modal pre_detection_webhook to detect furniture via Claude Vision.
 *
 * Input:  { room_id: string, photo_url: string }
 * Output: { status, room_id, furniture, count } or { error }
 * Saves:  rooms.pre_detection_result (written by Modal pipeline)
 */

export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface PreDetectBody {
  room_id?: string;
  photo_url?: string;
}

type BBoxPct = { x: number; y: number; w: number; h: number };

type DetectedItemLoose = {
  estimated_bbox_pct?: BBoxPct | null;
  azimuth_degrees?: number;
  elevation_degrees?: number;
  [key: string]: unknown;
};

function deriveBboxPct(item: DetectedItemLoose): BBoxPct {
  const az = typeof item.azimuth_degrees === "number" ? item.azimuth_degrees : 0;
  const el =
    typeof item.elevation_degrees === "number" ? item.elevation_degrees : 0;
  return {
    x: Math.max(0, Math.min(0.95, 0.5 + (az / 90) * 0.4 - 0.05)),
    y: Math.max(0, Math.min(0.95, 0.5 - (el / 60) * 0.3 - 0.05)),
    w: 0.1,
    h: 0.1,
  };
}

function normalizeFurniture(items: unknown[]): DetectedItemLoose[] {
  return items.map((raw) => {
    const item = (raw ?? {}) as DetectedItemLoose;
    if (
      item.estimated_bbox_pct &&
      typeof item.estimated_bbox_pct === "object"
    ) {
      return item;
    }
    return { ...item, estimated_bbox_pct: deriveBboxPct(item) };
  });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as PreDetectBody;
  const { room_id, photo_url } = body;

  if (!room_id || !photo_url) {
    return NextResponse.json(
      { error: "room_id and photo_url are required" },
      { status: 400 },
    );
  }

  const webhookUrl = process.env.PRE_DETECTION_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "PRE_DETECTION_WEBHOOK_URL not configured" },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id, photo_url }),
      signal: AbortSignal.timeout(55_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      console.error("[pre-detect] Modal webhook error:", response.status, text);
      return NextResponse.json(
        { error: "Pre-detection pipeline failed", detail: text },
        { status: 502 },
      );
    }

    const result = (await response.json()) as {
      status: string;
      room_id?: string;
      furniture?: unknown[];
      count?: number;
      error?: string;
    };

    if (result.status === "error") {
      console.error("[pre-detect] Pipeline error:", result.error);
      return NextResponse.json(
        { error: result.error ?? "Pre-detection failed" },
        { status: 500 },
      );
    }

    const furniture = normalizeFurniture(result.furniture ?? []);

    // Backfill: ensure stored pre_detection_result contains estimated_bbox_pct
    // even if Modal returned the old azimuth_degrees-only format.
    if (furniture.length > 0) {
      try {
        await supabase
          .from("rooms")
          .update({ pre_detection_result: furniture })
          .eq("id", room_id);
      } catch (err) {
        console.warn(
          "[pre-detect] Failed to backfill pre_detection_result:",
          err,
        );
      }
    }

    return NextResponse.json({
      status: result.status,
      room_id: result.room_id,
      furniture,
      count: result.count ?? furniture.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[pre-detect] Unexpected error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
