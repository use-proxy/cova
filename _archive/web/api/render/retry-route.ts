/**
 * POST /api/render/retry
 *
 * Retry an empty-room render. Enforces the locked retry policy:
 *   - FREE_RETRIES_PER_RENDER (1) free retries per original render
 *   - After that, each retry costs PAID_RETRY_TOKEN_COST (2) tokens
 *   - Hard ceiling MAX_PAID_RETRIES_PER_RENDER (5) per original render
 *   - Rate limit MAX_RETRIES_PER_HOUR (5) per user per hour
 *
 * All retries call the V3 Modal endpoint with skip_cache=true and a fresh seed.
 * Token check runs through lib/tokens.ts stub — swap for real schema later.
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { RENDER_CONFIG } from "@/lib/render-config";
import {
  getTokenBalance,
  chargeTokens,
  InsufficientTokensError,
} from "@/lib/tokens";
import { callEmptyRoomV3 } from "@/lib/render/empty-room-v3";

interface RetryRequestBody {
  original_render_id: string;
  image_url: string;
}

function minutesUntilNextHour(hourStart: Date): number {
  const nextHour = new Date(hourStart.getTime() + 60 * 60 * 1000);
  const ms = nextHour.getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / 60000));
}

export async function POST(request: Request) {
  try {
    const userClient = await createServerSupabaseClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as RetryRequestBody;
    const { original_render_id, image_url } = body ?? {};
    if (!original_render_id || !image_url) {
      return NextResponse.json(
        { error: "original_render_id and image_url are required" },
        { status: 400 },
      );
    }

    const admin = createAdminSupabaseClient();

    // 1. Validate ownership — the render must belong to this user.
    //    `renders` table is the frozen prod table; we only SELECT here.
    const { data: renderRow, error: renderErr } = await admin
      .from("renders")
      .select("id, user_id")
      .eq("id", original_render_id)
      .maybeSingle();
    if (renderErr || !renderRow) {
      return NextResponse.json(
        { error: "Render not found" },
        { status: 404 },
      );
    }
    if ((renderRow as { user_id: string }).user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Fetch / create render_retries row
    const { data: existingRetry } = await admin
      .from("render_retries")
      .select("id, free_retries_used, paid_retries_used")
      .eq("user_id", user.id)
      .eq("original_render_id", original_render_id)
      .maybeSingle();

    let retryRow =
      (existingRetry as {
        id: string;
        free_retries_used: number;
        paid_retries_used: number;
      } | null) ?? null;

    if (!retryRow) {
      const { data: inserted, error: insErr } = await admin
        .from("render_retries")
        .insert({
          user_id: user.id,
          original_render_id,
          free_retries_used: 0,
          paid_retries_used: 0,
        })
        .select("id, free_retries_used, paid_retries_used")
        .single();
      if (insErr || !inserted) {
        return NextResponse.json(
          { error: "Failed to initialize retry tracking" },
          { status: 500 },
        );
      }
      retryRow = inserted as {
        id: string;
        free_retries_used: number;
        paid_retries_used: number;
      };
    }

    // 3. Hard ceiling: max paid retries per render
    if (retryRow.paid_retries_used >= RENDER_CONFIG.MAX_PAID_RETRIES_PER_RENDER) {
      return NextResponse.json(
        { error: "Maximum retries reached on this render", code: "max_paid_retries" },
        { status: 429 },
      );
    }

    // 4. Rate limit: max retries per user per hour (fresh-row semantics)
    const nowHourStart = new Date();
    nowHourStart.setMinutes(0, 0, 0);

    const { data: rateRow } = await admin
      .from("render_rate_limits")
      .select("retries_last_hour, hour_start")
      .eq("user_id", user.id)
      .maybeSingle();

    let retriesThisHour = 0;
    let hourStartDb = nowHourStart;

    if (rateRow) {
      hourStartDb = new Date((rateRow as { hour_start: string }).hour_start);
      if (hourStartDb.getTime() === nowHourStart.getTime()) {
        retriesThisHour = (rateRow as { retries_last_hour: number }).retries_last_hour ?? 0;
      } else {
        // Stale hour bucket — we'll roll it over when we increment below.
        retriesThisHour = 0;
        hourStartDb = nowHourStart;
      }
    }

    if (retriesThisHour >= RENDER_CONFIG.MAX_RETRIES_PER_HOUR) {
      return NextResponse.json(
        {
          error: "Retry limit reached",
          code: "rate_limited",
          minutes_until_reset: minutesUntilNextHour(hourStartDb),
        },
        { status: 429 },
      );
    }

    // 5. Determine free vs paid, and pre-flight token balance for paid
    const willBeFree = retryRow.free_retries_used < RENDER_CONFIG.FREE_RETRIES_PER_RENDER;
    const tokensToCharge = willBeFree ? 0 : RENDER_CONFIG.PAID_RETRY_TOKEN_COST;

    if (!willBeFree) {
      const balance = await getTokenBalance(user.id);
      if (balance < tokensToCharge) {
        return NextResponse.json(
          {
            error: "Insufficient tokens",
            code: "insufficient_tokens",
            balance,
            required: tokensToCharge,
          },
          { status: 402 },
        );
      }
    }

    // 6. Call V3 Modal endpoint with a fresh seed and skip_cache=true
    const seed = Math.floor(Math.random() * 2_000_000_000);
    let v3;
    try {
      v3 = await callEmptyRoomV3({ imageUrl: image_url, seed, skipCache: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown";
      return NextResponse.json(
        { error: `V3 pipeline failed: ${message}` },
        { status: 502 },
      );
    }

    // 7. Charge tokens on success (only if paid); if charge fails (race),
    //    bail out before incrementing counters to avoid desync.
    if (tokensToCharge > 0) {
      try {
        await chargeTokens(user.id, tokensToCharge, `empty_room_retry:${original_render_id}`);
      } catch (err) {
        if (err instanceof InsufficientTokensError) {
          return NextResponse.json(
            {
              error: "Insufficient tokens",
              code: "insufficient_tokens",
              balance: err.balance,
              required: err.required,
            },
            { status: 402 },
          );
        }
        throw err;
      }
    }

    // 8. Increment counters atomically (admin client bypasses RLS)
    const newFree = retryRow.free_retries_used + (willBeFree ? 1 : 0);
    const newPaid = retryRow.paid_retries_used + (willBeFree ? 0 : 1);
    await admin
      .from("render_retries")
      .update({
        free_retries_used: newFree,
        paid_retries_used: newPaid,
        last_retry_at: new Date().toISOString(),
      })
      .eq("id", retryRow.id);

    await admin
      .from("render_rate_limits")
      .upsert(
        {
          user_id: user.id,
          retries_last_hour: retriesThisHour + 1,
          hour_start: hourStartDb.toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    // 9. Cost log
    await admin.from("render_cost_log").insert({
      render_id: original_render_id,
      user_id: user.id,
      pipeline_version: RENDER_CONFIG.CACHE_PIPELINE_VERSION,
      is_retry: true,
      retry_type: willBeFree ? "free" : "paid",
      cost_usd: v3.cost_usd,
      tokens_charged: tokensToCharge,
      cache_hit: false,
    });

    // 10. Response — reflect remaining slots for UI
    return NextResponse.json({
      empty_room_url: v3.empty_room_url,
      quality_warning: v3.quality_warning,
      residual_items: v3.residual_items,
      pipeline_path: v3.pipeline_path,
      retry_was_free: willBeFree,
      tokens_charged: tokensToCharge,
      remaining_free_retries: Math.max(
        0,
        RENDER_CONFIG.FREE_RETRIES_PER_RENDER - newFree,
      ),
      remaining_paid_retry_slots: Math.max(
        0,
        RENDER_CONFIG.MAX_PAID_RETRIES_PER_RENDER - newPaid,
      ),
      remaining_hour_budget: Math.max(
        0,
        RENDER_CONFIG.MAX_RETRIES_PER_HOUR - (retriesThisHour + 1),
      ),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
