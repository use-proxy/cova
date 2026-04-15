#!/usr/bin/env tsx
/**
 * One-off patch: set design_brief fields for a specific room.
 *
 * Usage (from apps/web/):
 *   npx tsx scripts/patch-room-brief.ts --room <ROOM_ID>
 *
 * Defaults to room cb2e7047-c7ae-4253-bf2b-cc42a6f3a727 with the values
 * needed for the differential diffusion test (Issue 4 + 5 fix).
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}

const args = process.argv.slice(2);
const roomArg = args[args.indexOf("--room") + 1] ?? "cb2e7047-c7ae-4253-bf2b-cc42a6f3a727";

const admin = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log(`Patching room: ${roomArg}`);

  // Read current design_brief to merge (not overwrite existing fields)
  const { data: row, error: readErr } = await admin
    .from("rooms")
    .select("design_brief")
    .eq("id", roomArg)
    .single();

  if (readErr) {
    console.error("❌ Failed to read room:", readErr.message);
    process.exit(1);
  }

  const existing = (row?.design_brief as Record<string, unknown>) ?? {};
  console.log("Current design_brief:", JSON.stringify(existing, null, 2));

  const patched = {
    ...existing,
    wall_change_requested: false,
    floor_change_requested: false,
    required_objects: ["65 inch Samsung Frame TV", "Sonos Beam soundbar"],
  };

  const { error: writeErr } = await admin
    .from("rooms")
    .update({ design_brief: patched })
    .eq("id", roomArg);

  if (writeErr) {
    console.error("❌ Failed to patch room:", writeErr.message);
    process.exit(1);
  }

  console.log("✅ design_brief patched successfully:");
  console.log(JSON.stringify(patched, null, 2));
}

main().catch((err) => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
