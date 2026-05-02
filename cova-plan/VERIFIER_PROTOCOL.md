# VERIFIER_PROTOCOL.md — Two-Session Fresh-Context Self-Healing Verifier

> **Purpose:** Catch what the executor missed without trusting the executor's
> framing. Two independent fresh-context sessions, run sequentially, both
> blind to executor intent, both blind to each other. Disagreements escalate
> to cloud chat. The protocol is designed so a single planner-executor cycle
> cannot quietly "pass" itself.

**Version:** 1.0 (2026-05-02)
**Applies to:** every phase doc P1–P12.
**Companion files:** `PLANNER_PROTOCOL.md`, `PHASE_STATUS.md`, each phase
doc's "Layer 1 verifier source-of-truth checklist" and "Adversarial code
review checklist".

---

## 1. Why two sessions, why fresh, why self-healing

Three failure modes the protocol exists to prevent:

1. **Executor framing bias.** A verifier that reads the executor's notes,
   handoff docs, or PR description inherits its framing — "we covered the
   3 RLS holes" — and looks only at those three. Symptoms get checked, root
   cause does not.
2. **Self-confirming reasoning.** A verifier that fixes an issue then
   re-checks its own fix is biased toward declaring success: it knows
   what it intended, and so it tests for that intent rather than for the
   spec's criterion.
3. **Latent regressions during remediation.** Self-heal during verification
   is necessary (round-trip to executor on every typo wastes hours), but
   self-heal without an independent re-check turns the verifier into the
   single point of failure.

The protocol's answer: **two fresh-context sessions, sequenced, the second
blind to the first**. Session 1 is allowed to self-heal; Session 2 is not
allowed to know about those heals; if Session 2 spots something Session 1
missed or disagrees with, the disagreement is **flagged, not auto-resolved**.

---

## 2. Roles and their context boundaries

| Session | Reads | Does not read |
|---|---|---|
| **Verifier Session 1** | Phase doc (full), spec criteria, current code at HEAD, live Supabase via Supabase MCP, prior verifier logs in `cova-plan/manual-evidence/P{N}/` if any, and the **list of self-healed items it itself produces during the run** | executor's session notes, executor's handoff docs, executor's PR description, executor's git commit messages |
| **Verifier Session 2** | Phase doc (full), spec criteria, **now-current** code at HEAD (which includes Session 1's heals), live Supabase via Supabase MCP, prior verifier logs (excluding Session 1's report) | Session 1's report, Session 1's heal log, Session 1's self-graded findings, executor's notes, executor's handoff docs, executor's PR description |

> **Critical:** Session 2 is told a verifier session ran before it, but is
> **not** told which findings were already fixed. If Session 2 lands on a
> file that looks correct, that's the system working. If Session 2 lands on
> a file that looks wrong, the heal didn't take or there's a deeper issue.
> Either outcome is information.

---

## 3. Trigger and prerequisites

The verifier protocol fires when an executor declares a phase "executor-complete":

1. Executor commits its final change for the phase.
2. Executor writes a one-line note to `PHASE_STATUS.md` flipping the phase
   to `VERIFYING`.
3. Executor opens (does not merge) a PR with a body that lists the changed
   file paths only — no narrative about *why*. (Narrative would bias the
   verifier.) The PR's title is `phase-{N}: {phase name} — verifier ready`.

**Prerequisites for the verifier to fire:**

- The phase doc's Layer 1 checklist must be present and unambiguous — every
  item testable against either code or live DB state.
- Supabase MCP is connected and authorized. Confirm with a no-op query
  (e.g. `SELECT 1`).
- Context7 + EXA + web-search MCPs are connected (the verifier may need
  them to confirm an external behavior — e.g. "is this the current Stripe
  webhook event name?").
- The phase doc's adversarial review checklist exists.

If any prerequisite is missing, the verifier writes a one-line halt note
and returns to cloud chat. It does not improvise.

---

## 4. Verifier Session 1 — review + self-heal

### 4.1 Inputs

- The phase doc (full file).
- The phase doc's Layer 1 verifier checklist (criterion → expected
  observable).
