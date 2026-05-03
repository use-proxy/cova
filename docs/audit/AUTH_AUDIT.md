# AUTH_AUDIT — Authentication, Signup, and Account Lifecycle

Date: 2026-04-29
Scope: `apps/web/app/auth/**`, `apps/web/middleware.ts`, `apps/web/lib/supabase/**`,
`apps/web/components/auth/**`, `apps/web/app/dashboard/**`,
`apps/web/components/dashboard/**`, `supabase/functions/delete-account`,
`supabase/migrations/20240001000000_users.sql`, `supabase/config.toml`,
`apps/web/lib/store/fingerprint.ts`.

---

## 1. Signup flow — what actually happens

### 1.1 The active sign-in page is sign-in only — no signup

`apps/web/app/auth/page.tsx` is the canonical auth page (the route the
middleware redirects to: `middleware.ts:85`). It exposes:

- Google OAuth (`page.tsx:62-86`)
- Email + password sign-**in** via `signInWithPassword` (`page.tsx:35-60`)
- A "Forgot password" button whose handler is a no-op (`page.tsx:88-90`)
- A "Request access" footer button whose handler is a no-op
  (`page.tsx:92-94`)

There is **no email-password signup form on this page**. A user landing on
`/auth` cannot create an email-password account from the UI. The only
self-service signup path is Google OAuth.

### 1.2 `AuthModal` exists but is not mounted

`apps/web/components/auth/AuthModal.tsx` implements a full email/password
signup with strength meter, confirm-password check, and Terms checkbox
(`AuthModal.tsx:178-198`). It calls `supabase.auth.signUp` and then writes
to a `profiles` table on success (`AuthModal.tsx:189-196`).

**It is never mounted.** A code search for `AuthModal` returns the file
itself, an audit doc, and nothing else. Two additional problems if it were
ever wired up:

- It writes to a `profiles` table that does not exist in the canonical schema
  (`apps/web/lib/types/supabase.ts` — no `profiles` row type).
- `redirectAfterAuth` (`AuthModal.tsx:145-159`) selects from `profiles`
  to decide between `/dashboard` and `/capture` — `/capture` is also a
  retired flow (V0 path); the V3 onboarding entry is `/design/step-1`
  per `apps/web/CLAUDE.md`.

### 1.3 `auth.users` and `public.users` writes

`auth.users` is written by Supabase whenever any of these fires:

- Google OAuth callback (`/auth/callback` exchanges the code for a session)
- `signInWithPassword` (no — sign-in only)
- The unmounted `AuthModal.signUp` (would, if mounted)

`public.users` is populated by an `AFTER INSERT ON auth.users` trigger
defined in `supabase/migrations/20240001000000_users.sql:18-31`:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

The trigger inserts only `id` and `email`. Every other column relies on
defaults from the same migration:

- `token_balance INTEGER NOT NULL DEFAULT 5`
- `account_type` defaults to `'consumer'`
- `style_fingerprint` / `budget_dna` default to `'{}'`
- `onboarding_completed` defaults to `false`

`SCHEMA_AUDIT.md:509` confirms `handle_new_user()` exists in the live DB
but the trigger is on `auth.users`, not `public`, so it does not show in
the public `pg_trigger` listing.

### 1.4 Does the trigger fire reliably?

**Likely yes, but defensive backfill exists.** Two production code paths
handle the case where the trigger silently fails or the row pre-exists:

- `app/api/quiz/fingerprint/route.ts:1098-1116` does an idempotent
  `users.upsert({id, email, full_name})` keyed on `id` if the user row
  is missing before writing the fingerprint.
- `app/auth/callback/route.ts:113-126` updates `users.style_fingerprint`
  and `users.style_blend` after the OAuth code exchange — this assumes
  the row exists.

The presence of the upsert backfill at `fingerprint/route.ts` suggests
the trigger has misbehaved at least once in the project's history (or
the developer was hedging against the possibility). I did not run a
live trigger test against production.

### 1.5 Post-signup hooks

**None.** No welcome email, no analytics `user_signed_up` event, no
token grant, no Sentry user binding. The `lib/analytics.ts` event
catalog (`lib/analytics.ts:48-75`) lists `quizStarted`, `quizCompleted`,
`photoUploaded`, `renderStarted`, `renderCompleted`, `hotspotTapped`,
`affiliateClicked`, `matchViewed`, `swapInitiated` — no signup event.

