# Playwright Render Pipeline E2E Tests

## Overview

Two tests that verify the render pipeline works end-to-end without human interaction.

## Files Created

| File | Purpose |
|------|---------|
| `tests/e2e/helpers/auth.ts` | Injects Supabase session cookies into Playwright browser context |
| `tests/e2e/render-pipeline.spec.ts` | Two E2E tests for the render pipeline |
| `tests/fixtures/test-room.jpg` | Auto-downloaded on first run from Unsplash |
| `playwright.config.ts` | Updated: loads `.env.local`, port 3001, serial workers |

## Key Design Decisions

### Auth Injection
- Uses `@supabase/supabase-js` `signInWithPassword` in Node.js (test runner context)
- Extracts project ref from `NEXT_PUBLIC_SUPABASE_URL` to build cookie name: `sb-<ref>-auth-token`
- Handles cookie chunking per `@supabase/ssr` v0.10.0 spec (chunks at 3180 bytes URL-encoded)
- Cookie value = `JSON.stringify(session)` — matches what `createServerClient` reads

### sessionStorage Injection
- Fingerprint store key: `cova-fingerprint-v1` (uses sessionStorage, not localStorage)
- Room store key: `cova-room-v1` (uses sessionStorage, not localStorage)
- Format: `{ state: {...}, version: 0 }` matching Zustand persist middleware
- Navigate → inject → reload → Zustand re-hydrates from sessionStorage

### Step-6 Bypass
- `keepMask: []` (empty array, NOT null) triggers `showFallback = true` in step-6
- Fallback shows "Design My Room →" button directly without waiting for detection
- No detection dots clicked — verifies the zero-items path works

### Test 1 — Full Render
1. Create room via `/api/rooms/create`
2. Upload photo via `/api/rooms/capture` (multipart, field name `photo`)
3. Navigate to `/design/step-6` → inject sessionStorage → reload
4. Click "Design My Room" (visible immediately via fallback)
5. Wait for `/design/step-7` navigation
6. Poll `rooms` table every 5s until `render_url` appears (max 150s)
7. Assert `render_url` starts with `https://`, `pipeline_cost_log.two_stage` is falsy

### Test 2 — Inpainting Gate
1. Create room via API
2. POST `/api/render` with `keep_mask: []` (no `showcase_mode`)
3. Assert `prediction_id` returned (render started single-stage)
4. Query DB immediately: `pipeline_cost_log` should be null
5. `two_stage` falsy = inpainting gate worked correctly

## How to Run

```bash
# Terminal 1: Start dev server on port 3001
npm run dev -- -p 3001

# Terminal 2: Run the tests
npx playwright test tests/e2e/render-pipeline.spec.ts --headed=false
```

## Environment Variables Required

```bash
# In apps/web/.env.local
E2E_TEST_EMAIL=daksh_parikh@berkeley.edu
E2E_TEST_PASSWORD=<your-password>
NEXT_PUBLIC_SUPABASE_URL=https://xdeacbmkdwqrwxonqaqh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
REPLICATE_API_TOKEN=<token>
```

## Acceptance Criteria

- [ ] Both tests pass (green checkmarks)
- [ ] Terminal shows `[TEST PASSED] Render completed successfully`
- [ ] Terminal shows the actual render URL
- [ ] Terminal shows `two_stage: false or two_stage: not set`
- [ ] `npm run build` passes
