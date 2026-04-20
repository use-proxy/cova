# Phase 0 — RLS Security Fixes

**Branch:** `phase-0/rls-fixes`
**Audit source:** `docs/audit/supabase.md` (2026-04-19)
**Scope:** 5 CRITICAL RLS holes + missing RLS on `swipe_history` + missing policies on `style_loras` / `style_vectors` / `app_config` + `room-photos` storage RLS + negative test suite.

---

## CRITICAL fixes

### C1 — `app/api/render/tweak/status/route.ts:64-75`

Added ownership verification before admin write; scoped the `rooms.update` by `user_id`.

```diff
   const admin = createAdminSupabaseClient();

+  const { data: ownedRoom } = await admin
+    .from("rooms").select("id")
+    .eq("id", roomId).eq("user_id", user.id)
+    .maybeSingle();
+  if (!ownedRoom) {
+    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
+  }
+
   await admin
     .from("rooms").update({ render_url: finalUrl })
-    .eq("id", roomId);
+    .eq("id", roomId).eq("user_id", user.id);
```

### C2 — `app/api/render/status/route.ts:181-567`

Captured `userId`, added one upfront ownership check, and added `.eq("user_id", userId)` to every admin `rooms.update(...)` call (6 updates across both the two-pass Kontext branch and the legacy single-stage branch) and the room metadata `select(...).single()`.

```diff
+  const userId = user.id;
   const admin = createAdminSupabaseClient();
+
+  const { data: ownedRoom } = await admin.from("rooms").select("id")
+    .eq("id", roomId).eq("user_id", userId).maybeSingle();
+  if (!ownedRoom) {
+    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
+  }

   const { data: roomRaw } = await admin
     .from("rooms")
     .select("pipeline_cost_log, inpainting_mask_url, original_photo_url")
-    .eq("id", roomId)
+    .eq("id", roomId)
+    .eq("user_id", userId)
     .single();
```
…and `.eq("user_id", userId)` added to each of the 6 downstream `rooms.update(...)` chains.

### C3 — `app/api/generate-art/route.ts:68-130`

GET handler: added auth check + `user_id` filter on the room SELECT.
POST handler: added `user_id` filter on both the SELECT and UPDATE.

```diff
 export async function GET(req: Request) {
   ...
   const supabase = await createServerSupabaseClient();
+  const { data: { user } } = await supabase.auth.getUser();
+  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
+
   const { data } = await supabase
     .from("rooms").select("personalization")
-    .eq("id", roomId).single();
+    .eq("id", roomId).eq("user_id", user.id).single();
```

POST update:
```diff
   await supabase.from("rooms").update({...})
-    .eq("id", roomId);
+    .eq("id", roomId).eq("user_id", user.id);
```

### C4 — `app/api/parallax/route.ts:77-84`

Added explicit ownership SELECT before the admin write; scoped the update by `user_id`.

```diff
+  const { data: owned } = await admin.from("rooms").select("id")
+    .eq("id", room_id).eq("user_id", session.user.id).maybeSingle();
+  if (!owned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
   await admin.from("rooms")
     .update({ parallax_video_url: videoUrl } as Record<string, unknown>)
-    .eq("id", room_id);
+    .eq("id", room_id).eq("user_id", session.user.id);
```

### C5 — `app/api/rooms/capture/route.ts:94-102`

When client provides `roomId`, ownership is verified before the admin write.

```diff
   } else {
+    const { data: owned } = await admin.from("rooms").select("id")
+      .eq("id", finalRoomId).eq("user_id", user.id).maybeSingle();
+    if (!owned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
     await admin.from("rooms").update({...})
-      .eq("id", finalRoomId);
+      .eq("id", finalRoomId).eq("user_id", user.id);
   }
```

---

## New migrations (hold for human review before applying)

| File | Purpose |
|---|---|
| `supabase/migrations/20260419000000_enable_swipe_history_rls.sql` | `ENABLE ROW LEVEL SECURITY` + `FOR ALL USING (auth.uid() = user_id)` policy on `swipe_history`. |
| `supabase/migrations/20260419000001_ref_table_policies.sql` | Public-read policies on `style_loras`, `style_vectors`, `app_config`; service-role INSERT policy on `style_loras`. |
| `supabase/migrations/20260419000002_room_photos_storage_rls.sql` | `room-photos` storage bucket — own-files-only policy mirroring `room-uploads`. |

These migrations are **not** applied to production; they must be reviewed and run via `supabase db push` (or via the Supabase Dashboard) by an operator.

---

## Negative tests

`apps/web/tests/security/rls-negative.test.ts` — 27 cross-user denial assertions across the 14 test groups from the audit. Skips automatically when `SUPABASE_SERVICE_ROLE_KEY` is not present (so CI without secrets stays green). Run locally with the env populated:

```bash
SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
  npx vitest run tests/security/rls-negative.test.ts
```

---

## Test & build status

- `npm test` (vitest) — **620 passed, 38 failed, 28 skipped**. The 38 failures are identical to the baseline on `main` (pre-existing zustand/create import regressions in `lib/stores/*`, `__tests__/area1/*`, `tests/lib/env.test.ts`, etc.). Verified via `git stash` + rerun: same 38 failures pre- and post-change, so the RLS fixes introduce no regressions.
- `__tests__/area3/render-pipeline.test.ts` — updated the `makeAdminForStatus` and tweak-status admin mock chains to support `.maybeSingle()` and the new ownership `select("id")` flow. All 23 render-pipeline tests now pass.
- `npm run build` — **not executed** under this task. The repo has pre-existing TypeScript errors in unrelated store / `area2Store.ts` code that block a clean `tsc --noEmit`. `npx tsc --noEmit` against the five files I edited is clean.

---

## Unresolved / follow-ups

1. **Pre-existing test + typecheck failures** (zustand `create` imports, `area2Store.ts` object types, `env.test.ts`, `hnsw-migration.test.ts`, `navigation-flow.test.ts`) — out of scope; should be tracked separately.
2. **WARNING findings from the audit (W1-W8)** were not addressed in this PR — the audit explicitly labels them as "safe if RLS is correctly configured, but represent defense-in-depth gaps." Worth a follow-up sweep.
3. **Migrations need manual application** after review: `supabase db push` or Dashboard. Consider also verifying that `room-photos` bucket actually exists before applying `20260419000002_room_photos_storage_rls.sql`.
4. **`style_fingerprints` DELETE policy is still missing** per the audit's final observation (§Key Architectural Observations #5). Left as-is — audit notes it's likely intentional.
5. **`/api/dev/rerun`** has no auth (observation #3). Confirm `NODE_ENV !== "development"` gate is sufficient and that the route is tree-shaken out of production builds.
