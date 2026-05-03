#!/usr/bin/env tsx
// scripts/agents/cost-monitor.ts
// Invoked by Vercel Cron via apps/web/app/api/cron/cost-monitor/route.ts.
// Standalone version for local dry-runs.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.posthog.com";
const LAUNCH_DATE = process.env.COVA_LAUNCH_DATE ?? "2026-05-15";

export async function runCostMonitor(): Promise<{
  ok: boolean;
  reportMarkdown: string;
  tripped: boolean;
  total: number;
  ceiling: number;
}> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from("render_cost_log")
    .select("category, cost_usd, model, stage, duration_ms, failure_category, created_at")
    .gte("created_at", since);

  if (error) {
    return {
      ok: false,
      reportMarkdown: `# Cost report — error\n\n${error.message}`,
      tripped: false,
      total: 0,
      ceiling: 0,
    };
  }

  const total = (rows ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);

  const launchMs = new Date(LAUNCH_DATE).getTime();
  const daysSinceLaunch = Math.floor((Date.now() - launchMs) / 86_400_000);
  let ceiling = 30;
  if (daysSinceLaunch > 7) {
    const sinceWeek = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: weekRows } = await supabase
      .from("render_cost_log")
      .select("cost_usd, created_at")
      .gte("created_at", sinceWeek);
    const weekTotal = (weekRows ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
    ceiling = (weekTotal / 7) * 2;
  }
  const tripped = total > ceiling;

  const byCat: Record<string, { cost: number; n: number }> = {};
  for (const r of rows ?? []) {
    const k = (r.category as string | null) ?? "unknown";
    if (!byCat[k]) byCat[k] = { cost: 0, n: 0 };
    byCat[k].cost += Number(r.cost_usd ?? 0);
    byCat[k].n += 1;
  }
  const catRows = Object.entries(byCat)
    .sort((a, b) => b[1].cost - a[1].cost)
    .map(([k, v]) => `| ${k} | $${v.cost.toFixed(4)} | ${v.n} | $${(v.cost / Math.max(v.n, 1)).toFixed(4)} |`)
    .join("\n");

  let narration = "(narration disabled)";
  try {
    const sys = readFileSync("cova-plan/subagents/cost-monitor.md", "utf8");
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      temperature: 0,
      system: sys,
      messages: [
        {
          role: "user",
          content: `Day total $${total.toFixed(2)}, ceiling $${ceiling.toFixed(2)}, tripped=${tripped}. Per-category JSON: ${JSON.stringify(byCat)}. Write a 3-bullet "Notable spikes" markdown section, no preamble.`,
        },
      ],
    });
    narration = resp.content
      .filter((b) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
  } catch (e: any) {
    narration = `(narration failed: ${e?.message ?? "unknown"})`;
  }

  const today = new Date().toISOString().slice(0, 10);
  const md = `# Cost report — ${today}

Total: $${total.toFixed(4)} | Ceiling: $${ceiling.toFixed(2)} (${tripped ? "🔴 BREACH" : "🟢 OK"})
Days since launch: ${Math.max(daysSinceLaunch, 0)}

## By category
| Category | Cost | Calls | Avg/call |
|----------|------|-------|----------|
${catRows || "| (none) | $0 | 0 | $0 |"}

## Notable spikes
${narration}
`;

  if (tripped && POSTHOG_KEY) {
    try {
      await fetch(`${POSTHOG_HOST}/i/v0/e/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: POSTHOG_KEY,
          event: "cost_alert",
          distinct_id: "system-cron",
          properties: { date: today, total, ceiling, top_category: Object.keys(byCat)[0] ?? null },
        }),
      });
    } catch {}
  }
  if (tripped && SLACK_WEBHOOK_URL) {
    try {
      await fetch(SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: `🔴 Cova cost alert — $${total.toFixed(2)} > $${ceiling.toFixed(2)} on ${today}` }),
      });
    } catch {}
  }

  try {
    await supabase.storage
      .from("cost-reports")
      .upload(`${today}.md`, new Blob([md], { type: "text/markdown" }), { upsert: true });
  } catch {}

  return { ok: true, reportMarkdown: md, tripped, total, ceiling };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCostMonitor().then((r) => {
    console.log(r.reportMarkdown);
    process.exit(r.ok ? 0 : 1);
  });
}