### 1.6 Post-signup redirect

For email-password sign-in via `/auth`, redirect is hardcoded to
`/design/step-1` (`app/auth/page.tsx:51`).

For OAuth, the callback redirects to `searchParams.next ?? "/design/step-1"`
(`app/auth/callback/route.ts:63, 141`). The middleware also forces
authenticated users hitting `/` to `/dashboard` (`middleware.ts:72-76`),
so a logged-in user re-visiting the site lands on the dashboard.

There is no logic that distinguishes "first-time signup" from "returning
sign-in" — both routes go to `/design/step-1`. There is a
`users.onboarding_completed` boolean in the schema, but no code reads or
writes it (verified via grep — only test fixtures and generated types
reference it).

---

## 2. OAuth Google flow

### 2.1 Production status

OAuth is wired and works in code. Two callsites:

- `app/auth/page.tsx:62-86` (active sign-in page)
- `components/auth/AuthModal.tsx:129-143` (unmounted)

Both call `supabase.auth.signInWithOAuth({ provider: "google",
options: { redirectTo: `${window.location.origin}/auth/callback` } })`.

I cannot verify production-domain OAuth approval status from code — that
lives in the Supabase dashboard's auth-provider config and the Google
Cloud OAuth-consent-screen for `covainterior.com`. `supabase/config.toml`
sets the redirect-allow list to `https://covainterior.com/**` and
`http://localhost:3000/**` (`config.toml:25-26`).

### 2.2 Scopes

**Defaults only.** Neither callsite passes `scopes` to
`signInWithOAuth.options`. Supabase requests Google's default OIDC scopes
(`openid email profile`). Cova never reads anything beyond email +
display name + avatar URL from the OAuth payload, so this is fine.

### 2.3 Email + Google with same address

**Supabase default behavior — collision.** Supabase identifies users by
email; if a user signs up with email-password and later "Continue with
Google" using the same address, Supabase merges (when "Allow account
linking" is on, default since Auth v2) or surfaces an
`identity_already_exists` error. Cova has no UI to handle either case —
the modal-mode `setError(error.message)` would just display Supabase's
raw string. No recovery flow exists.

### 2.4 `/auth/callback`

**Working.** `app/auth/callback/route.ts` is the canonical callback.

Flow:
1. Read `code` and optional `next` from query string.
2. `exchangeCodeForSession(code)` to mint the session cookies.
3. Read the `cova_anon_fingerprint` cookie (see §6).
4. If the fingerprint exists, insert into `style_fingerprints` and
   mirror onto `users.style_fingerprint` + `users.style_blend` using
   the admin client (`callback/route.ts:82-127`).
5. Clear the cookie.
6. Redirect to `${origin}${next ?? "/design/step-1"}`.

Notes:
- The duplicate `/api/auth/callback` route was deleted; the file's
  header comment (`callback/route.ts:1-15`) documents this.
- The fingerprint persistence is wrapped in try/catch and is best-effort
  (`callback/route.ts:73, 136-139`) — auth never fails because of a
  fingerprint write failure.
- The error path on a failed `exchangeCodeForSession` redirects to
  `/?error=auth_failed` (`callback/route.ts:145`); the landing page
  does not render this error today.

---

## 3. Email/password flow

### 3.1 Email verification

**Disabled.** `supabase/config.toml:28-31`:

```toml
[auth.email]
enable_signup = true
double_confirm_changes = false
enable_confirmations = false
```

No email verification is sent. Users would sign up and immediately
become authenticated. (Moot today because no signup UI is wired.)

### 3.2 Email templates

Not configured in `supabase/config.toml`. Default Supabase templates
would be used if any email-driven flow (verification, password reset)
were enabled.

### 3.3 Forgot password

**Stub only.** `app/auth/page.tsx:88-90`:

```ts
function handleForgotPassword() {
  // Forgot-password flow not yet implemented.
}
```

No call to `resetPasswordForEmail` exists anywhere in `apps/web` (grep
returns zero non-`node_modules` matches). There is no `/forgot-password`
page, no `/reset-password` page, no `/api/auth/*` recovery route.

### 3.4 Password requirements

