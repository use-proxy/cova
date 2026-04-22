/**
 * GET /api/admin/render-costs
 *
 * Aggregate cost + retry stats from render_cost_log. Service-role reads via
 * admin client. Callable only by user_ids in ADMIN_TEST_USER_IDS.
 *
 * Query params:
 *   window: "24h" | "7d" | "30d"   (default "24h")
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { RENDER_CONFIG } from "@/lib/render-config";

const WINDOW_HOURS: Record<string, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

function isAdmin(userId: string): boolean {
  const ids = (process.env.ADMIN_TEST_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}

interface CostRow {
  pipeline_version: string;
  is_retry: boolean;
  retry_type: "free" | "paid" | null;
  cost_usd: number;
  tokens_charged: number;
  cache_hit: boolean;
}

export async function GET(request: Request) {
  try {
    const userClient = await createServerSupabaseClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdmin(user.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const windowKey = (url.searchParams.get("window") || "24h") as keyof typeof WINDOW_HOURS;
    const hours = WINDOW_HOURS[windowKey] ?? 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("render_cost_log")
      .select("pipeline_version, is_retry, retry_type, cost_usd, tokens_charged, cache_hit")
      .gte("created_at", since)
      .limit(50_000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as CostRow[];

    // Accumulators
    let totalCost = 0;
    let totalRows = 0;
    let primaryRenders = 0;
    let primaryRendersCost = 0;
    let cacheHits = 0;
    let freeRetries = 0;
    let paidRetries = 0;
    let paidRetryTokensCharged = 0;
    const byPipeline: Record<string, { count: number; cost: number }> = {};

    for (const r of rows) {
      totalRows += 1;
      const cost = Number(r.cost_usd ?? 0);
      totalCost += cost;
      byPipeline[r.pipeline_version] = byPipeline[r.pipeline_version] ?? {
        count: 0,
        cost: 0,
      };
      byPipeline[r.pipeline_version].count += 1;
      byPipeline[r.pipeline_version].cost += cost;

      if (r.cache_hit) cacheHits += 1;
      if (r.is_retry) {
        if (r.retry_type === "free") freeRetries += 1;
        else if (r.retry_type === "paid") {
          paidRetries += 1;
          paidRetryTokensCharged += Number(r.tokens_charged ?? 0);
        }
      } else {
        primaryRenders += 1;
        primaryRendersCost += cost;
      }
    }

    const totalRetries = freeRetries + paidRetries;
    const retryRate = totalRows > 0 ? totalRetries / totalRows : 0;
    const costPerPrimary = primaryRenders > 0 ? primaryRendersCost / primaryRenders : 0;
    const cacheHitRate = totalRows > 0 ? cacheHits / totalRows : 0;

    return NextResponse.json({
      window: windowKey,
      since,
      counts: {
        total_rows: totalRows,
        primary_renders: primaryRenders,
        retries_total: totalRetries,
        retries_free: freeRetries,
        retries_paid: paidRetries,
        cache_hits: cacheHits,
      },
      totals_usd: {
        all: Number(totalCost.toFixed(4)),
        primary_renders: Number(primaryRendersCost.toFixed(4)),
      },
      averages_usd: {
        per_primary_render: Number(costPerPrimary.toFixed(4)),
      },
      ratios: {
        retry_rate: Number(retryRate.toFixed(4)),
        cache_hit_rate: Number(cacheHitRate.toFixed(4)),
      },
      by_pipeline_version: Object.fromEntries(
        Object.entries(byPipeline).map(([k, v]) => [
          k,
          { count: v.count, cost_usd: Number(v.cost.toFixed(4)) },
        ]),
      ),
      retry_revenue: {
        tokens_charged: paidRetryTokensCharged,
        paid_retries: paidRetries,
        token_cost_per_paid_retry: RENDER_CONFIG.PAID_RETRY_TOKEN_COST,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
