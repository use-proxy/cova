# P01 Split Coverage Log

Generated: 2026-05-02
Source: `cova-plan/phases/_archive/P01-foundations-pre-split.md` (811 lines)
Outputs:
- `cova-plan/phases/P01a-demolition-ops.md` (712 lines)
- `cova-plan/phases/P01b-auth-legal-deletion.md` (614 lines)

## Summary

| Metric | Value |
|---|---|
| Original lines | 811 |
| P01a lines | 712 |
| P01b lines | 614 |
| Original H1/H2/H3 headings | 66 |
| D-NNN rules in original (D-001..D-021) | 21 |
| D-NNN rules in P01a (with D-022) | 22 |
| D-NNN rules in P01b (with D-022) | 22 |
| Gaps in original (G1..G10) | 10 |
| Gaps in P01a | 7 (G1,G2,G3,G6,G7,G9,G10) |
| Gaps in P01b | 3 (G4,G5,G8) |
| API routes in original §9 | 6 (all auth) |
| API routes in P01a §9 | 1 (internal cron) |
| API routes in P01b §9 | 6 (all auth) |
| Audit rows in original §4.3 | 10 |
| Audit rows in P01a §4.3 | 9 |
| Audit rows in P01b §4.3 | 2 (one is the INFRA row split — DNS half) |
| **Verification** | **PASSED** |

---

## Step 1 — Heading coverage

Every heading from the original is mapped to one of {P01a, P01b, BOTH, NEITHER}. NEITHER without rationale is a halt condition. None recorded.