Not enforced server-side. Supabase's project-level minimum password
length is the only gate (the Cova project setting is unknown from code,
but defaults to 6 characters). The unmounted `AuthModal` has a
client-side strength meter (`AuthModal.tsx:17-25`) but it only colors
three pips — it doesn't block weak passwords.

---

## 4. Session management

### 4.1 Session lifetime

Cova does not set `[auth.jwt_expiry]` in `supabase/config.toml`, so
Supabase defaults apply: **JWT 1 hour, refresh tokens 30 days, sliding
window**. Refresh-token rotation is enabled by default in Supabase
Auth v2 — Cova does not override.

### 4.2 Session storage

HTTP-only cookies via `@supabase/ssr` (CLAUDE.md Rule 1). No
localStorage/sessionStorage usage in the auth path. Browser client at
`lib/supabase/client.ts:3-8` uses `createBrowserClient`; server client
at `lib/supabase/server.ts:4-28` uses `createServerClient`.

### 4.3 Session refresh in middleware

`middleware.ts:42-67` follows the `@supabase/ssr` `getUser()` pattern.
On every request it constructs a `createServerClient`, calls
`supabase.auth.getUser()`, and reflects refreshed cookies onto the
outgoing response (`middleware.ts:54-59`). This is the canonical
Supabase SSR refresh pattern.

### 4.4 Logout

Three sign-out callsites, all real:

- `apps/web/app/dashboard/SignOutButton.tsx:10-13` — calls `signOut` then
  `router.push("/auth")`.
- `apps/web/components/dashboard/AvatarDropdown.tsx:27-31` — calls
  `signOut`, navigates to `/`, calls `router.refresh()`.
- `apps/web/app/dashboard/page.tsx:585-595` (sidebar "Sign out" button) —
  same.

`signOut()` clears the session locally and revokes the refresh token
server-side. After it returns, the next middleware pass sees no user
and the protected-route gate kicks in.

`apps/web/app/dashboard/settings/page.tsx:521-535` ("delete account")
also calls `signOut` but **does not actually delete anything** — see §5.

### 4.5 Middleware unauthenticated redirects

`middleware.ts:11-23` lists protected page routes
(`/design/step-2..9, /dashboard`). Unauthenticated requests to those get
a 302 to `/auth?next=<original-path>`. Unauthenticated requests to
non-public API routes get `401 {"error":"Unauthorized"}` JSON
(`middleware.ts:90-97`). Public-API exceptions are listed at
`middleware.ts:28-39` (quiz, style references, public-room counts,
test-pipeline, all of `/api/pipeline/**`).

`/design/step-1` is **public** by design (no entry in
`PROTECTED_PAGE_ROUTES`). The user only hits the auth wall starting at
`/design/step-2`.

---

## 5. Account deletion

### 5.1 Edge Function

`supabase/functions/delete-account/index.ts` exists and is
implementation-complete. Flow (`index.ts:33-71`):

1. Verify the caller's session via the anon client + Authorization header.
2. With the admin (service-role) client, fetch the user's `room_ids`.
3. Delete in FK-safe order:
   - `chat_messages` by `user_id`
   - `furniture_placements` by `room_id IN (room_ids)`
   - `renders` by `user_id`
   - `rooms` by `user_id`
   - `token_transactions` by `user_id`
4. Best-effort wipe of storage buckets `room-photos` and `renders`
   under prefix `${userId}/`.
5. `users.delete().eq('id', userId)`.
6. `auth.admin.deleteUser(userId)` — terminates the auth identity.

CLAUDE.md Rule 12 lists `delete-account` as FROZEN (only `chat-room`
may be edited).

### 5.2 Wired to UI?

**No working hook.** Two surfaces that look like they delete the
account, neither calls the Edge Function:

- `apps/web/components/dashboard/DeleteAccountButton.tsx` — used by
  `/dashboard/profile`. The implementation is literally an `alert()`
  telling the user to email `hello@covainterior.com`
  (`DeleteAccountButton.tsx:7-19`).
- `apps/web/app/dashboard/settings/page.tsx:521-535` — opens a
  type-DELETE confirm modal, but the confirm handler waits 1.4s,
  signs the user out, shows a toast, and redirects to `/`. **It does
  not POST to the Edge Function and it does not touch any DB row.**

Anyone who clicks "Delete Account" in settings today is silently signed
out with stale data still in Supabase.

