"use client";

import posthog from "posthog-js";

let initialized = false;

export function initPostHog() {
  if (initialized) return posthog;
  if (typeof window === "undefined") return posthog;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.posthog.com";
  if (!key) {
    if (process.env.NODE_ENV !== "production") console.warn("PostHog key missing; analytics disabled.");
    return posthog;
  }
  posthog.init(key, {
    api_host: host,
    capture_pageview: false,
    person_profiles: "identified_only",
    autocapture: false,
    disable_session_recording: true,
  });
  initialized = true;
  return posthog;
}

export { posthog };
