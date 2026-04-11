# COVA Verification — COMPLETE

**Date:** 2026-04-07
**Parent commit:** `5927aff1a56eec8356ee87884249112e47ab7a5e`
**Branch:** `main`

## Result

`bash apps/web/scripts/verify-all.sh` exits with code **0**.

Every check is real — no mocks, no state injection, no `.catch(() => {})` swallows.
The full pipeline (build → tsc → 4 verifier scripts → 8 API contract tests
→ 46 Playwright e2e tests including a real FLUX render and a real
`/api/match` call) passed end-to-end.

## What ran

| #   | Stage                                                                 | Result                                         |
| --- | --------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | `npm run build`                                                       | ✓                                              |
| 2   | `npx tsc --noEmit`                                                    | ✓ clean                                        |
| 3   | Production server boot on `:3001`                                     | ✓                                              |
| 4   | `verify-depth.ts` (Replicate Depth Anything V2 + DB write-back)       | ✓                                              |
| 5   | `verify-matching.ts` (Serper Shopping + SearchApi Google Lens)        | ✓                                              |
| 6   | `verify-quiz-personalization.ts`                                      | ✓ avg dim diff bohemian↔minimalist = **0.720** |
| 7   | `verify-swap.ts` (FLUX Fill Pro creation)                             | ✓                                              |
| 8   | Playwright `api-contracts` project (8 tests)                          | ✓ in 14.9s                                     |
| 9   | Playwright `e2e` project (46 tests, includes real ~3 min FLUX render) | ✓ in 3.1m                                      |

Final Playwright tally: **46 passed, 0 failed**.

## Real production bugs surfaced and fixed

The new test strategy caught two real bugs that the previous mock-everything
suite had missed.

### 1. `/api/quiz/fingerprint` — `.catch is not a function` 500 for authenticated users

`app/api/quiz/fingerprint/route.ts` called `.catch()` directly on a
`supabase-js` insert builder. The builder is a thenable but **not** a real
`Promise`, so `.catch()` is not a method on it. For authenticated users
(where the insert path runs) the route threw:

```
r.from(...).insert(...).catch is not a function
```

…and 500'd. The previous test suite never noticed because:

- The unauthenticated curl path skipped the insert and returned 200, so a
  manual smoke test looked fine.
- The Vitest contract test mocked the supabase client entirely, so the bad
  call site was never executed against a real builder.

**Fix:** wrap both call sites (new format + legacy format) in try/catch on
the awaited builder. See `app/api/quiz/fingerprint/route.ts` for the
inline comment that documents the trap for the next engineer.

### 2. `/api/match` — `isFurnitureProduct` over-strict, dropped 100% of Serper results

Serper Shopping commonly returns Google Shopping indirect URLs of the form
`https://www.google.com/search?ibp=oshop&...` with the real retailer in
the `source` field (e.g. `crateandbarrel.com`). The previous code in
`app/api/match/route.ts` required **both** the retailer field **and** the
`productUrl` hostname to match the furniture allowlist. The hostname check
saw `google.com`, failed, and the entire candidate set was dropped:

```
[match] candidates: 49 raw → 0 after furniture filter
```

…producing an empty product sheet on every hotspot tap.

**Fix:** require **either** the retailer field **or** the URL hostname to
match. Either signal proves the candidate is a real furniture product.

## Test architecture

| Layer                    | File                                                           | What it asserts                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API contracts            | `tests/api/contracts.test.ts`                                  | Auth gates, fingerprint shape, quiz next-card diversity, style references, real `/api/match` returns furniture from allowlisted retailers, Replicate Depth Anything V2 SDK canary. **No mocks.**                                                                                                                                       |
| Verifier scripts         | `scripts/verify-{depth,matching,quiz-personalization,swap}.ts` | Direct SDK / Supabase calls, exit non-zero on any deviation.                                                                                                                                                                                                                                                                           |
| Full E2E                 | `tests/e2e/complete-flow.spec.ts`                              | Real clicks: landing → step-1 → step-2 (real photo upload) → step-3 (3 Phase A rounds + 12-pair Phase B + Phase C) → fingerprint hard-asserted via response interception → step-4 reveal → step-5 keep/remove → step-6 (real ~3 min FLUX render) → step-7 reveal + slider drag → step-9 hotspot tap → real `/api/match` hard-asserted. |
| Playwright project graph | `playwright.config.ts`                                         | `e2e` project depends on `api-contracts`, so contract failures short-circuit the slower UI run.                                                                                                                                                                                                                                        |

`vitest.config.ts` excludes `tests/api/**` so the new Playwright contract
file does not get loaded by Vitest's runner.

## Cost

Each full `verify-all.sh` run consumes approximately **$2–$3** of paid API
credit:

- Replicate Depth Anything V2 (verifier + contract): ~$0.02
- FLUX Fill Pro creation (swap verifier): ~$0.03
- FLUX render in `/api/render` (complete-flow + render-pipeline tests): ~$1.10 × 2 ≈ $2.20
- Anthropic Claude Vision in `/api/match`: ~$0.05
- Serper + SearchApi (Lens) calls: ~$0.05

This is intentional. The price of catching a 500 before investors see it is
small change.

## Screenshots

`apps/web/docs/verification-screenshots/` contains a frame from every
checkpoint of the live click-through:

```
00-landing.png
01-step-1-room-type.png
01-step-1-selected.png
02-step-2-capture.png
02-step-2-uploaded.png
03-step-3-phase-a-round-1.png
03-step-3-phase-a-round-1-selected.png
03-step-3-phase-a-round-2-selected.png
03-step-3-phase-a-round-3-selected.png
03-step-3-phase-b-start.png
03-step-3-phase-c.png
04-step-4-fingerprint-reveal.png
05-step-5-keep-remove-loading.png
05-step-5-keep-remove-detected.png
06-step-6-render-firing.png
07-step-7-reveal.png
07-step-7-reveal-dragged.png
09-step-9-shelf.png
09-step-9-hotspot-tapped.png
09-step-9-product-sheet.png
```

## How to re-run

```bash
cd apps/web
bash scripts/verify-all.sh
```

The script frees `:3001`, builds, type-checks, starts `next start`, runs
every verifier script, runs both Playwright projects, and cleans up. Any
non-zero exit aborts the whole pipeline. **No retries. No noise tolerance.**

---

**Verified product is ready for investor demo.** Every check passed. Zero failures.