### 5.3 What deletion would clean (if wired)

Tables explicitly deleted by `delete-account`: `chat_messages`,
`furniture_placements` (per `room_id`), `renders`, `rooms`,
`token_transactions`, `users`, plus `auth.users`.

Tables not explicitly deleted but cleaned via FK cascades:

- `style_fingerprints` (FK `user_id` ON DELETE CASCADE per
  `001_initial.sql:36`).
- Any other table with `REFERENCES auth.users(id) ON DELETE CASCADE`
  is wiped when `auth.admin.deleteUser` fires (the `public.users.id`
  FK in `20240001000000_users.sql:5` cascades).

Tables anonymized (FK SET NULL):

- `interactions` (`user_id` ON DELETE SET NULL per `001_initial.sql:189`).
  Rows persist with `user_id = NULL`. This is acceptable for analytics
  but worth noting for GDPR — any PII inside the row (none today, but
  `quiz_responses` columns elsewhere may carry user-typed text) would
  remain.

### 5.4 GDPR / CCPA fitness

**Mechanically sufficient if wired.** Email + ID + style data + uploads
all leave the system. The remaining gaps before V1:

- The Edge Function isn't reachable from any UI.
- `swipe_history`, `votes`, and other tables added since the function
  was written are not in the explicit-delete list. They are likely
  cascade-cleaned via `users` → `auth.users` FK, but this is not
  asserted by the function and would silently break if FKs change.
- Storage cleanup only wipes `room-photos` and `renders`. If V3
  pipeline writes to other buckets (e.g. `style-references`, depth
  caches), those would remain.
