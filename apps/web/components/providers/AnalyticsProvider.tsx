"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Lazy-initializes PostHog and tracks page views on route change.
 * Must be a Client Component because it uses usePathname and window-dependent PostHog.
 * Add once to the root layout, wrapping children.
 */
export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    // Lazy import so PostHog only loads client-side, never SSR
    import("@/lib/analytics").then(({ trackPageView }) => {
      trackPageView(pathname);
    });
  }, [pathname]);

  return <>{children}</>;
}
