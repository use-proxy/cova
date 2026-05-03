// Typed event taxonomy. Phase-specific events added by their owning phase.
// P01a-owned events only.

export type CovaEvent =
  | "subagent.run.started"
  | "subagent.run.completed"
  | "cost_alert"
  | "phase.deploy";

export interface CovaEventProperties {
  "subagent.run.started": { subagent: "verifier" | "schema-reviewer" | "frontend-visionary" | "cost-monitor"; phase?: string };
  "subagent.run.completed": { subagent: "verifier" | "schema-reviewer" | "frontend-visionary" | "cost-monitor"; phase?: string; verdict: "PASS" | "FAIL" | "PARTIAL"; duration_ms: number };
  "cost_alert": { date: string; total: number; ceiling: number; top_category: string | null };
  "phase.deploy": { phase: string; commit_sha: string };
}

import { posthog } from "./posthog";

export function capture<E extends CovaEvent>(event: E, props: CovaEventProperties[E]) {
  try {
    posthog.capture(event, props as Record<string, unknown>);
  } catch {
    // analytics must never crash the app
  }
}