- No audit log row is written before deletion ("user X requested
  delete at T") — common GDPR practice.

### 5.5 Re-signup with same email

After Edge Function completes, `auth.users` row is gone, so the email
is free. Supabase will accept a new signup. There is no "deletion
cooldown" or "tombstone" — re-signup is immediate and the user starts
fresh. This is the intended behavior; no fix needed.

---

## 6. Pre-auth fingerprint persistence

### 6.1 What it is

The quiz (`/design/step-3`) can complete before the user authenticates.
The Zustand fingerprint store (`apps/web/lib/store/fingerprint.ts`)
serializes its state into the `cova_anon_fingerprint` cookie
(`Path=/, SameSite=Lax, Max-Age=3600`) using a custom storage adapter
(`fingerprint.ts:94-153`).

The `covariance` field is stripped from the persisted payload to keep
the cookie under ~3 KB (`fingerprint.ts:137`, CLAUDE.md Rule 1 calls
this out — the prior `sessionStorage` overflow fallback was removed).

### 6.2 What `/auth/callback` does with it

After `exchangeCodeForSession` succeeds
(`app/auth/callback/route.ts:67`):

1. Read the cookie (`callback/route.ts:79-80`).
2. Parse via `parseAnonFingerprintCookie` (base64 → URI-decode → JSON).
3. Insert into `style_fingerprints` with `entry_path = 'pre_auth_quiz'`
   (`callback/route.ts:88-110`).
4. Mirror `dimensions` onto `users.style_fingerprint` and
   `users.style_blend` (`callback/route.ts:113-126`).
5. Clear the cookie (`callback/route.ts:128-133`).

### 6.3 Failure modes

- Cookie parse failure → silently ignored, function returns `null`
  (`callback/route.ts:54-56`).
- Insert error → logged via `console.error`, does not block redirect.
- The mirror update only fires inside the `if (anonState?.fingerprint)`
  branch (`callback/route.ts:82`). If the user has no anon-quiz cookie
  (signed up first, quizzed later), the cookie path is skipped and the
  fingerprint is later persisted via `/api/quiz/fingerprint`.

This is the mechanism that lets a marketing user "take the quiz, then
make an account" without losing their result.

---

## 7. Token grant on signup

### 7.1 Does the 7-token grant fire?

**No.** There is no signup-time token grant code anywhere.

### 7.2 What actually happens to `token_balance`

The `users` table has `token_balance INTEGER NOT NULL DEFAULT 5`
(`supabase/migrations/20240001000000_users.sql:11`). When the
`handle_new_user()` trigger inserts `(id, email)`, Postgres applies the
default and the new row gets **5 tokens**. Not 7. Not zero.

### 7.3 Why this is moot today

`apps/web/lib/tokens.ts:7-11` is an in-memory `Map<userId, number>`
stub:

- Admin user IDs always return `999_999`.
- All other users get a fixed 100-token allowance.

The DB column is never read. No code reads `users.token_balance` and no
code writes to `token_transactions` outside of `delete-account`'s wipe
step. `users.tokens_enabled` (a feature flag column) defaults `false`
and is never flipped.

`docs/audit/BILLING_AUDIT.md:117` confirms: *"Free-token grant on
signup: Not wired. Default in the users migration is 5; the in-memory
stub seeds non-admins to 100. Neither matches the prompt's '7 free
tokens at signup' target. There is no signup hook that writes a
token_transactions row."*

### 7.4 Where the grant should fire

Two options once tokens are turned on:

- Extend `handle_new_user()` to `INSERT INTO token_transactions
  (user_id, delta, reason)` with `reason = 'signup_grant'` and bump
  the column default to 7.
- Or call a new `/api/auth/post-signup` route from the OAuth callback
  on first-ever sign-in (detected by `users.created_at == now`).

A trigger-side grant is idempotent by table constraint
(`token_transactions.user_id, reason='signup_grant'` could carry a
unique partial index). An app-side grant must guard against retries
(re-entering OAuth callback after sign-out should not double-grant).

### 7.5 Reason code

The schema permits free-text `reason` strings on `token_transactions`
(`apps/web/lib/types/supabase.ts:2034`). No enum is enforced. The
billing audit recommends `'signup_grant'`, `'topup'`, `'subscription'`,
`'render'`, `'refine'`.

---

## 8. Account-related screens & components

| Surface | File | Status |
|---|---|---|
| `/auth` (sign-in) | `app/auth/page.tsx` | Working: Google + email-password sign-in. **Missing:** signup form, forgot-password handler. |
| `/auth/callback` | `app/auth/callback/route.ts` | Working: code exchange + pre-auth fingerprint persistence. |
| `/dashboard/profile` | `app/dashboard/profile/page.tsx` | Working: real reads of `auth.user.email`, `created_at`, `app_metadata.provider` + style fingerprint via `getUserFingerprint`. **DeleteAccountButton is an alert stub.** |
| `/dashboard/settings` | `app/dashboard/settings/page.tsx` | **Placeholder.** Hardcoded `INITIAL_PROFILE = { fullName: "Ariana Bennett", email: "ariana@cova.design", … }` (line 115). Real `getUser()` gate at line 338 + real `signOut()` at line 526. Save buttons mutate local React state only. Delete-account modal calls `signOut`; **does not delete**. |
| `/dashboard/saved` | `app/dashboard/saved/page.tsx` | Out of scope here (not auth-related). |
| `/dashboard` (Home) | `app/dashboard/page.tsx` | Mostly mock data ("Amelia Laurent", hardcoded rooms/products/activity). Real `getUser()` gate at line 472 and real `signOut` at line 590. |
| AvatarDropdown | `components/dashboard/AvatarDropdown.tsx` | Working: shows email, links to `/dashboard/profile` and `/dashboard/settings`, real `signOut`. |
| `SignOutButton` | `app/dashboard/SignOutButton.tsx` | Working. |
| AuthModal | `components/auth/AuthModal.tsx` | **Dead code.** Implements signup but is not mounted; references a non-existent `profiles` table and a retired `/capture` route. |
| Forgot-password / reset-password | — | Does not exist. |
| `/api/auth/*` | `apps/web/app/api/auth/` | Directory does not exist. |

---

## 9. Recommended additions for V1

### 9.1 Must-haves

- **Email-password signup UI.** Either wire `AuthModal` (after fixing the
  `profiles` write and the `/capture` redirect) or add a sign-up tab to
  `/auth/page.tsx`. Without it, only Google users can self-serve.
- **Forgot-password flow.** `resetPasswordForEmail` + a `/reset-password`
  page. The Supabase email template should be edited from the dashboard
  to match Cova brand.
- **Token grant on signup.** Extend `handle_new_user()` to write a
  `token_transactions(delta=7, reason='signup_grant')` row, and bump
  `users.token_balance` default to 7. Add a unique partial index so
  re-entry is idempotent. Then swap `lib/tokens.ts` from the in-memory
  Map to a real ledger query — the BILLING_AUDIT roadmap covers this.
- **Wire `delete-account` to the UI.** The settings-page modal and
  the profile-page button must POST to the Edge Function (with the
  user's access token in the Authorization header) and then sign out.
  Today's "click delete → silent sign-out" behavior is a privacy bug.
- **Analytics signup event.** Add `analytics.userSignedUp({method,
  is_first_session})` and call from `/auth/callback` after the code
  exchange succeeds (gated on `users.created_at == now()` for
  first-time-only). Without this we cannot measure signup conversion.

### 9.2 Should-haves

- **Email verification.** Currently disabled
  (`config.toml: enable_confirmations = false`). For V1 launch a
  decision is needed — leaving it off speeds up funnel but allows
  typo'd / disposable emails. Recommendation: enable with a 24h grace
  window so the user can use the product before verifying.
- **Fix `/dashboard/settings` to read & write real data.** Today every
  field is hardcoded. The save buttons are theatre. At minimum email
  + full_name should round-trip to `users` (full_name) and
  `auth.updateUser` (email).
- **Replace `DeleteAccountButton`'s `alert("contact support…")`** with a
  real call to the Edge Function once §9.1 wiring is done.

### 9.3 Nice-to-haves

- **Welcome email** triggered from the same post-signup hook as the
  token grant. Resend or Supabase's transactional email both work.
- **Sentry user binding** in `/auth/callback` (`Sentry.setUser({id,
  email})`) so error reports group by user.
- **PostHog `identify`** with `auth_provider`, `created_at`, plan tier
  from the same place.
- **Account-collision UX**: detect Supabase's "Identity already exists"
  error on Google OAuth and show "You signed up with email — sign in
  with email and link Google in Settings" instead of the raw error.

---

## 10. Open questions

1. **Is the `handle_new_user()` trigger actually live in production?**
   The migration is in `supabase/migrations/`. The SCHEMA_AUDIT confirms
   the function exists in the live DB. The trigger on `auth.users` is
   not visible in the standard `pg_trigger` query that the audit ran.
   A 30-second test (insert a synthetic auth user via dashboard, check
   `public.users`) would confirm. The defensive upsert at
   `quiz/fingerprint/route.ts:1098` suggests at least one prior failure.

2. **Should sign-in send the user to `/dashboard` or `/design/step-1`?**
   Today `/auth/page.tsx` always sends to `/design/step-1`, but
   middleware bounces logged-in `/` visits to `/dashboard`. A returning
   user signing in from `/auth` lands on the welcome screen instead of
   their dashboard. Decide on the canonical post-sign-in destination
   (suggest: `/dashboard` if `users.onboarding_completed = true`, else
   `/design/step-1`).

3. **Where does `users.onboarding_completed` get set?** The column
   exists, defaults to `false`, but no code reads or writes it. If we
   want the redirect-decision in question 2, this column needs a
   writer (best home: a server action that fires when the user reaches
   `/design/step-9` for the first time).

4. **Email verification on or off for V1?** Today off. Marketing-funnel
   argument says off; spam/abuse-prevention argument says on. Need a
   call.

5. **Account merging for "email then Google" duplicate signups.**
   Supabase has an "Allow account linking" project setting. We should
   confirm it is on (or explicitly off with a friendly error path).

6. **Should `delete-account` be allowed to mutate while CLAUDE.md Rule
   12 lists it as FROZEN?** The function needs to be extended to cover
   newer tables (`swipe_history`, `votes`, `style_references` writes,
   any new storage buckets). If it is truly frozen, we need a NEW
   function (`delete-account-v2`) called by the UI instead.

7. **Password requirements.** Supabase project setting (currently
   unknown) governs minimum length. Should be confirmed and a stricter
   client-side check added if signup UI is wired.

8. **Session-expiry UX.** Today an expired refresh token surfaces as
   "next protected request 401s, middleware redirects to `/auth`". For
   long-lived dashboard sessions (e.g. user leaves a tab open over
   night), surfacing a friendly "Session expired — sign in again" toast
   would be better than a silent jump.

9. **Are pre-auth fingerprint cookies (3 KB) ever served from a CDN-cached
   response?** If the `/auth/callback` response or a downstream redirect
   were ever cached, we could leak fingerprints. Worth a single audit
   pass against the Vercel cache headers.