| Original heading | P01a | P01b | NEITHER (rationale) |
|---|---|---|---|
| `# Phase 1 — Foundations` | retitled `# Phase 1A — …` | retitled `# Phase 1B — …` | — |
| `## Phase identity` | ✓ (recomputed estimates: ~3–4 sessions, $30–45) | ✓ (recomputed: ~3–4 sessions, $30–45) | — |
| `## 1. The session loop for this phase` | ✓ (omits manual click-script step) | ✓ (keeps manual click-script step) | — |
| `## 2. Prereq verification` | ✓ (adds Decision 15 — Modal CLI auth) | ✓ (adds P01a CLOSED check, Resend DNS, Termly, Apple OAuth) | — |
| `### Filesystem checks` | ✓ | ✓ | — |
| `### External dependency checks` | ✓ | ✓ | — |
| `### Halt conditions` | ✓ | ✓ | — |
| `## 3. Pre-decisions` | ✓ (G1, G2, G3, G6, G7, G9, G10) | ✓ (G4, G5, G8) | — |
| `## 4. Background context` | ✓ | ✓ | — |
| `### 4.1 What Cova is` | ✓ (identical) | ✓ (identical) | — |
| `### 4.2 What Phase 1 is` | retitled "What Phase 1A is" — rewritten | retitled "What Phase 1B is" — rewritten | — |
| `### 4.3 Audit findings driving this phase` | ✓ (9 of 10 rows; INFRA split) | ✓ (AUTH + INFRA-DNS row) | — |
| `### 4.4 Existing infrastructure to preserve` | ✓ (Decision 2 iOS + Decision 16 keys) | ✓ (Decision 2 iOS + Decision 16 keys) | — |
| `## 5. Tech stack for this phase` | ✓ (no Resend/Termly/Turnstile/zxcvbn/React Email) | ✓ (adds Resend, Termly, Turnstile, zxcvbn, React Email, RHF) | — |
| `### Hard locked rules` | ✓ (D-001..D-022 verbatim) | ✓ (D-001..D-022 verbatim) | — |
| `## 6. Scope` | ✓ (M0 + M1 + M3) | ✓ (M2 only) | — |
| `### 1A — Backend / Infrastructure` | ✓ | renamed `### 1A — Backend / Auth APIs` | — |
| `### 1B — UI (M2 screens)` | renamed `### 1B — Integration + review` (no UI) | ✓ (verbatim) | — |
| `### 1C — Integration + review` | folded into P01a's `### 1B — Integration + review` | ✓ | — |
| `## 7. Out of scope` | ✓ (adds "Auth/legal/deletion in P01b") | ✓ (adds "Demolition/ops/subagents completed in P01a") | — |
| `## 8. Files touched (expected paths)` | ✓ | ✓ | — |
| `### Created` | ✓ (subagent + ops + ESLint + paidCall + snapshots + READMEs) | ✓ (auth pages + auth API routes + Edge Function + GDPR export) | — |
| `### Migrations` | ✓ (6 P01a migrations) | ✓ (account_deletions only) | — |
| `### Archived` | ✓ | — (P01b archives nothing) | NEITHER N/A — section legitimately absent in P01b |
| `### Deleted` | ✓ (narrowed per Decision 4) | — (P01b deletes nothing) | NEITHER N/A — section legitimately absent in P01b |
| `### Modified (~120 files)` | ✓ (redactLogPayload + paidCall refactor + next.config.js) | ✓ (feature-flags + nav wiring) | — |
| `## 9. API contracts` | ✓ (only `GET /api/cron/cost-monitor`) | ✓ (all 6 auth routes verbatim) | — |
| `### POST /api/auth/signup` | — | ✓ | — |
| `### POST /api/auth/signin` | — | ✓ | — |
| `### POST /api/auth/forgot-password` | — | ✓ | — |
| `### POST /api/auth/reset-password` | — | ✓ | — |
| `### POST /api/auth/delete-account` | — | ✓ | — |
| `### POST /api/users/export` | — | ✓ | — |
| `## 10. Schema migrations (full DDL)` | ✓ | ✓ | — |
| `### account_deletions` | — | ✓ (verbatim) | — |
| `### feature_flags` | renamed `### Step 5 — feature_flags` | — | — |
| `### render_cost_log (verify or recreate)` | renamed `### Step 4 — render_cost_log` (D-022 applied: `category text NOT NULL`) | — | — |
| `### Drop dead room columns` | renamed `### Step 2 — drop dead room columns` | — | — |
| `### Drop dead tables` | renamed `### Step 3 — drop dead tables` (gated by Decision 5 cron audit) | — | — |
| `### RLS consolidation` | renamed `### Step 6 — RLS consolidation` (Decision 10: `p1_` prefix on every CREATE POLICY) | — | — |
| `## 11. Failure handling` | ✓ (cost.*, infra.*, subagent.* dotted prefixes) | ✓ (full auth.* dotted union) | — |
| `### Per-route failure_category enum` | renamed `### Dotted-namespace failure_category (Decision 8)` | renamed `### Dotted-namespace failure_category (Decision 8) — auth.*` | — |
| `### Recovery actions` | ✓ (cost/infra/subagent recovery) | ✓ (auth recovery verbatim, dotted format) | — |
| `## 12. Cost budget` | ✓ ($35–55 setup + $5–10/mo subagent ongoing per Decision 14) | ✓ ($32–47) | — |
| `## 13. Verifier focus areas` | ✓ (Decision 22 + Decision 5 + Decision 6 baked in) | ✓ (Decision 22 baked in) | — |
| `### Verifier session 2 cross-check` | ✓ | ✓ | — |
| `## 14. Adversarial code review checklist` | ✓ (P01a-domain probes) | ✓ (P01b-domain probes) | — |
| `## 15. Manual click-script` | replaced with "no manual click-script" note | ✓ (verbatim) | — |
| `### Auth happy path` | — | ✓ | — |
| `### OAuth path` | — | ✓ | — |
| `### Magic link` | — | ✓ | — |
| `### Forgot/reset password` | — | ✓ | — |
| `### Rate limit` | — | ✓ | — |
| `### Turnstile` | — | ✓ | — |
| `### Legal pages` | — | ✓ | — |
| `### Account deletion` | — | ✓ | — |
| `### GDPR export` | — | ✓ | — |
| `### Reduced motion` | — | ✓ | — |
| `### Mobile responsive` | — | ✓ | — |
| `## 16. Manual evidence bundle` | renamed `## 16. Automated evidence bundle` | ✓ (verbatim) | — |
| `## 17. Remediation budget` | ✓ (cross-ref to §14) | ✓ (cross-ref to §14) | — |
| `## 18. Closing checklist` | ✓ (no manual evidence row) | ✓ (includes manual evidence row) | — |
| `## 19. Rollback plan` | ✓ (schema + archive restore) | ✓ (auth rollback + Edge Function disable + Termly content) | — |
| `## 20. Feature flags introduced` | ✓ (table only — no flag rows seeded) | ✓ (3 flag rows seeded) | — |
| `## 21. Document updates at phase close` | ✓ (P01a → CLOSED, P01b → READY) | ✓ (P01b → CLOSED, Phase 2 → READY; EMPIRICAL_FINDINGS.md created here) | — |
| `## End of Phase 1 doc.` | retitled `## End of Phase 1A doc.` | retitled `## End of Phase 1B doc.` | — |

