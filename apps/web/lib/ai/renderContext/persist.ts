/**
 * Area 2 — Persist the assembled RenderContext to Supabase.
 *
 * Called from Screen D's "Design My Room" CTA. Writes both the full
 * render_context and a flattened `personalization` object (used by
 * analytics and downstream queries), plus the individual context
 * columns for direct SQL access.
 */

import { createBrowserClient } from '@/lib/supabase/client'
import type { RenderContext } from '@/lib/types/area2'

export async function persistRenderContext(
  roomId: string,
  context: RenderContext,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createBrowserClient()

  const { error } = await supabase
    .from('rooms')
    .update({
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
    })
    .eq('id', roomId)
    .eq('user_id', userId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
