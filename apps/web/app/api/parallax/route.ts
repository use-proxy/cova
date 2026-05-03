import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { redactLogPayload } from "@/lib/log/redact";

const DEPTHFLOW_WEBHOOK_URL = process.env.DEPTHFLOW_WEBHOOK_URL;

export async function POST(req: NextRequest) {
  // Auth check — protected route
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Validate request body
  let body: { render_url?: string; depth_map_url?: string; room_id?: string };
  try {
    body = (await req.json()) as {
      render_url?: string;
      depth_map_url?: string;
      room_id?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { render_url, depth_map_url, room_id } = body;
  if (!render_url || !depth_map_url || !room_id) {
    return NextResponse.json(
      { error: "render_url, depth_map_url, and room_id are required" },
      { status: 400 },
    );
  }

  // If Modal DepthFlow endpoint is not configured, skip gracefully
  // step-7 UI handles null video_url by showing before/after comparison directly
  if (!DEPTHFLOW_WEBHOOK_URL) {
    console.warn(
      "[parallax] DEPTH_VIDEO_WEBHOOK_URL not set — skipping parallax generation",
    );
    return NextResponse.json({ video_url: null });
  }

  try {
    const response = await fetch(DEPTHFLOW_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ render_url, depth_map_url, room_id }),
      signal: AbortSignal.timeout(170_000), // 170s — Modal function timeout is 180s
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      console.error(
        "[parallax] Modal function returned error:",
        response.status,
        redactLogPayload(text),
      );
      return NextResponse.json({ video_url: null });
    }

    const result = (await response.json()) as {
      video_url?: string | null;
      error?: string;
    };

    if (result.error) {
      console.error("[parallax] DepthFlow error:", redactLogPayload(result.error));
      return NextResponse.json({ video_url: null });
    }

    const videoUrl = result.video_url ?? null;

    // Store in rooms table if we got a video URL
    if (videoUrl && room_id) {
      const admin = createAdminSupabaseClient();
      const { data: owned } = await admin
        .from("rooms")
        .select("id")
        .eq("id", room_id)
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!owned) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      await admin
        .from("rooms")
        .update({ parallax_video_url: videoUrl } as Record<string, unknown>)
        .eq("id", room_id)
        .eq("user_id", session.user.id);
    }

    return NextResponse.json({ video_url: videoUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[parallax] Unexpected error:", redactLogPayload(message));
    // Non-fatal: step-7 skips to comparison mode
    return NextResponse.json({ video_url: null });
  }
}
