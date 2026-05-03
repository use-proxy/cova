/**
 * GET /api/admin/render-costs
 *
 * Aggregate cost stats from render_cost_log (V1 shape per D-022).
 * Service-role reads via admin client. Callable only by user_ids in
 * ADMIN_TEST_USER_IDS.
 *
 * Query params:
 *   window: "24h" | "7d" | "30d"   (default "24h")
 *
 * Schema reference (post-M4): category, stage, model, cost_usd, duration_ms,
 * failure_category, user_id, render_id, created_at.
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

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
  category: string;
  stage: string | null;
  model: string | null;
  cost_usd: number;
  duration_ms: number | null;
  failure_category: string | null;
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
      .select("category, stage, model, cost_usd, duration_ms, failure_category")
      .gte("created_at", since)
      .limit(50_000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as CostRow[];

    let totalCost = 0;
    let totalRows = 0;
    let totalDurationMs = 0;
    let durationSamples = 0;
    let failures = 0;
    const byCategory: Record<string, { count: number; cost: number }> = {};
    const byStage: Record<string, { count: number; cost: number }> = {};
    const byFailure: Record<string, number> = {};

    for (const r of rows) {
      totalRows += 1;
      const cost = Number(r.cost_usd ?? 0);
      totalCost += cost;
      const cat = r.category;
      byCategory[cat] = byCategory[cat] ?? { count: 0, cost: 0 };
      byCategory[cat].count += 1;
      byCategory[cat].cost += cost;
      const stage = r.stage ?? "(unstaged)";
      byStage[stage] = byStage[stage] ?? { count: 0, cost: 0 };
      byStage[stage].count += 1;
      byStage[stage].cost += cost;
      if (typeof r.duration_ms === "number") {
        totalDurationMs += r.duration_ms;
        durationSamples += 1;
      }
      if (r.failure_category) {
        failures += 1;
        byFailure[r.failure_category] = (byFailure[r.failure_category] ?? 0) + 1;
      }
    }

    const meanDurationMs = durationSamples > 0 ? totalDurationMs / durationSamples : 0;
    const failureRate = totalRows > 0 ? failures / totalRows : 0;

    return NextResponse.json({
      window: windowKey,
      since,
      counts: {
        total_rows: totalRows,
        failures,
      },
      totals_usd: {
        all: Number(totalCost.toFixed(4)),
      },
      averages: {
        duration_ms: Math.round(meanDurationMs),
      },
      ratios: {
        failure_rate: Number(failureRate.toFixed(4)),
      },
      by_category: Object.fromEntries(
        Object.entries(byCategory).map(([k, v]) => [
          k,
          { count: v.count, cost_usd: Number(v.cost.toFixed(4)) },
        ]),
      ),
      by_stage: Object.fromEntries(
        Object.entries(byStage).map(([k, v]) => [
          k,
          { count: v.count, cost_usd: Number(v.cost.toFixed(4)) },
        ]),
      ),
      by_failure_category: byFailure,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
