// MSW (Mock Service Worker) server for intercepting HTTP requests in Vitest.
// Intercepts BOTH client-side and server-side fetch calls, which page.route()
// in Playwright cannot do for server components.
//
// Usage in tests:
//   import { mswServer, withHandler } from '../fixtures/msw-server'
//   withHandler(http.post('http://localhost:3000/api/render', () => HttpResponse.json({ error: 'fail' }, { status: 500 })))

import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

// ── Default handlers — realistic response shapes matching actual Cova API ────

export const defaultHandlers = [
  // Design chat API (Claude Sonnet)
  http.post("*/api/design-chat", () => {
    return HttpResponse.json({
      reply:
        "I understand your preferences. Let me help design your space with warm natural materials and bright lighting.",
      completedTab: null,
    });
  }),

  // Quiz fingerprint (public, no auth)
  http.post("*/api/quiz/fingerprint", () => {
    return HttpResponse.json({
      fingerprint: {
        dimensions: {
          colorTemperature: 0.7,
          colorSaturation: 0.5,
          density: 0.3,
          formality: 0.5,
          era: 0.4,
          material: 0.6,
          texture: 0.7,
          pattern: 0.5,
          lineQuality: 0.5,
          lightPreference: 0.7,
          nature: 0.6,
          culturalInfluence: 0.5,
        },
        covariance: Array.from({ length: 12 }, (_, i) =>
          Array.from({ length: 12 }, (__, j) => (i === j ? 0.3 : 0)),
        ),
        confidence: 0.75,
      },
      style_name: "Warm & Grounded",
      style_tags: [
        "Warm Tones",
        "Natural & Organic",
        "Tactile Textures",
        "Airy & Bright",
      ],
    });
  }),

  // Quiz next-card (returns 9 anchor cards)
  http.post("*/api/quiz/next-card", () => {
    const styles = [
      "Warm Japandi",
      "Dark Moody Glam",
      "Coastal Bright",
      "Industrial Loft",
      "Maximalist Eclectic",
      "Heritage Traditional",
      "Pure Minimal White",
      "Biophilic Jungle",
      "Retro Mid-Century",
    ];
    return HttpResponse.json({
      cards: styles.map((style, i) => ({
        id: `anchor-${i}`,
        imageUrl: `https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-anchors/${style.toLowerCase().replace(/\s+/g, "-")}.jpg`,
        alt: `${style} interior`,
        styleName: style,
        dimensionLabels: {
          colorTemperature: 0.3 + i * 0.05,
          colorSaturation: 0.4 + i * 0.03,
          density: 0.2 + i * 0.08,
          formality: 0.5,
          era: 0.5,
          material: 0.5,
          texture: 0.5,
          pattern: 0.3,
          lineQuality: 0.5,
          lightPreference: 0.6,
          nature: 0.5,
          culturalInfluence: 0.4,
        },
      })),
    });
  }),

  // Render trigger (requires auth)
  http.post("*/api/render", () => {
    return HttpResponse.json({
      predictionId: "pred-test-123",
      schnellPredictionId: "pred-schnell-456",
      status: "queued",
    });
  }),

  // Product matching (requires auth)
  http.post("*/api/match", () => {
    const categories = [
      "Seating",
      "Tables",
      "Lighting",
      "Rugs",
      "Decor",
      "Art",
    ];
    const retailers = [
      "article",
      "westelm",
      "crateandbarrel",
      "ikea",
      "potterybarn",
      "cb2",
    ];
    return HttpResponse.json({
      products: Array.from({ length: 6 }, (_, i) => ({
        id: `product-${i}`,
        name: `Test ${categories[i % 6]} Item`,
        retailer: retailers[i % 6],
        price: 200 + i * 150,
        affiliate_url: `https://example.com/product-${i}?ref=cova`,
        image_url: `https://example.com/product-${i}.jpg`,
        match_score: 0.95 - i * 0.05,
        match_label:
          i < 2
            ? ("Perfect Match" as const)
            : i < 4
              ? ("Very Similar" as const)
              : ("Inspired By" as const),
        fit_label: "Great Fit",
        fit_reason: `Matches your warm natural style`,
      })),
      item_description: "Modern linen upholstered sofa with oak frame",
      queries_used: ["modern linen sofa", "oak frame sofa"],
    });
  }),

  // Detection (requires auth)
  http.post("*/api/detect", () => {
    return HttpResponse.json({
      detections: [
        {
          type: "furniture",
          label: "sofa",
          bbox: [0.1, 0.2, 0.5, 0.4],
          confidence: 0.94,
          showToUser: true,
        },
        {
          type: "furniture",
          label: "coffee table",
          bbox: [0.3, 0.5, 0.2, 0.2],
          confidence: 0.91,
          showToUser: true,
        },
        {
          type: "furniture",
          label: "area rug",
          bbox: [0.05, 0.6, 0.8, 0.3],
          confidence: 0.88,
          showToUser: true,
        },
        {
          type: "furniture",
          label: "bookshelf",
          bbox: [0.7, 0.1, 0.2, 0.5],
          confidence: 0.78,
          showToUser: false,
        },
      ],
    });
  }),

  // Style references
  http.post("*/api/style-references/match", () => {
    return HttpResponse.json({
      references: [
        {
          id: "ref-1",
          image_url: "https://example.com/ref-1.jpg",
          style_name: "Warm & Grounded",
          similarity: 0.92,
        },
        {
          id: "ref-2",
          image_url: "https://example.com/ref-2.jpg",
          style_name: "Natural Warmth",
          similarity: 0.87,
        },
      ],
    });
  }),

  // Room creation
  http.post("*/api/rooms/create", () => {
    return HttpResponse.json({
      id: "room-test-123",
      status: "draft",
    });
  }),

  // Supabase auth token (for test auth flows)
  http.post("*/auth/v1/token", () => {
    return HttpResponse.json({
      access_token: "test-access-token-msw",
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "test-refresh-token-msw",
      user: { id: "test-user-msw", email: "test@cova.test" },
    });
  }),
];

export const mswServer = setupServer(...defaultHandlers);

/** Override a specific handler for the current test. Automatically reset after each test. */
export function withHandler(...handlers: Parameters<typeof mswServer.use>) {
  mswServer.use(...handlers);
}
