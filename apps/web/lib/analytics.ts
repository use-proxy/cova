/**
 * PostHog analytics wrapper — server-safe (no window checks needed, posthog-js handles that)
 * All event capture is client-side only; this module is imported via AnalyticsProvider.
 */

type Properties = Record<string, string | number | boolean | null | undefined>;

let posthogInstance: typeof import("posthog-js").default | null = null;

async function getPostHog() {
  if (posthogInstance) return posthogInstance;
  if (typeof window === "undefined") return null;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com";
  if (!key) return null;

  const { default: posthog } = await import("posthog-js");
  if (!posthog.__loaded) {
    posthog.init(key, {
      api_host: host,
      capture_pageview: false,
      autocapture: false,
      persistence: "memory",
    });
  }
  posthogInstance = posthog;
  return posthog;
}

export async function identify(userId: string, traits?: Properties) {
  const ph = await getPostHog();
  if (!ph) return;
  ph.identify(userId, traits);
}

export async function track(event: string, properties?: Properties) {
  const ph = await getPostHog();
  if (!ph) return;
  ph.capture(event, properties);
}

export async function trackPageView(path: string) {
  await track("$pageview", { $current_url: path });
}

// Domain-specific events
export const analytics = {
  quizStarted: (entryPath: string) =>
    track("quiz_started", { entry_path: entryPath }),
  quizCompleted: (styleName: string, stepCount: number) =>
    track("quiz_completed", { style_name: styleName, step_count: stepCount }),
  photoUploaded: (roomType: string) =>
    track("photo_uploaded", { room_type: roomType }),
  renderStarted: (roomId: string, budget: string) =>
    track("render_started", { room_id: roomId, budget }),
  renderCompleted: (roomId: string, durationMs: number) =>
    track("render_completed", { room_id: roomId, duration_ms: durationMs }),
  hotspotTapped: (productId: string, productName: string) =>
    track("hotspot_tapped", {
      product_id: productId,
      product_name: productName,
    }),
  affiliateClicked: (productId: string, retailer: string, price: number) =>
    track("affiliate_clicked", { product_id: productId, retailer, price }),
  matchViewed: (productId: string, matchScore: number, matchLabel: string) =>
    track("match_viewed", {
      product_id: productId,
      match_score: matchScore,
      match_label: matchLabel,
    }),
  swapInitiated: (productId: string) =>
    track("swap_initiated", { product_id: productId }),
};
