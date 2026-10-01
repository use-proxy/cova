/**
 * Shared completion step for /api/render/status.
 *
 * Kept out of the route file so every success branch of the status route
 * goes through one call-site (and so it can be tested without Replicate).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// Flip the room to "complete" (only from pending / null), then fire the
// post-render work: detection on the render, then furniture matching.
// The client polls, so several requests can see the same finished render;
// .select() returns the rows this update flipped, so only the poll that
// actually flipped the room fires the work.
export async function markRenderComplete(
  admin: SupabaseClient,
  roomId: string,
  userId: string,
  onComplete: () => void,
): Promise<void> {
  const { data: claimed } = await admin
    .from("rooms")
    .update({ redesign_status: "complete" })
    .eq("id", roomId)
    .eq("user_id", userId)
    .or("redesign_status.eq.pending,redesign_status.is.null")
    .select("id");
  if (!claimed?.length) return;
  onComplete();
}
