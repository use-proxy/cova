// @vitest-environment node
/**
 * Area 4 — complete-room.test.ts
 * Tests for POST /api/match/complete-room
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const MOCK_USER = { id: "user-complete", email: "complete@example.com" };

const ALL_HOTSPOTS = [
  {
    label: "sofa",
    bbox: [0.1, 0.1, 0.5, 0.4] as [number, number, number, number],
  },
  {
    label: "coffee table",
    bbox: [0.3, 0.5, 0.2, 0.2] as [number, number, number, number],
  },
  {
    label: "floor lamp",
    bbox: [0.7, 0.1, 0.1, 0.4] as [number, number, number, number],
  },
  {
    label: "area rug",
    bbox: [0.2, 0.6, 0.4, 0.3] as [number, number, number, number],
  },
];

const BASE_BODY = {
  room_id: "room-complete-test",
  render_url: "https://example.com/render.jpg",
  tapped_item_label: "sofa",
  tapped_item_bbox: [0.1, 0.1, 0.5, 0.4],
  all_hotspots: ALL_HOTSPOTS,
  fingerprint: { dimensions: {}, covariance: [], confidence: 0.5 },
  budget_range: [500, 2000] as [number, number],
  room_type: "living_room",
};

const MOCK_MATCH_PRODUCT = {
  id: "prod-comp-1",
  name: "Matching Coffee Table",
  retailer: "westelm",
  price: 499,
  affiliate_url: "https://westelm.com/coffee-table",
  image_url: "https://westelm.com/ct.jpg",
  match_score: 0.82,
  match_label: "Very Similar",
};

// ── Route loader ───────────────────────────────────────────────────────────────

async function loadRoute(
  overrides: {
    user?: { id: string } | null;
    rateAllowed?: boolean;
    claudePicked?: Array<{ label: string; reason: string }>;
    claudeError?: boolean;
    matchProducts?: unknown[];
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

  // Default Claude picks 3 complementary items (excluding tapped sofa)
  const picked = overrides.claudePicked ?? [
    { label: "coffee table", reason: "Matches sofa style" },
    { label: "floor lamp", reason: "Complements sofa lighting needs" },
    { label: "area rug", reason: "Ties the seating area together" },
  ];

  const claudeCreate = overrides.claudeError
    ? vi.fn().mockRejectedValue(new Error("Claude failed"))
    : vi.fn().mockResolvedValue({
        content: [
          {
            type: "tool_use",
            name: "pick_complementary_items",
            input: { items: picked },
          },
        ],
      });

  vi.doMock("@anthropic-ai/sdk", () => ({
    default: class MockAnthropic {
      messages = { create: claudeCreate };
    },
  }));

  // Mock internal /api/match calls
  const matchProducts = overrides.matchProducts ?? [MOCK_MATCH_PRODUCT];
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

  const { POST } = await import("@/app/api/match/complete-room/route");
  return { POST };
}

function makeRequest(body: Record<string, unknown> = {}): Request {
  return new Request("http://localhost:3000/api/match/complete-room", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host: "localhost:3000",
    },
    body: JSON.stringify({ ...BASE_BODY, ...body }),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("POST /api/match/complete-room", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. returns { tapped_item, complementary_items }", async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toHaveProperty("tapped_item");
    expect(json).toHaveProperty("complementary_items");
    expect(Array.isArray(json.complementary_items)).toBe(true);
  });

  it("2. ≤ 3 complementary items", async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeRequest());
    const json = (await res.json()) as { complementary_items: unknown[] };
    expect(json.complementary_items.length).toBeLessThanOrEqual(3);
  });

  it("3. each item has label, bbox, products[], style_reason", async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeRequest());
    const json = (await res.json()) as {
      complementary_items: Array<{
        label: string;
        bbox: unknown[];
        products: unknown[];
        style_reason: string;
      }>;
    };
    for (const item of json.complementary_items) {
      expect(typeof item.label).toBe("string");
      expect(Array.isArray(item.bbox)).toBe(true);
      expect(Array.isArray(item.products)).toBe(true);
      expect(typeof item.style_reason).toBe("string");
    }
  });

  it("4. labels are from all_hotspots (no hallucinated labels)", async () => {
    // Claude returns a hallucinated label — route should filter it out
    const { POST } = await loadRoute({
      claudePicked: [
        { label: "hallucinated item", reason: "I made this up" },
        { label: "coffee table", reason: "Real item from hotspots" },
      ],
    });
    const res = await POST(makeRequest());
    const json = (await res.json()) as {
      complementary_items: Array<{ label: string }>;
    };
    const knownLabels = new Set(ALL_HOTSPOTS.map((h) => h.label));
    for (const item of json.complementary_items) {
      expect(knownLabels.has(item.label)).toBe(true);
    }
  });

  it("5. style_reason non-empty", async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeRequest());
    const json = (await res.json()) as {
      complementary_items: Array<{ style_reason: string }>;
    };
    for (const item of json.complementary_items) {
      expect(item.style_reason.length).toBeGreaterThan(0);
    }
  });

  it("6. products ≤ 3 per item", async () => {
    const manyProducts = Array.from({ length: 10 }, (_, i) => ({
      ...MOCK_MATCH_PRODUCT,
      id: `prod-${i}`,
      name: `Product ${i}`,
    }));
    const { POST } = await loadRoute({ matchProducts: manyProducts });
    const res = await POST(makeRequest());
    const json = (await res.json()) as {
      complementary_items: Array<{ products: unknown[] }>;
    };
    for (const item of json.complementary_items) {
      expect(item.products.length).toBeLessThanOrEqual(3);
    }
  });

  it("7. tapped_item matches request tapped_item_label", async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ tapped_item_label: "floor lamp" }));
    const json = (await res.json()) as { tapped_item: string };
    expect(json.tapped_item).toBe("floor lamp");
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

  it("10. Claude hallucinated label filtered out", async () => {
    const allValidLabels = new Set(ALL_HOTSPOTS.map((h) => h.label));
    const { POST } = await loadRoute({
      claudePicked: [
        { label: "nonexistent lamp", reason: "hallucinated" },
        { label: "coffee table", reason: "real one" },
      ],
    });
    const res = await POST(makeRequest());
    const json = (await res.json()) as {
      complementary_items: Array<{ label: string }>;
    };
    for (const item of json.complementary_items) {
      expect(allValidLabels.has(item.label)).toBe(true);
    }
    expect(
      json.complementary_items.find((i) => i.label === "nonexistent lamp"),
    ).toBeUndefined();
  });

  it("11. fewer than 3 hotspots → fewer items returned", async () => {
    const twoHotspots = [
      {
        label: "coffee table",
        bbox: [0.3, 0.5, 0.2, 0.2] as [number, number, number, number],
      },
    ];
    const { POST } = await loadRoute({
      claudePicked: [
        { label: "coffee table", reason: "Only option" },
        { label: "ghost item", reason: "Does not exist" },
      ],
    });
    const res = await POST(
      makeRequest({
        tapped_item_label: "sofa",
        all_hotspots: [
          { label: "sofa", bbox: [0.1, 0.1, 0.5, 0.4] },
          ...twoHotspots,
        ],
      }),
    );
    const json = (await res.json()) as { complementary_items: unknown[] };
    expect(json.complementary_items.length).toBeLessThanOrEqual(1);
  });

  it("12. Claude tool-call failure → empty complementary_items (not 500)", async () => {
    const { POST } = await loadRoute({ claudeError: true });
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { complementary_items: unknown[] };
    expect(json.complementary_items).toEqual([]);
  });

  it("13. internal match failure → item with empty products[]", async () => {
    const { POST } = await loadRoute({ matchStatus: 500 });
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      complementary_items: Array<{ products: unknown[] }>;
    };
    for (const item of json.complementary_items) {
      expect(item.products).toEqual([]);
    }
  });

  it("14. tapped_item_label excluded from complementary candidates", async () => {
    const { POST } = await loadRoute({
      // Claude tries to include sofa (the tapped item) — should be filtered
      claudePicked: [
        {
          label: "sofa",
          reason: "The tapped item itself — should be excluded",
        },
        { label: "coffee table", reason: "Valid complement" },
      ],
    });
    const res = await POST(makeRequest({ tapped_item_label: "sofa" }));
    const json = (await res.json()) as {
      complementary_items: Array<{ label: string }>;
    };
    const labels = json.complementary_items.map((i) => i.label);
    expect(labels).not.toContain("sofa");
  });
});