**Result: PASS.** Every original heading is accounted for in either or both new docs, with rationale. The two NEITHER rows (`### Archived` and `### Deleted` in P01b) are legitimate omissions: P01b ships no archives or deletions; that work was completed in P01a.

---

## Step 2 — D-NNN coverage

| ID | Original | P01a §5 | P01b §5 | Notes |
|---|---|---|---|---|
| D-001 | ✓ | ✓ | ✓ | one photo per room |
| D-002 | ✓ | ✓ | ✓ | no scraping |
| D-003 | ✓ | ✓ | ✓ | no LoRAs |
| D-004 | ✓ | ✓ | ✓ | no multi-ref |
| D-005 | ✓ | ✓ | ✓ | no depth ControlNet |
| D-006 | ✓ | ✓ | ✓ | no FLUX averaging |
| D-007 | ✓ | ✓ | ✓ | 12-pick quiz |
| D-008 | ✓ | ✓ | ✓ | display names only |
| D-009 | ✓ | ✓ | ✓ | EXIF strip mandatory |
| D-010 | ✓ | ✓ (annotated: ESLint rule supersedes grep) | ✓ (annotated) | redactLogPayload |
| D-011 | ✓ | ✓ (annotated: paidCall wrapper supersedes grep) | ✓ (annotated) | cost telemetry |
| D-012 | ✓ | ✓ (dotted format) | ✓ (dotted format) | failure_category |
| D-013 | ✓ | ✓ | ✓ | 8 stages locked |
| D-014 | ✓ | ✓ | ✓ | THREE.js 0.155.0 |
| D-015 | ✓ | ✓ | ✓ | fetch only |
| D-016 | ✓ | ✓ | ✓ | forced-choice quiz |
| D-017 | ✓ | ✓ | ✓ | 10 styles |
| D-018 | ✓ | ✓ | ✓ | refine free-form |
| D-019 | ✓ | ✓ | ✓ | token enforce false |
| D-020 | ✓ | ✓ | ✓ | mood feed dropped |
| D-021 | ✓ | ✓ | ✓ | Termly free tier |
| D-022 | — (added) | ✓ | ✓ | render_cost_log.category is text (Decision 3) |

**Result: PASS.** All 21 originals + D-022 present in both new docs.

---

## Step 3 — G-NNN gap coverage

Partition required: P01a={G1,G2,G3,G6,G7,G9,G10}, P01b={G4,G5,G8}.

| Gap | In P01a §3 | In P01b §3 |
|---|---|---|
| G1 (dead column names) | ✓ | — |
| G2 (dead table names) | ✓ | — |
| G3 (legacy.ts state) | ✓ | — |
| G4 (Resend DNS) | — | ✓ |
| G5 (Termly templates) | — | ✓ |
| G6 (stale test inventory) | ✓ (Decision 4 selective classification baked in) | — |
| G7 (render_cost_log shape) | ✓ (D-022 applied) | — |
| G8 (Apple OAuth) | — | ✓ |
| G9 (Edge Functions) | ✓ | — |
| G10 (Modal app cleanup) | ✓ | — |

**Result: PASS.** Each gap present in exactly one phase doc; partition matches the spec.

---

## Step 4 — File path coverage

Every file path mentioned in original §8 (Created / Migrations / Archived / Deleted / Modified) is routed to a single new phase. New decision files are added to the appropriate phase.