- Live code at HEAD.
- Live DB schema and table-row counts via Supabase MCP.
- Permission to write code (Edit, Write tools enabled).
- Permission to run tests, lint, typecheck, smoke scripts (Bash tool enabled).

### 4.2 First action

**Read PHASE_STATUS.md.** Confirm the phase is in state `VERIFYING`. If not,
halt — verifier was fired out of band.

### 4.3 Review approach: by criterion, not by file

The phase doc's Layer 1 checklist is a list of criteria, not a list of files.
Session 1 walks the **criteria** and for each one:

1. Read the criterion ("All admin-client room writes are scoped by `user_id`").
2. Identify the *evidence locations* — files, lines, DB tables, log
   patterns — that would prove or disprove the criterion.
3. Visit each location. Observe. Record what is and isn't there.
4. Decide PASS / FAIL / PARTIAL for that criterion.
5. If FAIL or PARTIAL, **decide self-heal eligibility** (§4.5).

By-criterion review forces breadth: a file that touches three criteria gets
visited three times, each time with a different question. By-file review
loses this — the reviewer reads the file once and pattern-matches against
the closest criterion.

### 4.4 Live state via Supabase MCP

For every criterion that has a DB-observable artifact, the verifier runs a
query *during* the review, never relies on cached schema. Examples:

- "RLS enabled on `swipe_history`" → `SELECT relrowsecurity FROM pg_class WHERE relname = 'swipe_history';`
- "No rows have `users.token_balance != 7` after signup grant lands" →
  `SELECT count(*) FROM users WHERE token_balance != 7 AND created_at > NOW() - INTERVAL '7 days';`
- "Migration `20260502...` has applied" → check `supabase_migrations.schema_migrations`.
- "`render_cost_log` has at least one row per render path" → SQL count.

The query is recorded verbatim in the verifier report. If a query fails
because Supabase MCP rejects it (auth, RLS), Session 1 records the failure
and treats the criterion as PARTIAL pending escalation. Session 1 does not
elevate to `service_role` to bypass RLS — that's exactly the kind of
defense-in-depth check the verifier is supposed to enforce.

### 4.5 Self-heal eligibility

Session 1 may self-heal a defect if **all** of these are true:

- The defect is unambiguous (PASS criterion clearly violated, no spec
  ambiguity).
- The fix is **mechanical**: missing `.eq("user_id", user.id)`; missing
  redactor wiring; absent migration `down`; missing env var declaration in
  `.env.example`; missing test fixture cleanup.
- The fix is local: it changes ≤ 3 files OR ≤ 1 schema migration.
- The fix does not change **behavior** of any in-scope feature beyond
  closing the defect (no refactors, no rewriting, no "while I'm here").
- Tests pass after the fix.

**Session 1 must NOT self-heal:**

