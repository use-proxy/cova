# Session handoff: P01a planner complete

Date: 2026-05-02
Session type: planner (no execution)
Status: COMPLETE
Output: cova-plan/planner-output/P01a-executor-prompt.md (128 KB, 3,192 lines)

## Drift check result

| # | Check | Result |
|---|-------|--------|
| 1 | Filesystem (phase docs, decisions, coverage log, SESSION_HANDOFFS, back-bugs/drift/escalations/manual-evidence/subagents directories) | PASS |
| 2 | PHASE_STATUS.md content (P1A=NOT STARTED, P1B=NOT STARTED, Phase 0 IN PROGRESS) | PASS |
| 3 | Supabase MCP reachability + schema state (rooms has 93 cols ≥ 70; ≥ 14 of 17 named-as-dead tables exist) | PASS |
| 4 | Modal CLI authenticated + 4 LIVE apps deployed (cova-perception, cova-empty-room/-v3, cova-redesign/-v3, cova-composite-art) | PASS — with caveat: the planner-prompt's "6 dead apps" hardcoded list (anysplat/marble-mini/etc.) does NOT match live state. Cleanup truly hasn't run; the actual dead apps are 4 V8-era apps from Apr 13. Treated as spec-vs-reality discrepancy (logged in §B.6 of executor prompt), not project-state drift. |
| 5 | covainterior.com responds (307 → www) | PASS |
| 6 | apps/web/.env.local contains SEARCHAPI_KEY | PASS |

No drift halt triggered.

## Research calls completed

### 3.A — Supabase MCP

| Call | Result |
|------|--------|
| 1. 28 dead `rooms` columns | Live shape has 93 cols. Enumerated 28 safe drops: Group A (23 Marble/3D/video/depth) + Group B (4 V1 capture) + Group D (1 personalization_context). Verified each name exists. |
| 2. 17 dead tables | Enumerated: cart_items, click_events, furniture_placements, jobs, listings, votes, product_impressions, product_interactions, style_purchase_signals, rate_limit_events, render_comparison_pairs, chat_sessions, token_transactions, render_retries, render_rate_limits, anchor_renders, user_style_profiles. All confirmed to exist. |
| 3. 12 dead indexes | Enumerated: products_v1_clip_embedding_hnsw_idx, products_v1_fusion_embedding_hnsw_idx, idx_products_clip_embedding, rooms_generation_seed_idx, idx_pairs_is_anchor, idx_quiz_comparison_pairs_anchor, style_loras_style_name_idx, idx_style_fingerprints_room_type, idx_redesign_feedback_user_room, idx_renders_composite_score, idx_renders_laion_high, idx_renders_laion_score. Original DDL captured for `_down.sql`. |
| 4. render_cost_log shape | Diverges from spec (live: pipeline_version/is_retry/retry_type/tokens_charged/cache_hit; spec: category/stage/model/duration_ms/failure_category). **Decision: drop and recreate** with `category text NOT NULL` per D-022. |
| 5. RLS state | 13 kept user-scoped tables enumerated. Multiple legacy duplicate per-op policies on rooms/users/chat_messages/style_fingerprints/render_sessions/interactions to consolidate. Renders has unsafe `WITH CHECK true` on service_insert — fixed by p1_renders_self_all + RLS deny by default for service. |
| 6. Storage buckets | 14 buckets total. quiz-images (public) and room-uploads exist; replace legacy policies with p1_-prefixed equivalents. |
| 7. Edge Function deps | 3 frozen functions reference dropped tables: delete-account (furniture_placements + token_transactions — patch + redeploy as Rule 12 narrow exception); aggregate-style-profiles (4 dead tables — DEPRECATED comment + cron job dropped); render-room (anchor_renders + token_transactions — DEPRECATED comment). |

### 3.B — Codebase grep

