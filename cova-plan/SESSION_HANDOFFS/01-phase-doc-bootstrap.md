# Session Handoff 01 — Phase-Doc Bootstrap

**Date:** 2026-05-02
**Session type:** Cloud-chat-driven planning bootstrap
**Predecessor handoff:** `00-baseline.md` (intentionally empty — this is the first non-empty handoff)
**Next session expected:** Cloud chat reviews these four files, resolves the P1 known gaps, then fires the first planner session for P1.

---

## 1. What this session was asked to do

> Create the four foundation planning documents for Cova V1 and a session
> handoff. The five context files originally listed (`EMPIRICAL_FINDINGS.md`,
> `OPEN_DECISIONS.md`, `BLOCK_B_CLEANUP_PLAN.md`, `IMPLEMENTATION_PLAN.md`,
> `SESSION_HANDOFFS/00-baseline.md`) did not exist on disk; the user
> pivoted to using the 21 audit files in `docs/audit/` plus the existing
> `cova-plan/` artifacts as substance.

## 2. What was created

| File | Purpose | Length |
|---|---|---|
| `cova-plan/PHASE_STATUS.md` | Single source of truth for V1 phase state. Status legend, workflow loop, P0 + P1–P12 tables, per-phase fields, drift detection wiring, escalation paths. | ~280 lines |
| `cova-plan/VERIFIER_PROTOCOL.md` | Two-session fresh-context self-healing verifier protocol. Session 1 reviews + self-heals; Session 2 fires fresh and re-checks; disagreements escalate; 2-round remediation budget; round-3 escalation; manual gate by Daksh. | ~330 lines |
| `cova-plan/PLANNER_PROTOCOL.md` | Planner session protocol. Drift detection at session start, required research via EXA + Context7 + web search, pre-decisions block, executor prompt output format, return-to-cloud-chat workflow, remediation prompts, anti-patterns. | ~380 lines |
| `cova-plan/phases/P01-foundations.md` | Phase 1 doc. Identity, prereq verification, 20 locked pre-decisions (D-001..D-020), audit-derived background, scope split into 1A backend / 1B UI / 1C integration, 11 schema migrations with reversible downs, API contracts, failure handling, cost budget, 5-step phase loop, Layer 1 verifier checklist, adversarial code review checklist, 30-step manual click-script, evidence bundle list, remediation budget, closing checklist, rollback plan, feature flags, executor session count estimate (4–6), 10 known gaps to resolve in cloud chat. | ~770 lines |
| `cova-plan/SESSION_HANDOFFS/01-phase-doc-bootstrap.md` | This file. | (you are here) |

Directory scaffold also created (empty until populated by future phases):

```
cova-plan/
  back-bugs/         — bugs found in earlier phases during a later phase
  drift/             — drift docs from planner sessions
  escalations/       — round-3 verifier failures
  manual-evidence/   — Daksh's screenshots + logs per phase
  phases/            — per-phase docs
  SESSION_HANDOFFS/  — session continuity docs
  subagents/         — verifier / schema-reviewer / frontend-visionary / cost-monitor prompts
```

## 3. What was deliberately NOT created

- `cova-plan/OPEN_DECISIONS.md` — referenced by `PHASE_STATUS.md` §6.1
  but not yet authored. Should be created at P1 kickoff (the first
  thing the P1 planner does, *after* drift detection, is to seed it
  with D-001..D-020 from `P01-foundations.md` §2). The session-handoff
  loop did not author it because P1 has not started.
- `cova-plan/EMPIRICAL_FINDINGS.md` — same reasoning. Created at P1
  close with the first phase entry.
- `cova-plan/manual-evidence/P01/` contents — populated only after
  executor work and verifier sessions.
- Phase docs P02–P12 — stubs in `PHASE_STATUS.md` §4 only; full docs
  authored immediately before each phase plans.
- `cova-plan/subagents/{verifier,schema-reviewer,frontend-visionary,cost-monitor}.md`
  — listed in P1 scope (§5C.1, D-017); the executor lands them in P1's
  M0 session.
