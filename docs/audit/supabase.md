# Supabase RLS Audit Report

**Date:** 2026-04-19
**Scope:** All Supabase queries in `apps/web/` (production code only, excluding `scripts/`, `tests/`, `docs/`)
**Auditor:** Automated static analysis

---

## Summary

| Risk Level | Count |
|------------|-------|
| SAFE       | 62    |
| WARNING    | 8     |
| CRITICAL   | 5     |

**CRITICAL findings:** 5 queries use admin client to write/read room data without explicit `user_id` scoping. While some are mitigated by prior auth checks or server-to-server context, they bypass RLS and should be hardened.

**WARNING findings:** 8 queries rely on RLS enforcement at the database layer rather than explicit `user_id` filtering in the application query. These are safe if RLS is correctly configured, but represent defense-in-depth gaps.

---

## RLS Policy Inventory

### Tables with RLS Enabled + Policies Defined

| Table | RLS Enabled | Policy Type | Scoping |
|-------|-------------|-------------|---------|
| `users` | Yes | Per-operation (SELECT/INSERT/UPDATE/DELETE) | `auth.uid() = id` |
| `rooms` | Yes | Per-operation | `auth.uid() = user_id` |
| `renders` | Yes | Per-operation | `auth.uid() = user_id` |
| `token_transactions` | Yes | Per-operation | `auth.uid() = user_id` |
| `chat_messages` | Yes | Per-operation | `auth.uid() = user_id` |
| `chat_messages_v2` | Yes | FOR ALL | `auth.uid() = user_id` |
| `cart_items` | Yes | Per-operation | `auth.uid() = user_id` |
| `style_fingerprints` | Yes | Per-operation (SELECT/INSERT/UPDATE) | `auth.uid() = user_id` |
| `render_sessions` | Yes | SELECT/INSERT via subquery | `rooms.user_id = auth.uid()` |
| `interactions` | Yes | INSERT/SELECT | `auth.uid() = user_id` |
| `products` | Yes | SELECT: public read; INSERT/UPDATE/DELETE: service_role only |
| `room_products` | Yes | SELECT: via room ownership subquery; ALL: service_role |
| `saved_products` | Yes | FOR ALL with CHECK | `auth.uid() = user_id` |
| `product_impressions` | Yes | FOR ALL | `auth.uid() = user_id` |
| `product_interactions` | Yes | FOR ALL | `auth.uid() = user_id` |
| `redesign_feedback` | Yes | FOR ALL | `auth.uid() = user_id` |
| `user_style_profiles` | Yes | FOR ALL | `auth.uid() = user_id` |
| `style_purchase_signals` | Yes | FOR ALL | `auth.uid() = user_id` |
| `swipe_cards` | Yes | SELECT: public; writes: service_role only |
| `quiz_anchor_images` | Yes | SELECT: public read |
| `quiz_comparison_pairs` | Yes | SELECT: public read |
| `rate_limits` | Yes | service_role only |
| `style_references` | Yes | SELECT: public read |
| `furniture_placements` | Yes | Enabled (policy from security audit migration) |
| `jobs` | Yes | FOR ALL | `auth.uid() = user_id` |
| `listings` | Yes | Own + public read |
| `votes` | Yes | Public insert + read |

### Tables with RLS Enabled but NO Policies Found

| Table | Risk |
|-------|------|
| `style_loras` | LOW: Read-only lookup table, no user data. No RLS policies defined but only queried via admin client in lora-registry.ts. Should add public SELECT policy. |
| `style_vectors` | LOW: Reference data, no user data. No RLS policies. Should add public SELECT policy. |
| `render_comparison_pairs` | LOW: A/B test data with room_id FK. No RLS policies. Not actively queried in production. |
| `app_config` | LOW: System config, no user data. No RLS policies. Only queried by service role. |

### Tables with NO RLS at All

| Table | Risk |
|-------|------|
| `swipe_history` | MEDIUM: Contains `user_id` column. `ENABLE ROW LEVEL SECURITY` not found in any migration. However, no production app code queries this table directly (only referenced in migration ALTER statements). |

---

## Detailed Query-by-Query Analysis

### CRITICAL Issues

