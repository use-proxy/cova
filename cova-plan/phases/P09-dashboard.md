# Phase 9 — Dashboard

**Cova V1 implementation · Phase 9 of 12 · Self-contained**

---

## Phase identity

| | |
|---|---|
| **Phase number** | 9 of 12 |
| **Goal** | Persistent home for users post-onboarding. View all renders, manage account, re-take quiz, delete account. 3 sections (Recent / By room / Settings), per-design view with refine history chain, settings hub with 5 subsections. |
| **Executor session estimate** | 2–3 sessions |
| **Calendar estimate** | 1.5–2 weeks |
| **Predicted Claude credits** | ~$30–50 |
| **Predicted infra spend** | ~$2 (test renders for dashboard population) |
| **Depends on** | Phases 1, 2, 5, 6, 7 closed |
| **Blocks** | Phase 12 deployment final smoke test (full user journey) |

---

## 1. The session loop for this phase

1. **Open new claude.ai chat.** Paste this entire phase doc.
2. **Chat summarizes back.** Confirms understanding, lists gaps. You confirm.
3. **Planner fires.** Fresh Claude Code session. Drift check confirms Phases 1, 2, 5, 6, 7 closed: auth flows operational, renders table populated, refine chain works, shop screen accessible. Confirms RefineHistoryChain component exists from Phase 6 (built but not yet surfaced). Uses Context7 MCP for: current Next.js App Router parallel routes (for dashboard layout), current TanStack Query patterns for paginated server state, current Supabase realtime subscription patterns for live render-status updates. Uses EXA MCP for: dashboard UX patterns (gallery + grouped + settings), refine tree visualization patterns. Writes executor prompt to `cova-plan/planner-output/P9-executor-prompt.md`.
4. **Executor prompt returns.** Verify covers M15 acceptance criteria.
5. **Executor fires.** 2–3 sessions. Backend + UI roughly co-authored since dashboard is read-mostly.
6. **Verifier session 1 fires.** Reviews route auth gating, RLS read-only on renders, refine history chain rendering, settings updates (especially password change + delete account), re-take quiz routing with prior results in tweak mode. Self-heals.
7. **Verifier session 2 fires.** Independent. Hunts for: pagination off-by-one, deleted render still rendering in cached UI, refine history chain depth limits, OAuth disconnect orphans, account deletion mid-render race.
8. **Manual screenshot review.** §15 click-script. ~25 screenshots covering all 3 dashboard sections + per-design view + all 5 settings subsections + delete flows + re-take quiz.
9. **Document updates.** `PHASE_STATUS.md`, `OPEN_DECISIONS.md`, `EMPIRICAL_FINDINGS.md` (dashboard load latency at scale, refine chain depth distribution, account deletion completion rate).

---

## 2. Prereq verification

