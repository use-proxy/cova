/**
 * Area 2 — Persist the assembled RenderContext to Supabase.
 *
 * Called from Screen D's "Design My Room" CTA. Writes both the full
 * render_context and a flattened `personalization` object (used by
 * analytics and downstream queries), plus the individual context
 * columns for direct SQL access.
 */

import { createBrowserClient } from "@/lib/supabase/client";
import type { RenderContext } from "@/lib/types/area2";

export async function persistRenderContext(
  roomId: string,
  context: RenderContext,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createBrowserClient();

  const payload = {
    render_context: context,
    personalization: {
      budget: context.budget,
      requestedProducts: context.requestedProducts,
      artBrief: context.artBrief,
      techSpec: context.techSpec,
      sensoryProfile: context.sensoryProfile,
      identityBrief: context.identityBrief,
      fingerprintDimensions: context.fingerprint?.dimensions ?? null,
      fingerprintStyleName: null, // populated separately via style_fingerprints table
    },
    room_context: context.roomContext,
    room_constraints: context.roomConstraints,
    keep_mask: context.keepMask,
    design_step: 4,
  };

  // Retry with exponential backoff: attempt 1 → 1s delay → attempt 2 → 2s delay → attempt 3
  const delays = [1000, 2000];
  let lastError = "";
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const { error } = await supabase
      .from("rooms")
      .update(payload)
      .eq("id", roomId)
      .eq("user_id", userId);
    if (!error) return { success: true };
    lastError = error.message;
    console.warn(
      `[persistRenderContext] attempt ${attempt + 1} failed: ${error.message}`,
    );
    if (attempt < delays.length) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
  return { success: false, error: lastError };
}
