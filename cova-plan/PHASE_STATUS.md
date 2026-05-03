# PHASE_STATUS.md — Cova V1 Single Source of Truth

> **Read this file at the start of every cloud chat and every Claude Code
> session.** Update at the close of every phase. If anything in this doc
> contradicts code, treat the code as authoritative and open a drift doc at
> `cova-plan/drift/P{N}-detected.md`.

**Last updated:** 2026-05-03 (P01b CLOSED — 18 PASS / 7 PASS-CODE / 1 PARTIAL / 2 PENDING-VERIFIER / 0 FAIL across §13; verifier sessions 1+2+3 + 2 remediation rounds; deferrals tracked via back-bugs)
**Current phase pointer:** Phase 2 — Quiz + Capture wiring (NOT STARTED — pre-milestone conversation needed before planner fires)
**Next phase to plan:** P2 (Quiz + Capture)
**Workflow:** Cloud chat → Planner (Claude Code + MCPs) → review → Executor (fresh Claude Code, multi-session) → Verifier Session 1 → Verifier Session 2 → Manual gate → Close

---

## 1. Status legend

Every phase carries exactly one of these states. Definitions below are normative.

| State | Meaning | Allowed transitions |
|---|---|---|
| **NOT STARTED** | Phase doc may exist; no planner has been invoked yet. | → PLANNING |
| **PLANNING** | Planner session is active in Claude Code; or a plan has returned to cloud chat for review. | → IN EXECUTION (after plan approval) <br> → NOT STARTED (if plan rejected and rewritten) |
| **IN EXECUTION** | Executor session(s) are firing or are paused at a handoff. | → VERIFYING (when executor closes phase) <br> → IN EXECUTION (handoff to next executor session) |
| **VERIFYING** | Verifier Session 1 or Session 2 is running, OR awaiting Session 2 fire. | → MANUAL TEST (after both sessions PASS) <br> → REMEDIATING (any FAIL or disagreement) |
| **REMEDIATING** | A failed verifier round triggered a planner→executor remediation cycle. Round budget tracked inline (max 2 before escalation). | → VERIFYING (after remediation executor closes) <br> → ESCALATED (round 3 failure) |
| **MANUAL TEST** | Verifier passed; awaiting Daksh's screenshot click-through and evidence bundle review. | → CLOSED (manual evidence accepted) <br> → REMEDIATING (manual gate finds an issue) |
| **CLOSED** | Phase fully closed. Closing checklist run. PHASE_STATUS, OPEN_DECISIONS, EMPIRICAL_FINDINGS updated. Manual evidence in `cova-plan/manual-evidence/P{N}/`. | terminal |
| **ESCALATED** | Round-3 failure. Issue documented in `cova-plan/escalations/P{N}-{topic}.md`. Cloud chat owns next move. | → REMEDIATING (after escalation resolved) |
| **BLOCKED** | A dependency is missing (env var, external account approval, founder decision). State the blocker name + owner in the table below. | → PLANNING / IN EXECUTION (when blocker clears) |

---

## 2. Workflow loop (cross-cutting)

The same loop runs every phase. Detailed in `VERIFIER_PROTOCOL.md` and
`PLANNER_PROTOCOL.md`.

```
                  ┌─── cloud chat reviews phase doc ───┐
                  │                                     │
                  ▼                                     │
            generates planner prompt                    │
                  │                                     │
                  ▼                                     │
        Planner (Claude Code + MCPs) ────────────► drift detected?
                  │                                       │ yes
                  │                                       ▼
                  │                              cova-plan/drift/P{N}-detected.md
                  │                                       │
                  ▼                                       └─→ halt, escalate
        plan returns to cloud chat
                  │
                  ▼
              approved?
              │      │
            yes      no → re-plan
              │
              ▼
        Executor (fresh Claude Code session)
              │
              ▼
        handoff at 93-94% context if needed
              │
              ▼
        Executor closes phase
              │
              ▼
        Verifier Session 1 (fresh, no executor context)
        - reads spec criteria
        - queries Supabase MCP for live state
        - reviews code by criterion
        - SELF-HEALS detected issues in-session
              │
              ▼
        Verifier Session 2 (fresh, no Session 1 context)
        - reads now-current code
        - runs same review independently
        - flags disagreements (does NOT auto-resolve)
              │
              ▼
        disagreements?
        │            │
        no          yes → cloud chat reviews
        │                       │
        │            disagreement resolved → re-verify
        ▼
        Manual gate: Daksh runs click-script, reviews evidence bundle
              │
              ▼
        Closing checklist:
          - PHASE_STATUS.md updated
          - OPEN_DECISIONS.md updated
          - EMPIRICAL_FINDINGS.md updated
          - manual-evidence/P{N}/ archived
          - feature flags flipped per phase plan
          - rollback plan filed
              │
              ▼
            CLOSED
```