### Created — original → routed
| Original path | Routed to |
|---|---|
| `apps/web/instrumentation.ts` | P01a §8 Created |
| `apps/web/sentry.client.config.ts` | P01a §8 Created |
| `apps/web/sentry.server.config.ts` | P01a §8 Created |
| `apps/web/sentry.edge.config.ts` | P01a §8 Created |
| `apps/web/lib/log/redact.ts` | P01a §8 Created |
| `apps/web/lib/config/timeouts.ts` | P01a §8 Created |
| `apps/web/lib/cost/log.ts` | P01a §8 Created |
| `apps/web/lib/errors/categories.ts` | P01a §8 Created (P01a-owned slice); P01b §8 extends with `auth.*` |
| `apps/web/lib/analytics/posthog.ts` | P01a §8 Created |
| `apps/web/lib/analytics/events.ts` | P01a §8 Created |
| `apps/web/lib/feature-flags/index.ts` | P01a §8 Created (P01b §8 Modified — consumes seeded flags) |
| `apps/web/lib/capture/process.ts` | P01a §8 Created |
| `apps/web/middleware.ts` | P01b §8 Created (rate limiting is auth-domain) |
| `apps/web/app/auth/signup/page.tsx` | P01b §8 Created |
| `apps/web/app/auth/signin/page.tsx` | P01b §8 Created |
| `apps/web/app/auth/forgot-password/page.tsx` | P01b §8 Created |
| `apps/web/app/auth/reset-password/page.tsx` | P01b §8 Created |
| `apps/web/app/auth/verify-email-sent/page.tsx` | P01b §8 Created |
| `apps/web/app/auth/verify-email-success/page.tsx` | P01b §8 Created |
| `apps/web/app/account-deleted/page.tsx` | P01b §8 Created |
| `apps/web/app/terms/page.tsx` | P01b §8 Created |
| `apps/web/app/privacy/page.tsx` | P01b §8 Created |
| `apps/web/app/api/auth/signup/route.ts` | P01b §8 Created |
| `apps/web/app/api/auth/signin/route.ts` | P01b §8 Created |
| `apps/web/app/api/auth/oauth-callback/route.ts` | P01b §8 Created |
| `apps/web/app/api/auth/forgot-password/route.ts` | P01b §8 Created |
| `apps/web/app/api/auth/reset-password/route.ts` | P01b §8 Created |
| `apps/web/app/api/auth/magic-link/route.ts` | P01b §8 Created |
| `apps/web/app/api/auth/resend-verification/route.ts` | P01b §8 Created |
| `apps/web/app/api/auth/delete-account/route.ts` | P01b §8 Created |
| `apps/web/app/api/auth/sign-out/route.ts` | P01b §8 Created |
| `apps/web/app/api/users/export/route.ts` | P01b §8 Created |
| `supabase/functions/delete-user-cascade/index.ts` | P01b §8 Created |
| `cova-plan/subagents/verifier.md` | P01a §8 Created |
| `cova-plan/subagents/schema-reviewer.md` | P01a §8 Created |
| `cova-plan/subagents/frontend-visionary.md` | P01a §8 Created |
| `cova-plan/subagents/cost-monitor.md` | P01a §8 Created |
| `scripts/agents/verifier.ts` | P01a §8 Created |
| `scripts/agents/schema-reviewer.ts` | P01a §8 Created |
| `scripts/agents/frontend-visionary.ts` | P01a §8 Created |
| `scripts/agents/cost-monitor.ts` | P01a §8 Created |
| `.github/workflows/schema-review.yml` | P01a §8 Created |
| `.github/workflows/lint.yml` | P01a §8 Created |
| `tests/rls/two-user-isolation.test.ts` | P01a §8 Created (Decision 6: one test per kept user-scoped table) |
| `tests/exif/strip.test.ts` | P01a §8 Created |
| `tests/fixtures/exif-with-gps.jpg` | P01a §8 Created |
| `tests/fixtures/heic-iphone-sample.heic` | dropped (HEIC fixture moved to Phase 3 per its own scope) — flagged here for transparency; not a coverage gap because original P01 itself marked it as a Phase 3 placeholder |

