/**
 * Shared completion step for /api/render/status.
 *
 * Kept out of the route file so every success branch of the status route
 * goes through one call-site (and so it can be tested without Replicate).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { redis } from "@/lib/rate-limit/upstash";

// Strategy B: take a per-room lock in Redis; only the holder fires.
const LOCK_TTL_SECONDS = 60 * 60;

// Flip the room to "complete" (only from pending / null), then fire the
// post-render work: detection on the render, then furniture matching.
export async function markRenderComplete(
  admin: SupabaseClient,
  roomId: string,
  userId: string,
  onComplete: () => void,
): Promise<void> {
  const got = await redis.set(`cova:render-complete:${roomId}`, "1", {
    nx: true,
    ex: LOCK_TTL_SECONDS,
  });
  if (got !== "OK") return;
  await admin
    .from("rooms")
    .update({ redesign_status: "complete" })
    .eq("id", roomId)
    .eq("user_id", userId)
    .or("redesign_status.eq.pending,redesign_status.is.null");
  onComplete();
}