**Round budget:** at most 2 remediation rounds per phase. Round 3 = automatic
escalation to `cova-plan/escalations/P{N}-{topic}.md`. Cloud chat owns the
escalation; the planner does not auto-attempt round 3.

**Back-bugs:** if a verifier or executor in phase **N** discovers a defect
introduced by an earlier phase **M < N**, do **not** fix in the current
phase. Write to `cova-plan/back-bugs/P{M}-{slug}.md` with: file path, line
number, repro, blast radius, suggested fix. The bug is queued; cloud chat
decides whether to slot a remediation phase or absorb it into the next
relevant scope.

---

## 3. Phase 0 — Audits & Pre-build (parallel external work)

**Status:** IN PROGRESS
**Dependencies:** none
**Owner:** Daksh (external account work) + autonomous agents (audits)

### 3.1 What is done

| Item | Evidence | Status |
|---|---|---|
| 21 audit reports landed in `docs/audit/` | `AUTH_AUDIT.md`, `BILLING_AUDIT.md`, `CODEBASE_AUDIT.md`, `ERRORS_AUDIT.md`, `FRONTEND_AUDIT.md`, `IMAGEGEN_AUDIT.md`, `QUIZ_AUDIT.md`, `QUIZ_IMAGES_AUDIT.md`, `SCHEMA_AUDIT.md`, `STORAGE_AUDIT.md`, `director.md`, `director-quick-check.md`, `loras.md`, `lora-backup-report.md`, `lora-quality-eval.md`, `lora-spot-test.md`, `modal.md`, `pgvector.md`, `prompt-surfaces.md`, `supabase.md`, `tests.md` | DONE |
| Catalog audit (12 styles × 6 rooms; ~1,492 images classified) | `cova-plan/CATALOG_AUDIT_2026-04-30.md` | DONE — 1,428 useful, 24 cells below 6-image target |
| LoRA quality audit (10 LoRAs × 3 tests × 2 conditions = 30 pairs) | `cova-plan/LORA_AUDIT_2026-04-30.md` | DONE — 4 USE (art-deco, industrial, coastal, japandi), 6 MARGINAL, 0 REGRESSION |
| Domain registered (covainterior.com) | Namecheap DNS | DONE |
| Modal account + tokens in `.env.local` | `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET` | DONE |
| Amazon affiliate (cova03-20) active | Confirmed in `apps/web/.env.local` | DONE |
| CJ Affiliate W-9 submitted | external paperwork | DONE |
| Anthropic + fal.ai keys live | `ANTHROPIC_API_KEY`, `FAL_KEY` set; verified by audit script runs | DONE |
| Repository structure stable | `apps/web/`, `modal_pipeline/`, `supabase/` per `CODEBASE_AUDIT.md` | DONE |

### 3.2 What is open (must clear before P1 closes — NOT before P1 starts)

| Item | Owner | Notes |
|---|---|---|
| ImprovMX MX records propagation | Daksh | needed for `hi@covainterior.com` sender; resolves into Resend setup in P1 |
| Resend domain verification (SPF/DKIM/DMARC) for `covainterior.com` | Daksh | flag in P01 known gaps; planner must verify before sending verification emails |
| Termly free-tier templated legal pages output | Daksh | decision locked (Termly free); templates not yet generated |
| Impact affiliate domain verification | Daksh | external — tracked in OPEN_DECISIONS, not a P1 blocker |
| Target affiliate application | Daksh | external — tracked, not a P1 blocker |
| Article affiliate application | Daksh | external — tracked, not a P1 blocker |
| Marble API access (worldlabs.ai) | Daksh | not P1; gated to whatever phase reintroduces 3D if any |
| Sentry DSN confirmation in env | Daksh | DSN is set in `.env.local` per `ERRORS_AUDIT.md` §1.1; verify org/project per audit |
| PostHog EU instance project key | Daksh | `NEXT_PUBLIC_POSTHOG_KEY` set; confirm EU host per locked decision |
| Stripe products + prices created in dashboard | Daksh | needed by Phase 5 (Billing); not a P1 blocker |

### 3.3 Phase 0 close criteria

