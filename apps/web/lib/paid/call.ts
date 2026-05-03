import { logCost } from "../cost/log";
import type { CostCategory } from "../cost/categories";

export interface PaidCallOpts {
  provider: "anthropic" | "fal" | "modal" | "searchapi" | "resend";
  url: string;
  init: RequestInit;
  costEstimate: {
    category: CostCategory;
    costUsd: number;
    model?: string;
    stage?: string;
  };
  /** Optional override for failure_category if the call fails before parse */
  failureCategoryOverride?: string;
}

export async function paidCall<T = unknown>(opts: PaidCallOpts): Promise<T> {
  const start = Date.now();
  let res: Response | null = null;
  let parsed: T | null = null;
  let failure: string | null = null;
  try {
    res = await fetch(opts.url, opts.init);
    if (!res.ok) {
      failure = opts.failureCategoryOverride ?? `cost.paidcall.fetch_fail`;
      throw new Error(`${opts.provider} ${res.status}: ${await res.text().catch(() => "")}`);
    }
    parsed = (await res.json()) as T;
    return parsed;
  } catch (e: any) {
    if (!failure) failure = `cost.paidcall.parse_fail`;
    throw e;
  } finally {
    void logCost({
      category: opts.costEstimate.category,
      stage: opts.costEstimate.stage,
      cost_usd: opts.costEstimate.costUsd,
      model: opts.costEstimate.model,
      duration_ms: Date.now() - start,
      failure_category: failure ?? null,
    });
  }
}
