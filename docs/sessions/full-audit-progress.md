# Cova Full Audit — Progress Report
Date: 2026-04-05

---

## Summary

Full audit of `apps/web/` covering navigation flow, store contracts, API routes, design system, TypeScript correctness, and build integrity. **Build passes clean. TypeScript passes with zero errors.**

---

## Issues Found and Fixed

### 1. `sessionStore.nextStep()` clamped to 11, not 10
**File:** `apps/web/lib/store/session.ts`  
**Issue:** `Math.min(state.currentStep + 1, 11)` — spec requires max 10 steps.  
**Fix:** Changed to `Math.min(state.currentStep + 1, 10)`.

---

### 2. StepIndicator `totalSteps` inconsistency
**Files:** `app/design/step-1` through `step-5`  
**Issue:** All used `totalSteps={11}` and displayed "Step N of 11". Spec says 10 total steps.  
**Fix:** Changed all to `totalSteps={10}`. Updated hardcoded "Step 1 of 11" and "Step 2 of 11" text to match.

---

### 3. Step-1 did not save to fingerprintStore
**File:** `app/design/step-1/page.tsx`  
**Issue:** `handleContinue()` just called `router.push("/design/step-2")` without saving roomType or budgetTier to Zustand store. All downstream steps (step-2, step-7) depend on these values.  
**Fix:**  
- Added imports: `useFingerprintStore`, `useSessionStore`  
- Added `TIER_INDEX_TO_STORE` mapping (5 carousel tiers → 4 store tiers)  
- `handleContinue()` now calls `setRoomType()`, `setBudget()`, and `setStep(2)` before navigating.

---

### 4. Step-2 did not call fingerprint API
**File:** `app/design/step-2/page.tsx`  
**Issue:** After 19 quiz responses, step-2 called `router.push("/design/step-3")` directly without calling `POST /api/quiz/fingerprint`. Step-3 reads `fingerprint` from store which was always null.  
**Fix:**  
- Added `useSessionStore` and `setFingerprint` from `useFingerprintStore`  
- Added `completeQuiz()` async function that POSTs to `/api/quiz/fingerprint` with quiz responses and room_type, then calls `setFingerprint()` with the returned fingerprint + style_name  
- Updated `handleSelection` and the "Neither — skip" button to call `completeQuiz(updatedResponses)` on last pair  
- Navigation is fire-and-forget — even if API fails, we still navigate to step-3 (store retains defaults)

---

### 5. Auth callback redirected to step-1, not step-4
**File:** `app/api/auth/callback/route.ts`  
**Issue:** `const next = searchParams.get('next') ?? '/design/step-1'` — spec says auth callback should default to step-4.  
**Fix:** Changed default to `'/design/step-4'`.

---

### 6. Steps 7–10 missing StepIndicator
**Files:** `app/design/step-7/`, `step-8/`, `step-9/`, `step-10/`  
**Issue:** No `<StepIndicator>` rendered on these pages — user has no progress context.  
**Fix:** Added `StepIndicator` import and `<StepIndicator currentStep={N} totalSteps={10} />` to each page.

---

### 7. Style names exposed in user-facing UI (violates HARD RULE 8)
**File:** `app/design/step-3/page.tsx`  
**Issue:**  
- Line 429: `{typedName}` typed out the actual style name (e.g. "Warm Japandi", "Bohemian Layered") via typing animation  
- Lines 716, 742: style name shown in badge on render cards (`{styleName}`)  
- Line 703: style name in alt text  
**Fix:**  
- Typing animation now types `"Your Design DNA"` instead of the internal style name  
- Badge text changed from `{styleName}` to `"Your style"`  
- Alt text changed from `redesigned in ${styleName}` to `redesigned to your style`

---

### 8. Middleware blocked all `/design` routes without auth
**File:** `apps/web/middleware.ts`  
**Issue:** `PROTECTED_ROUTES = ['/design']` blocked steps 1–5, but the spec says "No account needed to start." CTA on step-1 says "No account needed to start."  
**Fix:** Changed `PROTECTED_ROUTES` to only protect steps 6–10 (where session data and server-side features are required).

---

### 9. `any` types in RoomChatbot.tsx (known backlog item)
**File:** `components/RoomChatbot.tsx`  
**Issue:** 7 occurrences of `: any` including `ToolResult.data: any`, `ProductCard({ product: any })`, etc. This was noted in `STATUS.md` as an open backlog item.  
**Fix:** Defined proper interfaces:  
- `ChatProduct` — product structure from chat tool results  
- `StyleUpdateData` — style update response shape  
- `CostsData` + `CostItem` — costs breakdown  
- `HistoryMessage` — chat history API response  
- `ToolResultData` union type  
Removed `eslint-disable @typescript-eslint/no-explicit-any` directive.