- Architecture choices (e.g. "should this be a server action or an API
  route?").
- Decisions the planner made that the verifier disagrees with — those go to
  cloud chat as disagreements.
- Anything spanning > 3 files or > 1 migration. That is a remediation
  round, not a heal.
- Bugs introduced by earlier phases (`P{M < N}`). Those go to
  `cova-plan/back-bugs/P{M}-{slug}.md`.

If Session 1 hits a defect that is ineligible for self-heal, it **records
the defect and continues review**. The defect surfaces in the report under
"FAIL — needs remediation round".

### 4.6 In-session heal log

Every self-heal is logged to a running file at
`cova-plan/manual-evidence/P{N}/verifier-session-1-heals.md`:

```
## Heal #{n}

Criterion: {criterion text from phase doc}
Defect: {what was wrong}
File(s): {paths + lines}
Diff: {1-3 line diff or "see commit {sha}"}
Test: {command run + result}
```

The log is written **as Session 1 works**, not at the end. If the session
crashes or times out, the partial log is still useful.

### 4.7 Output

Session 1 writes a final report to
`cova-plan/manual-evidence/P{N}/verifier-session-1-report.md`:

```
# Verifier Session 1 — P{N}

Date: ...
Code SHA at start: ...
Code SHA at end:   ...

## Criteria

| # | Criterion | Initial | Healed? | Final |
|---|---|---|---|---|
| 1 | ... | FAIL | yes (heal #1) | PASS |
| 2 | ... | PASS | — | PASS |
| ... |

## Self-heals

(see verifier-session-1-heals.md — N heals, X files changed, Y migrations)

## Defects requiring remediation round

| # | Criterion | Defect | Suggested fix path |
|---|---|---|---|
| ... |

## Escalations

- back-bugs filed: cova-plan/back-bugs/P{M}-{slug}.md (if any)
- drift detected: cova-plan/drift/P{N}-detected.md (if any)
- supabase MCP failures: ...

## Verdict

PASS / PASS-WITH-HEALS / FAIL (needs remediation round)
```

### 4.8 Handoff to Session 2

Session 1's report is **not** read by Session 2. The handoff is:

- Session 1 commits all heals to the working branch.
- Session 1 updates PHASE_STATUS.md only if its verdict is FAIL — bumping
  the phase to `REMEDIATING` (round 1 of 2). On PASS or PASS-WITH-HEALS
  the phase stays in `VERIFYING` and Session 2 is fired.
- Session 1 produces the report file but Session 2's prompt does not
  reference it.

Cloud chat fires Session 2 by giving it the same phase doc and the same
"verify this" prompt template. Session 2 receives no narrative about what
Session 1 found.

---

## 5. Verifier Session 2 — independent re-check

### 5.1 Inputs

- The phase doc.
- Live code at HEAD (now includes Session 1's heals — but Session 2 does
  not know which lines those are).
- Live DB schema via Supabase MCP.
- **No** access to Session 1's report or heal log. The cloud chat prompt
  that fires Session 2 must not reference them.

### 5.2 First action

**Read PHASE_STATUS.md.** Confirm phase is `VERIFYING` (not `REMEDIATING`,
in which case Session 1 already failed — Session 2 doesn't fire until the
remediation round produces a new "verifier ready" PR).

### 5.3 Review approach: identical to Session 1

Same criterion-by-criterion walk, same Supabase MCP usage, same
PASS/FAIL/PARTIAL bookkeeping. Session 2 is **not** Session 1 with extra
authority — it is an independent run of the same protocol.

### 5.4 Crucial difference: no self-heal

Session 2 is **read-only**. It must not write code. Its tools are limited
to Read, Grep, Glob, Bash (for tests/queries), and Supabase MCP. The
Edit/Write tools are not present in its prompt.

Why: a Session 2 that can heal becomes Session 1 with a different name.
The point is independent observation. If Session 2 finds a defect, it
**flags** it; the planner schedules remediation.

### 5.5 Disagreements with Session 1's heals

Session 2 has no way to know what Session 1 healed. Either:

- Session 2 looks at file X and the criterion passes — both sessions agree
  the code is correct (Session 1 either healed it or it was already good;
  doesn't matter).
- Session 2 looks at file X and the criterion still fails — Session 1
  either missed it or the heal didn't take.
- Session 2 looks at file X, the criterion passes, but Session 2 spots a
  *different* concern — recorded as a new finding.
- Session 2 disagrees with the spec criterion itself (rare) — recorded as
  a disagreement requiring cloud chat resolution. Session 2 does not
  unilaterally relax or tighten a spec rule.

### 5.6 Output

Session 2 writes its report to
`cova-plan/manual-evidence/P{N}/verifier-session-2-report.md` in the same
shape as Session 1. Verdict legend:

- **PASS** — every criterion passes.
- **FAIL — concur** — at least one criterion fails. (Cloud chat will diff
  this against Session 1's report; if both fail on the same criterion,
  remediation round 1 is unambiguous.)
- **FAIL — disagree** — Session 2 fails a criterion that, in cloud chat's
  read of Session 1's report, Session 1 marked PASS. Disagreement
  resolution flow in §6.

### 5.7 Handoff back to cloud chat

Session 2 commits its report and updates PHASE_STATUS.md:

- Both PASS → phase moves to `MANUAL TEST` (Daksh's gate next).
- Either FAIL → phase moves to `REMEDIATING` and the round counter
  increments by 1.

---

## 6. Disagreement resolution

The protocol intentionally does not let one verifier override another.
Disagreements are surfaced; cloud chat is the human-in-the-loop arbiter.

### 6.1 Convergent disagreements (both fail differently)

Both verifiers FAIL but on different criteria. Cloud chat reads both
reports, the union of their FAIL findings becomes the remediation
backlog. Planner gets a remediation prompt that addresses every union
finding.

### 6.2 Divergent disagreements (one passes, one fails)

The classic case: Session 1 PASS, Session 2 FAIL on the same criterion.
Cloud chat:

1. Reads the criterion and Session 2's evidence.
2. Reads what Session 1 said it was checking.
3. Re-runs the *concrete* test (the SQL query, the grep) themselves.
4. Decides:
   - If Session 2 is correct: remediation round, planner fixes.
   - If Session 1 was correct: the criterion passes, phase moves to
     `MANUAL TEST`. The disagreement gets recorded for verifier-protocol
     improvement (typically: the criterion was ambiguous; sharpen wording
     in the phase doc for the next phase).
5. Logs the resolution to `cova-plan/manual-evidence/P{N}/disagreement.md`.

### 6.3 Disagreements with the spec

If a verifier (either session) thinks the spec criterion is wrong — e.g.
"the spec says we must redact emails from logs but I notice we'd also need
to redact phone numbers" — the verifier records the concern as a
**spec disagreement**, not a defect. Cloud chat decides whether to
amend the spec for this phase or punt to a follow-up phase. Verifiers do
not silently broaden or narrow spec scope.

---

## 7. Remediation rounds

### 7.1 Budget

**At most 2 remediation rounds per phase.** Round 3 = automatic escalation
(§8). The budget is on the phase as a whole, not per criterion: 2 rounds
total, even if the second round addresses a different defect than the
first.

### 7.2 Round mechanics

A remediation round runs:

1. Cloud chat synthesizes the remediation backlog from the verifier
   report(s).
2. Planner prompt fires with: original phase doc, current code state, and
   the remediation backlog. (Plan in `PLANNER_PROTOCOL.md` §"Remediation
   prompts".)
3. Planner returns a remediation plan (smaller scope than the original
   plan; only addresses the backlog).
4. Cloud chat reviews and approves or sends back.
5. Executor (fresh session) executes the remediation plan.
6. Phase flips back to `VERIFYING`.
7. Both verifier sessions fire **fresh** — Session 1 has no memory of the
   prior verifier run, Session 2 again has no memory of Session 1.

The verifier sessions in remediation are not aware they are remediation
sessions. They run the same protocol. (Cloud chat tracks the round
counter; the verifiers do not.)

### 7.3 What counts as a round

A round = one full executor-and-verifier-and-verifier cycle that closes
with a verdict. A planner re-prompt that does not produce executor work
does not count.

A self-heal during a verifier session does **not** count as a remediation
round. Only an executor-driven cycle counts.

---

## 8. Round 3: escalation

If both verifier sessions in remediation round 2 still fail, the phase
escalates. Cloud chat does not auto-fire a planner round 3.

### 8.1 Escalation file

`cova-plan/escalations/P{N}-{topic}.md` is created with:

- The phase doc reference and the criteria that won't close.
- All four verifier reports (Session 1 + 2 from rounds 1 + 2).
- A diff of what each round changed.
- A first-pass hypothesis: why is this not closing? (Could be: spec
  criterion is wrong; underlying audit was wrong; an earlier phase
  introduced a structural issue; an external dependency is missing.)
- The phase status flips to `ESCALATED`.

### 8.2 Escalation resolution

Cloud chat owns the next move. Options:

- **Amend spec.** Update the phase doc, lower the criterion, refire round
  fresh.
- **Defer.** Move the unclosable criterion to a later phase; close the
  rest of the phase with a documented carve-out.
- **Triage to back-bug.** If the defect is from an earlier phase that
  shouldn't have closed, file `cova-plan/back-bugs/P{M}-{slug}.md` and
  schedule a remediation phase for `P{M}`.
- **Founder decision.** If the criterion is locked but the implementation
  cost outruns the value, Daksh decides whether to descope.

Whichever path is taken, the resolution is logged in the escalation file
and cross-referenced in PHASE_STATUS.md and OPEN_DECISIONS.md.

---

## 9. Manual gate (Daksh)

Verifier-PASS does not close a phase. The manual gate runs after both
verifier sessions return PASS.

### 9.1 Click-script

Each phase doc supplies a "manual click-script": a numbered list of UI
actions Daksh performs in the dev or staging build, with expected
observables. Example (from P01):

```
1. Open /auth in incognito.
2. Click "Sign up with email", enter test@cova.test and a 12-char password.
3. Confirm Turnstile widget appears (invisible mode; no challenge unless
   suspicious).
4. Submit.
5. Expected: redirect to /design/step-1, no console errors, network panel
   shows POST /auth/v1/signup → 200, then GET /design/step-1.
6. Open Supabase dashboard, table editor, users.
7. Expected: new row, token_balance = 7, exactly one row in
   token_transactions with delta=7, reason='signup_grant'.
```

### 9.2 Evidence bundle

Daksh archives screenshots, console captures, network HARs, and DB query
outputs to `cova-plan/manual-evidence/P{N}/` and writes a `summary.md`:

- What I tested
- What I didn't test (and why)
- Anything that "felt off" (subjective, but worth recording)
- Verdict: ACCEPT / REJECT

### 9.3 Gate outcome

- **ACCEPT** → phase moves to `CLOSED`. Closing checklist runs.
- **REJECT** → if it's a missed criterion, file a back-bug for the
  current phase and remediate (counts toward remediation round budget).
  If it's a "feel" issue Daksh wants addressed but isn't a spec
  violation, log it in OPEN_DECISIONS as a future-phase concern and let
  the phase close anyway.

---

## 10. Final report (to cloud chat)

When the phase closes, cloud chat receives a single closeout summary
constructed from:

- both verifier session reports,
- the disagreement resolution (if any),
- Daksh's `summary.md`,
- the closing checklist with each item ticked,
- a one-line entry appended to `EMPIRICAL_FINDINGS.md` summarizing what
  the phase shipped (and any gotchas).

Format (copy verbatim into the closeout commit message):

```
phase-{N}: closed

Verifier S1: {PASS|PASS-WITH-HEALS|FAIL→{N rounds}}
Verifier S2: {PASS|FAIL-CONCUR|FAIL-DISAGREE→{resolved by cloud chat}}
Manual gate: ACCEPT
Remediation rounds used: {0|1|2}

Notable findings:
- {1-2 bullets}

Carve-outs / deferrals:
- {1-2 bullets, or "none"}

Manual evidence: cova-plan/manual-evidence/P{N}/
Decisions added: D-NNN ... (see OPEN_DECISIONS.md)
```

---

## 11. Anti-patterns (do not do)

- **Verifier reading executor PR description.** Biases finding toward
  what the executor said it did.
- **Verifier sharing a cache between sessions.** Session 2 is fresh; if
  it gets Session 1's cache, it is no longer independent.
- **Verifier auto-resolving a disagreement.** Disagreements escalate to
  cloud chat. Period.
- **Self-heal on architecture decisions.** Mechanical fixes only.
- **Skipping Session 2 because Session 1 said PASS.** Both sessions run.
  No exceptions. The protocol's value is in the second-pair-of-eyes,
  even (especially) when the first pair was confident.
- **Counting a self-heal as a remediation round.** It isn't.
- **Closing the phase without a manual gate.** Verifier-PASS is necessary
  but not sufficient. Daksh's screenshots are the close criterion.
- **Reusing a verifier report from an earlier phase.** Each phase gets
  fresh reports.

---

## 12. When to amend this protocol

This file changes only when the protocol itself is wrong — not when a
phase wants to skip a step. Amendments are themselves reviewed in cloud
chat and produce a versioned bump (e.g. v1.0 → v1.1 in the metadata
header). A phase that wants to deviate writes a one-time carve-out in
its phase doc with reasoning, signed off by Daksh, before it's
applicable.

History (append on amendment, do not delete):

- v1.0 (2026-05-02) — initial protocol bootstrap.
