# PLANNER_PROTOCOL.md — Planner Session Protocol

> **Purpose:** Turn a phase doc into a directly-firable executor prompt.
> The planner does not implement; it researches against current docs,
> verifies that PHASE_STATUS.md still matches reality, surfaces unresolved
> pre-decisions, and writes an executor brief precise enough that the
> executor never has to make architectural choices.

**Version:** 1.0 (2026-05-02)
**Applies to:** every phase P1–P12 (and remediation rounds within them).
**Companion files:** `VERIFIER_PROTOCOL.md`, `PHASE_STATUS.md`, every
`cova-plan/phases/P{NN}-*.md`.

---

## 1. Mental model

A planner session is **one fresh Claude Code session** with three MCP
servers connected and the repository checked out at HEAD on `main`.

| Server | Used for |
|---|---|
| **Supabase MCP** | Live schema, table contents, RLS policy state, migration history. The single source of truth for "what does the DB actually look like right now". |
| **Context7 MCP** | Current API docs for libraries we depend on: Next.js, Supabase JS client, fal.ai client, Stripe SDK, Sentry, PostHog, Resend, Anthropic SDK. Required because training-cutoff knowledge is stale and library breaking changes happen between Cova phases. |
| **EXA MCP** | Technique research and adversarial searches: "how do other Next.js 14 + Supabase apps handle Turnstile + signup rate limiting?", "what are common pitfalls of zxcvbn at password creation time?". |

Web search is allowed for time-sensitive lookups (current Stripe pricing,
current Resend deliverability practices) but is **not a substitute for
Context7 on official library docs**. Context7 is preferred whenever the
question is "what does library X do?".

The planner never executes the plan. Its job is to deliver an executor
prompt; the executor fires next, in a fresh session, with the planner's
output as input.

---

## 2. Lifecycle of a planner session

```
1. Cloud chat selects a phase doc (P{N}) and writes a planner prompt.
2. Planner session opens.
3. Planner reads PHASE_STATUS.md.
4. Planner runs DRIFT DETECTION (§3).
5. Planner reads the phase doc fully, including its Pre-decisions block.
6. Planner identifies unresolved pre-decisions; if any → halt + return
   to cloud chat with "blocked: pre-decision needed".
7. Planner conducts RESEARCH (§4) per the phase doc's "Research required"
   block.
8. Planner authors EXECUTOR PROMPT (§5).
9. Planner returns the prompt to cloud chat.
10. Cloud chat reviews. Approves or sends back. (Approval may be
    conditional: "approve, but tweak the timeout to 320s before firing".)
11. Cloud chat fires the executor in a fresh Claude Code session.
```

The planner **does not write production code**. If the planner finds that
researching a question requires running code, it writes a tiny scratch
script, runs it via Bash, deletes it. Production code is the executor's
job.

---

## 3. Drift detection (mandatory at session start)

Every planner session begins with the same protocol — *before* it starts
researching the phase.

### 3.1 What "drift" means

PHASE_STATUS.md makes claims about the world: "P1 NOT STARTED, schema
clean, no dead columns yet". Reality may have shifted since the last
PHASE_STATUS update. Drift detection catches this.

### 3.2 The check

The planner runs three queries and confirms each matches PHASE_STATUS.md:

