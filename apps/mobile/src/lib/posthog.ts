/**
 * PostHog analytics — initialized once at app start.
 * All track() calls go through this module.
 */

import PostHog from 'posthog-react-native';

const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? '';
const POSTHOG_HOST = 'https://us.i.posthog.com';

let posthog: PostHog | null = null;

export async function initPostHog(): Promise<void> {
  if (!POSTHOG_API_KEY) {
    console.warn('[PostHog] No API key — analytics disabled');
    return;
  }
  try {
    posthog = await PostHog.initAsync(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      enableSessionReplay: false,
    });
  } catch (e) {
    console.warn('[PostHog] Init failed:', e);
  }
}

export function track(event: string, properties?: Record<string, unknown>): void {
  posthog?.capture(event, properties);
}

export function identify(userId: string, traits?: Record<string, unknown>): void {
  posthog?.identify(userId, traits);
}

export function reset(): void {
  posthog?.reset();
}

export { posthog };
