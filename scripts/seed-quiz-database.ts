/**
 * seed-quiz-database.ts — Seeds Supabase with generated quiz images.
 *
 * Reads from:
 *   swipe-pairs/manifest.json → quiz_comparison_pairs
 *   anchor-images/manifest.json → quiz_comparison_pairs (is_anchor=true)
 *
 * Requires: migration 20260416_quiz_v3_schema.sql to have been run first.
 *
 * Usage: cd scripts && npx tsx seed-quiz-database.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, "..", "apps", "web", ".env.local") });
config({ path: path.join(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL not set");
if (!SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Dimension name → index mapping (0-11)
const DIMENSION_INDEX: Record<string, number> = {
  warmth: 0,
  complexity: 1,
  formality: 2,
  natureMateriality: 3,
  colorSaturation: 4,
  textureRichness: 5,
  lightingDrama: 6,
  pattern: 7,
  lightPreference: 8,
  lineQuality: 9,
  symmetryPreference: 10,
  plantPresence: 11,
};

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function log(...args: unknown[]): void {
  console.log(`[${ts()}]`, ...args);
}

async function main(): Promise<void> {
  log("Seeding quiz database...");

  // Read manifests
  const swipeManifestPath = path.join(
    __dirname,
    "..",
    "swipe-pairs",
    "manifest.json"
  );
  const anchorManifestPath = path.join(
    __dirname,
    "..",
    "anchor-images",
    "manifest.json"
  );

  if (!fs.existsSync(swipeManifestPath)) {
    throw new Error(`Swipe manifest not found: ${swipeManifestPath}`);
  }
  if (!fs.existsSync(anchorManifestPath)) {
    throw new Error(`Anchor manifest not found: ${anchorManifestPath}`);
  }

  const swipeManifest = JSON.parse(fs.readFileSync(swipeManifestPath, "utf-8"));
  const anchorManifest = JSON.parse(
    fs.readFileSync(anchorManifestPath, "utf-8")
  );

  // Clear existing V3 rows (preserve old V2 rows that have image_a_stop set)
  log("Clearing existing V3 quiz_comparison_pairs (where is_anchor IS NOT NULL or room_type IS NOT NULL)...");
  const { error: deleteErr } = await admin
    .from("quiz_comparison_pairs")
    .delete()
    .or("is_anchor.not.is.null,room_type.not.is.null");

  if (deleteErr) {
    log(`Warning: delete failed (may be first run): ${deleteErr.message}`);
  }

  // Insert swipe pairs
  log(`Inserting ${swipeManifest.pairs.length} swipe pairs...`);

  const pairRows = swipeManifest.pairs.map(
    (
      p: {
        pair_id: string;
        dimension: string;
        room_type: string;
        image_a_url: string;
        image_b_url: string;
        a_is_high: boolean;
        b_is_high: boolean;
      },
      idx: number
    ) => ({
      dimension: p.dimension,
      dimension_index: DIMENSION_INDEX[p.dimension] ?? 0,
      pair_index: idx,
      image_a_url: p.image_a_url,
      image_b_url: p.image_b_url,
      room_type: p.room_type,
      style_a: null,
      style_b: null,
      a_dimension_value: p.a_is_high ? 1.0 : 0.0,
      b_dimension_value: p.b_is_high ? 1.0 : 0.0,
      is_anchor: false,
      anchor_style: null,
    })
  );

  // Insert in batches of 50
  for (let i = 0; i < pairRows.length; i += 50) {
    const batch = pairRows.slice(i, i + 50);
    const { error } = await admin.from("quiz_comparison_pairs").insert(batch);
    if (error) {
      throw new Error(
        `Insert failed at batch ${i}: ${error.message}\n${JSON.stringify(batch[0], null, 2)}`
      );
    }
    log(`  Inserted pairs ${i + 1}-${Math.min(i + 50, pairRows.length)}`);
  }

  // Insert anchor images
  log(`Inserting ${anchorManifest.anchors.length} anchor images...`);

  const anchorRows = anchorManifest.anchors.map(
    (
      a: { style: string; room_type: string; url: string },
      idx: number
    ) => ({
      dimension: "anchor",
      dimension_index: 0,
      pair_index: idx,
      image_a_url: a.url,
      image_b_url: null,
      room_type: a.room_type,
      style_a: a.style,
      style_b: null,
      a_dimension_value: null,
      b_dimension_value: null,
      is_anchor: true,
      anchor_style: a.style,
    })
  );

  const { error: anchorErr } = await admin
    .from("quiz_comparison_pairs")
    .insert(anchorRows);

  if (anchorErr) {
    throw new Error(`Anchor insert failed: ${anchorErr.message}`);
  }

  // Verify counts
  const { count: pairCount } = await admin
    .from("quiz_comparison_pairs")
    .select("*", { count: "exact", head: true })
    .eq("is_anchor", false);

  const { count: anchorCount } = await admin
    .from("quiz_comparison_pairs")
    .select("*", { count: "exact", head: true })
    .eq("is_anchor", true);

  log("═══ SEED COMPLETE ═══");
  log(`  Swipe pairs: ${pairCount}`);
  log(`  Anchor images: ${anchorCount}`);
  log(`  Total rows: ${(pairCount || 0) + (anchorCount || 0)}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
