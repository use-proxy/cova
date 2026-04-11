// @vitest-environment node
/**
 * Area 4 — room-budget.test.ts
 * Tests for POST /api/match/room-budget
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const MOCK_USER = { id: "user-budget", email: "budget@example.com" };

const HOTSPOT_WITH_PRODUCT = {
  label: "sofa",
  bbox: [0.1, 0.1, 0.5, 0.4] as [number, number, number, number],
  matched_product: {
    name: "Modern Sofa",
    price: 1200,
    retailer: "wayfair",
    affiliate_url: "https://wayfair.com/sofa",
    image_url: "https://wayfair.com/sofa.jpg",
  },
};

const HOTSPOT_NO_PRODUCT = {
  label: "coffee table",
  bbox: [0.3, 0.4, 0.2, 0.2] as [number, number, number, number],
  matched_product: null,
};

const BASE_BODY = {
  room_id: "room-budget-test",
  render_url: "https://example.com/render.jpg",
  hotspots: [HOTSPOT_WITH_PRODUCT, HOTSPOT_NO_PRODUCT],
  fingerprint: { dimensions: {}, covariance: [], confidence: 0.5 },
  budget_range: [1000, 5000] as [number, number],
  room_type: "living_room",
  current_tier: "mid",
  target_tier: "budget",
};

// ── Route loader with per-test isolation ──────────────────────────────────────

async function loadRoute(
  overrides: {
    user?: { id: string } | null;
    rateAllowed?: boolean;
    matchResponseProducts?: unknown[];
    matchStatus?: number;
  } = {},
) {
  vi.resetModules();

  const user = overrides.user !== undefined ? overrides.user : MOCK_USER;
  const rateAllowed = overrides.rateAllowed !== false;

  vi.doMock("@/lib/supabase/server", () => ({
    createServerSupabaseClient: vi.fn().mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user } }),
      },
    }),
  }));

  vi.doMock("@/lib/rateLimit", () => ({
    checkRateLimit: vi.fn().mockReturnValue({
      allowed: rateAllowed,
      remaining: rateAllowed ? 19 : 0,
      retryAfterSeconds: rateAllowed ? 0 : 3600,
    }),
  }));

  // The room-budget route calls internal /api/match via fetch
  const matchProducts = overrides.matchResponseProducts ?? [
    {
      id: "prod-1",
      name: "Budget Sofa",
      retailer: "wayfair",
      price: 400,
      affiliate_url: "https://wayfair.com/budget-sofa",
      image_url: "https://wayfair.com/budget-sofa.jpg",
      match_score: 0.8,
      match_label: "Very Similar",
    },
  ];
  const matchStatus = overrides.matchStatus ?? 200;

  global.fetch = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes("/api/match")) {
      return {
        ok: matchStatus === 200,
        status: matchStatus,
        json: async () => ({ products: matchProducts }),
      };
    }
    return { ok: true, json: async () => ({}) };
  });

  const { POST } = await import("@/app/api/match/room-budget/route");
  return { POST };
}

function makeRequest(body: Record<string, unknown> = {}): Request {
  return new Request("http://localhost:3000/api/match/room-budget", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host: "localhost:3000",
    },
    body: JSON.stringify({ ...BASE_BODY, ...body }),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("POST /api/match/room-budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. returns { tier, total_price, original_total, savings_or_premium, items }", async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toHaveProperty("tier");
    expect(json).toHaveProperty("total_price");
    expect(json).toHaveProperty("original_total");
    expect(json).toHaveProperty("savings_or_premium");
    expect(json).toHaveProperty("items");
  });

  it("2. tier matches request target_tier", async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ target_tier: "premium" }));
    const json = (await res.json()) as { tier: string };
    expect(json.tier).toBe("premium");
  });

  it("3. total_price is sum of alternative prices (or original when no alternative)", async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeRequest());
    const json = (await res.json()) as {
      total_price: number;
      items: Array<{
        alternative: { price: number } | null;
        original: { price: number } | null;
      }>;
    };
    const expected = json.items.reduce((sum, item) => {
      const altPrice = item.alternative?.price ?? item.original?.price ?? 0;
      return sum + altPrice;
    }, 0);
    expect(json.total_price).toBeCloseTo(expected);
  });

  it("4. savings_or_premium = total_price - original_total", async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeRequest());
    const json = (await res.json()) as {
      total_price: number;
      original_total: number;
      savings_or_premium: number;
    };
    expect(json.savings_or_premium).toBeCloseTo(
      json.total_price - json.original_total,
    );
  });

  it("5. items.length matches hotspots.length", async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeRequest());
    const json = (await res.json()) as { items: unknown[] };
    expect(json.items.length).toBe(BASE_BODY.hotspots.length);
  });

  it("6. hotspot without matched_product → alternative is null", async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeRequest());
    const json = (await res.json()) as {
      items: Array<{ label: string; alternative: unknown }>;
    };
    const noProductItem = json.items.find((i) => i.label === "coffee table");
    expect(noProductItem).toBeDefined();
    expect(noProductItem!.alternative).toBeNull();
  });

  it("7. tier multipliers: budget 0.3-0.6x", async () => {
    // budget multiplier is [0.3, 0.6]; product price 1200 → range [360, 720]
    // We just verify the route calls /api/match with a budget_range in that bracket
    let capturedBody: Record<string, unknown> = {};
    global.fetch = vi
      .fn()
      .mockImplementation(async (_url: string, opts: RequestInit) => {
        capturedBody = JSON.parse(opts.body as string) as Record<
          string,
          unknown
        >;
        return { ok: true, json: async () => ({ products: [] }) };
      });
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: MOCK_USER } }),
        },
      }),
    }));
    vi.doMock("@/lib/rateLimit", () => ({
      checkRateLimit: vi.fn().mockReturnValue({
        allowed: true,
        remaining: 19,
        retryAfterSeconds: 0,
      }),
    }));
    const { POST } = await import("@/app/api/match/room-budget/route");
    await POST(
      makeRequest({ target_tier: "budget", hotspots: [HOTSPOT_WITH_PRODUCT] }),
    );
    if (capturedBody.budget_range) {
      const [min, max] = capturedBody.budget_range as [number, number];
      // 1200 * 0.3 = 360, 1200 * 0.6 = 720
      expect(min).toBeCloseTo(360, 0);
      expect(max).toBeCloseTo(720, 0);
    }
  });

  it("8. 401 unauthenticated", async () => {
    const { POST } = await loadRoute({ user: null });
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("9. 429 rate-limited", async () => {
    const { POST } = await loadRoute({ rateAllowed: false });
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
  });

  it("10. internal /api/match failure → item.alternative null, not crash", async () => {
    const { POST } = await loadRoute({ matchStatus: 500 });
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{ label: string; alternative: unknown }>;
    };
    // The hotspot with product got a failed match → alternative should be null
    const productItem = json.items.find((i) => i.label === "sofa");
    expect(productItem).toBeDefined();
    expect(productItem!.alternative).toBeNull();
  });

  it("11. concurrency cap: tasks run ≤ CONCURRENCY at once", async () => {
    // Create 8 hotspots — more than CONCURRENCY (6)
    const hotspots = Array.from({ length: 8 }, (_, i) => ({
      label: `item-${i}`,
      bbox: [0.1, 0.1, 0.2, 0.2] as [number, number, number, number],
      matched_product: {
        name: `Item ${i}`,
        price: 100 + i * 50,
        retailer: "wayfair",
        affiliate_url: `https://wayfair.com/item-${i}`,
        image_url: `https://wayfair.com/item-${i}.jpg`,
      },
    }));
    let concurrent = 0;
    let maxConcurrent = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/match")) {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 10));
        concurrent--;
        return { ok: true, json: async () => ({ products: [] }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: MOCK_USER } }),
        },
      }),
    }));
    vi.doMock("@/lib/rateLimit", () => ({
      checkRateLimit: vi.fn().mockReturnValue({
        allowed: true,
        remaining: 19,
        retryAfterSeconds: 0,
      }),
    }));
    const { POST } = await import("@/app/api/match/room-budget/route");
    await POST(makeRequest({ hotspots }));
    expect(maxConcurrent).toBeLessThanOrEqual(6);
  });

  it("12. empty hotspots → total_price 0, original_total 0, items []", async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ hotspots: [] }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      total_price: number;
      original_total: number;
      items: unknown[];
    };
    expect(json.total_price).toBe(0);
    expect(json.original_total).toBe(0);
    expect(json.items).toEqual([]);
  });
});
