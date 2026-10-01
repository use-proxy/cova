/**
 * Shared completion step for /api/render/status.
 *
 * Kept out of the route file so every success branch of the status route
 * goes through one call-site (and so it can be tested without Replicate).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// Flip the room to "complete" (only from pending / null), then fire the
// post-render work: detection on the render, then furniture matching.
export async function markRenderComplete(
  admin: SupabaseClient,
  roomId: string,
  userId: string,
  onComplete: () => void,
): Promise<void> {
  await admin
    .from("rooms")
    .update({ redesign_status: "complete" })
    .eq("id", roomId)
    .eq("user_id", userId)
    .or("redesign_status.eq.pending,redesign_status.is.null");
  onComplete();
}
