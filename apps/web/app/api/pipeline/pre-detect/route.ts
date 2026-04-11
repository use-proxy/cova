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

    return NextResponse.json({
      status: result.status,
      room_id: result.room_id,
      furniture: result.furniture ?? [],
      count: result.count ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[pre-detect] Unexpected error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
