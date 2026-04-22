/**
 * Smoke test: exercise the Sharp + fal + Modal pipeline the same way
 * /api/render/empty-room does — by importing normalizeInputImage
 * directly, then forwarding to callEmptyRoomV3. Skips the route's
 * auth / cache / cost-log wrapper (those are framework boilerplate,
 * covered by UI testing later).
 */

import { normalizeInputImage } from "../lib/render/normalize-input-image";
import { callEmptyRoomV3 } from "../lib/render/empty-room-v3";
import { fal } from "@fal-ai/client";
import { promises as fs } from "node:fs";

async function main() {
  const falKey = process.env.FAL_KEY;
  const modalUrl = process.env.COVA_EMPTY_ROOM_V3_URL;
  if (!falKey) throw new Error("FAL_KEY missing");
  if (!modalUrl) throw new Error("COVA_EMPTY_ROOM_V3_URL missing");
  fal.config({ credentials: falKey });

  // Stage A: upload original target_room.jpg (5.16 MB) to fal so we have
  // a URL to hand to the normalizer — same shape as what the browser
  // would POST to /api/render/empty-room.
  const path = "/Users/daksh/Desktop/cova/benchmarks/target_room.jpg";
  const bytes = await fs.readFile(path);
  const original = new File([bytes], "target_room.jpg", { type: "image/jpeg" });
  const originalUrl = await fal.storage.upload(original);
  console.log(`[smoke] original upload: ${originalUrl}  (${bytes.length} bytes)`);

  // Stage B: run the exact normalizer the route uses
  const t0 = Date.now();
  const norm = await normalizeInputImage(originalUrl);
  console.log(
    `[smoke] normalized: ${norm.url}  (${norm.sizeBytes} bytes, ${norm.width}x${norm.height}, ${Date.now() - t0}ms)`,
  );
  if (norm.sizeBytes > 4_500_000) {
    throw new Error(`normalized payload still ${norm.sizeBytes} bytes — Sharp settings too loose`);
  }

  // Stage C: call Modal V3 exactly as the route does
  const t1 = Date.now();
  const res = await callEmptyRoomV3({ imageUrl: norm.url, skipCache: false });
  console.log(`[smoke] modal elapsed: ${Date.now() - t1}ms`);
  console.log("[smoke] response:");
  console.log(JSON.stringify(res, null, 2));

  // Assertions matching the user's smoke-test criteria
  const needed = ["empty_room_url", "quality_warning", "cache_hit"];
  for (const k of needed) {
    if (!(k in res)) throw new Error(`missing field ${k} in response`);
  }
  if (!res.empty_room_url || !res.empty_room_url.startsWith("http")) {
    throw new Error(`empty_room_url invalid: ${res.empty_room_url}`);
  }
  console.log("[smoke] PASS");
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
