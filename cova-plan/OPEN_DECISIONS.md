# Cova V1 — Open Decisions Log

Hard-locked decisions that bind all phases. Append-only after lock; never re-litigate without explicit revision protocol.

---

## Locked decisions (D-001..D-022)

- **D-001:** One photo per room. Not video, not multiple photos, not 360.
- **D-002:** No catalog scraping. Ever. Product matching via Google Lens (SearchApi.io) only.
- **D-003:** No LoRAs.
- **D-004:** No multi-reference style images.
- **D-005:** No depth-conditioning ControlNet on Stage 5.
- **D-006:** No multi-pass FLUX.1 → FLUX.2 averaging.
- **D-007:** 12-pick quiz count locked.
- **D-008:** Display names only — never expose internal style codenames.
- **D-009:** EXIF strip mandatory on every uploaded image. Server-side via Sharp.
- **D-010:** `redactLogPayload` before every log statement. CI grep enforces. *(Note: P01a Decision 7 swaps the CI grep for an ESLint custom rule — same intent, structural enforcement.)*
- **D-011:** Cost telemetry on every paid call. CI grep enforces. *(Note: P01a Decision 7 swaps the CI grep for a `paidCall<T>()` wrapper + ESLint custom rule — same intent, structural enforcement.)*
- **D-012:** `failure_category` populated on every failure path.
- **D-013:** 8 render stages locked. Don't add, merge, or reorder.
- **D-014:** THREE.js stays at 0.155.0.
- **D-015:** `fetch()` only for fal.ai and Anthropic. No SDK adoption.
- **D-016:** Forced-choice A vs B quiz. Not swipe-or-skip.
- **D-017:** 10 styles taxonomy locked.
- **D-018:** Refine UI is free-form text only.
- **D-019:** Build token infrastructure but DO NOT enforce in V1. `ENFORCE_TOKEN_LIMITS=false`.
- **D-020:** Mood feed dropped from V1 entirely.
- **D-021:** Termly free tier for legal pages. Sarah M Brooklyn placeholder testimonial (Phase 10).
- **D-022:** `render_cost_log.category` is `text` at DB layer; validated as TypeScript union at app layer (`apps/web/lib/cost/categories.ts`). Phases extend the union without `ALTER TYPE` migrations. *Locked during P01 split planning conversation (2026-05-02).*

---

## Deferred concerns (revisit at named milestone)

- **DEF-001:** `instrumentation.ts` Sentry pattern revisited at Phase 12 if Next 15 upgrade lands. Current pattern is Next 14 stable.
- **DEF-002:** Termly free-tier capability check (badge insertion, policy count caps, impression limits) — verified before P01b ships, not before P01a. If free tier insufficient, decision pivots to paid tier or alternative.
- **DEF-003:** Phase doc empirical verification precedent. The original P01a phase doc named 6 Modal apps (anysplat, marble-mini, marble-plus, colmap-fastgs, flythrough, glb-render) for archival; cova-plan/audit-reports/modal-deadness-2026-05.md proved none of those names exist in the live workspace and identified the actual 5-artifact archive scope. **Process rule for future planners:** when a phase doc names a specific artifact for deletion/archival (Modal app, Supabase table, file path, env var, etc.), the planner MUST verify the artifact exists and is dead before the executor acts. Verification methods: live MCP queries (Supabase, Modal CLI), repo grep, deployment-tool inspection. If the doc is wrong, halt and update the doc — DO NOT silently substitute names from audit docs or other secondary sources. Update the phase doc + corresponding handoff before re-firing the planner. Established via `cova-plan/SESSION_HANDOFFS/04-P01a-modal-doc-correction.md`.

---

## Revision log

- **2026-05-02** — Initial creation during the P01 split planning conversation. D-001..D-022 locked (D-001..D-021 ported verbatim from `cova-plan/phases/_archive/P01-foundations-pre-split.md` §5; D-022 added as part of the split). DEF-001, DEF-002 noted.
- **2026-05-03** — DEF-003 added after `cova-plan/audit-reports/modal-deadness-2026-05.md` proved the original P01a phase doc named 6 Modal apps that did not exist. Codifies "verify artifacts exist before archival" process rule for future planners. See `cova-plan/SESSION_HANDOFFS/04-P01a-modal-doc-correction.md`.