### Phase 1+2+5+6+7 closure checks
- All listed phases CLOSED in `PHASE_STATUS.md`
- /auth/* routes operational
- `users.style_blend`, `style_descriptor`, `onboarding_state` populated for test user
- `rooms` table has rows with completed renders
- `renders` table has populated rows with hotspots, parent_render_id chains
- /render/[id]/shop accessible
- `RefineHistoryChain` component exists at `apps/web/components/refine/RefineHistoryChain.tsx` (built in Phase 6)
- account_deletions table exists (Phase 1)
- delete-user-cascade Edge Function exists (Phase 1)
- All Phase 1 ops infra (Sentry, redactLogPayload, PostHog, failure_category)

### Halt conditions
- RefineHistoryChain component missing → halt, escalate to Phase 6 remediation
- account-deletion flow not working → halt, fix in Phase 1 remediation
- Test user has no completed renders → seed test data first

---

## 3. Pre-decisions

**G1. Dashboard layout (locked).** Three sections, top-to-bottom on /dashboard:
1. Recent renders gallery (most recent 6, paginated)
2. By room (rooms grouped, with all renders nested under each)
3. Settings link (CTA at bottom, takes user to /dashboard/settings)

NOT a sidebar nav. NOT tabs. Single scroll page on /dashboard. Settings hub at separate route.

**G2. Recent renders pagination.** *Resolution locked:* show 6 by default. "Load more" CTA → loads next 6. Cursor-based pagination using `created_at DESC` + `id` as tiebreaker. No infinite-scroll auto-load (user-initiated).

**G3. By-room nested display.** *Resolution locked:* each room shows hero (latest render) + collapsed list of refines. Click "View all N renders" expands chain. NOT a tree visualization on dashboard — flat indented list. Tree visualization lives on per-design view.

**G4. Per-design view route.** *Resolution locked:* `/dashboard/render/[id]` shows full-bleed render image left, side panel right with metadata + refine history chain (RefineHistoryChain component from Phase 6). CTAs: "Refine" / "Shop this room" / "Delete render."

**G5. Re-take quiz behavior.** *Resolution locked:* /dashboard/settings → Style profile section → "Re-take quiz" button. Routes to /onboarding/quiz with `?mode=retake` param. Quiz proceeds normally; on finalize, NEW style_blend entry written with version+1 (NOT overwrite). User sees previous fingerprints in settings (V1.5; V1 just shows latest). Confirm modal before re-take: "This will create a new style profile. Your old one will be saved."

**G6. Delete-render UX.** *Resolution locked:* per-design view "Delete render" button → confirmation modal "Delete this render? This can't be undone." → POST /api/dashboard/render/[id]/delete → soft-delete via `renders.deleted_at = now()` (RLS filters out). Render removed from dashboard but archive preserved 30 days for recovery.

**G7. Settings 5 subsections (locked):**
1. Account — email (display only), change password, change email
2. Personal info — first name, optional last name, country (USD-only display in V1)
3. Style profile — fingerprint summary + "Re-take quiz" CTA
4. Privacy — "Delete my account" + "Export my data" (GDPR endpoint from Phase 1)
5. Sign out — sign-out button

**G8. Display-only email field.** *Resolution locked:* email change requires re-auth + email confirmation to OLD and NEW addresses (Phase 1 already handles via Supabase Auth's `updateUser` flow). Settings UI just opens a modal that calls that flow.

**G9. Mobile dashboard layout.** *Resolution locked:* same single-scroll layout as desktop. Sections stack. Recent renders 2-col grid mobile (vs 3-col desktop). By-room list of cards. Settings link at bottom. Settings hub itself is single-column on mobile (vs 2-column on desktop with subsection nav left).

**G10. Empty states.** *Resolution locked:*
- 0 renders: dashboard shows "No designs yet" hero + "Start your first design →" CTA → routes to /onboarding/welcome (or capture if quiz already done)
- 0 renders for a room (just uploaded but render failed): show room with "Render failed. Retry?" CTA
- 0 refines under a render: per-design view doesn't show refine chain

---

## 4. Background context (self-contained)

### 4.1 What dashboard delivers

After Phase 9, signed-in users always have:
- /dashboard as their post-onboarding home
- Visibility into all their renders (Recent + By room views)
- Access to per-design detailed view with refine history
- Account management (settings hub)
- Re-take quiz path
- Delete account / GDPR export path
- Sign out

### 4.2 Routing flow

```
Signed in user opens app:
  - If onboarding incomplete (quiz_complete=false): redirect to /onboarding/welcome
  - Else: redirect to /dashboard

Signed-out user opens app:
  - Land on landing page (/) — Phase 10

User clicks Cova logo from any signed-in screen:
  - Routes to /dashboard

User clicks render thumbnail in dashboard:
  - Routes to /dashboard/render/[id]

User clicks "Settings" in dashboard:
  - Routes to /dashboard/settings

User clicks "Re-take quiz" in settings:
  - Modal confirm → routes to /onboarding/quiz?mode=retake

User clicks "Delete my account" in settings:
  - Modal confirm (type DELETE) → POST /api/auth/delete-account → /account-deleted

User clicks "Sign out":
  - POST /api/auth/sign-out → routes to / (landing)
```

### 4.3 Dashboard read patterns

| Section | Query | Index |
|---|---|---|
| Recent renders | `SELECT * FROM renders WHERE user_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 7 OFFSET cursor` | renders_user_idx (user_id, created_at DESC) |
| By room | `SELECT rooms.*, renders.* FROM rooms LEFT JOIN renders ON rooms.id=renders.room_id WHERE rooms.user_id=$1 AND renders.deleted_at IS NULL ORDER BY rooms.created_at DESC, renders.refine_index ASC` | renders_room_idx (room_id, created_at DESC) |
| Per-design | `SELECT * FROM renders WHERE id=$1 AND user_id=$2` + chain via parent_render_id | PK + parent_render_id idx |

### 4.4 Settings update patterns

| Action | API |
|---|---|
| Change password | Supabase Auth `updateUser({password})` after current-password verify |
| Change email | Supabase Auth `updateUser({email})` triggers OLD + NEW confirmation emails |
| Update profile | POST `/api/settings/update-profile` updates `users.first_name`, etc. |
| Re-take quiz | Sets `users.onboarding_state.quiz_in_retake=true` + redirects to /onboarding/quiz |
| Delete account | POST `/api/auth/delete-account` (already wired in Phase 1) |
| Export data | POST `/api/users/export` (already wired in Phase 1) |
| Sign out | POST `/api/auth/sign-out` (Phase 1) |

### 4.5 Edge cases

- **User has 0 renders:** dashboard shows empty state with first-design CTA
- **User has 1 render (no refines):** Recent shows it; By Room groups it under its room; per-design view shows render without chain
- **User has 50+ renders:** Recent paginates; By Room nests them under each parent room
- **User deletes a render mid-view:** soft-delete; deleted_at filter hides from UI; if user is on /dashboard/render/[deleted_id] they get redirected to /dashboard with toast
- **Render fails after upload:** room exists but no successful render; By Room shows room with "Render failed" state + retry CTA
- **User changes email:** confirmation sent to OLD address (security) + NEW address (verify); takes effect after both confirmed
- **User mid-render starts another render on same room:** Phase 5 idempotency check returns existing render_id; dashboard shows running state
- **User signs out from another device:** session invalidated; next dashboard fetch returns 401 → redirect to /auth/signin
- **OAuth disconnect:** if user had ONLY Google OAuth and disconnects, their auth method is gone; settings should warn and require setting password first
- **Refine chain depth >10:** dashboard shows latest 10 + "View all N refines" link to per-design tree view

---

## 5. Tech stack

| Layer | Tool | Notes |
|---|---|---|
| Routing | Next.js App Router | /dashboard, /dashboard/render/[id], /dashboard/settings, etc. |
| Server data | TanStack Query (client) + Supabase server queries | Cached, refetch on focus |
| Real-time updates | Supabase Realtime channel | Render status updates while in-progress |
| Pagination | Cursor-based (created_at DESC + id) | "Load more" |
| Image grid | Next.js Image with Cloudflare Images CDN | Lazy-loaded, blurhash placeholder |
| Modals | Frontend Visionary + Framer Motion | Delete confirm, password change, etc. |
| Settings forms | React Hook Form + Zod | Re-uses Phase 1 patterns |

---

## 6. Scope

### 9A — Backend (M15)

1. **Schema migration:**
```sql
ALTER TABLE renders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS renders_deleted_at_idx ON renders(deleted_at) WHERE deleted_at IS NULL;

-- For users.first_name etc. (may already exist from Phase 1)
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS country text DEFAULT 'US';
```
Paired down migrations.

2. **API routes:**

**GET /api/dashboard/recent-renders**
```
Auth: required
Query params: cursor?: string (ISO timestamp + id), limit?: int (default 6, max 20)
Returns: { 
  renders: [{id, render_url, created_at, refine_index, room: {id, processed_url}, style_blend_summary}],
  next_cursor: string | null
}
RLS: deleted_at IS NULL filter; user_id = auth.uid()
```

**GET /api/dashboard/by-room**
```
Auth: required
Query params: cursor?: string
Returns: {
  rooms: [{
    id, processed_url, created_at, hard_room_score,
    renders: [{id, render_url, refine_index, refine_prompt, created_at}]
  }],
  next_cursor: string | null
}
Sort: rooms.created_at DESC, then renders.refine_index ASC
```

**GET /api/dashboard/render/[id]**
```
Auth: required
Returns: {
  render: {id, render_url, refine_index, refine_prompt, hotspots, verification_scores, created_at, parent_render_id},
  parent_render: {...} | null,
  refine_chain: [...up to 20 most recent in chain],
  room: {id, processed_url, created_at, personalization_manifest}
}
RLS: render belongs to user, deleted_at IS NULL
```

**POST /api/dashboard/render/[id]/delete**
```
Auth: required
Validation: render belongs to user
Side effect: UPDATE renders SET deleted_at = now() WHERE id=$1
Returns: { ok: true }
PostHog: render_deleted event
```

**POST /api/settings/update-profile**
```
Auth: required
Body: { first_name?: string, last_name?: string, country?: string }
Validation: zod schema, profanity check on names (Haiku), max 50 chars each
Side effect: UPDATE users SET ... WHERE id=auth.uid()
Returns: { ok: true, user: {first_name, last_name, country} }
```

**POST /api/settings/change-password**
```
Auth: required
Body: { current_password: string, new_password: string }
Validation: current password verify via Supabase Auth, new password zxcvbn ≥2
Returns: { ok: true } or { ok: false, failure_category: 'auth_password_incorrect' | 'auth_password_weak' }
```

**POST /api/settings/change-email** (V1: just initiate; both confirms via Supabase Auth)
```
Auth: required
Body: { new_email: string, current_password: string }
Validation: zod email, current password verified
Side effect: triggers Supabase updateUser({email: new_email}) → confirmation emails
Returns: { ok: true, message: "We sent confirmation links to both emails. Confirm both to complete the change." }
```

**POST /api/settings/start-quiz-retake**
```
Auth: required
Side effect: sets users.onboarding_state.quiz_in_retake = true; clears onboarding_state.quiz_complete
Returns: { ok: true, redirect_to: "/onboarding/quiz?mode=retake" }
```

3. **Realtime subscription** for in-progress renders shown on dashboard:
   - Client subscribes to `pipeline_runs` table changes via Supabase Realtime
   - Updates render card status as stages advance
   - Subscription scoped to current user's renders only

### 9B — UI

#### /dashboard

**Tool:** Frontend Visionary

**Layout (desktop):**
- Top bar: Cova logo gold left, "Settings" link DM Sans 14px ivory 70% gold-hover right
- Main column 1024px max width centered
- Section 1: "Recent renders" — 3-col grid of render thumbnails 320×240, gap 16px. Each card: image + room+style caption. Click → /dashboard/render/[id]. Empty: "No designs yet" + first-design CTA.
- Section 2: "Your rooms" header + room cards. Each room card: small processed_url thumbnail 80×60 left, room metadata (created date, hard_room_score chip if flagged, total renders count) center, latest render thumbnail 320×240 right. Click renders → per-design view.
- Section 3: "Settings →" CTA at bottom of /dashboard, navy pill.

**Mobile:**
- Single column
- Section 1: 2-col grid for renders
- Section 2: vertical stack of room cards
- Settings link in top bar instead of bottom

**Behavior:**
- Initial render fetch via SSR (React Server Components) for fast LCP
- Subsequent fetches via TanStack Query with refetchOnFocus
- "Load more" CTAs trigger paginated fetch
- Render thumbnails lazy-load with blurhash placeholders
- In-progress renders show shimmer overlay + "Rendering…" caption
- Failed renders show error state + retry CTA

**Reduced motion:** image hover effects disabled.

**Analytics:**
- dashboard_viewed
- dashboard_render_clicked {render_id, position, section}
- dashboard_room_clicked {room_id}
- dashboard_settings_clicked
- dashboard_load_more_clicked {section, page}
- dashboard_first_design_cta_clicked (empty state)

#### /dashboard/render/[id]

**Tool:** Frontend Visionary + RefineHistoryChain (Phase 6)

**Layout (desktop):**
- Full-width: large render image left (60% width, max 800×1067), side panel right (40%)
- Side panel:
  - Render metadata: refine_index ("Original" if 0, "Refine N" else), created_at relative ("3 days ago"), refine_prompt if set
  - Verification scores chip group (camera 9, architecture 8, etc., gold pills)
  - Room link: "View all renders for this room →" navigates to By-Room scrolled to that room
  - Refine history chain (RefineHistoryChain component) — visual indented list
  - 3 CTAs:
    - "Refine →" gold pill (opens refine modal from Phase 6)
    - "Shop this room →" ghost (navigates to /render/[id]/shop from Phase 7)
    - "Delete render" warm-error text link

**Layout (mobile):**
- Stacked: image full width, metadata + chain below, CTAs bottom

**Refine history chain visualization:**
- Linear chain (parent → refine 1 → refine 2 → ...)
- Each node 80×60 thumbnail + caption
- Current render highlighted (gold border)
- Click node → navigate to that render's per-design view
- Branched chains rendered as subtle indents (V1: linear-only; V1.5 may add tree)

**Delete confirmation modal:**
- Centered card: "Delete this render? This can't be undone."
- 2 CTAs: Cancel (ghost) / Delete (warm-error pill)
- On confirm: POST /api/dashboard/render/[id]/delete → toast "Render deleted" + redirect to /dashboard

**Analytics:**
- per_design_viewed {render_id, refine_index}
- per_design_refine_clicked
- per_design_shop_clicked
- per_design_delete_clicked
- per_design_chain_node_clicked {target_render_id}

#### /dashboard/settings

**Tool:** Frontend Visionary

**Layout (desktop):**
- Top bar: Cova logo gold left, "← Back to dashboard" ivory 70% gold-hover left of center
- 2-column layout: left nav (180px) listing 5 subsections, right pane (640px) showing active subsection
- Active subsection: gold underline on left nav

**Layout (mobile):**
- Single column
- Subsections stacked vertically with section headers
- No left nav

**Subsection 1: Account**
- Email field (disabled input, displays current email)
- "Change email" button → modal with new_email + current_password fields
- "Change password" button → modal with current + new password (zxcvbn)
- Last sign-in: "X days ago"
- Connected providers: Google ✓ / Apple ✓ / Email ✓ (icons of connected methods)

**Subsection 2: Personal info**
- First name (text input, max 50 chars)
- Last name (optional, text input)
- Country (dropdown, USD-only display in V1)
- "Save changes" button (disabled until edits)
- On save: POST /api/settings/update-profile

**Subsection 3: Style profile**
- Style fingerprint summary: small fingerprint visualization (mini Phase 2 PhaseB) + descriptor italic
- Primary/Secondary/Tertiary percentages
- "Re-take quiz" button (warm-error?) → confirmation modal:
  - "This will create a new style profile. Your old one will be saved."
  - 2 CTAs: Cancel / Re-take quiz
  - On confirm: POST /api/settings/start-quiz-retake → /onboarding/quiz?mode=retake

**Subsection 4: Privacy**
- "Export my data" button → triggers POST /api/users/export → toast "Sent to your email"
- "Delete my account" button (warm-error) → confirmation modal:
  - Modal: "Delete your account? This is permanent."
  - Type DELETE field + email confirm field
  - 2 CTAs: Cancel / Delete forever
  - On confirm: POST /api/auth/delete-account → /account-deleted

**Subsection 5: Sign out**
- "Sign out" button → POST /api/auth/sign-out → / (landing)

**Reduced motion:** subsection transitions disabled.

**Analytics:**
- settings_viewed {subsection}
- settings_subsection_changed {to}
- settings_change_password_opened
- settings_change_email_opened
- settings_profile_updated
- settings_retake_quiz_confirmed
- settings_export_data_clicked
- settings_delete_account_opened
- settings_sign_out_clicked

### 9C — Integration + review

- Wire all dashboard routes to backend APIs
- Wire RefineHistoryChain to per-design view
- Test re-take quiz flow end-to-end (settings → modal → /onboarding/quiz?mode=retake → finalize → /onboarding/style-reveal → continue → /dashboard with new fingerprint)
- Test delete-account end-to-end (settings → modal → API → cascade → /account-deleted)
- Test delete-render soft-delete (deleted renders disappear from dashboard, /dashboard/render/[deleted_id] redirects)
- PostHog events all fire
- Verifier 7-phase: happy path + delete-account + re-take quiz + sign-out + OAuth disconnect + render mid-progress shown correctly

---

## 7. Out of scope

- Multi-version style profile UI ("see past fingerprints") — V1.5
- Image organization (folders, tags, favorites) — V1.5
- Search across renders — V1.5
- Sharing renders publicly — V1.5
- Friend / collaborator access — V2
- Designer marketplace integration — V2
- Real-time collaborative editing — V2
- Branched refine tree visualization (V1 = linear) — V1.5

---

## 8. Files touched

### Created
- `apps/web/app/dashboard/page.tsx`
- `apps/web/app/dashboard/render/[id]/page.tsx`
- `apps/web/app/dashboard/settings/page.tsx`
- `apps/web/app/dashboard/settings/[subsection]/page.tsx` (parallel route for direct URLs)
- `apps/web/app/api/dashboard/recent-renders/route.ts`
- `apps/web/app/api/dashboard/by-room/route.ts`
- `apps/web/app/api/dashboard/render/[id]/route.ts`
- `apps/web/app/api/dashboard/render/[id]/delete/route.ts`
- `apps/web/app/api/settings/update-profile/route.ts`
- `apps/web/app/api/settings/change-password/route.ts`
- `apps/web/app/api/settings/change-email/route.ts`
- `apps/web/app/api/settings/start-quiz-retake/route.ts`
- `apps/web/components/dashboard/RecentRendersGrid.tsx`
- `apps/web/components/dashboard/ByRoomList.tsx`
- `apps/web/components/dashboard/RoomCard.tsx`
- `apps/web/components/dashboard/RenderThumbnail.tsx`
- `apps/web/components/dashboard/EmptyState.tsx`
- `apps/web/components/dashboard/PerDesignView.tsx`
- `apps/web/components/dashboard/DeleteRenderModal.tsx`
- `apps/web/components/settings/SettingsNav.tsx`
- `apps/web/components/settings/AccountSection.tsx`
- `apps/web/components/settings/PersonalInfoSection.tsx`
- `apps/web/components/settings/StyleProfileSection.tsx`
- `apps/web/components/settings/PrivacySection.tsx`
- `apps/web/components/settings/SignOutSection.tsx`
- `apps/web/components/settings/ChangePasswordModal.tsx`
- `apps/web/components/settings/ChangeEmailModal.tsx`
- `apps/web/components/settings/RetakeQuizModal.tsx`
- `apps/web/components/settings/DeleteAccountModal.tsx`
- `apps/web/lib/dashboard/queries.ts` (TanStack Query hooks)
- `tests/dashboard/api-routes.test.ts`
- `tests/dashboard/pagination.test.ts`
- `tests/dashboard/soft-delete.test.ts`
- `tests/settings/profile-update.test.ts`
- `tests/settings/password-change.test.ts`
- `tests/settings/retake-quiz.test.ts`
- `tests/settings/delete-account.test.ts`

### Migrations
- `supabase/migrations/{ts}-renders-deleted-at.sql` + `_down.sql`
- `supabase/migrations/{ts}-users-profile-cols.sql` + `_down.sql` (if not already)

### Modified
- `apps/web/middleware.ts` (gate /dashboard on auth + onboarding completion)
- `apps/web/components/refine/RefineHistoryChain.tsx` (Phase 6 component, integrate into per-design view)
- `apps/web/lib/analytics/events.ts` (dashboard + settings events)

---

## 9. API contracts

### GET /api/dashboard/recent-renders
```
Auth: required
Query: ?cursor=ISO+id&limit=6
Returns: {
  ok: true,
  renders: [{id, render_url, created_at, refine_index, refine_prompt, room: {id, processed_url}, style_blend_summary: {primary: 'warm_japandi', primary_pct: 0.73}}],
  next_cursor: string | null
}
RLS: deleted_at IS NULL, user_id = auth.uid()
```

### GET /api/dashboard/by-room
```
Auth: required
Query: ?cursor=ISO+id&limit=4
Returns: {
  ok: true,
  rooms: [{id, processed_url, created_at, hard_room_score, renders: [...sorted by refine_index ASC]}],
  next_cursor: string | null
}
```

### GET /api/dashboard/render/[id]
```
Auth: required
Returns: {
  ok: true,
  render: {...full render},
  parent_render: {...} | null,
  refine_chain: [...up to 20],
  room: {...with personalization_manifest}
}
```

### POST /api/dashboard/render/[id]/delete
```
Auth: required
Returns: { ok: true }
```

### POST /api/settings/update-profile
```
Auth: required
Body: { first_name?, last_name?, country? }
Returns: { ok: true, user: {...} } or { ok: false, failure_category }
```

### POST /api/settings/change-password
```
Auth: required
Body: { current_password, new_password }
Returns: { ok: true } or { ok: false, failure_category }
```

### POST /api/settings/change-email
```
Auth: required
Body: { new_email, current_password }
Returns: { ok: true, message }
```

### POST /api/settings/start-quiz-retake
```
Auth: required
Returns: { ok: true, redirect_to: "/onboarding/quiz?mode=retake" }
```

---

## 10. Schema migrations

(Full DDL in §6 #1.)

```sql
-- {ts}-renders-deleted-at.sql
ALTER TABLE renders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS renders_deleted_at_idx ON renders(deleted_at) WHERE deleted_at IS NULL;

-- Down: 
-- DROP INDEX renders_deleted_at_idx;
-- ALTER TABLE renders DROP COLUMN deleted_at;
```

---

## 11. Failure handling

```typescript
export type DashboardFailure =
  | 'dashboard_unauthorized'
  | 'dashboard_render_not_found'
  | 'dashboard_render_not_owned'
  | 'dashboard_pagination_invalid_cursor'
  | 'dashboard_delete_render_fail'
  | 'settings_profile_update_fail'
  | 'settings_password_incorrect'
  | 'settings_password_weak'
  | 'settings_email_already_used'
  | 'settings_retake_redirect_fail'
  | 'realtime_subscription_fail';
```

| Category | Recovery |
|---|---|
| dashboard_unauthorized | Redirect to /auth/signin |
| dashboard_render_not_found | Redirect to /dashboard with toast "Render not found" |
| dashboard_render_not_owned | Same as not_found (don't reveal existence) |
| dashboard_pagination_invalid_cursor | Reset to first page silently |
| settings_password_incorrect | Modal stays open, error message inline |
| settings_email_already_used | Modal error "That email is already in use" |
| realtime_subscription_fail | Fall back to polling every 10s |

---

## 12. Cost budget

| Source | Estimated cost |
|---|---|
| Claude credits | $30–50 |
| Test renders for dashboard population | ~$2 |
| **Total** | **~$32–52** |

---

## 13. Verifier focus areas

| Criterion | Verifier check |
|---|---|
| /dashboard auth gate | Unauthenticated → /auth/signin redirect |
| /dashboard onboarding gate | quiz_complete=false → /onboarding/welcome redirect |
| Recent renders pagination | Load 7 renders test data → first page shows 6, "Load more" reveals 7th |
| By-room nesting | 2 rooms with 3 renders each → grouped correctly |
| Per-design view | /dashboard/render/[id] returns full render + chain + room |
| Refine history chain renders | Test render with parent_render_id chain shows nodes correctly |
| Delete render | POST /delete sets deleted_at; subsequent GET /recent-renders excludes it |
| Settings auth gate | Unauthenticated → /auth/signin |
| Profile update | POST /update-profile updates users row; refetch shows new values |
| Password change | Current verified before new applied |
| Email change | Triggers Supabase Auth flow; both emails sent |
| Re-take quiz routing | /settings → confirm → /onboarding/quiz?mode=retake works; finalize creates new style_blend version |
| Delete account | Cascade works end-to-end (user gone from auth.users, all rows cascaded, account_deletions row written) |
| Sign out | Session invalidated; subsequent /dashboard requires re-auth |
| RefineHistoryChain integration | Component from Phase 6 renders correctly in per-design view |
| Realtime updates | In-progress render's status updates shown via Supabase Realtime |
| All 11 DashboardFailure codes used | grep confirms |

---

## 14. Adversarial code review checklist

- [ ] All /api/dashboard/* routes verify `auth.uid() = renders.user_id` before returning data (RLS + explicit check)
- [ ] /api/dashboard/render/[id] returns 404 if render belongs to different user (don't reveal existence)
- [ ] Soft-delete: deleted_at IS NULL filter applied to ALL dashboard queries
- [ ] Pagination cursor signed/encoded so users can't tamper to access other users' renders
- [ ] /api/dashboard/render/[id]/delete validates ownership before UPDATE
- [ ] Delete is soft (deleted_at = now(), NOT DROP); 30-day cron cleanup deferred to V1.5
- [ ] /api/settings/change-password verifies current password BEFORE updating
- [ ] /api/settings/change-email triggers Supabase Auth (which sends OLD + NEW confirms)
- [ ] /api/settings/update-profile zod validates max 50 chars on names
- [ ] Profanity check on name updates (Haiku) prevents abusive display names
- [ ] Re-take quiz creates NEW style_blend version (versioned), doesn't overwrite
- [ ] Re-take quiz preserves old fingerprint accessible via SQL (V1.5 surfaces in UI)
- [ ] Delete-account modal requires BOTH "type DELETE" AND email confirm before submit
- [ ] Delete-account POST is idempotent (calling twice returns success on already-deleted)
- [ ] Sign out clears all session cookies (HttpOnly, Secure, SameSite=Strict)
- [ ] OAuth disconnect from settings prevents users from being locked out (warn if only auth method)
- [ ] No PII in dashboard analytics events (user_id only, no email)
- [ ] No console.log of user data via redactLogPayload
- [ ] Realtime subscription scoped to current user's rows only (not all pipeline_runs)
- [ ] TanStack Query refetchOnFocus enabled but throttled (don't hammer API)
- [ ] Image components lazy-load (Next/Image with priority=false except top render)
- [ ] Blurhash or low-res placeholders during image load
- [ ] Pagination cursor uses created_at + id tiebreaker (avoid duplicates on equal timestamps)
- [ ] Empty state CTA routes correctly based on onboarding state
- [ ] Mobile layout tested at 375px width
- [ ] Settings sub-routes via parallel route or query param (works with browser back)
- [ ] /dashboard/settings deep link works (e.g., /dashboard/settings?subsection=privacy)
- [ ] Cancel buttons on modals don't submit form
- [ ] Escape key closes modals
- [ ] Toast notifications for all settings save/delete actions
- [ ] Reduced motion CSS query honored
- [ ] All 11 failure_category codes used in error paths

---

## 15. Manual click-script

Save to `cova-plan/manual-evidence/P9/`.

### Dashboard happy path (with renders)
1. Sign in test user with: completed quiz, 3+ rooms with renders, some rooms with refine chains
2. Open root URL → redirects to /dashboard **[I1: dashboard.png]**
3. Recent renders section shows top 6 most recent **[I2: recent-renders.png]**
4. Click "Load more" → next 6 appear (if applicable) **[I3: load-more.png]**
5. By-room section shows rooms grouped, latest render hero per room **[I4: by-room.png]**
6. Hover render thumbnail → 1.04 scale, gold border outline
7. Settings link at bottom → click → /dashboard/settings **[I5: settings-nav.png]**

### Dashboard empty state (new user)
8. Sign in fresh test user with no renders
9. /dashboard shows "No designs yet" + "Start your first design →" CTA **[I6: empty-state.png]**
10. Click CTA → /onboarding/welcome (or /onboarding/capture if quiz done)

### Per-design view
11. From /dashboard, click any render thumbnail → /dashboard/render/[id]
12. Full-bleed render image left, side panel right **[I7: per-design.png]**
13. Refine history chain renders correctly (e.g., parent → refine 1 → refine 2) **[I8: refine-chain.png]**
14. Click chain node → navigates to that render's per-design view
15. CTAs: Refine, Shop, Delete present

### Refine from dashboard
16. Click "Refine →" → opens refine modal (Phase 6) → submit → cinematic
17. After refine completes, returns to /dashboard with new render at top of Recent

### Shop from dashboard
18. Click "Shop this room →" → /render/[id]/shop (Phase 7)

### Delete render
19. Click "Delete render" link → confirmation modal **[I9: delete-render-modal.png]**
20. Click Cancel → modal closes, render preserved
21. Click again, click Delete → toast "Render deleted" + redirect to /dashboard
22. Verify render not in Recent or By-Room **[I10: render-deleted.png]**
23. Verify SQL: deleted_at IS NOT NULL on that render

### Settings hub
24. /dashboard/settings → Account subsection active by default **[I11: settings-account.png]**
25. Click Personal info → loads section **[I12: settings-personal.png]**
26. Edit first_name → "Save changes" → toast "Saved" **[I13: profile-saved.png]**
27. Click Style profile → fingerprint visualization renders **[I14: settings-style.png]**
28. Click Privacy → buttons visible **[I15: settings-privacy.png]**
29. Click Sign out → session ends, redirect to / (landing)

### Change password
30. Settings → Account → "Change password" → modal **[I16: change-password.png]**
31. Enter wrong current password → error inline
32. Enter correct + new strong password → success → toast "Password updated"
33. Sign out, sign in with new password → success

### Change email
34. Settings → Account → "Change email" → modal **[I17: change-email.png]**
35. Enter new email + current password → submit → toast "Confirmation links sent"
36. Check both inboxes (old + new) for emails
37. Confirm both → email change takes effect

### Re-take quiz
38. Settings → Style profile → "Re-take quiz" → confirmation modal **[I18: retake-modal.png]**
39. Click Cancel → modal closes, stays on settings
40. Click "Re-take quiz" → /onboarding/quiz?mode=retake **[I19: retake-quiz.png]**
41. Complete 12 picks → /onboarding/style-reveal → Continue → /dashboard
42. Verify new style_blend with version=2 in users row (old version=1 preserved if V1.5)

### Delete account
43. Settings → Privacy → "Delete my account" → modal **[I20: delete-account-modal.png]**
44. Type "DELETE" + email → "Delete forever" → /account-deleted **[I21: account-deleted.png]**
45. Verify in Supabase: user gone from auth.users, account_deletions row exists with hashed_user_id
46. Try to sign in with deleted email → fails (anti-enumeration: "If that email is registered...")

### GDPR data export
47. Settings → Privacy → "Export my data" → toast "Sent to your email"
48. Check email → download zip → verify rooms.json + renders.json + swipes.json + image_urls.txt **[I22: gdpr-export.png]**

### Realtime updates
49. From /dashboard, trigger a render in another tab
50. Watch dashboard: in-progress render shows "Rendering…" caption + shimmer **[I23: render-in-progress-on-dashboard.png]**
51. When complete, caption updates without manual refresh

### Mobile responsive
52. iPhone Safari: open /dashboard → 2-col grid for renders **[I24: mobile-dashboard.png]**
53. Open /dashboard/settings → single column with stacked subsections **[I25: mobile-settings.png]**

### Reduced motion
54. Enable OS reduced motion → all animations degraded; modals fade-in only

---

## 16. Manual evidence bundle

- 25+ screenshots from §15
- Sample SQL dumps: 1 render dashboard query, 1 by-room query, 1 settings update audit, 1 delete-account cascade audit
- INDEX.md linking artifacts to spec criteria

---

## 17. Remediation budget

- Round 1: Verifier session 1 self-heals
- Round 2: Verifier session 2 finds new issues → remediation
- Round 3 (escalation): write `cova-plan/escalations/P9.md`

---

## 18. Closing checklist

- [ ] All screenshots in `cova-plan/manual-evidence/P9/`
- [ ] Sample SQL dumps archived
- [ ] INDEX.md written
- [ ] `PHASE_STATUS.md` Phase 9 → CLOSED
- [ ] `OPEN_DECISIONS.md` updated: dashboard 3-section layout locked, settings 5-subsection structure locked, soft-delete 30d retention, re-take quiz versioning policy, refine chain linear in V1
- [ ] `EMPIRICAL_FINDINGS.md` updated: dashboard load latency p50/p95, account deletion completion rate, re-take quiz attempt rate, settings change frequency
- [ ] Phase 10 prereq section reviewed
- [ ] Verifier reports archived
- [ ] Session handoffs written

---

## 19. Rollback plan

- Revert merge → run paired _down.sql in reverse:
  1. users-profile-cols down
  2. renders-deleted-at down (drops deleted_at column; soft-deleted records become visible again — this is a feature for rollback recovery)
- If dashboard broken: feature flag `dashboard_enabled=false` redirects /dashboard to a minimal "Welcome back" page with sign-out only

---

## 20. Feature flags introduced

| Flag key | Description | Default |
|---|---|---|
| `dashboard_enabled` | Master switch | true |
| `dashboard_realtime_updates` | Supabase Realtime subscriptions | true |
| `dashboard_pagination_enabled` | "Load more" CTAs (false = show all) | true |
| `settings_email_change_enabled` | Allow email change (false = disabled, contact support) | true |
| `settings_retake_quiz_enabled` | Allow re-taking quiz | true |

---

## End of Phase 9 doc.

Next: Phase 10 (Landing Page).
