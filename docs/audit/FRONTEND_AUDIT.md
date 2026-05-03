# Cova V1 — Frontend Audit

**Date:** 2026-04-29
**Scope:** `apps/web/` — all user-facing screens, design system, components.
**Method:** static read of every `page.tsx`, every `components/*` directory, `tailwind.config.ts`, `globals.css`, `styles/tokens.css`. No dev server hit.
**Source-of-truth flow (per `apps/web/CLAUDE.md`):** `/auth → step-1 → step-2 → step-3 → step-3b → step-4 → step-5 → step-6 → step-7 → step-7p → step-8a → step-8b → step-9`.

---

## 1. Design System State

### Is there a design system?
**Yes — partially adopted.** Three distinct layers coexist:

| Layer | Where | State |
|---|---|---|
| `styles/tokens.css` (root) | imported by `apps/web/app/globals.css` | Canonical. Defines `--cova-bg`, `--cova-surface`, `--cova-gold`, `--cova-ivory`, `--font-serif` (EB Garamond), `--font-sans` (Inter), spacing/radius/shadow scales. 175 lines. |
| Tailwind config | `tailwind.config.ts` | Maps tokens to Tailwind classes (`bg-cova-bg`, `text-cova-gold`, etc.). Adds Playfair Display + DM Sans variables on top of EB Garamond + Inter. |
| Cova primitives | `components/cova/{CovaButton,CovaCard,CovaInput,GoldDivider,StepIndicator}.tsx` | **Built but barely used.** Only `dashboard/profile/page.tsx`, dashboard subcomponents (`AvatarDropdown`, `RoomCard`, `RoomsGrid`, `SavedProductCard`, `DeleteAccountButton`, `DesignDnaShare`) reference them. Zero usages anywhere under `app/design/step-*`, `app/auth`, `app/page.tsx`, `app/dashboard/page.tsx`, `app/dashboard/settings`, `app/dashboard/saved`, `app/capture/*`, `app/room/*`. |

