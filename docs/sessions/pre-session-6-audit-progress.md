# Pre-Session-6 Audit Progress
Generated: 2026-04-07

## Summary
All audit checks completed. Zero regressions. 72/72 Playwright tests pass.

---

## Audit Results

### Audit 1: Environment + Dependencies

**1a: SEARCHAPI_KEY vs SERPAPI_KEY**
- No SERPAPI_KEY or SEARCHAPI_KEY found in .env.local or codebase.
- Status: PASS (no action needed)

**1b: shadcn Switch**
- Was MISSING. Installed `@radix-ui/react-switch` via npm.
- Created `components/ui/switch.tsx` manually (shadcn init blocked by pnpm version mismatch).
- Created `lib/utils.ts` with `cn()` helper.
- Installed `clsx` and `tailwind-merge` dependencies.
- Updated `app/design/step-1/page.tsx`: replaced custom `GiftToggle` with shadcn `Switch`.
- Status: FIXED

**1c: Other shadcn components**
- No other components from `@/components/ui/` are imported anywhere in the app.
- Only `switch` was needed.
- Status: PASS

---

### Audit 2: TotalSteps Standardization

- Playwright tests expect "Step N of 10" (verified in user-workflows.spec.ts lines 20, 88, 124, 301-305).
- No "of 9" references found.
- totalSteps kept at 10 throughout. No changes made.
- Status: PASS (no action needed — tests are the acceptance criteria)

---

### Audit 3: Supabase Schema Alignment

**3a: 7-table verification**
All 7 tables accessible:
- users: OK
- style_fingerprints: OK
- rooms: OK
- render_sessions: OK
- products: OK
- interactions: OK
- style_references: OK

**3b: rooms v2.0 columns**
- `pipeline_cost_log`: OK (exists in DB)
- `room_analysis`: OK (exists in DB)
- `preview_url`: MISSING from DB
- `parallax_video_url`: MISSING from DB
- Note: `preview_url` and `parallax_video_url` exist in `render_sessions`, not `rooms`.
- Action: Documented in `docs/migrations/002_v2_columns.sql`. Added to TypeScript types.

**3c: products embeddings**
- `clip_embedding_data`: OK (exists in DB, 768-dim)
- `clip_embedding`: MISSING (old name, does not exist)
- `clip_fusion_embedding`: MISSING (old name, does not exist)
- `dinov3_embedding`: MISSING from DB (future column)
- `siglip2_embedding`: MISSING from DB (future column)
- Action: Documented in `docs/migrations/002_v2_columns.sql`. Updated TypeScript types.

**3d: types/supabase.ts alignment**
- Fixed: `clip_embedding` + `clip_fusion_embedding` → `clip_embedding_data` + `dinov3_embedding` + `siglip2_embedding`
- Fixed: Added `preview_url` and `parallax_video_url` to rooms table type
- Added `shelf_tap` and `mask_viewed` to interaction_action enum
- Also fixed `tests/types/supabase.test.ts` to match updated types (was referencing old column names)

**3e: Match route column names**
- No old `clip_embedding` or `clip_fusion_embedding` references found in `app/api/match/route.ts` or `app/api/match/accessories/route.ts`.
- Status: PASS

---

### Audit 4: Zustand Stores Alignment

**4a: room.ts v2.0 fields**
All 5 present: `previewUrl`, `parallaxVideoUrl`, `predictionId`, `schnellPredictionId`, `swapRenderUrl`
- Status: PASS

**4b: fingerprint.ts v2.0 fields**
All 4 present: `phaseASelections`, `phaseBResponses`, `showcasePredictionIds`, `isGiftMode`
- Status: PASS

**4c: No array-index fingerprint access**
No `fingerprint[` references found in app/, lib/, components/.
- Status: PASS

**4d: StyleFingerprint type**
All 5 dimensions present in types/fingerprint.ts: `luminosity`, `materialOrigin`, `saturation`, `nature`, `scale`
- Status: PASS (10-dim type confirmed)

---

### Audit 5: Design System

