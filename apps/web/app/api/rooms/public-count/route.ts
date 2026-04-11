/**
 * Public social-proof count — number of rooms successfully rendered.
 * No auth required. Cached at the edge.
 */
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const revalidate = 300; // 5 minutes

export async function GET() {
  try {
    const admin = createAdminSupabaseClient();
    const { count, error } = await admin
      .from("rooms")
      .select("id", { count: "exact", head: true })
      .not("render_url", "is", null);

    if (error) return NextResponse.json({ count: null });
    return NextResponse.json({ count: count ?? 0 });
  } catch {
    return NextResponse.json({ count: null });
  }
}
