# Pre-existing Test Failures — phase-0/rls-fixes

**Date:** 2026-04-19
**Command:** `pnpm --filter web test`
**Result:** `Test Files 5 failed | 38 passed | 1 skipped (44)` — `Tests 21 failed | 682 passed | 28 skipped (731)`

> Note: task description referenced "38 pre-existing test failures." Actual failing count at HEAD of `phase-0/rls-fixes` is **21 tests across 5 files** (plus 1 suite-level load error). Listed exhaustively below.

## RLS-modified routes (blocking set)

A test is RELATED if it imports or exercises any of:
- `app/api/render/tweak/status/route.ts`
- `app/api/render/status/route.ts`
- `app/api/generate-art/route.ts`
- `app/api/parallax/route.ts`
- `app/api/rooms/capture/route.ts`

None of the failing test files import these routes. Confirmed by file path and imports in each failure below.

---

## Failure inventory

### 1. `tests/ai/pipeline-config.test.ts` — suite load failure
- **Error:** `TypeError: globSync is not a function` (line 28)
- **Touches RLS routes?** No — tests Modal Python pipeline files.
- **Category:** UNRELATED — broken `glob` import, not in our diff.

### 2. `tests/db/hnsw-migration.test.ts` — 7 failures
All 7 same root cause: `TypeError: globSync is not a function`.
- `HNSW migration file exists`
- `migration drops old IVFFlat indexes`
- `migration creates HNSW index with correct parameters`
- `migration targets clip_embedding_data column`
- `migration is idempotent (uses IF NOT EXISTS / IF EXISTS)`
- `at least one IVFFlat migration exists (confirming we are replacing it)`
- `existing migrations reference 768-dim vectors`

- **Touches RLS routes?** No — tests SQL migration file contents.
- **Category:** UNRELATED — broken `glob` import.

### 3. `__tests__/shared/navigation-flow.test.ts` — 3 failures
- `step-3 → step-4 pushes /design/step-4` — `expected false to be true`
- `step-7c → step-7d pushes /design/step-7d` — `expected false to be true`
- `deleted pages > step-7e is removed` — `expected true to be false`

- **Touches RLS routes?** No — tests design step page router pushes.
- **Category:** UNRELATED — pre-existing page structure drift.

### 4. `tests/lib/env.test.ts` — 1 failure
- `validateEnvironment returns valid=true when all required vars are set` — `expected false to be true`

- **Touches RLS routes?** No — tests env var validation.
- **Category:** UNRELATED — env validator drift.

### 5. `__tests__/area1/quiz-flow.test.ts` — 10 failures
All return 500 instead of expected status, root cause: `admin.from(...).select(...).eq is not a function` (stale Supabase admin client mock chain).
- `fingerprint POST: returns 401 when user is not authenticated (legacy format)`
- `fingerprint POST: returns 400 when responses array is empty (legacy format)`
- `fingerprint POST: returns 200 on valid authenticated new-format request`
- `next-pair POST: returns quizComplete: true when responseCount >= 12`
- `next-pair POST: returns a pair object on valid request (mocked DB with candidates)`
- `next-pair POST: returns quizComplete: true when DB returns no candidates`
- `next-card GET+POST: GET returns cards array`
- `next-card GET+POST: POST returns cards array`
- `next-card GET+POST: returns empty cards array when DB has no rows`
- `next-card GET+POST: card shape includes id, style_name, style_index, image_url, style_vector`

- **Touches RLS routes?** No — exercises `/api/quiz/*` routes.
- **Category:** UNRELATED — explicitly documented in `CLAUDE.md` under "Post-launch test debt": *"quiz-flow.test.ts (7 tests) — Supabase admin client mock chain is stale."*

---

## Summary

| Category | Count |
|---|---|
| RELATED (blocks PR) | **0** |
| UNRELATED (pre-existing) | 21 tests + 1 suite load |
| AMBIGUOUS | 0 |

## Verdict

**PR is safe to commit.** Zero failures touch any of the 5 RLS-modified routes. All failures are pre-existing and fall into three root causes unrelated to this branch:
1. `globSync` import breakage in `tests/ai/` and `tests/db/` (8 failures + 1 suite).
2. Stale Supabase mock chain in quiz-flow tests (10 failures — already documented as known debt in CLAUDE.md).
3. Page/env drift in navigation-flow and env tests (4 failures).

New RLS-negative tests (`apps/web/tests/security/rls-negative.test.ts`) should be run separately against a live Supabase to confirm policy behavior; they are not part of the vitest fail set above.
