import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// ── /api/quiz/mood-board ─────────────────────────────────────────────────────
// Decorative mood board for the step-4 fingerprint reveal screen.
// Returns up to N images from quiz_anchor_images. The supplied style_name
// (descriptive display name from the fingerprint route) is intentionally
// ignored — with only 9 anchors total, any deterministic-but-shuffled
// presentation works. The user just sees a 3×3 grid of inspiration shots.
//
// Migrated from swipe_cards in Session C cleanup.
//
// Body:     { style_name?: string; count?: number }
// Response: { images: Array<{ id, imageUrl, alt }> }
//
// `styleName` is intentionally NOT returned — the raw internal anchor name
// would violate CLAUDE.md hard rule #8 if it ever reached the UI, and the
// step-4 mood board only renders the image.

interface MoodBoardRequest {
  style_name?: string;
  count?: number;
}

interface AnchorRow {
  id: string;
  image_url: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MoodBoardRequest;
    const count = body.count ?? 9;

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("quiz_anchor_images")
      .select("id, image_url")
      .order("style_index", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as AnchorRow[];

    // Shuffle so the 3×3 grid feels fresh on each load.
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rows[i], rows[j]] = [rows[j]!, rows[i]!];
    }

    const images = rows.slice(0, count).map((row) => ({
      id: row.id,
      imageUrl: row.image_url,
      alt: "Interior design inspiration",
    }));

    return NextResponse.json({ images });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