### New files added by decisions (Section 2 of split prompt)
| File | Decision | Routed to |
|---|---|---|
| `apps/web/eslint-rules/no-unsafe-console.ts` | Decision 7 | P01a §8 Created |
| `apps/web/eslint-rules/no-direct-paid-fetch.ts` | Decision 7 | P01a §8 Created |
| `apps/web/eslint.config.js` | Decision 7 | P01a §8 Created |
| `apps/web/lib/paid/call.ts` | Decision 7 | P01a §8 Created |
| `apps/web/lib/cost/categories.ts` | Decision 3 / D-022 | P01a §8 Created |
| `apps/web/app/api/cron/cost-monitor/route.ts` | Decision 9 (cost-monitor cron entrypoint) | P01a §8 Created |
| `scripts/sync-subagents.sh` | Decision 9 | P01a §8 Created |
| `.claude/agents/{verifier,schema-reviewer,frontend-visionary,cost-monitor}.md` | Decision 9 (synced) | P01a §8 Created |
| `cova-plan/snapshots/P01a-pre-drop.sql` | Decision 12 | P01a §8 Created |
| `_archive/lib/README.md` | Decision 11 | P01a §8 Created |
| `_archive/components/README.md` | Decision 11 | P01a §8 Created |
| `_archive/scripts/README.md` | Decision 11 | P01a §8 Created |
| `_archive/modal_pipeline/README.md` | Decision 11 | P01a §8 Created |
| `_archive/tests/README.md` | Decision 11 + Decision 4 | P01a §8 Created |

### Migrations
| Original | Routed to |
|---|---|
| `drop-dead-room-cols.sql` | P01a §8 + §10 |
| `drop-dead-tables.sql` | P01a §8 + §10 (gated by cron audit) |
| `drop-dead-indexes.sql` | P01a §8 + §10 |
| `rls-consolidation.sql` | P01a §8 + §10 (`p1_` prefix) |
| `account-deletions-table.sql` | P01b §8 + §10 |
| `feature-flags-table.sql` | P01a §8 + §10 |
| `render-cost-log-verify.sql` | P01a §8 + §10 (D-022) |

### Archived
| Original | Routed to |
|---|---|
| `_archive/scripts/` (~70 fix_*.mjs) | P01a §8 |
| `_archive/modal_pipeline/` (6 dead apps) | P01a §8 |
| `_archive/lib/` (~20 dead files) | P01a §8 |
| `_archive/components/` (~12 dead components) | P01a §8 |
| `_archive/lib/legacy-auth.ts` | P01a §8 |

### Deleted
Per Decision 4, the original "ALL `*.test.*` deleted" reduces to "category-(c) only". Categories (a) KEEP and (b) ARCHIVE handled in P01a §8 Archived (`_archive/tests/`).

### Modified
- `~120 console.* files` → P01a (now enforced via ESLint rule)
- raw `fetch()` to paid providers → P01a (refactored to `paidCall<T>()`)
- `next.config.js` → P01a

**Result: PASS.** Every original path is routed; every decision-driven new file is in the right phase's §8.

---

## Step 5 — SQL artifact coverage