Phase 0 stays IN PROGRESS while external Daksh-side work completes. It does
**not** block planning or executing P1; the items in §3.2 are slotted into
the phases that consume them. P0 transitions to CLOSED only after every
Daksh-side prerequisite has been confirmed (most close inside P1 itself).

---

## 4. Phases 1 – 12

| Phase | Name | Status | Blocker / Dep | Doc |
|---|---|---|---|---|
| **P1A** | Demolition + Ops Hardening — schema demolition, subagents, Sentry, redactor, timeouts, EXIF strip, render_cost_log, failure_category namespace, PostHog, Cloudflare wiring, feature_flags table | **CLOSED** (2026-05-02; final commit `0437fc9`; 20 PASS / 3 acknowledged-deferred / 0 FAIL) | — | `cova-plan/phases/P01a-demolition-ops.md`; final pre-close audit at `cova-plan/audit-reports/P01a-final-pre-close-audit.md` |
| **P1B** | Auth + Legal + Account Deletion — 10 screens (signup/signin/forgot/reset/verify-email-sent/success/invalid/account-deleted/terms/privacy), 9 auth API routes, delete-user-cascade Edge Function, GDPR export with 7-day signed URL, /terms + /privacy placeholder pages, auth feature flag rows | **CLOSED** (2026-05-03; final commit see close handoff; 18 PASS / 7 PASS-CODE / 1 PARTIAL / 2 PENDING-VERIFIER / 0 FAIL across §13; 3 verifier sessions + 2 remediation rounds; 3 launch-prep deferrals tracked via back-bugs) | — | `cova-plan/phases/P01b-auth-legal-deletion.md`; final verifier report `cova-plan/verifier-reports/P01b/session-3.md`; close handoff `cova-plan/SESSION_HANDOFFS/17-P01b-close.md` |
| **P2** | Quiz + Capture wiring (V3 fast path, swipe consumption, photo intake hardening) | NOT STARTED | depends on P1 (style_blend wiring, EXIF strip, RLS cleanup) | `cova-plan/phases/P02-quiz-capture.md` (TBD) |
| **P3** | Pipeline reliability (timeout reconciliation, failure_category, render_cost_log writers) | NOT STARTED | depends on P1 (Sentry, redactor, error categories) | `cova-plan/phases/P03-pipeline-reliability.md` (TBD) |
| **P4** | Render UI + Refinement (step-8a/b polish, before/after slider, token gating UI) | NOT STARTED | depends on P3 + P5 (token gating live) | `cova-plan/phases/P04-render-ui.md` (TBD) |
| **P5** | Billing — Stripe checkout, portal, webhook, token ledger live | NOT STARTED | depends on P1 (signup grant), and Daksh creating Stripe products | `cova-plan/phases/P05-billing.md` (TBD) |
| **P6** | Product matching hardening (Serper + Google Lens + CLIP rerank, retailer diversity) | NOT STARTED | depends on P3 (cost telemetry) | `cova-plan/phases/P06-product-matching.md` (TBD) |
| **P7** | Personalization (step-7p slot UI, art compositing pass) | NOT STARTED | depends on P2 + P3 | `cova-plan/phases/P07-personalization.md` (TBD) |
| **P8** | Dashboard + account UX (real data binding, mobile responsive, settings round-trip) | NOT STARTED | depends on P1 + P5 | `cova-plan/phases/P08-dashboard.md` (TBD) |
| **P9** | Pricing + landing + legal (Termly templates wired, /pricing, FTC disclosure) | NOT STARTED | depends on P5 + Termly templates rendered | `cova-plan/phases/P09-pricing-landing.md` (TBD) |
| **P10** | Analytics + monitoring (PostHog event taxonomy, Sentry alerts, dashboard) | NOT STARTED | depends on P1 (Sentry server wired) + P3 (failure_category) | `cova-plan/phases/P10-analytics-monitoring.md` (TBD) |
| **P11** | E2E QA + 5-user beta + bug burn-down | NOT STARTED | depends on P1–P10 | `cova-plan/phases/P11-qa-beta.md` (TBD) |
| **P12** | Production deploy + DNS + smoke + monitoring on | NOT STARTED | depends on P1–P11 | `cova-plan/phases/P12-deploy.md` (TBD) |

> **Authoring rule:** every phase doc lives in `cova-plan/phases/P{NN}-{slug}.md`
> and follows the locked template laid out by `P01-foundations.md`. Subsequent
> phases (P2–P12) are stub references at planning time and get fleshed out
> immediately before their planner fires.

---

## 5. Per-phase fields (uniform across P1–P12)

