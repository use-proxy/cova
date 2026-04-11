# Spec: Rebuild all 19 Cova pages to match SITE.md layout and DESIGN.md tokens
Date: 2026-04-09
Status: DRAFT

## PROBLEM
All pages in the Cova web app use an inconsistent, partially-implemented design system that does not match the SITE.md screen-by-screen layout spec or the exact DESIGN.md color/typography tokens. Pages use wrong background colors (#0A1628 instead of #091829), wrong surface colors (#0F1F3D instead of rgba(255,255,255,0.04)), wrong fonts (Inter/EB Garamond instead of Playfair Display/DM Sans), no Framer Motion animations, and missing layout structures (split layouts, full-bleed screens, bottom sheets, etc.).

## FILES IN SCOPE
- apps/web/app/auth/page.tsx
- apps/web/app/design/step-1/page.tsx
- apps/web/app/design/step-2/page.tsx
- apps/web/app/design/step-3/page.tsx
- apps/web/app/design/step-4/page.tsx
- apps/web/app/design/step-5/page.tsx
- apps/web/app/design/step-6/page.tsx
- apps/web/app/design/step-7/page.tsx
- apps/web/app/design/step-7a/page.tsx
- apps/web/app/design/step-7b/page.tsx
- apps/web/app/design/step-7c/page.tsx
- apps/web/app/design/step-7d/page.tsx
- apps/web/app/design/step-7e/page.tsx
- apps/web/app/design/step-8/page.tsx
- apps/web/app/design/step-9/page.tsx
- apps/web/app/budget/page.tsx
- apps/web/app/dashboard/page.tsx
- apps/web/app/dashboard/saved/page.tsx
- apps/web/app/dashboard/settings/page.tsx

## FILES OUT OF SCOPE
- apps/web/app/api/** (all API routes — frozen)
- apps/web/lib/** (all lib utilities — frozen)
- apps/web/middleware.ts (frozen)
- apps/web/components/cova/** (shared components — frozen)
- apps/web/components/dashboard/** (dashboard components — do not modify)
- apps/web/app/layout.tsx (frozen)
- apps/web/tailwind.config.ts (frozen)
- apps/web/app/globals.css (frozen)
- styles/tokens.css (frozen)
- apps/mobile/** (frozen — never touch)
- supabase/** (frozen)
- modal_pipeline/** (frozen)
- apps/web/app/dashboard/layout.tsx (frozen)
- apps/web/app/dashboard/SignOutButton.tsx (frozen)

## DESIGN TOKENS (exact values from DESIGN.md — use these, not tokens.css)
- Background: #091829
- Surface (cards): rgba(255,255,255,0.04)
- Surface elevated (sheets/modals): rgba(255,255,255,0.07)
- Gold primary: #C9A84C
- Gold hover: #D4B460
- Gold subtle bg: rgba(201,168,76,0.12)
- Gold shimmer: rgba(201,168,76,0.08)
- Text primary: #F5F0E8 (ivory)
- Text secondary: rgba(245,240,232,0.45)
- Border default: rgba(201,168,76,0.15)
- Border hover: rgba(201,168,76,0.35)
- Border active/focus: rgba(201,168,76,0.6)
- Top bar bg: rgba(9,24,41,0.8)
- Top bar border: rgba(201,168,76,0.1)
- Sheet bg: rgba(9,24,41,0.95)
- Overlay: rgba(0,0,0,0.6)
- Error: #E87070
- Error bg: rgba(232,112,112,0.1)
- Success: #6FCF97
- Font display/headings: Playfair Display (use font-playfair or font-display Tailwind class)
- Font UI: DM Sans (use font-dm-sans Tailwind class)
- Wordmark: Playfair Display italic, 20px, #C9A84C, letter-spacing 0.05em

## ACCEPTANCE CRITERIA
1. All 19 pages render without TypeScript errors when running `next build`
2. `/auth` — split layout, left atmospheric image panel, right form card; email+password fields; Google OAuth button; Framer Motion entrance animation (translateY 24px → 0)
3. `/design/step-1` — full-bleed atmospheric background; frosted glass top bar; hero headline "Your room. Reimagined." in Playfair Display 64–72px; 4-step row; gold CTA; particle system present
4. `/design/step-2` — masonry grid 3 columns; 9 image cards; gold checkmark on selection; selection counter pill; CTA disabled until 2 selected; progress bar at top
5. `/design/step-3` — full-viewport two-image layout; A/B labels; gold OR divider; keyboard support (A/D keys); card-flip animation between rounds; progress bar
6. `/design/step-4` — SVG radar/spider chart 12 axes animating from center; style descriptor tags; gold CTA
7. `/design/step-5` — Budget Setup: room type pill selector; dual-handle budget slider; 4 tier cards; selected range display; gold CTA
8. `/design/step-6` — upload zone with dashed gold border; drag-over state; image preview after upload; file format note; CTA disabled until file uploaded
9. `/design/step-7` — full viewport; concentric pulsing gold rings; crossfading status messages every 2.5s; particle system; NO spinner, NO progress bar
10. `/design/step-7a` — 9 detection cards in grid; each card has icon+label+value; color swatches on dominant colors card; stagger animation
11. `/design/step-7b` — constraint form cards: own/rent toggle, physical constraints checkboxes, light/size/who toggles, style delta sliders (-2 to +2); scrollable
12. `/design/step-7c` — split layout 60/40; left: room image with bounding box overlays; right: scrollable item list grouped by type; keep/remove states
13. `/design/step-7d` — 6-tab bar (Budget, Products, Art, Tech, Sensory, Identity); chat message area; typing indicator; CTA activates when Budget tab + 1 other complete
14. `/design/step-7e` — 3 variant cards side by side; 3D tilt on hover (rotateX/Y ±8deg); gold border glow on selection; skip link
15. `/design/step-8` — 3 states: Loading (gold arc), Result (before/after 50/50 slider), Tweak Panel (bottom sheet with 3 cards); state transitions with Framer Motion
16. `/design/step-9` — full-viewport image; sonar hotspot markers (scale 1→2.5, opacity 0.6→0, 2s infinite); product bottom sheet; complete-the-room panel
17. `/budget` — budget panel bottom sheet: tier tabs; total display; item list with tier alternatives; shimmer loading rows
18. `/dashboard` — greeting with first name; 3 stats metric cards; rooms grid 3-col; empty state with gold CTA; frosted glass top bar
19. `/dashboard/saved` — filter bar (room dropdown, category pills, price sort); 4-col product grid; empty state
20. `/dashboard/settings` — two-column (240px nav + content); 4 nav items; Account/Notifications/StyleProfile/Privacy tabs
21. Every page uses `#091829` background, NOT #0A1628 or #000
22. Every card uses `rgba(255,255,255,0.04)` background, NOT opaque #0F1F3D
23. Every top bar uses `rgba(9,24,41,0.8)` + `backdrop-filter: blur(20px)` + border `rgba(201,168,76,0.1)`
24. Wordmark "Cova" appears italic, Playfair Display, #C9A84C on every page's top bar
25. No gray skeletons — all loading states use gold shimmer `rgba(201,168,76,0.08)`
26. Rule 8: Style names (Japandi, Bohemian, Coastal, Mid-Century Modern, Minimalist) NEVER appear in any user-facing string
27. Auth page preserves existing Supabase auth logic (signInWithOtp, signInWithOAuth)
28. Dashboard page preserves existing server-side Supabase queries (getUserRooms, getUserFingerprint, getSavedProducts)

## WHAT NOT TO DO
- Do not import from @supabase/supabase-js directly — use @/lib/supabase/client or @/lib/supabase/server
- Do not use localStorage or sessionStorage anywhere
- Do not modify any file not listed in FILES IN SCOPE
- Do not call CLIP embedding from client-side code
- Do not expose SUPABASE_SERVICE_ROLE_KEY in any NEXT_PUBLIC_ variable
- Do not import @sparkjsdev/spark at the module level of any page file
- Do not show style names (Japandi, Bohemian, Coastal, Mid-Century Modern, Minimalist) to users
- Do not use gray skeletons — always use gold shimmer
- Do not change routing — every page must stay at its current route
- Do not add new npm dependencies — use only what is in package.json (framer-motion, lucide-react, etc.)
- Do not refactor shared components in apps/web/components/cova/
- Do not change any API behavior or data fetching logic in lib/

## PHASE PLAN
### Phase 1: Auth + Shared Atoms
- `/auth/page.tsx` — split layout rebuild, preserve auth logic
- Establish shared inline style patterns used across all pages

### Phase 2: Design Flow — Steps 1–4 (Welcome through Fingerprint Reveal)
- step-1: Welcome hero
- step-2: Style Anchor Selection
- step-3: Pairwise Quiz
- step-4: Fingerprint Reveal

### Phase 3: Design Flow — Steps 5–7 (Budget through Analysis Loading)
- step-5: Budget Setup
- step-6: Room Upload
- step-7: Analysis Loading

### Phase 4: Design Flow — Steps 7a–7e (Results through Variant Picker)
- step-7a: Analysis Results
- step-7b: Constraints
- step-7c: Keep/Remove
- step-7d: Chatbot
- step-7e: Style Variant Picker

### Phase 5: Design Flow — Steps 8–9 + Budget Panel
- step-8: Render Loading/Result/Tweak
- step-9: Shoppable Room
- budget/page.tsx: Budget Calculator Panel

### Phase 6: Dashboard Pages
- dashboard/page.tsx: Dashboard home
- dashboard/saved/page.tsx: Saved Products
- dashboard/settings/page.tsx: Settings

## INTEGRATION TEST REQUIRED
no