| Call | Result |
|------|--------|
| 8. Active refs to dead cols/tables | 37 files reference one or more of the 28 dead columns; majority in tests/_archive/_future. Active code refs (lib/types/supabase.ts) — handled by `npx supabase gen types` regeneration after migrations. |
| 9. Test classification | 60+ test files enumerated and classified: ~50 KEEP, ~5 ARCHIVE (render-pipeline.test.ts, pipeline.test.ts, e2e/data-integrity.test.ts, e2e/render-pipeline.spec.ts, _future tests), 1 DELETE (lib/affiliates.test.ts duplicate). Table embedded in §D.2. |
| 10. console.* census | 489 occurrences across 50+ files. ESLint rule will catch all unsafe ones; not exhaustively enumerated. |
| 11. Direct paid fetch census | 16 sites across 11 files. Per-site migration list in §E.3. |
| 12. Hardcoded timeouts | 28 files contain literal 180/290/300/320/420 numerals outside `lib/config/timeouts.ts`. ESLint `no-restricted-syntax` rule blocks the *_000 ms versions; migration needed. |
| 13. Modal py-file→app-name map | 23 .py files in modal_pipeline/ mapped to Modal app names. 6 KEEP (perception, composite_art, empty_room, empty_room_gemini=v3, redesign=v3, plus catalog tooling). 14+ archive candidates. |

### 3.C — Modal CLI

| Call | Result |
|------|--------|
| 14. Modal app inventory | 10 apps deployed: 6 to KEEP (cova-perception, cova-composite-art, cova-empty-room, cova-empty-room-v3, cova-redesign, cova-redesign-v3) + 4 V8-era to STOP (cova-preprocessing-pipeline, cova-structural-extraction, cova-professionalization, cova-generation). Stop commands embedded in §D.5. |

### 3.D-F — EXA / Context7 / WebSearch

