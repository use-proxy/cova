/**
 * sync-loras-to-db.ts — Phase 4 closeout: push 10 trained LoRAs into style_loras.
 *
 * Reads registry (trigger, default_scale, trained_at, quality_score) and
 * each lora-backups/<STYLE>_2026-04-17.meta.json (original_url — the
 * fal.media safetensor URL the fal renderer actually loads).
 *
 * Upserts on style_name. Cost: $0 (no fal calls).
 *
 * Usage: cd scripts && npx tsx sync-loras-to-db.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { LORA_REGISTRY } from "../apps/web/lib/styles/lora-registry";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, "..", "apps", "web", ".env.local") });
config({ path: path.join(__dirname, "..", ".env.local") });

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) throw new Error("SUPABASE_URL not set");
if (!SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// COVA* key → human display style_name.
// COVACOASTAL owns "Coastal Bright"; COVASCANDINAV takes "Nordic Calm" to
// avoid collision (per task brief).
const STYLE_NAME_MAP: Record<keyof typeof LORA_REGISTRY, string> = {
  COVASCANDINAV: "Nordic Calm",
  COVAJAPANDI: "Warm Japandi",
  COVABIOPHILIC: "Biophilic Jungle",
  COVAMINIMAL: "Pure Minimal White",
  COVAMIDCENTURY: "Retro Mid-Century",
  COVACOASTAL: "Coastal Bright",
  COVABOHEMIAN: "Maximalist Eclectic",
  COVAINDUSTRIAL: "Industrial Loft",
  COVAFARMHOUSE: "Heritage Traditional",
  COVAARTDECO: "Dark Moody Glam",
};

const BACKUPS_DIR = path.join(__dirname, "..", "lora-backups");

async function main() {
  const rows = (Object.keys(LORA_REGISTRY) as Array<keyof typeof LORA_REGISTRY>).map(
    (covaKey) => {
      const reg = LORA_REGISTRY[covaKey];
      const metaPath = path.join(BACKUPS_DIR, `${covaKey}_2026-04-17.meta.json`);
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      return {
        style_name: STYLE_NAME_MAP[covaKey],
        trigger_word: reg.trigger,
        lora_url: meta.original_url as string,
        recommended_scale: reg.default_scale,
        trained_at: reg.trained_at,
        quality_score: reg.quality_score,
      };
    },
  );

  // No unique constraint on style_name or trigger_word, so delete-then-insert
  // for the target trigger_words to keep this idempotent.
  const triggers = rows.map((r) => r.trigger_word);
  console.log(`Deleting existing rows with trigger_word in ${triggers.join(", ")}…`);
  const { error: delErr } = await supabase
    .from("style_loras")
    .delete()
    .in("trigger_word", triggers);
  if (delErr) {
    console.error("Delete failed:", delErr);
    process.exit(1);
  }

  console.log(`Inserting ${rows.length} rows into style_loras…`);
  const { error } = await supabase.from("style_loras").insert(rows);

  if (error) {
    console.error("Insert failed:", error);
    process.exit(1);
  }

  const { data, error: selErr } = await supabase
    .from("style_loras")
    .select("style_name, trigger_word, lora_url, recommended_scale, quality_score, trained_at")
    .in(
      "style_name",
      rows.map((r) => r.style_name),
    )
    .order("style_name");

  if (selErr) {
    console.error("Select failed:", selErr);
    process.exit(1);
  }

  console.log(`\nstyle_loras verification (${data?.length ?? 0} rows):`);
  console.table(data);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