### Visual style — is the memo correct?
- **Background `#091829`** ✅ — set as `--background` in `globals.css` and `--cova-bg` (technically `#0A1628`, with `#091829` as `--cova-bg`'s alias `--navy-darker`). Both shades present, used interchangeably. Minor inconsistency.
- **Gold `#C9A84C` / `#D4B460`** ✅ — `--cova-gold` is `#C9A84C`; `--gold-light` is `#D4B460`; CTAs and accents consistently use these.
- **Ivory `#F5F0E8`** ✅ — defined as `--ivory`. Body text uses warmer `#F8F6F1` (`--cova-ivory`); both ivories appear, again a minor inconsistency.
- **EB Garamond + DM Sans** ✅ for serif/UI mix. Loaded in `app/layout.tsx` alongside Inter and Playfair Display. Several pages use **Playfair Display** for headlines (`app/page.tsx` landing, `app/dashboard/page.tsx`) instead of EB Garamond — drift from spec.
- **"Modern luxurious" aesthetic** ✅ on the high-traffic surfaces (landing, auth, step-1, step-5, step-6, step-8a, step-8b, step-9, dashboard home). ❌ on `step-3b`, `step-7p`, `capture/new`, the three test pages (`/budget`, `/chatbot`, `/product-panel`) — these look unstyled or placeholder.

### Component library
- **shadcn/ui:** present but minimal — only `components/ui/{alert-dialog,dropdown-menu,switch}.tsx`. Used by dashboard layout dropdown, settings switches, delete confirm.
- **Tailwind:** active (config + classes), but most step pages **bypass it** in favor of inline `style={{}}` and per-page `stepN.css` files.
- **Per-step CSS files** (~14 files: `step1.css … step9.css`, `step3b.css`, `dashboard.css`, `saved.css`, `settings.css`) carry most of the styling. This is non-portable — primitives in `components/cova/` cannot replace inline-styled JSX.
- **Framer Motion** is used heavily on landing + dashboard, lightly elsewhere; many "animations" elsewhere are CSS keyframes in `globals.css` (`fadeIn`, `slideUp`, `dotPulse`, `archDraw`, `shimmerSweep`, etc. — 35+ keyframes).

### Verdict on consistency
**B-minus.** Design tokens are correctly defined. The brand language is coherent on the marketing + reveal surfaces. The system isn't *applied uniformly* because the design-flow pages were each built as bespoke 300–1500-line files with their own CSS. The `components/cova/*` primitive layer was built and then mostly ignored.

---

## 2. Screen-by-Screen Inventory

| # | Path | Purpose | Visual | Functional | Mobile | A11y | Notes |
|---|---|---|:---:|---|:---:|:---:|---|
| 1 | `/` (`app/page.tsx`, 2745 lines) | Marketing landing | 5 | works | ⚠️ | basic | Polished. Hero/HowItWorks/BeforeAfter/ShoppableRoom/SmartFeatures/Personalization/StyleGallery/Testimonials/FinalCTA. Uses Unsplash + CDN imagery. **No pricing table, no FAQ, no demo video embed.** |
| 2 | `/auth` (`app/auth/page.tsx`, 765 lines) | Email + Google OAuth login/signup | 5 | works | ✅ | good | Cormorant Garamond + Manrope (drift from spec — spec calls for EB Garamond + Inter/DM Sans). Forgot-password and Request-access buttons are no-ops. |
| 3 | `/auth/callback/route.ts` | OAuth handler | n/a | works | n/a | n/a | Persists pre-auth fingerprint cookie → DB. Silent failure on cookie parse. |
| 4 | `/design/step-1` (330 lines) | Welcome | 4.5 | works | ⚠️ | partial | Particle field + floating hero. Hardcoded "24 shoppable pieces" badge. |
| 5 | `/design/step-2` (392 lines) | Pick 2 anchor styles + room type | 4 | works | ⚠️ | good | 3-question anchor flow. Partial responsive (max-width 900px hard-coded). |
| 6 | `/design/step-3` (840 lines) | 12-pair quiz + non-visual Q's | 4 | works | ⚠️ | good | Pairwise images via background-image (no alt text). Phase A correctly skipped if coming from step-2. |
| 7 | `/design/step-3b` (289 lines) | Style-blend confirm + adjust sliders | 3 | works | ✅ | partial | **Visually weak** — minimal styling. **Violates Hard Rule #8** — `DISPLAY_NAMES` map exposes `"Japandi"`, `"Minimalist"`, `"Mid-Century"`, `"Coastal"`, `"Bohemian"`, `"Scandinavian"` directly in the UI. |
| 8 | `/design/step-4` (1117 lines) | Fingerprint reveal + radar + tweak | 4.5 | partial | ⚠️ | partial | Style name + description **computed via heuristics in the client**, not from API. `/api/quiz/tweak` exists but parsing incomplete. Style preview poll runs 60s without UI feedback. |
| 9 | `/design/step-5` (1282 lines) | Budget tier picker | 4 | works | ⚠️ | partial | 5 luxe budget cards with star ratings. No validation that user picked one before advancing. |
| 10 | `/design/step-6` (1577 lines) | Photo upload + QR fallback | 4.5 | works | ✅ | good | Polished. **No >5MB enforcement** (Anthropic 5MB hard limit, known issue). **No hard-room warning** ("don't shoot through doorway"). 3 generic tip cards. |
| 11 | `/design/step-7` (463 lines) | Pre-detect polling | 4 | works | ✅ | partial | Cosmetic 6-sec timer + real polling. **Detection dots are mock positions** (hardcoded coords, not from `pre_detection_result`). 3-min timeout with weak error UX. |
| 12 | `/design/step-7p` (218 lines) | Personalization manifest | 3 | **broken** | ✅ | poor | **All 6 manifest slots show disabled "Add (coming soon)" buttons.** No input UI implemented. Only working CTA: "Skip & Generate" (saves empty manifest, fires redesign). |
| 13 | `/design/step-8a` (719 lines) | Render reveal | 5 | works | ⚠️ | good | Cinematic — pointer-tracked glow, particle burst, refinement counter dots, lock state. **No before/after slider here** (lives in step-8b). 180s render-poll timeout. |
| 14 | `/design/step-8b` (522 lines) | Tap-to-refine + chat refinement | 4.5 | works | ⚠️ | good | Tap → SAM-3 + Claude Haiku label → menu (Replace/Remove/Adjust). Chat textarea, suggestion chips (3), version history thumbnails, "hold to see original" button. SOFT_CAP 10 / HARD_CAP 20. Tap menu may clip on mobile. |
| 15 | `/design/step-9` (1316 lines) | Shoppable hotspots + product grid | 4.5 | works | ✅ | good | Hotspot zones, room-tour mode, filter tabs, sort, budget tracker, save-to-DB, share. **Three product-loading paths** (room_products+SERP / legacy products / `rooms.matched_products` JSONB) — only the first is V3. **No token-gating UI** (memory says $0.90/unlock); affiliate URLs are direct. |
| 16 | `/dashboard` (`app/dashboard/page.tsx`, 924 lines) | Hub: stats, rooms, saved, style DNA radar, activity | 4.5 | placeholder | ❌ | weak | **All data hardcoded** ("Amelia Laurent" user, 12 rooms, 47 items, etc.). Sidebar is fixed 240px with no breakpoint — **breaks on mobile.** Canvas radar not exposed to a11y. No token balance display. |
| 17 | `/dashboard/layout.tsx` | Top nav + avatar dropdown wrapper | 4 | works | ✅ | partial | Server-side auth redirect; uses shadcn dropdown. |
| 18 | `/dashboard/profile` (149 lines) | User identity + style fingerprint + delete-account | 3 | works | ✅ | good | The **only page that uses `components/cova/*` primitives.** Restrained, on-brand. |
| 19 | `/dashboard/settings` (1170 lines) | Notifications, budget, retailers, currency, style | 4 | placeholder | ⚠️ | weak | **Settings don't persist** — no API POST anywhere. Hardcoded "Ariana Bennett" user. **No subscription/billing UI** (CLAUDE.md spec: Starter $16 / Pro $39 / Studio $99 — absent). |
| 20 | `/dashboard/saved` (1033 lines) | Saved-products gallery, filters, CSV export | 4 | placeholder | ⚠️ | basic | Hardcoded `productTemplates` array. Real schema = `saved_products` table (used by step-9). Filter state doesn't persist across navigation. |
| 21 | `/budget` (268 lines) | Budget tier sheet | 3 | placeholder | ✅ | basic | **Duplicates step-5.** Hardcoded items (Sofa, Coffee Table, Floor Lamp, Area Rug). Likely a V1 prototype that should be deleted. |
| 22 | `/chatbot` (73 lines) | Standalone ChatPanel test | 3 | placeholder | n/a | n/a | Dev test page. Hardcoded `MOCK_CONTEXT` + `PRELOADED_MESSAGES`. Not wired into navigation. |
| 23 | `/product-panel` (219 lines) | Standalone ProductPanel test | 3 | placeholder | n/a | n/a | Dev test page. Hardcoded `MOCK_PRODUCTS` with hotspot coords. Not wired into navigation. |
| 24 | `/capture/new` (84 lines) | Creates room → redirects | 1 | works | n/a | n/a | Bare arc logo. **No error UI, no timeout** — silent hang on API failure. |
| 25 | `/capture/[roomId]` (309 lines) | Multi-shot 8-slot capture | n/a | **deprecated** | n/a | n/a | **Violates V3** (single-photo-only per `apps/web/CLAUDE.md`). 8-slot upload + QR mode preserved from V1. |
| 26 | `/capture/mobile/[token]` (329 lines) | Phone half of QR handoff | n/a | partial | n/a | n/a | Used by step-6 QR fallback tab. Functioning but unclear product status. |
| 27 | `/room/[roomId]/3d` (356 lines) | "3D" room mock with chat + product panels | n/a | placeholder | n/a | n/a | Hardcoded `MOCK_PRODUCTS`. Not in any user flow. Likely V1 panorama remnant — `apps/web/CLAUDE.md` explicitly bans 3D/panorama. |

### 2a. Auth flow — login/signup/OAuth
- `/auth/page.tsx` is **the** auth page; it's polished (5/5) and works (email/password + Google).
- A second `components/auth/AuthModal.tsx` (modal variant) exists with the same flow but redirects to `/dashboard` and `/capture` (the latter not in V3 routes). Not currently mounted on landing.
- Forgot-password and Request-access buttons in `/auth` are no-ops.

### 2b. Onboarding — style quiz
- step-1 → 2 → 3 → 3b → 4 chain works end-to-end. Quiz fingerprint is computed and saved to `users.style_fingerprint`.
- step-4 generates style **name** and **description** with client-side heuristics (`computeStyleName(dims)`-style logic in the page) instead of using the API response — a divergence risk.
- step-3b breaks Hard Rule #8 (forbidden style names visible).

### 2c. Personalization — confirmed disabled
✅ Memory is correct. `step-7p` ships with all 6 slot cards rendered as `<button disabled>Add (coming soon)</button>`.
- The 6 slots that the manifest schema (`apps/web/lib/types/personalization.ts` `PersonalizationManifest v2.0`) defines are: **art, smart_products, specific_items, lighting, identity_objects, freetext.**
- The CTA `handleSkipAndRender()` works: it saves an empty manifest, calls `/api/pipeline/redesign`, navigates to step-8a.
- **Salvageable:** the 6-card grid layout, the manifest schema, the personalization-compiler hooking. Each card needs an actual modal/drawer/inline form.

### 2d. Capture/upload
- `step-6` is the canonical V3 entry. Drag-drop + file input + QR fallback tab.
- Capture guidance: 3 generic tip cards (lighting / corners / steady shot). **No hard-room warning. No visual frame guide. No file-size enforcement (>5MB will fail Anthropic Vision).**
- The `apps/web/components/capture/*` directory still has V1 multi-shot artifacts (`MobileCapture`, `QRCapture`, `QRMode`, `UploadMode`, `CaptureResult`, `CompletionScreen`, `QualityChecker`, `RoomMeasure`, `UploadFallback`) — most are not imported in the active flow.

### 2e. Style selection
- Effectively step-2 (anchor pick) + step-3 (pairwise) + step-3b (slider adjust). No standalone "pick a style from a grid" surface, by design.

### 2f. Render-in-progress
- step-7 (pre-detection polling) + the in-page loading state inside step-8a (sequential checkmarks while redesign runs). No dedicated `/processing` page.

### 2g. Results view
- step-8a — image only, no hotspots. Hotspots are deferred to step-9. Refine button + Shop button + remaining-render counter present.

### 2h. Refine flow
✅ Exists (step-8b). Has all of: free-form prompt, tap-to-select with auto-label, suggestion chips, before/after hold-button, version history. **Refine count: SOFT_CAP 10, HARD_CAP 20** per session. Step-8a counter starts at `DEFAULT_RENDER_COUNT=3` (this is the "render" budget, not the refine budget — distinct concepts not clearly separated in UI).

### 2i. Product matching
- Hotspots ✅, click-to-shop ✅, product cards ✅, affiliate URLs out ✅ (via `serp_product_url` field), saved-products persistence ✅.
- **No token gating in UI.** Memory says $0.90/unlock — not implemented. All hotspots are clickable for free.

### 2j. History/past renders
- Lives only in `/dashboard` and `/dashboard/saved`. **Both use mock data** — no real DB query.

### 2k. Settings/account
- `/dashboard/profile` (real data, minimal UI) + `/dashboard/settings` (rich UI, mock data, no persistence).

---

## 3. Personalization System (Frontend Side)

### Currently captured (step-7p)
The manifest schema defines 6 slots. The UI **renders all 6 as cards but every input control is disabled.** Net: zero personalization is captured today.

| Slot | UI status |
|---|---|
| art | "Add (coming soon)" — disabled |
| smart_products | "Add (coming soon)" — disabled |
| specific_items | "Add (coming soon)" — disabled |
| lighting | "Add (coming soon)" — disabled |
| identity_objects | "Add (coming soon)" — disabled |
| freetext | "Add (coming soon)" — disabled |

The render fires regardless via "Skip & Generate".

### Missing for V1 (per audit prompt)
None of these have any UI surface:
- ❌ palette bias (warm / cool / neutral)
- ❌ density preference (sparse / layered / maximalist)
- ❌ lifestyle constraints (kids / pets / WFH / open vs closed)
- ❌ storage preference
- ❌ plant appetite (none / few / lots)
- ❌ material aversions (e.g., "no velvet")
- ❌ budget tier — *captured at step-5, but lives in `useArea2Store`, not the personalization manifest*
- ❌ must-avoid motifs

### Where should personalization live?
Three viable patterns. **Recommendation: hybrid** — ambient quick toggles (palette bias, density, plants) live in step-7p as inline pickers; deeper preferences (lifestyle, storage, aversions) move to `/dashboard/settings` where they persist across rooms; per-render exceptions stay in step-7p freetext.

---

## 4. Refine Feature (Frontend Side)

### Exists?
✅ Fully wired in `/design/step-8b/page.tsx` (522 lines).

### UX shape
- **Free-form prompt** — textarea, Cmd/Ctrl+Enter to fire.
- **Tap-to-select** — click on render → `/api/render/refinement/detect` (SAM-3 + Haiku label) → floating menu with object label + Replace / Remove / Adjust / Cancel.
- **Suggestion chips** — 3 chips supplied by QA scorer. Disappear after first refine (bug — should refresh).
- **Hold-to-compare** — "Hold to see original" button. Label flip on press is awkward.
- **Version history** — horizontal thumbnail strip (v0 → vN), tap to swap.

### Caps
- Step-8a counter: `DEFAULT_RENDER_COUNT=3` initial renders.
- Step-8b session: SOFT_CAP 10 (warning), HARD_CAP 20 (refuse).
- These two caps coexist confusingly. Memory says "free 3 per room" but step-8b accepts 10–20 inside one session — needs product clarification.

### Delta visualization
Hold-to-compare button exists; **no slider before/after** in step-8a or step-8b.

### Token cost
**Not implemented.** No token deduction on refine. CLAUDE.md token tier system is absent everywhere in UI.

---

## 5. Product Matching / Google Lens (Frontend Side)

### Hotspot UI
✅ in `/design/step-9/page.tsx`. Zones overlay the redesigned image with a 2px gold border, 28px glow, sonar-pulse animation. Hover lifts; click selects.

### On-click behavior
Selecting a hotspot scrolls/highlights the matching product card in the right-hand grid. Card has: image, brand, name, category pill, retailer, price (with strikethrough sale price), Save button (heart, persists to `saved_products` table), Shop button (opens `serp_product_url` in new tab with `noopener`).

### Product card design
✅ Exists, on-brand, ~4/5 visual quality. Animated skeleton shimmer while loading.

### Affiliate link out
✅ Wired (direct URL in `serp_product_url` or fallback `affiliate_url`). Opens new tab.

### Token gating reflected?
❌ **No.** All hotspots are clickable for free. The $0.90-per-unlock concept from memory has no UI representation.

---

## 6. Token / Subscription UI

| Feature | Status |
|---|---|
| Token balance display | ❌ Absent. Sidebar in dashboard hardcodes "3 rooms remaining" as static text. |
| Purchase tokens flow | ❌ Absent. |
| Subscription page | ❌ Absent. |
| Pricing on landing | ❌ Absent. (No Starter/Pro/Studio table.) |
| Tiered gating in render flow | ❌ Absent. step-8a counter is local-only. |
| `RetryButton.tsx` | Exists, not imported. Designed around `tokenBalance`, `freeRetriesUsed`, `paidRetriesUsed`, `hourRetryCount` props — **the only place token-economy concepts are coded**, but it's orphaned. |

The whole monetization layer (Starter $16 / Pro $39 / Studio $99 + 7 free tokens on signup + $0.90 product unlock) is **invisible to users**. This is the single biggest V1 gap.

---

## 7. Mobile Responsiveness

| Surface | Mobile status |
|---|---|
| Landing (`/`) | ⚠️ Likely OK — uses `clamp()` + `sm:`/`md:` breakpoints. Untested. |
| `/auth` | ✅ Cards scale, padding reduces, touch targets ≥3.6rem. |
| step-1 / step-2 / step-3 / step-4 / step-5 | ⚠️ Partial — relies on per-step CSS files with hard-coded max-widths (e.g., 900px in step-2, fixed grid sizes). Tablet breakpoints (768–1024px) rarely used. |
| step-3b | ✅ — sliders touch-friendly. |
| step-6 | ✅ — clamp font sizes, mobile-first padding. |
| step-7 | ✅ — canvas + CSS 3D scale to viewport. |
| step-7p | ✅ — but UI is empty so easy to be responsive. |
| step-8a | ⚠️ — bottom panel stacks; pointer-tracked glow falls back to default position. |
| step-8b | ⚠️ — split layout. Tap-to-select menu may clip near edges. **No explicit mobile media query.** |
| step-9 | ✅ — grid collapses, filter tabs scroll horizontally. |
| `/dashboard` | ❌ **Broken.** Sidebar is `position: fixed; width: 240px` with no breakpoint — overlaps content on phones. |
| `/dashboard/settings` | ⚠️ Untested. No breakpoints visible in TSX. |
| `/dashboard/saved` | ⚠️ Filter sidebar likely doesn't adapt. |
| `/dashboard/profile` | ✅ Stacked cards. |
| Capture pages | ✅ Mobile-first (they *are* the mobile capture surface). |

**Mobile-specific designs needed (not just reflow):** `/dashboard` (sidebar → bottom-nav or off-canvas drawer), `/dashboard/saved` (filters → bottom-sheet), step-8b (right-side chat → bottom-sheet on mobile, tap-menu repositioning logic).

---

## 8. Manus / v0-Generated Screens

No literal "Manus" or "v0" markers found in the codebase. CLAUDE.md cites v0 as the generation tool but no comments survive in code.

By stylistic pattern, the **likely-generated** screens (high coherence, comment headers like "design philosophy", consistent CSS variable usage, large single-file pages) are:

- **Strong candidates** — `/dashboard/page.tsx`, `/dashboard/settings/page.tsx`, `/dashboard/saved/page.tsx`, `/budget/page.tsx`. All have the "mock data + animated stats + glass morphism" pattern, none integrate with Supabase.
- **Probable hand-crafted (or hand-finished generation)** — `/auth/page.tsx`, `/`, step-1, step-5, step-6, step-8a, step-8b, step-9. These show real API wiring + production polish.
- **Probable scaffolds that need redesign** — `/design/step-3b`, `/design/step-7p`, `/capture/new`, `/chatbot`, `/product-panel`. Functional or cosmetic stubs.

Files that look out of place (could come from Manus or be experimental):
- `/budget`, `/chatbot`, `/product-panel` — three sandbox routes that should not be in a production tree.

---

## 9. Recommendations for V1

### Keep as-is (production-ready)
- `/auth`
- `/design/step-1`, step-5, step-6, step-8a, step-8b, step-9
- `/dashboard/profile`
- `/dashboard/layout.tsx`
- `components/cova/*` primitives, `styles/tokens.css`

### Light revision
- **Landing** (`/`) — add pricing table, embed demo video, add FAQ. Visual quality is already there.
- **step-2, step-3** — add tablet breakpoints, alt text on background-image pairs.
- **step-4** — switch from client-side heuristics to API-returned style name + description.
- **step-7** — wire `pre_detection_result` coordinates to detection dot positions; replace static mocks.
- **step-9** — drop two legacy product-loading paths, add token-gating UI shell.
- **`/dashboard/profile`** — add token balance + retake-quiz CTA.

### Major redesign / regen
- **`/dashboard/page.tsx`** — replace mock data with real Supabase queries (`rooms`, `saved_products`, `users.style_fingerprint`, token balance). Add a real mobile breakpoint. Surface subscription tier + token balance.
- **`/dashboard/settings/page.tsx`** — wire every form to a `PATCH /api/user/settings` endpoint. Add billing/subscription tab. Strip "Ariana Bennett" mock identity.
- **`/dashboard/saved/page.tsx`** — replace `productTemplates` array with the real `saved_products` table query. Mobile bottom-sheet for filters.
- **`/design/step-3b`** — fix Hard-Rule-#8 violation (don't show "Japandi", "Bohemian", etc. — use display-helper that returns descriptive strings). Visual upgrade to match step-4.
- **`/design/step-7p`** — implement the 6 input controls. Add palette bias, density, plants, lifestyle, material aversions either here or as ambient settings.

### Build from scratch
- **`/pricing`** — Starter $16 / Pro $39 / Studio $99 plans, "7 free tokens on signup" callout, FAQ.
- **`/dashboard/billing`** (or settings → Billing tab) — current plan, token balance, top-up purchase, invoice history.
- **Token balance widget** in `dashboard/layout.tsx` top nav and in `AvatarDropdown`.
- **Token-gating UI** in step-9 (lock state on hotspots until unlocked).
- **Hard-room warning modal** in step-6 — frame guide images + "good vs bad" examples.

### Delete / not in V1
- `/budget` — duplicates step-5. Delete.
- `/chatbot` — dev test page. Delete (or move to `_dev/`).
- `/product-panel` — dev test page. Delete.
- `/capture/[roomId]` — V1 8-slot multi-shot. Violates V3 hard rule. Delete or move to `app/_legacy/`.
- `/room/[roomId]/3d` — V1 panorama mock. `apps/web/CLAUDE.md` bans 3D/panorama. Delete.
- `components/render/RetryButton.tsx` — orphaned, unused. Delete unless wiring it up to step-8a retry.
- `components/capture/{MobileCapture,QRMode,QRCapture,UploadMode,CaptureResult,CompletionScreen,QualityChecker,RoomMeasure,UploadFallback}` — keep only what step-6's QR-fallback tab actively imports; archive the rest.
- `apps/web/app/design/_future/step-7{b,c,e,f,g,h}` — already gated correctly; leave under `_future`.

---

## 10. Open Questions

1. **Is QR-handoff (`/capture/mobile/[token]`) a supported V1 mode or a deprecated path?** Step-6 still ships the tab; `apps/web/CLAUDE.md` says single-photo-only. Need product call.
2. **Is the "3 renders per room" cap (step-8a) the same budget as the "10/20 refines per session" cap (step-8b)?** Or are they separate? UI implies both but doesn't reconcile.
3. **What does a "token" cost in dollars and how many does each user action consume?** Memory mentions $0.90/product-unlock, $16/$39/$99 plans, 7 free tokens on signup. Need a complete table to wire UI.
4. **Should personalization (palette / density / lifestyle / aversions) live per-render (step-7p) or as ambient `/dashboard/settings` preferences, or both?**
5. **Will Hard Rule #8 (forbidden style names — Japandi, Bohemian, Coastal, Mid-Century Modern, Minimalist) be relaxed for V1?** It's currently violated in `step-3b/page.tsx:18-29`. Either enforce a `toCovaKeyDisplayName` mapping or relax the rule.
6. **Are `/dashboard/page.tsx`, `/dashboard/settings`, `/dashboard/saved` intended to be Manus-regenerated with real data, or hand-rewired from current shells?** They are visually further along than `/design/step-7p` but functionally hollower.
7. **Should step-4's style-name + description come from the API or stay client-computed?** The current heuristic divergence is a maintenance risk.
8. **Do we want a unified `/processing` screen** (replacing step-7's cosmetic timer + step-8a's in-page loading), or keep them split per stage?