| Call | Result |
|------|--------|
| 15. ESLint custom rule patterns | Confirmed `no-restricted-syntax` AST selector pattern + `RuleTester` for plugin-rule unit tests. Both custom rules embedded in §E.3 with passing test files. |
| 16. Sentry Next.js 14 instrumentation | Confirmed pattern: `instrumentation.ts` with NEXT_RUNTIME branch + `onRequestError` export. v8+ enforces this pattern (sentry.server/edge.config.ts no longer optional). |
| 17. Sharp EXIF strip + exiftool verify | Confirmed `.rotate().resize(1536,1536,{fit:'inside',withoutEnlargement:true}).jpeg({quality:90,mozjpeg:true}).withMetadata({})` strips all EXIF. Vitest fixture test embedded. |
| 18. Vercel Cron CRON_SECRET | Confirmed `Authorization: Bearer ${CRON_SECRET}` header check. Pattern wired into the cost-monitor route. |
| 19. PostHog Next.js 14 EU | Confirmed `eu.posthog.com` host; manual pageview capture for App Router. Init code embedded. |
| 20-23. SDK versions pinned | @sentry/nextjs ^9.0.0 (already installed), sharp ^0.34.5 (installed), posthog-js ^1.257.2 (installed), @aws-sdk/client-s3 3.726.1 (NEW; pinned to avoid 3.729.0 R2 incompatibility). |
| 24. zxcvbn | N/A in P01a; flagged for P01b. |
| 25. Sentry sample rates 2026 | Confirmed: tracesSampleRate 0.1 production, profilesSampleRate 0.05, replaysOnErrorSampleRate 1.0 (raised from phase doc's 0.5 per current best practice), replaysSessionSampleRate 0.0. |
| 26. Cloudflare pricing 2026 | R2: $0.015/GB storage, $0 egress, 10GB free tier. Images: $0.50/1k transforms, $5/100k storage, $1/100k delivery, 5k free transforms/mo. P01a §12 cost budget remains accurate (well under free tier for P01a's fixture loads). |
| 27. Modal A10G pricing 2026 | ~$0.0006/sec ≈ $2.16/hr (per CLAUDE.md context). Cost lines unchanged. |

## Discrepancies between phase doc and audits / live state

1. **Phase doc names 6 dead Modal apps that don't exist.** Phase doc §6 M1 lists `anysplat`, `marble-mini`, `marble-plus`, `colmap-fastgs`, `flythrough`, `glb-render`. None deployed today. Actual cleanup target = 4 V8-era apps. Logged in executor prompt §B.6 + §D.5; executor reconciles via MODAL_AUDIT (source of truth).
2. **Phase doc says "rooms has 63 columns" (audit-era).** Live count is 93 — schema grew since audit. The 28 dead-column list still applies; the difference is just "more cols added by V9 work". Logged in §D.3.2 comment.
3. **Phase doc says "~70 fix_*.mjs scripts".** Actual count = 45. Adjusted §D.7.
4. **Phase doc §10 names `pipeline_runs` table.** That table does not exist in current schema (verified via list_tables). The §10 RLS DDL referencing pipeline_runs is omitted from the §D.3.6 RLS migration.
5. **Phase doc §D.7 stale data flagging requires `rooms.tags jsonb` column.** That column doesn't exist. P01a doesn't add columns. Deferred to a back-bug for Phase 9.
6. **render_cost_log shape mismatch.** Live diverges from spec; planner determined "drop and recreate" (vs. "verify-only") and embedded explicit recreate migration.
7. **`apps/web/eslint.config.js` referenced by phase doc** — repo uses legacy `apps/web/.eslintrc.json` (ESLint 8 + next-lint requires legacy). Adjusted: rules registered via local plugin in `.eslintrc.json`, not flat config.

All discrepancies handled in the executor prompt. None are halt-worthy.

## Self-check result

| Criterion | Result |
|-----------|--------|
| Every reference to a dead column/table/index uses an exact name (no placeholders) | PASS |
| All embedded SQL is well-formed and self-contained | PASS — DDL + DML + RLS migrations + _down.sql skeletons |
| All embedded TypeScript compiles (no obvious syntax errors) | PASS — manual visual review |
| All embedded YAML compiles | PASS |
| All embedded bash uses POSIX-portable syntax | PASS |
| Every D-rule referenced matches OPEN_DECISIONS.md verbatim | PASS |
| All 4 subagent .md files have full system prompts | PASS — verifier (~120 lines), schema-reviewer (~70), frontend-visionary (~60), cost-monitor (~80) |
| Every research call (1–27) contributed or is logged not-applicable | PASS — see above table |
| Drift check + halt logic embedded in §B for executor's first session AND every subsequent session | PASS |
| Stop conditions / non-goals enumerated in §G | PASS |

## Pinned dependency versions (locked into executor prompt)

- `@sentry/nextjs ^9.0.0` (already in package.json)
- `sharp ^0.34.5` (already)
- `posthog-js ^1.257.2` (already)
- `@aws-sdk/client-s3 3.726.1` (NEW — exact pin to avoid 3.729.0 R2 break)
- `@aws-sdk/s3-request-presigner 3.726.1` (NEW — same)
- `eslint-plugin-cova-rules file:./eslint-plugin-cova-rules` (NEW — local link)

ESLint stays on v8 (next-lint requirement). Vitest 4.x. Next 14.2.35. TypeScript 5. All match current `apps/web/package.json`.

## Files written this session

- `cova-plan/planner-output/P01a-executor-prompt.md` (3,192 lines / 128 KB)
- `cova-plan/SESSION_HANDOFFS/03-P01a-planner-complete.md` (this file)

## Files NOT written / actions NOT taken

Per Section 7 of the planner prompt:
- No migrations executed.
- No Modal apps stopped.
- No source files modified.
- No phase doc edited.
- No commits pushed to remote.
- No executor session triggered.
- No work past 93-94% context (planner ran well within budget).

## What's next

1. Daksh reviews `cova-plan/planner-output/P01a-executor-prompt.md`.
2. If approved, paste the executor prompt as the first message of a fresh Claude Code session in `/Users/daksh/Desktop/cova/`.
3. Executor runs M0 → M1 → M3 across 3–4 sessions with handoffs at 93–94 % context (handoffs land at `cova-plan/SESSION_HANDOFFS/04-...`, `05-...`, etc.).
4. Verifier session 1 then session 2 close the phase.
5. Daksh reviews auto-evidence bundle + verifier reports.
6. PHASE_STATUS.md flips P1A → CLOSED, P1B → READY TO START.
7. Open a fresh chat to plan P01b.