- `scripts/agents/{name}.ts` — same. Executor M0.
- `cova-plan/back-bugs/`, `cova-plan/escalations/`, `cova-plan/drift/`
  contents — populated as needed.

## 4. Cross-references

The four foundation files are designed to be read in order on a fresh
session, with each pointing to the next:

```
PHASE_STATUS.md          ──cites──► VERIFIER_PROTOCOL.md (workflow loop §2)
                         ──cites──► PLANNER_PROTOCOL.md (drift detection §6.2)
                         ──cites──► phases/P01-foundations.md (per-phase fields §5)

VERIFIER_PROTOCOL.md     ──cites──► PHASE_STATUS.md (state machine §3)
                         ──cites──► phases/P01-foundations.md (Layer 1 checklist §1, §3)

PLANNER_PROTOCOL.md      ──cites──► PHASE_STATUS.md (drift §3)
                         ──cites──► phases/P01-foundations.md (pre-decisions §5)
                         ──cites──► VERIFIER_PROTOCOL.md (remediation rounds §8)

phases/P01-foundations.md ──cites──► PHASE_STATUS.md (workflow §0)
                          ──cites──► VERIFIER_PROTOCOL.md (Layer 1 §13, §14)
                          ──cites──► PLANNER_PROTOCOL.md (research, drift)
                          ──cites──► docs/audit/* (every scope item)
```

A planner session entering Cova V1 cold reads PHASE_STATUS.md first;
that file sends it to the protocol files and the phase doc.

## 5. P1 known gaps to resolve before the planner fires

Reproduced verbatim from `P01-foundations.md` §21. Cloud chat resolves
each before authoring the planner prompt.

1. Exact dead-column and dead-table names (counts known; names not
   enumerated — verifier reads schema directly).
2. Current state of `apps/web/lib/auth/legacy.ts` and what imports it.
3. Resend DNS records (SPF/DKIM/DMARC) status for
   `hi@covainterior.com`.
4. Termly templating output (decision locked: Termly free tier;
   templates not yet generated).
5. CLAUDE.md Rule 12 carve-out for `delete-account` (one-time amendment).
6. `apps/web/app/capture/[roomId]/page.tsx` retention (delete vs
   fix-EXIF-in-place).
7. `empty_room_url` column decision (drop vs implement-cache-in-P3).
8. `apps/web/.env.local` snapshot (planner reads at fire time).
9. Apple Developer credentials available for Apple OAuth.
10. Cloudflare Turnstile site key created.

## 6. State of the world after this session

| Artifact | Status |
|---|---|
| 4 foundation docs | DONE |
| Directory scaffold | DONE |
| P0 audits (inputs) | DONE (in `docs/audit/`, `cova-plan/CATALOG_AUDIT_2026-04-30.md`, `cova-plan/LORA_AUDIT_2026-04-30.md`) |
| P1 doc | DRAFTED |
| P1 planner | NOT FIRED — waiting for cloud chat to resolve §5 known gaps |
| P2–P12 docs | NOT WRITTEN |
| Subagent prompts | NOT WRITTEN (lands in P1 M0) |
| OPEN_DECISIONS.md | NOT WRITTEN (lands at P1 kickoff) |
| EMPIRICAL_FINDINGS.md | NOT WRITTEN (lands at P1 close) |

`PHASE_STATUS.md` reflects this: P0 IN PROGRESS (parallel external work
continues), P1–P12 NOT STARTED.

## 7. What cloud chat does next

In order:

1. **Read all four files** (PHASE_STATUS, VERIFIER_PROTOCOL,
   PLANNER_PROTOCOL, P01-foundations) end-to-end. Verify they cohere
   with each other and with the locked decisions communicated in
   chat.
2. **Resolve the 10 known gaps** in `P01-foundations.md` §21. For each:
   gather data (live queries, Resend API checks, Daksh confirmations),
   update the relevant section of `P01-foundations.md` with the
   resolution, lock any new D-NNN decisions in OPEN_DECISIONS.md
   (which cloud chat creates as part of this step).