| SQL artifact (from original §10) | Routed to | Decision-driven change |
|---|---|---|
| `CREATE TABLE account_deletions` | P01b §10 | — |
| `CREATE INDEX account_deletions_deleted_at_idx` | P01b §10 | — |
| `ALTER TABLE account_deletions ENABLE ROW LEVEL SECURITY` | P01b §10 | — |
| `CREATE TABLE feature_flags` | P01a §10 step 5 | — |
| `ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY` | P01a §10 step 5 | — |
| `CREATE POLICY feature_flags_read_all` | P01a §10 step 5 | renamed `p1_feature_flags_read_all` (Decision 10) |
| `CREATE TABLE IF NOT EXISTS render_cost_log` | P01a §10 step 4 | `category text NOT NULL` (Decision 3 / D-022) ✓ |
| `CREATE INDEX IF NOT EXISTS render_cost_log_user_idx` | P01a §10 step 4 | — |
| `CREATE INDEX IF NOT EXISTS render_cost_log_render_idx` | P01a §10 step 4 | — |
| `CREATE INDEX IF NOT EXISTS render_cost_log_category_idx` | P01a §10 step 4 | — |
| `CREATE INDEX IF NOT EXISTS render_cost_log_created_idx` | P01a §10 step 4 | — |
| `ALTER TABLE render_cost_log ENABLE ROW LEVEL SECURITY` | P01a §10 step 4 | — |
| `CREATE POLICY render_cost_log_self_read` | P01a §10 step 4 | renamed `p1_render_cost_log_self_read` (Decision 10) |
| `ALTER TABLE rooms DROP COLUMN ...` (28 cols) | P01a §10 step 2 | — |
| `DROP TABLE IF EXISTS splat_renders, marble_jobs, ...` (17 tables) | P01a §10 step 3 | gated by Decision 5 cron audit |
| `ALTER TABLE users ENABLE ROW LEVEL SECURITY` | P01a §10 step 6 | — |
| `ALTER TABLE rooms ENABLE ROW LEVEL SECURITY` | P01a §10 step 6 | — |
| `CREATE POLICY users_self_read` | P01a §10 step 6 | renamed `p1_users_self_read` (Decision 10) |
| `CREATE POLICY rooms_self_all` | P01a §10 step 6 | renamed `p1_rooms_self_all` (Decision 10) |
| `ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY` | P01a §10 step 6 | — |
| `INSERT INTO storage.buckets quiz-images` | P01a §10 step 6 | — |
| `INSERT INTO storage.buckets room-uploads` | P01a §10 step 6 | — |
| `CREATE POLICY "quiz-images public read"` | P01a §10 step 6 | renamed `p1_quiz_images_public_read` (Decision 10) |
| `CREATE POLICY "room-uploads user insert"` | P01a §10 step 6 | renamed `p1_room_uploads_user_insert` (Decision 10) |
| `CREATE POLICY "room-uploads user read"` | P01a §10 step 6 | renamed `p1_room_uploads_user_read` (Decision 10) |
| (new) `DROP INDEX IF EXISTS rooms_splat_url_idx` (12 indexes) | P01a §10 step 1 | enumerated as a step per Decision 12 ordering |
| (new) `pg_dump --schema-only` snapshot | P01a §10 step 0 | Decision 12 |

**Decision 3 verification:** P01a §10 step 4 declares `category text NOT NULL`. ✓
**Decision 10 verification:** every `CREATE POLICY` in P01a §10 begins with `p1_`. Confirmed by visual inspection. ✓

**Result: PASS.**

---

## Step 6 — API route coverage

| Route | Original §9 | P01a §9 | P01b §9 |
|---|---|---|---|
| `POST /api/auth/signup` | ✓ | — | ✓ |
| `POST /api/auth/signin` | ✓ | — | ✓ |
| `POST /api/auth/forgot-password` | ✓ | — | ✓ |
| `POST /api/auth/reset-password` | ✓ | — | ✓ |
| `POST /api/auth/delete-account` | ✓ | — | ✓ |
| `POST /api/users/export` | ✓ | — | ✓ |
| `GET /api/cron/cost-monitor` (internal, new) | — | ✓ | — |

P01a §9 explicitly states: "No public API contracts in P01a (no user-facing endpoints)." ✓

**Result: PASS.** Every original auth route lands in P01b. P01a only has the internal cron route.

---

## Step 7 — Audit row coverage (§4.3)

| Audit row | Original | P01a §4.3 | P01b §4.3 |
|---|---|---|---|
| STAGE5_AUDIT | ✓ | ✓ | — |
| AUTH_AUDIT | ✓ | — | ✓ |
| SCHEMA_AUDIT | ✓ | ✓ | — |
| SUPABASE_AUDIT | ✓ | ✓ | — |
| TIMEOUT_AUDIT | ✓ | ✓ | — |
| TELEMETRY_AUDIT | ✓ | ✓ | — |
| LIB_AUDIT | ✓ | ✓ | — |
| COMPONENT_AUDIT | ✓ | ✓ | — |
| MODAL_AUDIT | ✓ | ✓ | — |
| INFRA_AUDIT | ✓ (combined) | ✓ (Cloudflare half) | ✓ (DNS half) |