| # | File | Line | Table | Op | Client | Scoping | Issue |
|---|------|------|-------|----|--------|---------|-------|
| C1 | `app/api/render/tweak/status/route.ts` | 64-75 | `rooms`, `render_sessions` | UPDATE, INSERT | admin | `.eq("id", roomId)` only | Admin client updates room and inserts render_session by roomId without user_id filter. Auth check exists upstream but admin bypasses RLS. A crafted `room_id` param could write to another user's room. |
| C2 | `app/api/render/status/route.ts` | 187-340 | `rooms`, `render_sessions` | UPDATE, INSERT | admin | `.eq("id", roomId)` only | Multiple admin writes (render_url, redesign_status, render_sessions insert) scoped only by roomId. Auth verified upstream but admin operations not re-scoped to user. |
| C3 | `app/api/generate-art/route.ts` | 74-129 | `rooms` | SELECT, UPDATE | anon (RLS) | `.eq("id", roomId)` only (GET); `.eq("id", roomId)` only (POST update) | GET handler has no auth check at all -- relies entirely on RLS. POST auth-checks but updates room without `.eq("user_id", user.id)`. RLS protects the anon-key path, but the missing user_id in the UPDATE means any authenticated user could modify any room they guess the ID of (RLS on rooms enforces user_id=auth.uid(), so this is actually safe via RLS, but no defense-in-depth). |
| C4 | `app/api/parallax/route.ts` | 79-83 | `rooms` | UPDATE | admin | `.eq("id", room_id)` only | Admin client writes `parallax_video_url` scoped only by room_id. Auth verified via session but room ownership not checked before admin write. |
| C5 | `app/api/rooms/capture/route.ts` | 95-101 | `rooms` | UPDATE | admin | `.eq("id", finalRoomId)` only | When roomId is provided by client, admin updates room's photo URL without verifying user owns that room. The roomId comes from form data, not validated against user. |

### WARNING Issues

| # | File | Line | Table | Op | Client | Scoping | Issue |
|---|------|------|-------|----|--------|---------|-------|
| W1 | `app/design/step-9/page.tsx` | 352-356 | `rooms` | SELECT | anon (RLS) | `.eq("id", roomId)` only | Fetches `render_detection_result` without user_id filter. RLS enforces ownership but no app-level defense-in-depth. |
| W2 | `app/design/step-9/page.tsx` | 398-403 | `room_products` | SELECT | anon (RLS) | `.eq("room_id", roomId)` only | Room products fetched without user scoping. RLS policy uses subquery on rooms.user_id, so this is safe at DB level but not at app level. |
| W3 | `components/FurnitureHotspots.tsx` | 126-132 | `room_products` | SELECT | browser (RLS) | `.eq("room_id", roomId)` only | Same as W2 -- relies on room_products RLS subquery. |
| W4 | `app/api/generate-art/route.ts` | 74-78 | `rooms` | SELECT | anon (RLS) | `.eq("id", roomId)` only | GET handler has no auth check. Relies entirely on RLS to scope results. |
| W5 | `app/api/rooms/status/route.ts` | 70-73 | `room_products` | SELECT | anon (RLS) | `.eq("room_id", roomId)` only | Fetches room products without user_id. RLS subquery protects. |
| W6 | `lib/dashboard/queries.ts` | 183-186 | `render_sessions` | SELECT | server (RLS) | `.eq("room_id", roomId)` only | `getRoomRenderHistory` queries by roomId without user_id. RLS subquery on rooms.user_id protects. Caller must pass a roomId the user owns. |
| W7 | `app/api/render/refine/route.ts` | 76-78 | `render_sessions` | SELECT | admin | `.eq("room_id", room_id)` only | Counts render_sessions via admin without user_id. Auth + room ownership checked earlier in the handler. |
| W8 | `app/api/pipeline/furniture-match/route.ts` | 341-350 | `room_products`, `rooms` | DELETE, INSERT, UPDATE | admin/anon | `.eq("room_id", room_id)` | Service-call path uses admin client. Room ownership verified in prior query, but subsequent operations only filter by room_id. |

### SAFE Queries (Properly Scoped)

All remaining queries (62 total) fall into these categories:

