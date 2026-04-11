import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rateLimit";
import type { StyleFingerprint } from "@/types/fingerprint";
import type { MatchedProduct } from "@/lib/types/match";

type BudgetTier = "budget" | "mid" | "premium" | "luxury";

interface HotspotInput {
  label: string;
  bbox: [number, number, number, number];
  matched_product: {
    name: string;
    price: number;
    retailer: string;
    affiliate_url: string;
    image_url: string;
  } | null;
}

interface RoomBudgetRequestBody {
  room_id: string;
  render_url: string;
  hotspots: HotspotInput[];
  fingerprint: StyleFingerprint;
  budget_range: [number, number] | null;
  room_type: string;
  current_tier: BudgetTier;
  target_tier: BudgetTier;
}

interface RoomBudgetResponseItem {
  label: string;
  original: {
    name: string;
    price: number;
    retailer: string;
    affiliate_url: string;
    image_url: string;
  } | null;
  alternative: MatchedProduct | null;
}

interface RoomBudgetResponse {
  tier: BudgetTier;
  total_price: number;
  original_total: number;
  savings_or_premium: number;
  items: RoomBudgetResponseItem[];
}

// Price-range multipliers applied to the current matched_product.price
// to compute an alternative budget_range for the same item.
const TIER_MULTIPLIERS: Record<BudgetTier, [number, number]> = {
  budget: [0.3, 0.6],
  mid: [0.7, 1.3],
  premium: [1.5, 2.5],
  luxury: [2.5, 5.0],
};

const CONCURRENCY = 6;

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<Array<PromiseSettledResult<T>>> {
  const results: Array<PromiseSettledResult<T>> = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      try {
        const value = await tasks[i]!();
        results[i] = { status: "fulfilled", value };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = checkRateLimit(user.id, "room-budget");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          retry_after: rateLimit.retryAfterSeconds,
        },
        { status: 429 },
      );
    }

    const body = (await request.json()) as RoomBudgetRequestBody;
    const {
      room_id,
      render_url,
      hotspots,
      fingerprint,
      budget_range,
      room_type,
      target_tier,
    } = body;

    if (!room_id || !render_url || !Array.isArray(hotspots) || !target_tier) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const multiplier = TIER_MULTIPLIERS[target_tier];
    if (!multiplier) {
      return NextResponse.json(
        { error: "Invalid target_tier" },
        { status: 400 },
      );
    }

    // Build base URL for internal /api/match calls. Prefer the inbound request's
    // host so this works on localhost, preview, and production without config.
    const host = request.headers.get("host") ?? "localhost:3000";
    const proto =
      request.headers.get("x-forwarded-proto") ??
      (host.startsWith("localhost") ? "http" : "https");
    const baseUrl = `${proto}://${host}`;
    const cookieHeader = request.headers.get("cookie") ?? "";

    // One parallel task per hotspot with a matched_product. Hotspots without
    // a matched product are emitted as-is with alternative: null.
    const items: RoomBudgetResponseItem[] = hotspots.map((h) => ({
      label: h.label,
      original: h.matched_product,
      alternative: null,
    }));

    const tasks: Array<() => Promise<void>> = [];
    hotspots.forEach((h, idx) => {
      if (!h.matched_product) return;
      const basePrice = h.matched_product.price;
      const altRange: [number, number] = [
        Math.max(1, Math.round(basePrice * multiplier[0])),
        Math.max(2, Math.round(basePrice * multiplier[1])),
      ];
      tasks.push(async () => {
        const res = await fetch(`${baseUrl}/api/match`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: cookieHeader,
          },
          body: JSON.stringify({
            render_url,
            item_id: `${h.label}-budget-${target_tier}-${idx}`,
            item_label: h.label,
            item_bbox: h.bbox,
            item_keep: false,
            fingerprint_vector: fingerprint,
            budget_range: altRange,
            room_type,
            room_id,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { products?: MatchedProduct[] };
        const alt = data.products?.[0] ?? null;
        if (alt) items[idx]!.alternative = alt;
      });
    });

    await runWithConcurrency(tasks, CONCURRENCY);

    const original_total = items.reduce(
      (sum, it) => sum + (it.original?.price ?? 0),
      0,
    );
    const total_price = items.reduce((sum, it) => {
      const altPrice = it.alternative?.price ?? it.original?.price ?? 0;
      return sum + altPrice;
    }, 0);

    const response: RoomBudgetResponse = {
      tier: target_tier,
      total_price,
      original_total,
      savings_or_premium: total_price - original_total,
      items,
    };

    // `budget_range` is accepted for API symmetry with other routes but is
    // not used in tier computation — tier multipliers drive per-item pricing.
    void budget_range;

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
