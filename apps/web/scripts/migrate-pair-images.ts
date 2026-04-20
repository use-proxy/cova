/**
 * migrate-pair-images.ts — Copy quiz comparison pair images from fal.media CDN
 * to Supabase permanent storage, then update DB URLs.
 *
 * Copies 480 rows × 2 images = 960 images from expiring fal.media URLs to
 * quiz-images/pairs/dim-{N}/{pairIndex}-{a|b}.jpg in Supabase Storage.
 *
 * Run: cd apps/web && npx tsx scripts/migrate-pair-images.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, "..", ".env.local") });
config({ path: path.join(__dirname, "..", "..", "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL not set");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

async function copyToStorage(
  sourceUrl: string,
  storagePath: string,
): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status}: ${sourceUrl.slice(0, 60)}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "image/jpeg";

  const { error } = await admin.storage
    .from("quiz-images")
    .upload(storagePath, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Upload ${storagePath}: ${error.message}`);

  const { data } = admin.storage.from("quiz-images").getPublicUrl(storagePath);
  return data.publicUrl;
}

async function main() {
  // Fetch all comparison pairs
  const { data: rows, error } = await admin
    .from("quiz_comparison_pairs")
    .select("id, dimension_index, pair_index, image_a_url, image_b_url, image_a_storage_path, image_b_storage_path")
    .order("dimension_index", { ascending: true })
    .order("pair_index", { ascending: true });

  if (error) {
    console.error("DB error:", error.message);
    return;
  }

  console.log(`[${ts()}] Found ${rows?.length ?? 0} comparison pairs to migrate`);

  let copied = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    const dimIdx = row.dimension_index;
    const pairIdx = row.pair_index;

    // Image A
    const pathA = `pairs/dim-${dimIdx}/${pairIdx}-a.jpg`;
    const pathB = `pairs/dim-${dimIdx}/${pairIdx}-b.jpg`;

    // Check if already has Supabase URLs
    const alreadyMigratedA = row.image_a_url?.includes("supabase.co");
    const alreadyMigratedB = row.image_b_url?.includes("supabase.co");

    try {
      let newUrlA = row.image_a_url;
      let newUrlB = row.image_b_url;

      if (!alreadyMigratedA && row.image_a_url) {
        newUrlA = await copyToStorage(row.image_a_url, pathA);
        copied++;
      } else {
        skipped++;
      }

      if (!alreadyMigratedB && row.image_b_url) {
        newUrlB = await copyToStorage(row.image_b_url, pathB);
        copied++;
      } else {
        skipped++;
      }

      // Update DB with permanent URLs
      const { error: updateErr } = await admin
        .from("quiz_comparison_pairs")
        .update({
          image_a_url: newUrlA,
          image_b_url: newUrlB,
          image_a_storage_path: pathA,
          image_b_storage_path: pathB,
        })
        .eq("id", row.id);

      if (updateErr) {
        console.error(`[${ts()}] DB update error for ${row.id}:`, updateErr.message);
        failed++;
      }

      if ((copied + skipped) % 50 === 0) {
        console.log(`[${ts()}] Progress: ${copied} copied, ${skipped} skipped, ${failed} failed`);
      }
    } catch (e) {
      console.error(`[${ts()}] FAIL dim-${dimIdx} pair-${pairIdx}:`, (e as Error).message);
      failed++;
    }
  }

  console.log(`\n=== MIGRATION COMPLETE ===`);
  console.log(`Copied: ${copied}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);