Every row in §4 expands into the structure below when a phase begins
planning. The **closing checklist** is what the manual gate verifies before
flipping a phase to CLOSED.

### 5.1 Phase identity

- Phase number, name, one-line goal
- Owner: cloud chat (planner authoring) + Daksh (manual gate)
- Workflow position: which phases must be CLOSED before this one starts

### 5.2 Pre-decisions block

A list of **D-NNN** identifiers, each a frozen decision the planner must
honor (e.g. `D-001: Auth provider = Supabase Auth`). Pre-decisions are
**embedded in the phase doc** so the planner does not need to re-derive them.
If a planner finds a missing decision, the planner halts and returns
"blocked: pre-decision needed" to cloud chat — it does not guess.

### 5.3 Scope and out-of-scope

The phase doc enumerates every file path expected to change, every schema
change, every new env var, every new dependency, every new API route. Items
that look in-scope but are deferred go in **out-of-scope** with the reason
and the future phase that owns them.

### 5.4 Closing checklist (the manual gate's bar)

Each phase defines its own. Common items:

- All scope items verified by both verifier sessions (PASS).
- Manual click-script run to completion; screenshots in `cova-plan/manual-evidence/P{N}/`.
- All new schema migrations have applied successfully and have a documented `down`.
- All new env vars added to `.env.example`.
- All known gaps from §5.6 either closed or documented as deferred.
- Feature flags flipped per the phase's flag plan (see §5.7).
- Rollback plan committed and rehearsed (when reversibility matters).
- Subagent(s) configured for the phase's domain (see §5.8).
- PHASE_STATUS.md, OPEN_DECISIONS.md, EMPIRICAL_FINDINGS.md updated.

### 5.5 Manual evidence bundle

Each phase produces a `cova-plan/manual-evidence/P{N}/` folder containing:

- click-script transcript (which steps were performed, in order)
- before/after screenshots for every UI screen the phase touched
- a smoke-test log (for backend phases: API request/response captures)
- any DB query outputs that demonstrate the fix (e.g. `SELECT count(*) FROM users WHERE token_balance != 7` returning 0)
- a `summary.md` written by Daksh: what was tested, what wasn't, anything still uneasy

### 5.6 Known gaps

Every phase doc carries a "known gaps to resolve in cloud chat before planner
fires" block. The planner refuses to plan if any unresolved blocker is
listed. See `P01-foundations.md` §"Known gaps" for the canonical example.

### 5.7 Feature flags

Each phase declares which flags it gates new behavior behind, and which
phase flips them on. P1 builds the **infrastructure** (`feature_flags`
table + typed reader); P5+ consumes it. Flag names follow
`{phase}__{behavior}` snake-case convention, e.g. `p5__stripe_checkout_live`.

### 5.8 Subagents in scope

Cova V1 uses 4 subagents wired in M0:

- `verifier` — fresh-context verifier (the protocol in `VERIFIER_PROTOCOL.md`)
- `schema-reviewer` — RLS + migration adversary
- `frontend-visionary` — design-system + a11y reviewer
- `cost-monitor` — ensures every paid call writes to `render_cost_log`

Prompts at `cova-plan/subagents/{name}.md`; CLI scripts at
`scripts/agents/{name}.ts`. A phase doc may add temporary subagents (and
must then list them with prompts in the phase doc itself).

### 5.9 Rollback plan

Every phase that ships schema changes, mutates production state, or flips a
feature flag must include a **rollback plan**: SQL down migration, flag
reset command, code revert SHA, and the smoke check that confirms rollback
succeeded.

---

## 6. Cross-phase concerns

### 6.1 Single source of truth

| Domain | File | Owner |
|---|---|---|
| Phase status | `cova-plan/PHASE_STATUS.md` (this file) | every phase close |
| Decisions | `cova-plan/OPEN_DECISIONS.md` (TBD; create at P1 kickoff if not present) | every phase that locks a new D-NNN |
| Empirical findings | `cova-plan/EMPIRICAL_FINDINGS.md` (TBD; create at P1 kickoff if not present) | every phase that runs a benchmark or audit |
| Verifier protocol | `cova-plan/VERIFIER_PROTOCOL.md` | meta — only when the protocol itself changes |
| Planner protocol | `cova-plan/PLANNER_PROTOCOL.md` | meta — only when the protocol itself changes |
| Per-phase doc | `cova-plan/phases/P{NN}-{slug}.md` | the phase author (cloud chat) |
| Schema reality | live Supabase, queried via Supabase MCP | always read live; no caching |
| Code reality | the repo at HEAD on `main` | always read at the time of session |