The original INFRA_AUDIT row carries two facts: "Cloudflare Images not wired" (M3 = P01a) and "DNS for Resend not set" (M2 = P01b). The split routes each fact to its phase. Acceptable per Section 3 of the split prompt.

**Result: PASS.**

---

## Step 8 — Decision application audit

For each decision in Section 2 of the split prompt, the table records where it landed.

| Decision | P01a applied? | P01b applied? | Section refs |
|---|---|---|---|
| 1 — Two-phase split | ✓ (whole doc) | ✓ (whole doc) | both `## Phase identity`; PHASE_STATUS.md |
| 2 — iOS unprotected | ✓ | ✓ | both §4.4 (third bullet, bold) |
| 3 — Cost log category is text + D-022 | ✓ | ✓ (D-022 in §5) | P01a §10 step 4 (`category text NOT NULL`); P01a §5 D-022; P01b §5 D-022 |
| 4 — Test deletion selective | ✓ | n/a | P01a §3 G6; P01a §6 M1 (KEEP/ARCHIVE/DELETE); P01a §8 Deleted (narrowed) |
| 5 — Cron table dependency audit | ✓ | n/a | P01a §6 M1 (gating note); P01a §10 step 3 (header); P01a §13 verifier check |
| 6 — RLS isolation per-table | ✓ | n/a | P01a §6 M1 (test description); P01a §13 verifier check ("Test case count >= count of kept user-scoped tables") |
| 7 — Structural enforcement (ESLint + paidCall) | ✓ | inherits enforcement | P01a §6 M3 (both ESLint rules + paidCall wrapper); P01a §8 Created (4 new files); P01a §13 verifier checks; P01a §14 adversarial probes; P01b §14 reuses inherited probes |
| 8 — Dotted failure_category namespace | ✓ (cost.*, infra.*, subagent.*) | ✓ (full auth.*) | P01a §11; P01b §11; P01a §5 D-012 annotation |
| 9 — Subagent runtime contract | ✓ | inherits | P01a §6 M0 (full table); P01a §8 Created (sync script + .claude/agents files); P01a §13 verifier check |
| 10 — Additive RLS p1_ prefix | ✓ | n/a (P01b only adds account_deletions which has no policies) | P01a §10 step 6 (every CREATE POLICY); P01a §13 verifier check; P01a §14 adversarial probe |
| 11 — _archive/ uses git mv + READMEs committed | ✓ | n/a | P01a §6 M1 (paragraph on `git mv` + committed); P01a §8 Created (5 README.md files) |
| 12 — Migration ordering locked | ✓ | n/a | P01a §6 M1 (ordering paragraph); P01a §10 (Step 0..6 ordered) |
| 13 — redactLogPayload field expansion | ✓ | inherits | P01a §6 M3 (full strip list including userId hashed/sessionId/ipAddress/userAgent truncated/authToken/magicLinkToken) |
| 14 — Subagent operating cost line item | ✓ | n/a | P01a §12 (added `Subagent operating costs (ongoing)` row) |
| 15 — Modal CLI auth as P01a prereq | ✓ | n/a | P01a §2 External dependency checks (bold line); P01a §2 Halt conditions |
| 16 — Supabase publishable/secret key format | ✓ | ✓ | both §4.4 (first bullet) |

**Result: PASS.** Every decision applied in the appropriate doc(s) at the cited section.

---

## Step 9 — Final coverage summary

- Original lines: 811
- P01a lines: 712
- P01b lines: 614
- Combined new lines (712 + 614 = 1326) > 811 because:
  - Both docs duplicate §1 session loop, §2 prereq, §4.1, §4.4, §5 (D-001..D-022), §7 out-of-scope template, §17 remediation, §19 rollback structure
  - Decision-driven additions (subagent runtime contract table, ESLint rules description, migration ordering, isolation test rule, cron audit, paidCall wrapper, decision callouts) added net new prose
- **Lines unaccounted for: 0.** Every original heading is mapped (Step 1); every D-NNN, G-NNN, file path, SQL artifact, API route, audit row is routed (Steps 2–7); every decision in Section 2 of the split prompt is applied (Step 8).

## Halt conditions tripped

None.

---

## Verification: PASSED