**Category 1: Explicit user_id scoping (35 queries)**
Routes that include `.eq("user_id", user.id)` or `.eq("user_id", userId)`:
- `app/api/rooms/create/route.ts` -- INSERT with `user_id: user.id`
- `app/api/rooms/status/route.ts` -- SELECT `.eq("user_id", user.id)`
- `app/api/rooms/[roomId]/route.ts` -- PATCH/DELETE `.eq("user_id", user.id)`
- `app/api/detect/route.ts` -- UPDATE `.eq("user_id", user.id)`
- `app/api/detect/status/route.ts` -- SELECT `.eq("user_id", user.id)`
- `app/api/detect/render/route.ts` -- SELECT `.eq("user_id", userId)`
- `app/api/pipeline/redesign/route.ts` -- SELECT `.eq("user_id", userId)`
- `app/api/pipeline/segment-masks/route.ts` -- SELECT `.eq("user_id", user.id)`
- `app/api/render/previews/route.ts` -- SELECT `.eq("user_id", user.id)`
- `app/api/render/refine/route.ts` -- SELECT `.eq("user_id", user.id)` (room query)
- `app/api/render/from-context/route.ts` -- SELECT + ownership check `room.user_id !== user.id`
- `app/api/chat/route.ts` -- SELECT `.eq("user_id", user.id)`
- `app/api/chat/history/route.ts` -- SELECT `.eq("user_id", user.id)` + ownership check
- `app/api/design-chat/route.ts` -- SELECT `.eq("user_id", user.id)`
- `app/api/interactions/route.ts` -- INSERT with `user_id: user.id` + room ownership verification
- `app/api/swap/status/route.ts` -- UPDATE `.eq("user_id", user.id)`
- `lib/dashboard/queries.ts` -- getUserRooms `.eq("user_id", userId)`, getUserFingerprint `.eq("user_id", userId)`, getSavedProducts `.eq("user_id", userId)`
- `lib/interactions.ts` -- INSERT/SELECT `.eq("user_id", userId)` (admin client but scoped)
- `app/design/step-3b/page.tsx` -- SELECT `.eq("id", user.id)` on users
- `app/design/step-4/page.tsx` -- SELECT `.eq("id", user.id)` on users
- `app/design/step-7/page.tsx` -- SELECT `.eq("user_id", user.id)`
- `app/design/step-7b/page.tsx` -- SELECT `.eq("user_id", user.id)`
- `app/design/step-7c/page.tsx` -- SELECT `.eq("user_id", user.id)`
- `app/design/step-7d/page.tsx` -- SELECT `.eq("user_id", user.id)`
- `app/design/step-8a/page.tsx` -- SELECT `.eq("user_id", user.id)`
- `app/design/step-9/page.tsx` -- rooms SELECT `.eq("user_id", user.id)`, saved_products `.eq("user_id", user.id)`
- `app/auth/callback/route.ts` -- INSERT with `user_id` from auth
- `app/api/quiz/update-fingerprint/route.ts` -- admin, but scoped by authenticated user_id
- `app/api/quiz/fingerprint/route.ts` -- admin, user_id from auth session

**Category 2: Public/reference data (15 queries)**
No user data, intentionally public:
- `app/api/rooms/public-count/route.ts` -- aggregate COUNT, no user data exposed
- `app/api/quiz/next-card/route.ts` -- reads `quiz_anchor_images` (public)
- `app/api/quiz/next-pair/route.ts` -- reads `quiz_comparison_pairs` (public)
- `app/api/quiz/mood-board/route.ts` -- reads `quiz_anchor_images` (public)
- `app/api/quiz/mood-strip/route.ts` -- reads `quiz_anchor_images` (public)
- `app/api/style-references/match/route.ts` -- reads `quiz_anchor_images` (public)
- `lib/ai/style-references.ts` -- reads `quiz_anchor_images` (public)
- `lib/ai/lora-registry.ts` -- reads `style_loras` (reference data, no user data)
- `app/design/step-9/page.tsx` -- reads `products` (public catalog)
- `components/quiz/ReturningUserStrip.tsx` -- reads `style_sessions` (user-scoped via RLS)

**Category 3: Admin writes with prior ownership verification (12 queries)**
Admin client used but room ownership verified in the same handler before the write:
- `app/api/pipeline/redesign/route.ts` -- admin writes to rooms, but `.eq("user_id", userId)` on initial fetch
- `app/api/render/status/route.ts` -- auth check present, admin writes are to rooms previously verified
- `app/api/render/refine/route.ts` -- room ownership checked via anon client before admin writes
- `app/api/pipeline/furniture-match/route.ts` -- authenticated path checks `.eq("user_id", user.id)`
- `app/api/rooms/capture/route.ts` -- INSERT path uses `user_id: user.id` (safe); UPDATE path is C5

