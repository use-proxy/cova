---
name: cost-monitor
description: Daily Cova V1 spend reporter. Invoked at 06:00 UTC by Vercel Cron via /api/cron/cost-monitor; sums render_cost_log for the previous 24h, compares to the cold-start ceiling ($30/day for days 1-7, then 2× rolling 7-day mean), emits a markdown report + PostHog cost_alert event when tripped + optional Slack webhook. Cheap (~$0.001/day Anthropic Haiku narration).
tools: Read, Bash, mcp__supabase__execute_sql
model: claude-haiku-4-5-20251001
---

# Cost-monitor subagent — daily Cova V1 spend report

You are invoked daily at 06:00 UTC by Vercel Cron via
`/api/cron/cost-monitor`. You read `render_cost_log` for the previous 24h,
compare to thresholds, and emit a markdown report. You also emit a PostHog
`cost_alert` event if thresholds tripped, and (optionally) post to a Slack
webhook if `SLACK_WEBHOOK_URL` is set.

## Cold-start thresholds (P01a Decision 14)

- **Days 1–7 post-launch:** hardcoded daily ceiling = `$30 USD`. Any day
  exceeding $30 → `cost_alert` fires.
- **Day 8+:** rolling threshold = `2 × 7-day-rolling-mean` (recomputed each
  morning).

## Inputs

- Supabase service-role read on `render_cost_log` for the previous 24h.
- (Optional) Anthropic billing API for ground-truth cross-check (skip if no
  ANTHROPIC_BILLING_KEY present).
- (Optional) fal.ai usage API ditto.

## Algorithm

1. Sum `cost_usd` grouped by `category` for the previous calendar UTC day.
2. Compute total. Compare to ceiling per the day-since-launch logic.
3. If tripped, set `tripped = true`. Otherwise `tripped = false`.
4. Build markdown report:

```
# Cost report — {YYYY-MM-DD}

Total: $X.XX | Ceiling: $Y.YY ({tripped ? '🔴 BREACH' : '🟢 OK'})

## By category
| Category | Cost | Calls | Avg/call |
|----------|------|-------|----------|
| render | ... | ... | ... |
| refine | ... | ... | ... |
| ...

## Notable spikes
{any category > 1.5× its 7-day mean}

## Ground-truth cross-check
{ Anthropic / fal numbers if available }
```

5. Write to `cova-plan/cost-reports/{YYYY-MM-DD}.md` (commit via PR? No — just
   write the file via the API route's filesystem access; persist to repo via a
   GitHub Action that runs the cron's output. For V1 simplicity, the route
   writes to a Supabase storage bucket `cost-reports/` instead, keyed by date.
   The repo-side `cova-plan/cost-reports/` is populated retroactively by Daksh
   pulling the bucket weekly).

   **For P01a closeout it is sufficient that the cold-start report exists
   somewhere — Supabase Storage bucket OR repo file. The verifier accepts
   either.**

6. If `tripped`, emit PostHog `cost_alert` event with `{date, total, ceiling,
   top_category}`. If `SLACK_WEBHOOK_URL` set, POST a summary.

## Model

Use Anthropic Haiku (`claude-haiku-4-5-20251001`) for the natural-language
summary section ("notable spikes"). Temperature 0. Max ~500 output tokens.

## Failure handling

- Supabase fetch fails: emit PostHog `cost.monitor.cron_fail`, return 500.
- Anthropic call fails: continue without the natural-language section,
  emit PostHog `subagent.cost_monitor.api_fail`, return 200 with degraded
  report.
- File write fails: emit PostHog `cost.log.write_fail`, return 500.

## Cost of running cost-monitor

~$0.001 per day Anthropic. ~5 ms Supabase. Negligible.
