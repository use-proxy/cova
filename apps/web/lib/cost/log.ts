import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

export interface LogCostInput {
  category: string;
  stage?: string;
  cost_usd: number;
  model?: string;
  duration_ms?: number;
  failure_category?: string | null;
  user_id?: string | null;
  render_id?: string | null;
}

export async function logCost(input: LogCostInput): Promise<void> {
  try {
    const { error } = await adminClient.from("render_cost_log").insert({
      category: input.category,
      stage: input.stage ?? null,
      cost_usd: input.cost_usd,
      model: input.model ?? null,
      duration_ms: input.duration_ms ?? null,
      failure_category: input.failure_category ?? null,
      user_id: input.user_id ?? null,
      render_id: input.render_id ?? null,
    });
    if (error) {
      const Sentry = await import("@sentry/nextjs");
      Sentry.captureMessage(`cost.log.write_fail: ${error.message}`, "warning");
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown";
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.captureMessage(`cost.log.write_fail: ${message}`, "warning");
    } catch {}
  }
}