1. **Supabase MCP — phase-related schema state.**

   For each phase whose status in PHASE_STATUS.md is `CLOSED`, query the
   tables/columns/policies that phase was supposed to add or remove.
   Example for P1 (when verifying P2 plans):

   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'rooms' AND column_name = 'personalization_context';
   -- expected: 0 rows (P1 dropped it)

   SELECT relrowsecurity FROM pg_class WHERE relname = 'swipe_history';
   -- expected: relrowsecurity = true (P1 enabled RLS)
   ```

2. **File grep — code claims.**

   ```
   rg -n "captureError\(" apps/web/lib apps/web/app  # P1 wired captureError
   rg -n "instrumentation.ts" apps/web                # P1 created it
   rg -n "from '@/lib/auth/legacy'" apps/web          # P1 deleted legacy auth
   ```

   The phase doc enumerates the file-level claims; the planner confirms
   each.

3. **PHASE_STATUS.md vs git log.**

   ```
   git log --oneline --grep "phase-{N}: closed" main
   ```

   For every phase listed `CLOSED`, a closing commit should exist.

### 3.3 Drift outcomes

- **All claims match** → planner proceeds.
- **One or more claims mismatch** → planner halts, writes
  `cova-plan/drift/P{N}-detected.md`:

  ```
  # Drift detected during planner session for P{N}

  Date: ...
  PHASE_STATUS.md claim: ...
  Reality observed: ...
  Likely cause: ...
  Recommended action: ...
  ```

  The planner returns "drift detected — see {file}" to cloud chat. No
  research, no plan. Cloud chat owns the next move (could be: amend
  PHASE_STATUS.md, file a back-bug for the offending phase, run a
  remediation phase, or decide the drift is benign).

### 3.4 Why this matters

Cova's phase chain has multiple feedback loops (the catalog audit feeds
P6 + P7; the LoRA audit feeds P3 + P7; the schema audit feeds P1 + P2).
Without drift detection, a planner can confidently plan against a world
that no longer exists. The cost of catching drift early is a few SQL
queries; the cost of catching it late is a phase that fails verification
and burns remediation rounds.

---

## 4. Research

Every phase doc carries a "Research required" block listing topics the
planner must cover before authoring the prompt. The planner is not free
to skip topics ("I already know how OAuth works") — the explicit
research is the audit trail that the executor was given current
information.

### 4.1 Required research surfaces

Per the locked decisions for V1, the planner uses each surface for the
class of question it was set up for:

| Surface | Use for | Do NOT use for |
|---|---|---|
| Context7 MCP | Current API surface of any library/SDK we depend on. Every API method the executor will call should have its current signature confirmed. | Architectural advice ("should I use X or Y?"). |
| EXA MCP | Adversarial / technique searches: production patterns, known pitfalls, security guidance. | Library API specifics. |
| Web search | Time-sensitive: pricing, regulatory changes, recent breaking changes flagged in CHANGELOGs. | Library docs (use Context7). Architectural decisions (use EXA + cloud chat). |
| Supabase MCP | Live DB / schema / migration state. | Static knowledge (use audits + spec). |

### 4.2 Research output format

The planner records research findings in the executor prompt, **inline
where each finding is consumed**. Example:

> #### Step 3: wire signup rate limiter
>
> Library: `@upstash/ratelimit` v0.7.0 (confirmed via Context7 2026-05-02).
> The `Ratelimit.slidingWindow(3, "1h")` constructor returns a limiter
> that allows 3 requests per IP per hour. **Note from Context7 docs:**
> the IP must be passed as a **string**, not a `Headers`/`URL` object;
> common bug is passing `req.headers.get("x-forwarded-for")` raw, which
> may include multiple IPs comma-separated.
>
> Pattern (verified against Upstash docs 2026-05-02):
>
> ```ts
> const ip = (req.headers.get("x-forwarded-for") ?? "127.0.0.1")
>   .split(",")[0].trim();
> const { success, remaining } = await ratelimit.limit(ip);
> ```
>
> Failure handling: on `success === false`, return 429 with body
> `{error: "rate_limited", retry_after_seconds: ...}` (see §"Failure
> handling").

The executor reads "verified against Upstash docs 2026-05-02" and trusts
that pattern. If the executor's later session hits a behavior that
contradicts the planner's quoted snippet, the executor halts and asks
cloud chat (it does not silently choose a different pattern).

### 4.3 Versions matter

The planner pins **exact dependency versions** in the executor prompt
because npm packages drift. Example:

> Add to `apps/web/package.json`:
> ```
> "@upstash/ratelimit": "0.7.0",
> "@upstash/redis": "1.34.0",
> ```
> (Confirmed available 2026-05-02 via npm registry; no breaking changes
> from prior 0.6.x for the API methods we use, per Upstash CHANGELOG.)

### 4.4 What to research per V1 phase (canonical list)

Every phase doc lists its own research topics. Common ones:

- **P1 Foundations:** Supabase Auth current API (Context7); Resend
  domain verification flow + transactional templates (Context7 + web);
  Cloudflare Turnstile invisible mode integration (Context7); zxcvbn
  current API + maintainership (web — package recently changed hands);
  Sentry Next.js 14 instrumentation hook (Context7); PostHog EU host
  configuration (Context7); Termly free-tier templating output format
  (web).

- **P2 Quiz + Capture:** EXIF stripping with Sharp current API
  (Context7); Anthropic Vision image-size limits (Context7).

- **P3 Pipeline reliability:** Vercel `maxDuration` current cap and
  whether 290s is still ceiling (web — Vercel pricing pages); fal.ai
  client timeout best practice (Context7).

- **P5 Billing:** Stripe webhook event names current set (Context7);
  Stripe `events` table schema for idempotency (web + Context7);
  Subscription proration policy (web — Stripe docs); Account-link
  for marketplace? (No, Cova is not a marketplace.)

- **P10 Analytics:** PostHog event taxonomy best practices (EXA); Sentry
  alert rule syntax (Context7); Vercel Analytics overlap (web).

The planner enumerates phase-specific topics in the executor prompt and
quotes findings as in §4.2.

### 4.5 Research that turns up a blocker

If research surfaces a blocker — e.g. "Stripe deprecated the
`charge.succeeded` event Cova plans to listen for in May 2026" — the
planner halts research, writes a one-line note to cloud chat:
"blocker: Stripe `charge.succeeded` deprecated; pre-decision needed
on whether to listen to `payment_intent.succeeded` instead", and stops.
Cloud chat resolves and re-fires.

---

## 5. Pre-decisions block

Every phase doc opens with a "Pre-decisions" section listing **D-NNN**
identifiers that must be resolved before planning. The planner reads this
block first.

### 5.1 Format of a pre-decision

```
### D-014: Email transactional sender

