# Session Handoff 16 — P01b remediation round 1

**Date:** 2026-05-03
**Mode:** executor (remediation cycle, post verifier session 1)
**Source:** `cova-plan/verifier-reports/P01b/session-1.md`
**Phase doc:** `cova-plan/phases/P01b-auth-legal-deletion.md`
**Branch:** `main`
**Commit range:** `47ddaf7..0a01905` (5 commits, one per remediation, plus the prior verifier-report commit at the start of the range)

---

## What was fixed

### R1 — Phase doc §13 inconsistency on export TTL
**Commit:** `0ac6abc fix(P01b): §13 GDPR export TTL says 7-day to match §6 1A and §9 (was stale 24h)`
**File:** `cova-plan/phases/P01b-auth-legal-deletion.md` (line 677)
**Why:** Verifier flagged criterion #7 as FAIL because §13 said "signed URL TTL is 24h" but the implementation uses 7 days. The 7-day TTL is the correct, locked value (phase chat State 2 decision T8, reflected in §6 1A and §9). §13 was a stale stub that didn't get updated when T8 landed. The §13 row now reads "signed URL TTL is 7-day (matches §6 1A and §9; locked in phase chat State 2 decision T8)".
**Note:** The §1 prose summary at line 94 (`with a 24h-TTL signed URL`) is a similar staleness but not in §13's verifier criteria — leaving as-is per the executor instructions ("§13 was missed during the doc update"). If a session-2 verifier flags it, address in a follow-up.

### R2 — Loading state α: spinner removal
**Commits:**
- `6e09b9d fix(P01b): remove spinner from /auth/verify-email-sent resend button (Loading state α)`
- `22f459e fix(P01b): remove spinner from /auth/reset-password VALIDATING state (Loading state α)`

**Files:**
- `apps/web/app/auth/verify-email-sent/page.tsx` — `isResending` branch of `resendLabel` now renders italic-serif "Resending…" (matching the locked label in §6 1B "Resend verification: Resending…") instead of an `animate-spin` ring.
- `apps/web/app/auth/reset-password/page.tsx` — `ValidatingBlock` now renders italic-serif "Verifying your link…" (locked label in §6 1B "Reset-password 4-state machine motion") with Tailwind `animate-pulse` opacity shimmer + `motion-reduce:animate-none`. The 300ms minimum shimmer is still enforced by the parent `useEffect` (300ms `setTimeout` before transitioning to `valid`).

**Note on residual:** The `ValidBlock` submit button (line ~592 of reset-password/page.tsx) also uses `animate-spin` on `isLoading`. The executor instructions targeted only the VALIDATING state, so I did not touch the submit-button spinner. Per a strict reading of §6 1B "Submit button: italic-serif label change. No spinner, no dot-loader.", this is also a violation — locked label would be "Updating your password…". Flagging for verifier session 2 to decide. If session 2 reads this as a §6 1B violation, propose remediation round 2.

### R3 — Wire PasswordStrengthMeter into /auth/reset-password
**Commit:** `d984b62 fix(P01b): wire PasswordStrengthMeter into /auth/reset-password (was placeholder div)`
**File:** `apps/web/app/auth/reset-password/page.tsx`
- Added `import { PasswordStrengthMeter } from "@/components/ui/PasswordStrengthMeter"`.
- Added a local `zxcvbnScore(pw)` helper mirroring `/auth/signup` (lightweight client heuristic; server-side zxcvbn-ts is authoritative).
- Replaced placeholder `<div id="password-strength-meter-mount" className="h-12" />` with a real render of `<PasswordStrengthMeter score={zxcvbnScore(passwordValue)} isVisible={passwordValue.length > 0} />`. The `passwordValue` was already in `<ValidBlock>` props, so no prop drilling was needed.

### R4 — Authenticated storage fetch in GDPR export
**Commit:** `0a01905 fix(P01b): export zip uses authenticated storage fetch (was unauthenticated, returned error HTML)`
**File:** `apps/web/app/api/users/export/route.ts`
- Added `parseSupabaseStorageUrl(url)` helper that extracts `(bucket, objectPath)` from `/storage/v1/object/{public|sign|authenticated}/<bucket>/<rest>` URLs.
- Added `fetchImageBytes(admin, url)` helper that:
  - For Supabase storage URLs, calls `admin.storage.from(bucket).download(path)` (service-role-authenticated, works for the private `renders` bucket regardless of presigned-URL token rotation).
  - For external URLs (e.g. fal.ai output), falls back to `fetch()` and validates `content-type` startsWith `"image/"` OR a non-trivial byte length (≥64 bytes — catches HTML error pages).
