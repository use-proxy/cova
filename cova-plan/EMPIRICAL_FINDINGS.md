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

---

## P01b (closed 2026-05-03)

### Acceptance tally
- §13 final: 18 PASS / 7 PASS-CODE / 1 PARTIAL / 2 PENDING-VERIFIER / 0 FAIL
- Verifier sessions: 1 + 2 + 3 (3 fresh-context passes); 2 remediation rounds (R1, R1.5, R2 + globals sweep)
- Build green, typecheck green, lint clean (no new warnings introduced; baseline P01a `no-unsafe-console` warnings unchanged)

### Locked decisions surfaced during P01b
- C-3a γ silent-lockout DoS surface tradeoff — accepted. Signin reveals only `auth.signin.invalid_credentials`; lockout state never surfaced to user. Internal `auth.signin.silent_lockout` log-only category. DoS surface (an attacker can lock a known account) accepted as the cost of avoiding enumeration.
- Session cookie `SameSite=Lax` (not Strict) — pragmatic accept. `@supabase/ssr@0.10.0` defaults to Lax because Strict breaks OAuth callback round-trip. Spec said Strict; reality is Lax. Both verifier sessions concur on accept.
- Cron boot-halt deviation — pragmatic accept (P01a `cost-monitor` precedent). Cron routes 401 at runtime when `CRON_SECRET` missing rather than halting at module-load. Same pattern across both phases. Recommend manual gate notes flag this so it doesn't resurface as a defect in P01c.
- GDPR export signed URL TTL = 7 days (not 24h). Locked in phase chat State 2 decision T8. §6 1A, §9, §13 all converge on 7-day post R1+R1.5 doc cleanup. §14 floor check is `≥24h`, satisfied.

### Launch-prep deferrals (back-bugs filed; blocking public V1 launch but not P01b close)
- **`P01b-launch-prep-email-deferred.md`** — Resend gated behind `EMAIL_SENDING_ENABLED=false`. Code present + tested via `paidCall<>()` wrapper. Forgot-password / verification / GDPR-export-ready / deletion-confirmation emails all short-circuit to synthetic success when flag off. Signup auto-marks users verified server-side as the bypass. Estimated 30-60 min to enable post-launch (Resend account + DNS + key + flag flip + redeploy).
- **`P01b-launch-prep-termly-deferred.md`** — `/terms` + `/privacy` ship with placeholder htmlContent (`"This document is coming soon. Contact hi@covainterior.com…"`). LegalPage chrome (sticky header, eyebrow, headline, gold rule, footer) is launch-ready. CCPA exposure if launched public without real Privacy Policy. Estimated 60-90 min via Termly Starter ($10/mo) or 4-6 hrs hand-write.
- **`P01b-prep-globals-css-font-bug.md`** — pre-existing globals.css font issue surfaced during prep; tracked separately.
- **Apple OAuth deferred** — gates G8a + G8b never confirmed. `auth_apple_oauth` feature flag seeded as `enabled=false, percent_rollout=0, environment=all`. Decision: ship V1 with Google OAuth + email/password only; add Apple post-launch when Apple Developer account + Sign-in-with-Apple service ID + DNS verification all land.

### Cost rate baseline (Resend)
- Blended cost rate: **$0.0008/send** (used by `paidCall<>()` wrapper inside `lib/email/resend.ts`). To be refined post-launch with real send-volume telemetry from Resend dashboard. Current rate is the pre-launch placeholder.

### Process learnings (carry forward to P02+)
- **Verifier prompts must explicitly require global grep for pattern-class violations.** Verifier session 1 (P01b) found 3 spinner sites by walking specific files; session 2 ran `grep -rn animate-spin apps/web/app/auth/` and caught 5 *additional* sites session 1 had missed. The systemic gap: session 1's prompt enumerated criteria but did not require directory-wide grep for spec violations of the form "pattern X must not appear in directory Y". Future verifier prompts (built into VERIFIER_PROTOCOL.md if not already) should require: for any §13 row of the form "no X anywhere in Y", run `grep -rn X Y` and report match count, not just file-by-file inspection.
- **Phase-doc edits must sweep all sections, not just listed ones.** R1 caught a spec inconsistency on GDPR export TTL: §6 1A and §9 said 7-day (correct, locked decision T8), but §13 stub still said 24h (stale). The verifier session 1 FAIL was the doc, not the code. Lesson: when a planner updates a locked value, grep the entire phase doc for the prior value and update every occurrence in one commit, not just the section being edited.
- **Phase docs accumulate "stale enumeration" wording that must be re-checked when scope grows.** P01b §6 1B "Loading state α" originally listed "6 form screens"; verify-email-invalid was added later but the enumeration text was not updated. Session 2 caught the scope mismatch via global grep. Generalize: when a phase adds a screen/route/criterion mid-flight, audit all enumeration phrases ("6 screens", "all form pages", "every submit button") for the affected scope.
- **`renders` table column drift caught at remediation 4.** Original GDPR export code referenced `final_image_url` and `redesign_pano_url` on the `renders` table — neither exists. Live MCP query revealed actual columns are `image_url`, `panoramic_url`, `empty_room_url`. Lesson: API routes that read non-frozen tables should be schema-MCP-checked at build time, not just typecheck-time (TypeScript types may lag the live schema if regen wasn't run). Add to P02+ planner checklist: `npx supabase gen types typescript --project-id xdeacbmkdwqrwxonqaqh > apps/web/lib/types/supabase.ts` before fingerprinting routes against schema.

### P01b live state (Supabase MCP, end-of-phase)
- `account_deletions` table live — 5 columns: `id (uuid)`, `hashed_user_id (text, sha256)`, `deleted_at (timestamptz)`, `deletion_reason (text)`, `audit_retention_days (int)`. **No PII columns.** RLS `ON`.
- `feature_flags` rows seeded: `auth_apple_oauth (false@0%)`, `email_verification_required (true@100%)` — both `environment=all`.
- 9 auth API routes live: signup, signin, signout, forgot-password, reset-password, callback (OAuth), delete-account, export, plus internal cron `purge-deletion-audit`.
- 10 P01b screens prerendered in build: signup (3.31kB), signin (4.23kB), forgot-password (4.17kB), reset-password, verify-email-sent, verify-email-success, verify-email-invalid (3.9kB), account-deleted, terms, privacy.
- Total p1_-prefixed RLS policies after P01b: 19 (P01a baseline) + new policies on `account_deletions`. RLS on every public table verified via `pg_class.relrowsecurity`.

### Open back-bugs at P01b close
- `P01b-launch-prep-email-deferred.md` — OPEN, blocks public launch
- `P01b-launch-prep-termly-deferred.md` — OPEN, blocks public launch
- `P01b-prep-globals-css-font-bug.md` — OPEN, cosmetic
- (P01a back-bugs unchanged: `P01a-m2-m4-active-refs.md`, `P01a-eslint-rule-severity-pending-cleanup.md`, `P01a-stale-data-flagging.md`)

### Live-env items rolled forward to manual gate
- 4 signups in 1h from same IP → 4th = 429 (Upstash + real Turnstile)
- Small-fixture user export → sync `{downloadUrl}` < 7s
- Power-user fixture → `{status:"queued"}` + Resend email < 5min (gated on `EMAIL_SENDING_ENABLED=true`)
- Download zip → `images/` contains JPEG/PNG bytes (after R4 service-role download fix)
- Forgot-password timing variance ≤ 50ms over 20 trials
- 5-fail+6th signin → silent lockout in logs (deployed Sentry/log surface)