Locked: 2026-04-30 (cloud chat conversation 2026-04-30/11:42)
Decision: Resend, hi@covainterior.com
Rationale: Transactional volume well under Resend's 100/day free tier;
  domain (covainterior.com) already on Cloudflare; SPF/DKIM/DMARC setup
  is mechanical. Postmark and Mailgun considered; Resend wins on DX +
  Next.js docs.
Implications:
- Adds RESEND_API_KEY to env
- Requires hi@covainterior.com mailbox on covainterior.com
- DNS SPF/DKIM/DMARC records on covainterior.com
- Resend domain verification status must be "verified" before sending
```

### 5.2 What "unresolved" means

A pre-decision is unresolved if any of:

- The Decision line is empty or "TBD".
- The Implications list mentions an external dependency the planner can
  see is not satisfied (e.g. "DNS records added" but Daksh hasn't done
  it).
- Two pre-decisions contradict each other.
- The decision references a tool/library/service that research surfaces
  is no longer current.

### 5.3 Halt protocol on unresolved pre-decisions

The planner does not guess at unresolved pre-decisions. It returns to
cloud chat:

```
## Planner halt — unresolved pre-decisions for P{N}

Phase: {N} — {name}

Unresolved:
- D-014: rationale present but Resend domain verification status is
  "pending" (queried via Resend API). Cannot plan signup verification
  emails until verification completes.
- D-022: contradicts D-018. D-018 says "rate-limit by IP only"; D-022
  says "rate-limit by IP + user_agent". Pick one.

Proposed resolutions: ...

Awaiting cloud chat response.
```

Cloud chat resolves and re-fires. The planner does not start research or
write a plan against an unresolved decision set.

---

## 6. Executor prompt — output format

The planner's primary deliverable is a single executor prompt, ready to
paste into a fresh Claude Code session. The prompt's structure is fixed
across phases. Each section is required (or marked "(none for this
phase)").

### 6.1 Structure

```
# Phase {N} — {name}

You are an executor session. Read PHASE_STATUS.md first to confirm phase
state is IN EXECUTION. If not, halt.

## Pre-decisions in force (do not deviate)

D-014: {one-liner}
D-022: {one-liner}
... (every D-NNN cited by the phase doc)

## Scope (every file you may touch)

apps/web/app/api/auth/signup/route.ts            (create)
apps/web/lib/auth/post-signup.ts                 (create)
apps/web/lib/rate-limit/upstash.ts               (create)
apps/web/middleware.ts                           (edit; only the auth-callback branch)
apps/web/.env.example                            (edit; add 4 keys, see §"Env vars")
supabase/migrations/20260503000000_signup_grant.sql (create)
supabase/migrations/20260503000001_signup_grant_down.sql (create; rollback)