3. **Author the P1 planner prompt** using `PLANNER_PROTOCOL.md` as the
   template. Include `P01-foundations.md` as the input doc; instruct
   the planner to do drift detection, research the topics in P1's
   "Research required" sub-list (the planner expands this from D-001..
   D-020), and return a 4–6 session executor brief.
4. **Open a fresh Claude Code session** and paste the planner prompt.
   Planner runs.
5. **Receive plan.** Review per `PLANNER_PROTOCOL.md` §7. Approve as-is,
   approve with edits, or reject with reason.
6. **Open a fresh Claude Code session** for the executor. Paste the
   approved plan. Executor runs.
7. Continue per the workflow loop documented in `PHASE_STATUS.md` §2.

## 8. Conventions assumed by these docs

- **Cloud chat = the human-facing chat layer** that orchestrates
  planner / executor / verifier sessions. Cloud chat is the
  "pilot"; Claude Code sessions are the "instruments."
- **Claude Code sessions are stateless across firings.** Each session
  reads only the files explicitly handed in (the prompt + linked
  docs). PHASE_STATUS.md is the across-session memory.
- **MCP servers (Supabase, Context7, EXA) are connected.** All four
  docs assume the planner has them.
- **Subagent CLI scripts (`bun run scripts/agents/...`) live in the
  repo and are invoked by Daksh or by Claude Code planner/verifier
  sessions via the Agent tool.** They are not run in CI.
- **CI** runs typecheck/lint/tests + the four grep rules from
  P01-foundations.md §5C.4 (timeouts, console.error of objects,
  unwrapped paid calls, forbidden style names). Any other CI behavior
  is out of scope for these docs.
- **Vercel** is the deploy target (P12). Local dev uses
  `pnpm -C apps/web dev`. No production deploy is in play during P1.

## 9. Anything that felt off in this session

- The user originally listed 5 context files that did not exist on
  disk; pivoted mid-session to "use what exists." This handoff is
  mildly less grounded than ideal because the original
  `EMPIRICAL_FINDINGS.md` / `OPEN_DECISIONS.md` were going to be the
  cumulative state. Recommend cloud chat author both at P1 kickoff
  rather than later, so subsequent phases have the cumulative shelf
  to write into.
- The "21 audit files" instruction had 22 actual files in
  `docs/audit/` (the lora-* siblings were not counted in the spec).
  Documented in the audit corpus table (P01 §3.1) anyway; superseded
  ones (`director.md`, `loras.md`, `lora-quality-eval.md`,
  `lora-spot-test.md`, `lora-backup-report.md`,
  `lora-registry.backup-urls.patch`) explicitly noted.
- `P01-foundations.md` §21.2 known gap on `lib/auth/legacy.ts` could
  not be fully resolved without a `rg` query + Daksh confirmation.
  Cloud chat resolves before planner fires (the doc instructs as
  much).
- Apple OAuth (D-001) is in scope but depends on Apple Developer
  credentials Daksh may not have ready. The doc carries a
  `BLOCKED-WAITING-EXTERNAL` flag for that sub-step. If Apple is not
  ready, the entire feature can defer to a P1 addendum without
  blocking the rest of P1.

## 10. Files committed in this session

```
cova-plan/PHASE_STATUS.md                              (created)
cova-plan/VERIFIER_PROTOCOL.md                         (created)
cova-plan/PLANNER_PROTOCOL.md                          (created)
cova-plan/phases/P01-foundations.md                    (created)
cova-plan/SESSION_HANDOFFS/01-phase-doc-bootstrap.md   (created)

cova-plan/back-bugs/         (empty dir)
cova-plan/drift/             (empty dir)
cova-plan/escalations/       (empty dir)
cova-plan/manual-evidence/   (empty dir)
cova-plan/phases/            (now non-empty)
cova-plan/SESSION_HANDOFFS/  (now non-empty)
cova-plan/subagents/         (empty dir)
```

No code, no migrations, no tests touched. Pure planning artifacts.

## 11. Stop condition

The user's instructions ended with "When all four files are written,
write a session handoff at cova-plan/SESSION_HANDOFFS/01-phase-doc-bootstrap.md
and stop." This handoff fulfills that. Stopping.
