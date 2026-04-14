import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// ── /api/quiz/next-card ──────────────────────────────────────────────────────
// Returns the 9 anchor images from quiz_anchor_images. Used by Phase A of the
// quiz at /design/step-3 — a single round where the user picks exactly 2.
//
// Both GET and POST are accepted. Optional ?room_type= param overrides each
// card's image_url with a room-specific variant from Supabase Storage.
//
// Response shape:
//   { cards: Array<{
//       id: string
//       style_name: string
//       style_index: number      // 1-9
//       image_url: string
//       style_vector: Record<DimKey, number>   // 12 dims [0,1]
//       room_images: Record<string, string> | null
//   }> }
//
// Migrated from swipe_cards (10-dim, wiped in Session A) to quiz_anchor_images
// in Session C (quiz wiring).

const STYLE_SLUG: Record<number, string> = {
  1: 'warm-japandi',
  2: 'dark-moody-glam',
  3: 'coastal-bright',
  4: 'industrial-loft',
  5: 'maximalist-eclectic',
  6: 'heritage-traditional',
  7: 'pure-minimal-white',
  8: 'biophilic-jungle',
  9: 'retro-mid-century',
}

const ROOM_SLUG: Record<string, string> = {
  living_room: 'living-room',
  bedroom: 'bedroom',
  dining_room: 'dining-room',
  kitchen: 'kitchen',
  bathroom: 'bathroom',
  home_office: 'home-office',
}

const ROOM_SPECIFIC_BASE = 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-images/anchors/room-specific'


interface AnchorRow {
  id: string;
  style_name: string;
  style_index: number;
  image_url: string;
  style_vector: Record<string, number>;
  flux_prompt: string | null;
  room_images: Record<string, string> | null;
  round_images: Record<string, Record<string, string>> | null;
}

async function loadAnchors(room_type?: string, round?: number) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("quiz_anchor_images")
    .select("id, style_name, style_index, image_url, style_vector, flux_prompt, room_images, round_images")
    .order("style_index", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ cards: [] });
  }

  const roomSlug = room_type ? ROOM_SLUG[room_type] : undefined;
  const roundKey = round ? `r${round}` : undefined;

  const cards = (data as AnchorRow[]).map((row) => {
    let image_url = row.image_url;

    // Try round_images first (per-room, per-round), fall back to room-specific URL
    if (roomSlug && roundKey && row.round_images) {
      const roomRounds = row.round_images[roomSlug];
      if (roomRounds && roomRounds[roundKey]) {
        image_url = roomRounds[roundKey];
      }
    } else if (roomSlug) {
      const styleSlug = STYLE_SLUG[row.style_index];
      if (styleSlug) {
        image_url = `${ROOM_SPECIFIC_BASE}/phase-a-${styleSlug}-${roomSlug}.webp`;
      }
    }

    return {
      id: row.id,
      style_name: row.style_name,
      style_index: row.style_index,
      image_url,
      style_vector: row.style_vector,
      flux_prompt: row.flux_prompt ?? null,
      room_images: row.room_images ?? null,
      round_images: row.round_images ?? null,
    };
  });
  return NextResponse.json({ cards });
}

export async function GET(request: NextRequest) {
  try {
    const room_type = request.nextUrl.searchParams.get("room_type") ?? undefined;
    const roundParam = request.nextUrl.searchParams.get("round");
    const round = roundParam ? parseInt(roundParam, 10) : undefined;
    return await loadAnchors(room_type, round);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    let room_type: string | undefined;
    let round: number | undefined;
    try {
      const body = await request.json();
      room_type = body?.room_type;
      round = body?.round ? parseInt(String(body.round), 10) : undefined;
    } catch {
      // no body or invalid JSON — fall back to query params
      room_type = request.nextUrl.searchParams.get("room_type") ?? undefined;
      const roundParam = request.nextUrl.searchParams.get("round");
      round = roundParam ? parseInt(roundParam, 10) : undefined;
    }
    return await loadAnchors(room_type, round);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