You may NOT touch:
apps/web/app/dashboard/**
apps/web/lib/ai/**
modal_pipeline/**
supabase/functions/**

## Out of scope (do not implement, even if "easy")

- Stripe checkout — P5 owns
- Forgot-password UI — phase 1B sub-task §X (different executor session)
- ...

## Research findings

(Inlined throughout the steps below. Highlights:)

- Supabase Auth: signUp with `options.emailRedirectTo: '/auth/callback'`
  is current as of @supabase/ssr 0.10.0; no breaking change. Confirmed
  via Context7 2026-05-02.
- Cloudflare Turnstile: invisible mode requires `data-action` attribute;
  passing the token in `cf-turnstile-response` header works server-side.
  Confirmed via Cloudflare docs (Context7) 2026-05-02.
- ...

## Step 1: {one verb-led sentence}

{exact instructions, including code patterns, file paths, line numbers
to insert at, env vars to read, error handling}

## Step 2: ...

...

## Step N: ...

## Failure handling

| Failure | HTTP status | Body | Next step |
|---|---|---|---|
| Turnstile token invalid | 400 | `{error: "challenge_failed"}` | retry user |
| Rate limit exceeded | 429 | `{error: "rate_limited", retry_after: 3600}` | UI shows banner |
| Supabase 5xx | 502 | `{error: "auth_provider_unavailable"}` | log to Sentry, retry once at 1s |

## Test commands

After every step, run:
- pnpm -C apps/web typecheck
- pnpm -C apps/web lint
- pnpm -C apps/web test -- --run lib/rate-limit
- pnpm -C apps/web test -- --run app/api/auth

## Verification handoff

When done, update PHASE_STATUS.md to VERIFYING. Do NOT run the verifier
yourself; cloud chat fires it.

## Hand-off if context tight

If you hit 93–94% context, write
cova-plan/SESSION_HANDOFFS/{nn}-P{N}-handoff.md with:
- last completed step number
- exact file/line cursor
- next step's first instruction (copied from above)
- any uncommitted changes
Then commit and stop.
```

### 6.2 What the executor prompt does NOT contain

- Architectural choices ("should this be a server action?"). The planner
  decides; the executor implements.
- Library version ranges (`^0.7.0`). Pin exact versions.
- Vague verbs ("handle the error"). Specify the error class, the HTTP
  code, the body, and the log line.
- Conditional plans ("if this approach doesn't work, try X"). The plan
  is one path. If it fails the executor halts and asks cloud chat.
- The phrase "use your judgement". The planner already used its
  judgement. The executor's judgement is for tactical questions (how to
  name a helper) not strategic ones (whether to use a helper).

### 6.3 Length

Executor prompts run long — 3-10 pages typical for V1 phases. That is
correct. A short prompt is one with hidden ambiguity. Cloud chat accepts
length in exchange for the executor never having to choose.

### 6.4 Pre-decisions echo

Every executor prompt repeats the **D-NNN identifiers in force** at the
top. This is intentional duplication: the executor session is fresh and
must not need to crawl back to the phase doc for the locked decisions.

---

## 7. Plan returns to cloud chat

The planner does **not** fire the executor. The planner posts the
executor prompt back to cloud chat (paste in the chat) and stops.

### 7.1 What cloud chat does

Reviews the prompt against:

- Phase doc's scope and out-of-scope sections (no surprise deviations).
- The Pre-decisions block (every cited D-NNN is in force).
- Research findings (do they look reasonable; are versions current).
- Failure handling (every external call has a failure path).
- Test commands (do they cover the changed surfaces).
- Length and clarity (a senior engineer could pick up the prompt and
  execute without further questions).

### 7.2 Approval / rejection

- **Approve as-is** → cloud chat opens a fresh Claude Code session and
  pastes the prompt. Executor fires.
- **Approve with edits** → cloud chat edits the prompt (small tweaks
  only) and fires. Edits are recorded in a one-line addendum at the
  bottom of the planner's deliverable: "Edit before fire: changed
  timeout from 300s to 320s per cloud chat 2026-05-03".
- **Reject** → cloud chat sends back to planner with reason. Planner
  re-runs in a fresh session with the feedback as input.

### 7.3 Pre-decision drift in cloud chat

If cloud chat realizes during review that a pre-decision is wrong, it
does **not** fix the executor prompt — it amends OPEN_DECISIONS.md
(adding a successor D-NNN that supersedes the old one), adds the
amendment to the phase doc, and re-fires the planner. Pre-decisions are
load-bearing; ad-hoc edits to executor prompts that contradict them are
a recipe for verifier failure.

---

## 8. Remediation prompts

When a phase fails verifier, the planner fires again — but the prompt is
**different in shape**.

### 8.1 Inputs

- The original phase doc.
- The verifier reports (Session 1 + Session 2 from the failed round).
- The current code state at HEAD.

### 8.2 Output

A **scoped** executor prompt that addresses only the verifier's union of
FAIL findings. It does not re-implement passing scope. Example header:

```
# Phase {N} remediation round 1

Verifier S1 FAIL: criteria 3, 7, 11
Verifier S2 FAIL: criteria 7, 11, 14
Union of fail: 3, 7, 11, 14

The fix below addresses each. All other phase scope was verified PASS
and is not in scope for this remediation.

D-NNN in force: ... (same as original)

## Step 1: close criterion 3 — {description}
...
```

### 8.3 Round counter

The planner reads the round counter from PHASE_STATUS.md. If round = 2
and the verifier still fails, escalation triggers automatically per
`VERIFIER_PROTOCOL.md` §8. The planner does not author a round-3 plan;
it returns to cloud chat with "round budget exhausted".

---

## 9. Anti-patterns (do not do)

- **Skipping drift detection.** If you skip and your plan assumes a
  CLOSED phase that isn't actually closed, the executor will execute
  against a broken substrate.
- **Over-trusting your training-data knowledge.** Every external API
  surface gets a Context7 lookup, even if you "know" the answer.
- **Researching while authoring the prompt.** Two passes: research
  first, then author. Mixing is a recipe for skipped lookups.
- **Submitting a plan with TBD values.** A plan with TBD is incomplete.
  Halt to cloud chat instead.
- **Changing scope mid-prompt.** The phase doc set the scope. If you
  realize during research that the scope is wrong, halt to cloud chat.
- **Authoring code in the planner session.** Production code goes in the
  executor's session, not the planner's. The exception: tiny scratch
  scripts to verify a research finding, deleted before plan submission.
- **Passing the verifier reports through the executor prompt verbatim.**
  Remediation prompts should *summarize* what to fix, not require the
  executor to read the verifier reports.

---

## 10. Subagent usage in planner sessions

The planner may dispatch subagents for parallel investigation —
particularly the `schema-reviewer` (RLS adversary) and `cost-monitor`
(every paid call writes to `render_cost_log`) — when the phase touches
their domains. Subagent dispatches are recorded in the planner's
deliverable: "consulted schema-reviewer subagent 2026-05-03; output
attached in cova-plan/manual-evidence/P{N}/planner-subagent-output.md".

The four standing subagents (per `cova-plan/subagents/`):

| Subagent | When to dispatch in planning | Why |
|---|---|---|
| `schema-reviewer` | Any phase touching RLS, migrations, or admin-client writes | Independent adversarial check of policy + scoping |
| `frontend-visionary` | Any phase touching UI files | Catches design-system drift (e.g. `<img>` instead of `<Image>`, font drift, breakpoint gaps) |
| `cost-monitor` | Any phase touching paid-API call sites | Confirms `logCost()` wraps every external paid call |
| `verifier` | Not in planning (post-execution) | The verifier subagent is fired by the verifier protocol, not by the planner |

Each subagent's prompt is at `cova-plan/subagents/{name}.md`. Their CLI
invocation is `bun run scripts/agents/{name}.ts` (TS scripts wired in M0
per the locked workflow). The planner dispatches in-session via the
Agent tool, with the subagent_type matching the file name.

---

## 11. Versioning + amendment

This file changes only when the planner protocol is wrong, not when a
phase wants to deviate. Phases that want to deviate must write a
one-time carve-out in their phase doc with reasoning, signed off by
Daksh.

History (append on amendment, do not delete):

- v1.0 (2026-05-02) — initial protocol bootstrap.