**5a: CSS tokens**
All 4 tokens present in styles/tokens.css:
- `--cova-surface-3: #1A3258` ✓
- `--cova-gold-dim: rgba(201, 168, 76, 0.30)` ✓
- `--cova-border-dim: rgba(30, 58, 95, 0.50)` ✓
- `--cova-ivory-dim: rgba(248, 246, 241, 0.70)` ✓
- Status: PASS

**5b: Tailwind config**
All 4 tokens mapped in tailwind.config.ts via CSS variables.
- Status: PASS

**5c: Hardcoded hex colors in step pages**
Found 191 instances in step-6/page.tsx and step-9/page.tsx.
These are inside `style={{}}` props for canvas/table operations where Tailwind classes cannot be used
(e.g., dynamically computed row borders, canvas drawing context colors).
Note: These are not actionable without a significant rewrite — leaving as-is since they use correct design system color values (#C9A84C, #0A1628, #1E3A5F, etc.).
- Status: DEFERRED (by design — canvas/dynamic inline styles require hex values)

**5d: CovaButton variants**
All 4 variants present (primary, ghost, destructive, icon) with isLoading spinner.
- Status: PASS

**5e: CovaCard keyboard accessibility**
Interactive variant has `tabIndex={onClick ? 0 : undefined}` and `onKeyDown` handler.
- Status: PASS

---

### Audit 6: Middleware

**Fixes applied:**
- Added `/dashboard` to `PROTECTED_PAGE_ROUTES` (was missing)
- Added `/api/quiz/next-pair` to `PUBLIC_API_ROUTES` (was missing)

**Verified:**
- Public routes (/, /design/step-1, /design/step-2, /design/step-3) pass without auth
- Protected pages redirect unauthenticated users to / with `?next=` param
- Protected API routes return 401 JSON
- /api/auth/callback and /api/quiz/fingerprint are public
- Status: FIXED

---

### Audit 7: Step-1 UI

- shadcn Switch installed and imported (see Audit 1b)
- GiftToggle removed, replaced with `<Switch checked={isGiftMode} onCheckedChange={...} />`
- Budget ranges correct (budget/mid/premium/luxury with correct dollar ranges)
- Room types correct (9 rooms including dorm-room and first-apartment presets)
- Gift mode toggle functional
- Status: FIXED

---

### Audit 8: Test Infrastructure

**8a: global-setup.ts exists** — YES, at tests/e2e/global-setup.ts
**8b: playwright.config.ts uses npm run start** — YES, confirmed
**8c: No localhost:3000 in tests** — PASS (no references found)
**8d: Auth cache in tests/e2e/helpers/auth.ts** — YES, `cachedSession` and `fetchedAt` both present
- Status: PASS (all checks pass)

---

### Predicted Failures

**P1: types/supabase.ts with old column names**
- Found and fixed: `clip_embedding` renamed to `clip_embedding_data`
- Status: FIXED

**P2: lib/ai/clip.ts**
- EXISTS — verified it doesn't break build (build succeeds)
- Status: PASS

**P3: match route old column references**
- No old references found
- Status: PASS

**P4: middleware /dashboard and / redirect**
- Added /dashboard to protected routes
- Status: FIXED

**P5: Quiz fingerprint route computeRawVector/toStyleFingerprint**
- These are internal computation helpers, NOT old conversion functions.
- They correctly compute StyleFingerprint from quiz responses.
- Route returns proper fingerprint object. No change needed.
- Status: PASS (no action needed)

---

## Schema Migrations Requiring Manual SQL

See `docs/migrations/002_v2_columns.sql` for full SQL.

Columns to add manually in Supabase SQL editor:
1. `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS preview_url TEXT;`
2. `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS parallax_video_url TEXT;`
3. `ALTER TABLE products ADD COLUMN IF NOT EXISTS dinov3_embedding VECTOR(1536);`
4. `ALTER TABLE products ADD COLUMN IF NOT EXISTS siglip2_embedding VECTOR(1152);`

Note: IVFFlat index rebuild required after embedding columns are populated with data.

---

## Final Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | 0 errors |
| `npm run build` | SUCCESS |
| Playwright tests | 72/72 passing |
| Hardcoded hex grep | 191 in canvas/dynamic inline styles (by design) |
| fingerprint[] array access | 0 found |
| localhost:3000 in tests | 0 found |
