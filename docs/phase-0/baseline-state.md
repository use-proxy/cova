# Phase 0 Verification Baseline

**Captured:** 2026-04-19 20:32 local (run from `/Users/daksh/Desktop/cova`)
**Git SHA (main HEAD):** `d5eaf7a`
**Branch:** `main`, in sync with `origin/main`

## Build

- **Status:** PASS (`✓ Compiled successfully` via `next build`)
- **Log:** `docs/phase-0/baseline-build.log`
- Note: a `Chat history error: Dynamic server usage: Route /api/chat/history couldn't be rendered statically` log appears during build. This is a Next.js *dynamic-route informational message*, not a build failure. Build completed and emitted full page manifest.

## Tests

- **Runner:** vitest run (via `pnpm --filter web test`)
- **Log:** `docs/phase-0/baseline-tests.log`
- **Test Files:** 3 failed | 40 passed | 1 skipped (44 total)
- **Tests:** 14 failed | 710 passed | 28 skipped (752 total)
- **Suite-load errors:** 0

### Failing test IDs (14)

1. `__tests__/area1/quiz-flow.test.ts > /api/quiz/fingerprint POST > returns 401 when user is not authenticated (legacy format)`
2. `__tests__/area1/quiz-flow.test.ts > /api/quiz/fingerprint POST > returns 400 when responses array is empty (legacy format)`
3. `__tests__/area1/quiz-flow.test.ts > /api/quiz/fingerprint POST > returns 200 with fingerprint, style_name, style_tags on valid authenticated new-format request`
4. `__tests__/area1/quiz-flow.test.ts > /api/quiz/next-pair POST > returns quizComplete: true when responseCount >= 12`
5. `__tests__/area1/quiz-flow.test.ts > /api/quiz/next-pair POST > returns a pair object on valid request (mocked DB with candidates)`
6. `__tests__/area1/quiz-flow.test.ts > /api/quiz/next-pair POST > returns quizComplete: true when DB returns no candidates`
7. `__tests__/area1/quiz-flow.test.ts > /api/quiz/next-card GET + POST > GET returns cards array`
8. `__tests__/area1/quiz-flow.test.ts > /api/quiz/next-card GET + POST > POST returns cards array`
9. `__tests__/area1/quiz-flow.test.ts > /api/quiz/next-card GET + POST > returns empty cards array when DB has no rows`
10. `__tests__/area1/quiz-flow.test.ts > /api/quiz/next-card GET + POST > card shape includes id, style_name, style_index, image_url, style_vector`
11. `__tests__/shared/navigation-flow.test.ts > step-3 → step-4 > pushes /design/step-4`
12. `__tests__/shared/navigation-flow.test.ts > step-7c → step-7d > pushes /design/step-7d`
13. `__tests__/shared/navigation-flow.test.ts > deleted pages > step-7e is removed`
14. `tests/lib/env.test.ts > validateEnvironment > returns valid=true when all required vars are set`

### Failing files (3)

- `__tests__/area1/quiz-flow.test.ts` — 10 failures (known: CLAUDE.md post-launch test debt, stale Supabase admin mock chain)
- `__tests__/shared/navigation-flow.test.ts` — 3 failures (page-existence assertions out of sync with current routes)
- `tests/lib/env.test.ts` — 1 failure (env var not set in test context)

## TypeScript

- **Command:** `pnpm --filter web exec tsc --noEmit`
- **Exit:** 0
- **Errors:** 0
- **Files with errors:** 0
- **Log:** `docs/phase-0/baseline-tsc.log` (empty)

## How to use the verification gate

- Before every commit to main during Phase 0 prompts 2-6, run:

  ```bash
  bash scripts/verify-before-commit.sh
  ```

- If it exits 0: review the diff it printed, then commit and push.
- If it exits 1: STOP, investigate the regression, do not commit until fixed.
- The gate compares the *current* test-failure count against the baseline's 14. Any net-new failure trips it. It will not flag a green test turning red as long as another red test turns green — the gate counts, it doesn't identify. The diff print at the end shows which specific tests changed, so use that to sanity-check.