**Category 4: Client-side with user_id in payload (SplatViewer)**
- `components/SplatViewer.tsx` -- upserts `redesign_feedback` with `user_id: userId` from auth store. RLS enforces `auth.uid() = user_id`.

---

## Recommended Fixes

### C1: `app/api/render/tweak/status/route.ts:64-75`
**Fix:** Add `.eq("user_id", user.id)` to the admin room update at line 65:
```
await admin.from("rooms").update({ render_url: finalUrl }).eq("id", roomId).eq("user_id", user.id);
```
Same for the render_sessions insert -- add user_id field or verify room ownership before writing.

### C2: `app/api/render/status/route.ts:187-340`
**Fix:** Store `user.id` after the auth check and add `.eq("user_id", userId)` to all admin `.from("rooms").update(...)` calls. For render_sessions inserts, the RLS subquery already protects when using anon client, but admin bypasses it. Either:
- Switch to anon client for these writes, OR
- Add explicit user_id verification before each admin write

### C3: `app/api/generate-art/route.ts:74-78` (GET handler)
**Fix:** Add auth check to the GET handler:
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```
Then add `.eq("user_id", user.id)` to the room query.

For the POST update at line 121-129, add `.eq("user_id", user.id)`:
```
await supabase.from("rooms").update({...}).eq("id", roomId).eq("user_id", user.id);
```

### C4: `app/api/parallax/route.ts:79-83`
**Fix:** Verify room ownership before the admin write:
```typescript
const { data: owned } = await admin.from("rooms").select("id").eq("id", room_id).eq("user_id", session.user.id).maybeSingle();
if (!owned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
```

### C5: `app/api/rooms/capture/route.ts:95-101`
**Fix:** When `roomId` is provided by the client, verify ownership before updating:
```typescript
const { data: owned } = await admin.from("rooms").select("id").eq("id", finalRoomId).eq("user_id", user.id).maybeSingle();
if (!owned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
```

### Missing RLS: `swipe_history` table
**Fix:** Add migration:
```sql
ALTER TABLE swipe_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "swipe_history_own" ON swipe_history FOR ALL USING (auth.uid() = user_id);
```

### Missing RLS Policies: `style_loras`, `style_vectors`, `app_config`
**Fix:** Add public SELECT policies:
```sql
CREATE POLICY "style_loras_public_read" ON style_loras FOR SELECT USING (true);
CREATE POLICY "style_loras_service_write" ON style_loras FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "style_vectors_public_read" ON style_vectors FOR SELECT USING (true);
CREATE POLICY "app_config_public_read" ON app_config FOR SELECT USING (true);
```

---

## Negative Test Plan

For each user-scoped table, authenticate as User A, then attempt to access User B's data. Expect 0 rows or an error in every case.

### 1. `rooms` Table
- **Test 1.1:** Auth as User A. SELECT from rooms WHERE id = (User B's room ID). Expect 0 rows.
- **Test 1.2:** Auth as User A. UPDATE rooms SET room_type = 'bedroom' WHERE id = (User B's room ID). Expect 0 rows affected.
- **Test 1.3:** Auth as User A. DELETE from rooms WHERE id = (User B's room ID). Expect 0 rows affected.
- **Test 1.4:** Auth as User A. INSERT into rooms with user_id = User B's ID. Expect RLS violation error.

### 2. `style_fingerprints` Table
- **Test 2.1:** Auth as User A. SELECT from style_fingerprints WHERE user_id = User B's ID. Expect 0 rows.
- **Test 2.2:** Auth as User A. INSERT into style_fingerprints with user_id = User B's ID. Expect RLS violation.
- **Test 2.3:** Auth as User A. UPDATE style_fingerprints SET dimensions = '{}' WHERE user_id = User B's ID. Expect 0 rows.

### 3. `render_sessions` Table
- **Test 3.1:** Auth as User A. SELECT from render_sessions WHERE room_id = (User B's room ID). Expect 0 rows (subquery on rooms.user_id blocks).
- **Test 3.2:** Auth as User A. INSERT into render_sessions with room_id = (User B's room ID). Expect RLS violation (subquery blocks).

### 4. `saved_products` Table
- **Test 4.1:** Auth as User A. SELECT from saved_products WHERE user_id = User B's ID. Expect 0 rows.
- **Test 4.2:** Auth as User A. DELETE from saved_products WHERE user_id = User B's ID. Expect 0 rows affected.
- **Test 4.3:** Auth as User A. INSERT into saved_products with user_id = User B's ID. Expect RLS violation.

### 5. `interactions` Table
- **Test 5.1:** Auth as User A. SELECT from interactions WHERE user_id = User B's ID. Expect 0 rows.
- **Test 5.2:** Auth as User A. INSERT into interactions with user_id = User B's ID. Expect RLS violation.

### 6. `room_products` Table
- **Test 6.1:** Auth as User A. SELECT from room_products WHERE room_id = (User B's room ID). Expect 0 rows (subquery on rooms.user_id).
- **Test 6.2:** Auth as User A. INSERT/UPDATE/DELETE room_products for User B's room. Expect failure (service_role-only write policy).

### 7. `redesign_feedback` Table
- **Test 7.1:** Auth as User A. SELECT from redesign_feedback WHERE user_id = User B's ID. Expect 0 rows.
- **Test 7.2:** Auth as User A. UPSERT redesign_feedback with user_id = User B's ID. Expect RLS violation.

### 8. `product_impressions` Table
- **Test 8.1:** Auth as User A. SELECT from product_impressions WHERE user_id = User B's ID. Expect 0 rows.

### 9. `product_interactions` Table
- **Test 9.1:** Auth as User A. SELECT from product_interactions WHERE user_id = User B's ID. Expect 0 rows.

### 10. `style_purchase_signals` Table
- **Test 10.1:** Auth as User A. SELECT from style_purchase_signals WHERE user_id = User B's ID. Expect 0 rows.

### 11. `chat_messages` Table
- **Test 11.1:** Auth as User A. SELECT from chat_messages WHERE user_id = User B's ID. Expect 0 rows.
- **Test 11.2:** Auth as User A. INSERT into chat_messages with user_id = User B's ID. Expect RLS violation.

### 12. `token_transactions` Table
- **Test 12.1:** Auth as User A. SELECT from token_transactions WHERE user_id = User B's ID. Expect 0 rows.

### 13. `users` Table
- **Test 13.1:** Auth as User A. SELECT from users WHERE id = User B's ID. Expect 0 rows.
- **Test 13.2:** Auth as User A. UPDATE users SET email = 'hacked@test.com' WHERE id = User B's ID. Expect 0 rows affected.

### 14. Admin Bypass Tests (API-level)
- **Test 14.1:** Call `POST /api/render/tweak/status?prediction_id=X&room_id=(User B's room)` as User A. Expect the admin write to target User B's room (CRITICAL -- this is C1).
- **Test 14.2:** Call `POST /api/rooms/capture` with `room_id` = User B's room as User A. Expect the photo to be written to User B's room (CRITICAL -- this is C5).
- **Test 14.3:** Call `GET /api/generate-art?roomId=(User B's room)` unauthenticated. Expect 0 rows or empty (WARNING -- this is W4, protected by RLS).

---

## Storage Bucket RLS

| Bucket | RLS | Policy |
|--------|-----|--------|
| `room-uploads` | Yes | Own files only (`foldername[1] = auth.uid()`) |
| `renders` | Yes | Read own only; write via service_role |
| `product-images` | Yes | Public read |
| `swipe-cards` | Yes | Public read |
| `3d-models` | Yes | Public read |
| `scene-snapshots` | Yes | Own files only |
| `room-photos` | No migration found | Used by capture route via admin client. Should add RLS policy matching room-uploads pattern. |

---

## Key Architectural Observations

1. **Admin client usage is widespread in API routes.** The `createAdminSupabaseClient()` bypasses all RLS. This is necessary for webhook callbacks and cross-table operations, but every admin write should include explicit user_id scoping as defense-in-depth.

2. **RLS is the primary defense for client-side queries.** Browser client queries in `app/design/step-9/page.tsx` and `components/FurnitureHotspots.tsx` correctly rely on RLS, but some omit explicit user_id filters. This is acceptable if RLS is correctly configured, but adding app-level filters is recommended.

3. **The dev-only `/api/dev/rerun` route has no auth** but is gated by `NODE_ENV !== "development"`. Ensure this route is excluded from production builds or add additional verification.

4. **The `render/status` route is the most complex** with multiple admin write paths. It would benefit from a refactor to centralize room ownership verification.

5. **No `style_fingerprints` DELETE policy exists.** Users can SELECT, INSERT, UPDATE but not DELETE their own fingerprints. This is likely intentional (data retention) but should be documented.