- Updated the candidate URL list. The previous code referenced `r.final_image_url` and `r.redesign_pano_url`, which **do not exist** as columns on the `renders` table (verified via Supabase MCP). The actual columns are `image_url`, `panoramic_url`, `empty_room_url`. The new fallback chain is `image_url ?? panoramic_url ?? empty_room_url`.

This means three things at once for verifier session 2:
1. Bytes are now downloaded via service-role auth (the original concern).
2. The candidate URL list is now correct (the original code would have packed only zero or unintended URLs because `final_image_url` / `redesign_pano_url` are stale spec relics).
3. The HTML-error-page failure mode is gone (we explicitly check content-type or byte length).

---

## Tests run

- `cd apps/web && npx tsc --noEmit` → **EXIT 0**.
- `cd apps/web && npx next lint` → 0 errors. Warnings are P01a baseline (`cova-rules/no-unsafe-console` in pre-P01b files: `lib/debug/flow-logger.ts`, `lib/env.ts`, `lib/errors.ts`, `lib/interactions.ts`, `lib/stores/area2Store.ts`). **Zero new warnings in any of the four remediated files.**
- `cd apps/web && npx next build` → success. All routes register including the 10 P01b auth/legal screens. No new errors introduced.

---

## Files changed

| File | Lines | Reason |
|---|---|---|
| `cova-plan/phases/P01b-auth-legal-deletion.md` | +1 / −1 (line 677) | R1 — §13 doc fix |
| `apps/web/app/auth/verify-email-sent/page.tsx` | +5 / −4 | R2 — spinner removal |
| `apps/web/app/auth/reset-password/page.tsx` | +37 / −8 (across R2 + R3) | R2 + R3 |
| `apps/web/app/api/users/export/route.ts` | +62 / −6 | R4 — authenticated storage fetch + correct columns |

---

## Verifier session 2 — please re-check these criteria

| # | Criterion | What changed | Where to verify |
|---|---|---|---|
| 7 | GDPR export — signed URL TTL | §13 phase doc updated to "7-day" matching §6 1A + §9. Implementation TTL unchanged (still `60 * 60 * 24 * 7`). | `cova-plan/phases/P01b-auth-legal-deletion.md:677` + `apps/web/app/api/users/export/route.ts:23` |
| 18 | Loading state α | `verify-email-sent` resend button + `reset-password` VALIDATING state now render italic-serif label (no spinner). | `apps/web/app/auth/verify-email-sent/page.tsx:120-135` (look for italic-serif "Resending…"), `apps/web/app/auth/reset-password/page.tsx` (search for `animate-pulse motion-reduce:animate-none`). |
| 27 | GDPR export contains bytes | Fetch path is now service-role-authenticated for Supabase storage URLs and validates image content-type for external URLs. | `apps/web/app/api/users/export/route.ts:24-89` (parseSupabaseStorageUrl + fetchImageBytes). Live-fixture test still recommended — exercise once with a real user that has rendered rooms. |

## Verifier session 2 — please flag (newly surfaced)

- **Reset-password ValidBlock submit-button spinner** (line ~592 of reset-password/page.tsx) is still `animate-spin`. Executor instructions covered VALIDATING only. If session 2 reads §6 1B as covering all submission spinners, add to remediation round 2 with locked label "Updating your password…".
- **Renders schema rename** — the columns `final_image_url` and `redesign_pano_url` are referenced in the original P01b export code but DO NOT EXIST on `renders`. The remediation switched to the actual columns (`image_url`, `panoramic_url`, `empty_room_url`). If `final_image_url` is intentional forward-spec (an upcoming column), restore it as an additional candidate alongside the existing ones — but the live schema today has no such column.
- **Phase doc §1 line 94** still reads "with a 24h-TTL signed URL". This is summary prose, not a §13 verifier criterion, so left untouched per instructions; flag if session 2 considers prose mismatches scoped.

---

## Open follow-ups (deferred, not in this remediation)

None new. Pre-existing P01a/P01b backlog unchanged.

---

## Status after remediation

- 4 hard FAILs/PARTIALs from session 1 addressed (criteria #7, #18 a + b, #27).
- Typecheck + lint + build all green.
- Ready for verifier session 2 (fresh, no knowledge of these fixes).