### 6.2 Drift detection at session start

Every planner session begins by reading PHASE_STATUS.md, then queries
Supabase MCP and greps the working tree for the claims in this file. If a
claim is contradicted, the planner halts, writes
`cova-plan/drift/P{N}-detected.md`, and returns to cloud chat. See
`PLANNER_PROTOCOL.md` §"Drift detection".

### 6.3 Escalation paths

- **Round 3 verifier failure:** `cova-plan/escalations/P{N}-{topic}.md`.
- **Back-bugs from earlier phases:** `cova-plan/back-bugs/P{M}-{slug}.md`.
- **Drift between PHASE_STATUS and reality:** `cova-plan/drift/P{N}-detected.md`.
- **Manual gate finds an issue not caught by verifier:** open a back-bug for
  the current phase, flip to REMEDIATING, planner re-fires.

### 6.4 Session handoffs

Executor sessions hand off when context utilization reaches 93–94%.
Handoffs land at `cova-plan/SESSION_HANDOFFS/{NN}-{slug}.md` and contain:

- last-completed task ID + executor's view of remaining work
- the exact file/line cursor to resume from
- any environment side-effects (running background processes, mounted
  worktrees, partial commits, dirty schema state)
- the next executor session's first instruction (the planner's prompt
  truncated to the resume point)

---

## 7. Initial baseline (2026-05-02)

| Phase | Status | Notes |
|---|---|---|
| P0 | IN PROGRESS | external Daksh-side work continues in parallel; non-blocking for P1 |
| P1A | **CLOSED** (2026-05-02; final commit `0437fc9`) | 20 of 23 §13 criteria PASS, 3 PARTIAL (acknowledged-deferred via documented back-bugs), 0 FAIL. M2 tightened from 28→17 truly-dead rooms columns (11 deferred to P02/P03). 4 V8-stage Modal apps stopped. ESLint `no-direct-paid-fetch` at error (0 violations); `no-unsafe-console` at warn (199 residuals tracked). Sentry sample rates locked. 4 subagents shipped. See `cova-plan/audit-reports/P01a-final-pre-close-audit.md` |
| P1B | **CLOSED** (2026-05-03) | 10 screens shipped, 9 auth API routes live, account_deletions table + RLS live, GDPR export with 7-day signed URL via service-role storage download, Resend wrapper present but gated behind `EMAIL_SENDING_ENABLED=false`, Termly /terms + /privacy ship as placeholder htmlContent. Verifier sessions 1+2+3 + 2 remediation rounds. Final §13 tally: 18 PASS / 7 PASS-CODE / 1 PARTIAL (cron boot-halt — pragmatic accept, P01a precedent) / 2 PENDING-VERIFIER (constant-time forgot-password timing, GDPR queued path — both require deploy + fixtures, roll forward to manual gate). Launch-prep deferrals tracked: P01b-launch-prep-email-deferred (Resend), P01b-launch-prep-termly-deferred (legal content), P01b-prep-globals-css-font-bug. Apple OAuth deferred (G8a + G8b not confirmed) — `auth_apple_oauth=false@0%`. |
| P2 | NOT STARTED | doc not authored |
| P3 | NOT STARTED | doc not authored |
| P4 | NOT STARTED | doc not authored |
| P5 | NOT STARTED | doc not authored |
| P6 | NOT STARTED | doc not authored |
| P7 | NOT STARTED | doc not authored |
| P8 | NOT STARTED | doc not authored |
| P9 | NOT STARTED | doc not authored |
| P10 | NOT STARTED | doc not authored |
| P11 | NOT STARTED | doc not authored |
| P12 | NOT STARTED | doc not authored |

The `cova-plan/SESSION_HANDOFFS/` chain begins at `00-baseline.md`
(intentionally empty — see `SESSION_HANDOFFS/01-phase-doc-bootstrap.md` for
the bootstrap that produced this file). Future handoffs are sequentially
numbered.

---

## 8. Update protocol for this file

When a phase transitions state, update three things:

1. **§4 phase row** — flip the Status column.
2. **§7 baseline table** — keep a cumulative log; do not delete prior rows.
3. **Top-of-file metadata** — bump `Last updated`, set the
   `Current phase pointer`.

Then commit the change with a message of the form:

```
chore(cova-plan): P{N} status → {NEW STATE}
```

If multiple phases moved in one session (e.g. P1 closed and P2 entered
PLANNING), keep them in a single commit and list each in the body.
