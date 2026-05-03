# Cova V1 — Empirical Findings

Test results, measured constraints, and verified facts that bind future phases. Append-only.

## P01a (closed 2026-05-02)

### Demolition results (post-migration verification at HEAD)
- 17 of 17 dead tables removed from xdeacbmkdwqrwxonqaqh (cart_items, click_events, furniture_placements, jobs, votes, listings, product_impressions, product_interactions, style_purchase_signals, rate_limit_events, render_comparison_pairs, chat_sessions, token_transactions, render_retries, render_rate_limits, anchor_renders, user_style_profiles)
- 17 of 28 dead rooms columns removed (M2 tightened from 28 to 17 truly-dead per back-bug `P01a-m2-m4-active-refs.md`); 11 deferred to P02/P03 with consumer mapping
- 12 of 12 dead indexes removed
- 4 V8-stage Modal apps stopped (cova-preprocessing-pipeline, cova-structural-extraction, cova-professionalization, cova-generation); cova-redesign-pipeline orchestrator never deployed (source archived only)
- 5 archived modal_pipeline .py files in _archive/

### Schema state (post-P01a)
- public schema: 23 tables, all RLS-enabled (pg_class.relrowsecurity = true)
- 19 p1_-prefixed policies live
- render_cost_log shape: category text NOT NULL per D-022 (validated app-layer via TypeScript union in lib/cost/categories.ts)
- feature_flags table created, 0 seeded rows (P01b seeds auth flags)
- pipeline_runs not yet created (Phase 5 owns)
- account_deletions not yet created (P01b owns)

### ESLint enforcement
- cova-rules/no-direct-paid-fetch: error severity, 0 violations on production code (15 paid-fetch sites migrated to paidCall<T>())
- cova-rules/no-unsafe-console: warn severity, 199 residual violations (target <200 met; cleanup deferred to P02-P04 per back-bug)

### Build & test baseline
- npm run build: exit 0, 86 routes prerendered
- npm run lint: exit 0
- npm test: 514 pass / 16 fail / 32 skip (failures are pre-existing quiz-flow mock debt + env-gated integration tests; none introduced by P01a)

### Sentry sample rates (locked for production)
- Client: traces 0.1, profiles 0.05, replaysOnError 0.5, replaysSession 0.0
- Server: traces 0.1, profiles 0.05
- Edge: traces 0.05
- next.config.mjs wraps with withSentryConfig (hideSourceMaps: true, disableLogger: true)

### Subagents shipped
- verifier (claude-opus-4-7), schema-reviewer (claude-sonnet-4-6), frontend-visionary (claude-sonnet-4-6), cost-monitor (claude-haiku-4-5-20251001)
- Source-of-truth at cova-plan/subagents/, synced to .claude/agents/ via scripts/sync-subagents.sh

### Open back-bugs at P01a close
- P01a-m2-m4-active-refs.md → 11 deferred rooms columns mapped to P02/P03
- P01a-eslint-rule-severity-pending-cleanup.md → no-unsafe-console at warn pending P02-P04 cleanup
- P01a-stale-data-flagging.md → tags jsonb column + flag deferred to Phase 9
- P01a-python-test-imports.md → RESOLVED (commit c87df47)

### Deploy-time deferrals (not P01a code work)
- Vercel env vars: CRON_SECRET, COVA_LAUNCH_DATE, Cloudflare R2/Images credentials, Sentry credentials
- GitHub Actions secrets: ANTHROPIC_API_KEY, Supabase trio
- Cost-monitor first cold-start report appears post-deploy
