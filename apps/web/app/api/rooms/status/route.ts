import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const PROGRESS_MAP: Record<string, { percent: number; message: string }> = {
  pending: { percent: 0, message: "Getting ready..." },
  queued: { percent: 5, message: "Queued for processing..." },
  analyzing_room: { percent: 20, message: "Analyzing your space..." },
  applying_style: {
    percent: 40,
    message: "Applying your style preferences...",
  },
  rendering: { percent: 70, message: "Rendering your redesign..." },
  finalizing: { percent: 90, message: "Almost ready..." },
  kontext_processing: { percent: 45, message: "Redesigning your room..." },
  kontext_complete: { percent: 60, message: "Design complete." },
  matching_products: { percent: 97, message: "Finding your furniture..." },
  complete: { percent: 100, message: "Your room is ready!" },
  error: { percent: 0, message: "Something went wrong. Please try again." },
  failed: { percent: 0, message: "Something went wrong. Please try again." },
};

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Ignore
          }
        },
      },
    },
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get("roomId");
  if (!roomId) {
    return NextResponse.json({ error: "roomId required" }, { status: 400 });
  }

  const { data: room } = await supabase
    .from("rooms")
    .select(
      `id, redesign_status, render_url, redesign_pano_url, perspective_render_url,
       render_detection_result, pre_detection_result, fixed_furniture`,
    )
    .eq("id", roomId)
    .eq("user_id", user.id)
    .single();

  const { data: roomProducts } = await supabase
    .from("room_products")
    .select("id, hotspot_x, hotspot_y, furniture_label, matches")
    .eq("room_id", roomId);

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const statusKey = room.redesign_status ?? "pending";
  const statusInfo = PROGRESS_MAP[statusKey] ?? {
    percent: 50,
    message: "Processing...",
  };

  return NextResponse.json({
    roomId,
    redesign_status: statusKey,
    progress_percent: statusInfo.percent,
    progress_message: statusInfo.message,
    isComplete:
      statusKey === "complete" ||
      (!!room.render_url &&
        (!room.redesign_status || room.redesign_status === "pending")),
    isError: statusKey === "error" || statusKey === "failed",

    // Detection results
    render_detection_result: room.render_detection_result ?? null,
    pre_detection_result: room.pre_detection_result ?? null,
    fixed_furniture: room.fixed_furniture ?? null,

    // Redesign output (flat 2D image)
    redesignPanoUrl: room.redesign_pano_url ?? room.render_url ?? null,
    perspective_render_url:
      room.perspective_render_url ??
      room.redesign_pano_url ??
      room.render_url ??
      null,
    room_products: roomProducts ?? [],
  });
}
