/**
 * Interaction logging — writes to the interactions table for behavioral scoring.
 * Uses admin client so it can write regardless of user RLS context.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { TablesInsert as InsertTables } from "@/lib/types/supabase";

type InteractionAction =
  | "hotspot_tap"
  | "product_view"
  | "affiliate_click"
  | "swap_initiated"
  | "swap_completed"
  | "purchase_confirmed"
  | "regenerate"
  | "refine"
  | "add_item";

interface LogInteractionParams {
  userId: string;
  action: InteractionAction;
  roomId?: string;
  productId?: string;
  fingerprintId?: string;
}

export async function logInteraction(
  params: LogInteractionParams,
): Promise<void> {
  try {
    const admin = createAdminSupabaseClient();
    const insert: InsertTables<"interactions"> = {
      user_id: params.userId,
      action: params.action,
      room_id: params.roomId ?? null,
      product_id: params.productId ?? null,
      fingerprint_id: params.fingerprintId ?? null,
    };
    const { error } = await admin.from("interactions").insert(insert);
    if (error) {
      console.warn("[interactions] log failed:", error.message);
    }
  } catch (err) {
    // Non-critical — never throw from logging
    console.warn("[interactions] log error:", err);
  }
}

export async function getInteractionCount(
  userId: string,
  action: InteractionAction,
  windowSeconds = 3600,
): Promise<number> {
  try {
    const admin = createAdminSupabaseClient();
    const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
    const { count, error } = await admin
      .from("interactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", action)
      .gte("created_at", since);

    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
