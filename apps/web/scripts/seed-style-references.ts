/**
 * Seed style_references table using swipe_cards as source.
 * For each of the 5 styles, picks the 3 highest discriminability_score cards
 * from any room type as style references.
 *
 * Run: npx tsx scripts/seed-style-references.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const STYLES = ["bohemian", "coastal", "japandi", "mid_century", "minimalist"];

async function seed() {
  console.log("Seeding style_references...");

  // Clear existing rows
  const { error: deleteError } = await sb
    .from("style_references")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (deleteError) {
    console.error("Failed to clear style_references:", deleteError.message);
    process.exit(1);
  }

  let total = 0;

  for (const style of STYLES) {
    // Pick top 3 by discriminability_score, phase=baseline, active=true
    const { data: cards, error } = await sb
      .from("swipe_cards")
      .select("image_url, style, dimension_labels, room_type")
      .eq("style", style)
      .eq("phase", "baseline")
      .eq("active", true)
      .not("dimension_labels", "is", null)
      .order("discriminability_score", { ascending: false })
      .limit(3);

    if (error) {
      console.warn(`Failed to fetch cards for ${style}:`, error.message);
      continue;
    }

    if (!cards?.length) {
      console.warn(`No baseline cards found for style: ${style}`);
      continue;
    }

    const rows = cards.map((card) => ({
      image_url: card.image_url as string,
      room_type: (card.room_type as string) ?? "living_room",
      dimension_labels: card.dimension_labels as Record<string, number>,
      style_name: style,
      source: "swipe_cards",
    }));

    const { error: insertError } = await sb
      .from("style_references")
      .insert(rows);

    if (insertError) {
      console.error(`Insert failed for ${style}:`, insertError.message);
      continue;
    }

    total += rows.length;
    console.log(`  ✓ ${style}: ${rows.length} references seeded`);
  }

  console.log(`\nDone. Total style references: ${total}`);
}

seed().catch((err: unknown) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
