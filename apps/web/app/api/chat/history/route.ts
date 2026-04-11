import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId");

    if (!roomId) {
      return NextResponse.json({ error: "Missing roomId" }, { status: 400 });
    }

    // Auth check
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user owns room
    const db = createAdminClient();

    const { data: room } = await db
      .from("rooms")
      .select("id, user_id")
      .eq("id", roomId)
      .single();

    if (!room || room.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch last 50 messages
    const { data: messages } = await db
      .from("chat_messages")
      .select("id, role, content, tool_calls, tool_results, created_at")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(50);

    return NextResponse.json({ messages: messages || [] });
  } catch (error) {
    console.error("Chat history error:", error);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 },
    );
  }
}