---

### 10. StepIndicator hardcoded hex values
**File:** `components/cova/StepIndicator.tsx`  
**Issue:** Used `#0F1F3D` and `#C9A84C` hardcoded instead of CSS variables.  
**Fix:** Replaced with `var(--cova-surface)`, `var(--cova-gold)`, `var(--cova-gold-glow)`.

---

## Issues Found But Not Fixed (Accepted/Deferred)

### Hardcoded hex values in ShopRoom.tsx and step pages
**Scope:** Widespread — hundreds of lines across all step pages and ShopRoom component.  
**Status:** Deferred to M13 UI Polish milestone. The pages were built with inline style objects using hex values before the token system was finalized. Refactoring all of them would risk breaking visual consistency without any functional gain. The tokens.css file exists and is imported; components/cova/StepIndicator.tsx was cleaned up as a representative fix.

### `console.log` warnings in pipeline and API files
**Status:** Pre-existing, not introduced by this audit. They are all `no-console` ESLint warnings from legitimate debug logging in pipeline routes. Build compiles with warnings only.

### `RoomChatbot` hardcoded hex colors
**Status:** Same as ShopRoom — deferred to M13. The component is functional.

---

## Audit Checklist Results

### Navigation Flow
| Route | Status |
|---|---|
| Step 1 → Step 2 on "Start Designing" | ✅ Fixed (now saves to store) |
| Step 2 → Step 3 after 19 responses + fingerprint API | ✅ Fixed (API call added) |
| Step 3 → Step 4 on "Yes, design my room" | ✅ Works |
| Step 4 → Step 5 on "Continue →" | ✅ Works |
| Step 5 → Step 6 after photo upload | ✅ Works |
| Step 6 → Step 7 on "Design My Room →" | ✅ Works |
| Step 7 → Step 8 after render complete (polls /api/render/status every 3s) | ✅ Works |
| Step 8 → Step 9 on "Not quite right?" | ✅ Works |
| Step 8 → Step 10 on "Shop This Look →" | ✅ Works |
| Step 9 → Step 7 on "Refine My Design" | ✅ Works |
| Step 9 → Step 7 on "Try Again" | ✅ Works |
| Step 9 → Step 1 on "Start Over" | ✅ Works |
| Step 9 → Step 10 on "Shop This Look →" | ✅ Works |
| Step 10 — no outbound navigation | ✅ Works |

### Store Contracts
| Item | Status |
|---|---|
| fingerprintStore has all required fields | ✅ Verified |
| roomStore has all required fields | ✅ Verified |
| KeepMaskItem.keep is boolean \| null | ✅ Verified |
| sessionStore persists currentStep to localStorage | ✅ Verified (zustand persist) |
| sessionStore.nextStep clamps to 10 | ✅ Fixed |
| refineStore has all required fields | ✅ Verified |
| All stores exported from lib/store/index.ts | ✅ Verified |

### API Routes
| Route | Status |
|---|---|
| POST /api/render — returns prediction_id | ✅ Verified |
| GET /api/render/status — polls, writes to DB on complete | ✅ Verified |
| POST /api/detect — returns detections | ✅ Verified |
| POST /api/match — returns MatchedProduct[] | ✅ Verified |
| POST /api/quiz/fingerprint — returns fingerprint[] | ✅ Verified |
| POST /api/rooms/capture — multipart | ✅ Verified |
| POST /api/render/refine — exists | ✅ Verified |
| POST /api/parse-constraints — exists | ✅ Verified |
| GET /api/auth/callback — redirects to step-4 | ✅ Fixed |

### TypeScript
| Item | Status |
|---|---|
| `npx tsc --noEmit` | ✅ Zero errors |
| No `any` types in lib/ components/ app/ | ✅ Fixed (RoomChatbot) |

### Supabase
| Item | Status |
|---|---|
| lib/supabase/server.ts exports createServerSupabaseClient | ✅ Verified |
| lib/supabase/client.ts exports createBrowserClient | ✅ Verified |
| No direct @supabase/supabase-js in client components | ✅ Verified |
| middleware.ts refreshes session | ✅ Verified |
| Auth callback exists at /api/auth/callback | ✅ Verified |

### Build
| Item | Status |
|---|---|
| `npm run build` passes | ✅ Compiles with warnings only (no errors) |
| Warnings | Pre-existing console.log in pipeline routes |

---

## Final Status

- **Build:** ✅ PASS (warnings only, no errors)
- **TypeScript:** ✅ PASS (zero errors)
- **Navigation flow:** ✅ All steps connected correctly
- **Store contracts:** ✅ All required fields present
- **Rule 8 compliance:** ✅ Style names removed from UI
- **Auth flow:** ✅ Middleware fixed, callback redirects to step-4
