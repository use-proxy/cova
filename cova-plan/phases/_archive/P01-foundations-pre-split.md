# Phase 1 — Foundations

**Cova V1 implementation · Phase 1 of 12 · Self-contained**

---

## Phase identity

| | |
|---|---|
| **Phase number** | 1 of 12 |
| **Goal** | Demolish all dead code, dead schema, and stale tests. Close every gap from the 21 audits. Ship hardened ops, auth (6 screens), legal pages, account deletion. |
| **Executor session estimate** | 5–7 sessions across M0/M1/M2/M3, handoffs at 93–94% context |
| **Calendar estimate** | 2–3 weeks focused work — cleanup is the slowest phase |
| **Predicted Claude credits** | ~$50–80 |
| **Predicted infra spend** | ~$5 (test sends, fixture renders) |
| **Depends on** | Phase 0 partial: Resend DNS, Termly account, MCPs connected, audits read |
| **Blocks** | Every other phase. Phase 2 cannot start until Phase 1 closes. |

---

## 1. The session loop for this phase

How Phase 1 actually executes, end-to-end.

1. **You open a new claude.ai chat.** Paste this entire phase doc as the first message.
2. **Chat summarizes back.** Reads the doc, summarizes what it understands, lists gaps it sees, lists what it will research. You confirm or correct.
3. **Planner fires.** Chat invokes a fresh Claude Code planner session in `/Users/daksh/Desktop/cova/`. Planner uses Supabase MCP, EXA MCP, Context7 MCP, and web search to: verify drift against `PHASE_STATUS.md`, read all 21 audit files, enumerate exact dead column/table names from live Supabase schema, look up current docs for Sentry `instrumentation.ts`, Resend, Termly, Cloudflare Turnstile, zxcvbn, Sharp EXIF stripping. Then it writes the executor prompt to `cova-plan/planner-output/P1-executor-prompt.md` and stops.
4. **Executor prompt returns.** You paste the executor prompt back into the cloud chat. Chat verifies it covers every acceptance criterion, includes failure handling, references all hard rules. Approve or send back for revision.
5. **Executor fires.** Verified prompt goes into a fresh Claude Code session. Session executes M0 → M1 → M2 → M3 across 5–7 sessions with handoffs at 93–94% context written to `cova-plan/SESSION_HANDOFFS/`.
6. **Verifier session 1 fires.** Fresh Claude Code session, no executor context. Reads acceptance criteria + live state via Supabase MCP + actual code. Reviews by criterion, not by file. Self-heals detected issues in-session.
7. **Verifier session 2 fires.** Fresh again. No knowledge of session 1 fixes. Reads now-current code, runs same review independently. Flags disagreements rather than re-editing.
8. **Manual screenshot review.** You run the manual click-script in §18, capture screenshots into `cova-plan/manual-evidence/P1/`, paste them back into the cloud chat. Chat reviews against spec. Decision: close phase or remediate.
9. **Document updates.** `PHASE_STATUS.md`, `OPEN_DECISIONS.md` (created at this point), `EMPIRICAL_FINDINGS.md` (created at this point), Phase 2 prereq section if assumptions changed.

---

## 2. Prereq verification (chat runs before anything else)

If reality diverges from `PHASE_STATUS.md`, halt and write `cova-plan/drift/P1-detected.md`.

### Filesystem checks
- Repo at `/Users/daksh/Desktop/cova/` accessible
- `apps/web/` exists with Next.js 14.x app router structure
- `docs/audit/` contains 21 audit files
- `cova-plan/PHASE_STATUS.md` shows Phase 1 as NOT STARTED
- `cova-plan/SESSION_HANDOFFS/` exists
- `cova-plan/back-bugs/`, `drift/`, `escalations/`, `manual-evidence/`, `subagents/` directories exist
- `apps/web/.env.local` contains `SEARCHAPI_KEY` (already set per Phase 0)

### External dependency checks
- Supabase project `xdeacbmkdwqrwxonqaqh` reachable via Supabase MCP
- Vercel project deployed at covainterior.com
- Supabase tier: Pro · Vercel tier: Pro
- EXA MCP, Context7 MCP, Supabase MCP all connected in Claude Code

### Halt conditions
- Any audit file missing → drift report
- Repo not at expected path → halt
- Any required MCP not connected → halt, install MCP first

---

## 3. Pre-decisions (resolve before planner fires)

Ten known gaps. Cloud chat resolves them in conversation with Daksh before invoking the planner.

**G1. Exact dead column names.** Audits give counts (28 columns on `rooms`); names not enumerated. *Resolution:* planner reads schema directly via Supabase MCP, produces enumerated drop list. Cross-references each name against codebase grep before drop.

**G2. Exact dead table names (17).** Same resolution as G1 — planner enumerates from live schema, cross-references with code.

**G3. State of `apps/web/lib/auth/legacy.ts`.** AUTH_AUDIT references it as iOS-era AuthSession code. *Resolution:* planner greps imports across repo, recommends archive vs delete. Most likely: move to `_archive/lib/legacy-auth.ts`, remove all imports.

**G4. Resend DNS records for `hi@covainterior.com`** (SPF/DKIM/DMARC). *Resolution:* Daksh checks Namecheap before cloud chat. Configured → verifier confirms test send. Not configured → Phase 1 task.

**G5. Termly templating output.** Free tier locked. Templates not generated yet. *Resolution:* Daksh logs into Termly, generates ToS + Privacy with Cova specifics (16+ age gate, FTC affiliate disclosure, processor list: fal.ai, Anthropic, SearchApi.io, Hive, PhotoDNA, Resend, PostHog, Sentry, Cloudflare, Vercel, Supabase, Modal). Hands rendered HTML to executor.

**G6. Stale test inventory.** Codebase has many ad-hoc tests from V0 era (random integration tests, manual fix scripts disguised as tests). *Resolution:* planner runs `find . -name "*.test.*" -not -path "*/node_modules/*"`, classifies each as keep/archive/delete based on whether it tests V1 surfaces. **ALL stale tests deleted in M1.** New Phase 1 tests written fresh.

**G7. Pre-existing `render_cost_log` table state.** Audits say table exists with 0 rows. *Resolution:* planner verifies schema matches Phase 1 spec; if existing schema is wrong shape, drop and recreate.

**G8. Apple Sign In approval status.** Apple Developer Program membership required. *Resolution:* Daksh confirms Apple Developer account active before Phase 1. If not, Apple OAuth deferred to V1.5 — only Google OAuth ships in V1.

**G9. Existing Supabase Edge Functions.** Audit mentions one nightly cron at 2am UTC (style data aggregation). *Resolution:* planner audits `supabase/functions/`, identifies which to keep/delete. Account-deletion cascade Edge Function created in Phase 1.

**G10. Modal app cleanup scope.** ~6 dead Modal apps mentioned (anysplat, marble-mini, marble-plus, colmap-fastgs, flythrough, glb-render). *Resolution:* planner queries Modal CLI to list deployed apps, generates archive + delete-from-Modal-control-panel commands.

---

## 4. Background context (self-contained)

### 4.1 What Cova is

AI interior design product for end consumers. User signs up → takes a 12-pick forced-choice style quiz → sees their style fingerprint with personalized italic descriptor → uploads one photo of a real room → goes through three personalization slots (art, smart tech, lighting mood) → sees an editorial-grade redesigned photo via 8-stage pipeline → can refine with free-form text → can shop the items via Google Lens-powered hotspots with affiliate links. V1 ships when this works end-to-end with ≥80% verifier first-pass and ≤$0.32 cost per render.

### 4.2 What Phase 1 is

The demolition + foundation phase. Three things happen:

1. **Demolition.** Drop 28 dead columns, 17 dead tables, ~12 dead indexes. Archive ~70 `fix_*.mjs` scripts. Archive 6 dead Modal apps. Archive ~20 dead lib files. Archive ~12 dead components. **Delete ALL existing tests** (V0 era, irrelevant). Strip all V0 references from active code.

2. **Operational hardening.** Sentry across all runtimes. `redactLogPayload()`. Timeout chain locked. EXIF strip pipeline + CI fixture test. `render_cost_log` wired with `logCost()` wrapper. `failure_category` enums. PostHog client. Cloudflare Images + R2 wired. Feature flag infrastructure.

3. **Auth + legal + account deletion.** 6 auth screens. Email + Google OAuth (+ Apple if G8 resolves). Magic link. Cloudflare Turnstile. Rate limit. zxcvbn meter. Termly /terms and /privacy. Account-deletion cascade with audit row. GDPR data export endpoint.

### 4.3 Audit findings driving this phase

| Audit | Gap | Phase 1 fix |
|---|---|---|
| STAGE5_AUDIT | ~30% of renders fail silently with empty `redesign_error` | failure_category enums + Sentry capture in M3 |
| AUTH_AUDIT | No Apple OAuth, no magic link, no anti-enumeration on forgot, no Turnstile, no rate limit, no account-deletion flow | M2 rebuilds entire auth surface |
| SCHEMA_AUDIT | 28 dead columns, 17 dead tables, 12 dead indexes | M1 drops everything (reversible migration) |
| SUPABASE_AUDIT | RLS gaps on pipeline_runs, mood_feed_remixes; room-uploads bucket; quiz-images bucket missing policy | M1 RLS consolidation migration |
| TIMEOUT_AUDIT | 180/300/420 chain inverted | M3 locks 290/300/320 in `lib/config/timeouts.ts` |
| TELEMETRY_AUDIT | Sentry only on client; `instrumentation.ts` missing; `redactLogPayload` missing; `render_cost_log` unwired | M3 wires all four |
| LIB_AUDIT | ~20 dead lib files (orbit-controls, splat-loader, marble-client, etc.) | M1 archives all |
| COMPONENT_AUDIT | ~12 dead React components (SplatViewer, MarbleEmbed, FlythroughPlayer, LegacyQuizCard, etc.) | M1 archives all |
| MODAL_AUDIT | 6 dead Modal apps still deployed | M1 archives + deletes from Modal control panel |
| INFRA_AUDIT | Cloudflare Images not wired, DNS for Resend not set | M3 wires Cloudflare, M2 sets DNS |

### 4.4 Existing infrastructure to preserve

- Supabase project `xdeacbmkdwqrwxonqaqh` — DO NOT recreate
- Cova landing page already deployed at covainterior.com — Phase 10 redesigns it; Phase 1 leaves it alone
- Existing iOS app from V0 era — DO NOT touch. Hard rule.
- 4 Modal apps to keep: `cova-perception`, `cova-empty-room`, `cova-redesign`, `cova-composite-art`. Verifier confirms they're deployed and reachable.
- Test user UUID `62126d57-42df-405c-a38d-3a621f1fe3a8` — preserve for testing
- Vercel project + Pro tier + auto-deploy on push to main
- Supabase Auth: keep, do not recreate; new publishable/secret key format active (`sb_publishable_*` / `sb_secret_*`)

---

## 5. Tech stack for this phase

| Layer | Tool | Version / config |
|---|---|---|
| Frontend | Next.js | 14.x (Phase 12 may upgrade to 15) |
| Frontend | React | 18 |
| Language | TypeScript | strict mode |
| Validation | Zod | latest stable |
| Hosting (web) | Vercel | Pro tier |
| Hosting (media) | Cloudflare R2 + Cloudflare Images | Pro |
| Backend | Supabase | Pro tier; publishable/secret keys |
| Email | Resend + React Email | DNS for `hi@covainterior.com` |
| Errors | Sentry | client + server + edge runtimes |
| Analytics | PostHog | EU instance |
| Bot protection | Cloudflare Turnstile | invisible mode |
| Password strength | zxcvbn | client-side meter |
| Image processing | Sharp (libvips) | EXIF strip via `.withMetadata({})` |
| Legal templating | Termly | free tier |
| Forms | React Hook Form + Zod | |
| State | Zustand (UI) + TanStack Query (server) | |
| Smooth scroll | Lenis | (used Phase 10) |
| Scroll-pin | GSAP ScrollTrigger | (used Phase 10) |
| Component motion | Framer Motion | |
| MCP (planning + verifier) | Supabase, EXA, Context7 | |

### Hard locked rules (from chat history, embedded as D-001..D-021)

- **D-001:** One photo per room. Not video, not multiple photos, not 360.
- **D-002:** No catalog scraping. Ever. Product matching via Google Lens (SearchApi.io) only.
- **D-003:** No LoRAs.
- **D-004:** No multi-reference style images.
- **D-005:** No depth-conditioning ControlNet on Stage 5.
- **D-006:** No multi-pass FLUX.1 → FLUX.2 averaging.
- **D-007:** 12-pick quiz count locked.
- **D-008:** Display names only — never expose internal style codenames.
- **D-009:** EXIF strip mandatory on every uploaded image. Server-side via Sharp.
- **D-010:** `redactLogPayload` before every log statement. CI grep enforces.
- **D-011:** Cost telemetry on every paid call. CI grep enforces.
- **D-012:** `failure_category` populated on every failure path.
- **D-013:** 8 render stages locked. Don't add, merge, or reorder.
- **D-014:** THREE.js stays at 0.155.0.
- **D-015:** `fetch()` only for fal.ai and Anthropic. No SDK adoption.
- **D-016:** Forced-choice A vs B quiz. Not swipe-or-skip.
- **D-017:** 10 styles taxonomy locked.
- **D-018:** Refine UI is free-form text only.
- **D-019:** Build token infrastructure but DO NOT enforce in V1. `ENFORCE_TOKEN_LIMITS=false`.
- **D-020:** Mood feed dropped from V1 entirely.
- **D-021:** Termly free tier for legal pages. Sarah M Brooklyn placeholder testimonial (Phase 10).

---

## 6. Scope

Split into 1A backend / 1B UI / 1C integration. Run in this order within each milestone.

### 1A — Backend / Infrastructure

**M0 — Subagent setup**
- Verifier subagent prompt at `cova-plan/subagents/verifier.md`
- Schema-reviewer subagent prompt at `cova-plan/subagents/schema-reviewer.md`
- Frontend-visionary subagent prompt at `cova-plan/subagents/frontend-visionary.md`
- Cost-monitor subagent prompt at `cova-plan/subagents/cost-monitor.md`
- CLI scripts at `scripts/agents/{name}.ts`
- Cost-monitor cron registered (Vercel Cron, daily 06:00 UTC)
- CI hook for schema-reviewer in `.github/workflows/schema-review.yml`

**M1 — Demolition**

This is the most aggressive milestone of V1. Everything that doesn't directly serve V1 gets nuked.

- **Schema cleanup** — single migration drops all 28 dead `rooms` columns. Another drops 17 dead tables. Another drops 12 dead indexes. Each migration paired with `_down.sql` rollback. Schema-reviewer subagent reviews every migration.
- **Test deletion** — every `*.test.*`, `*.spec.*`, `tests/**`, `__tests__/**` file in the repo (excluding `node_modules`). Delete entirely. New Phase 1 tests written fresh.
- **Script archive** — `~70 fix_*.mjs` scripts moved to `_archive/scripts/`. Single PR.
- **Modal app archive** — 6 dead apps moved to `_archive/modal_pipeline/`: anysplat, marble-mini, marble-plus, colmap-fastgs, flythrough, glb-render. Modal control panel deletes the deployments.
- **Lib file archive** — ~20 dead files moved to `_archive/lib/`: `orbit-controls.js`, `camera-anchor*.ts`, `splat-loader.ts`, `splat-renderer.ts`, `marble-client.ts`, `marble-poller.ts`, `flythrough-builder.ts`, `colmap-client.ts`, `fastgs-client.ts`, `glb-loader.ts`, `glb-furniture-manifest.ts`, `legacy-auth-session.ts`, plus others enumerated by planner.
- **Component archive** — ~12 dead components moved to `_archive/components/`: `<SplatViewer />`, `<SplatThumbnail />`, `<MarbleEmbed />`, `<MarblePlusViewer />`, `<FlythroughPlayer />`, `<GLBFurnitureRenderer />`, `<LegacyQuizCard />`, `<LegacyQuizSwiper />`, plus others enumerated by planner.
- **Stale data flagging** — 138 stale "failed" rooms tagged `internal_test_data_pre_v1` in `tags` jsonb for analytics filter.
- **RLS consolidation** — single migration codifies explicit policies on every table. `pipeline_runs` service-role-only. `swipe_history` self-read + self-insert. `room-uploads` bucket users-own-folder, server full. `quiz-images` bucket read-anyone, server-only write. Two-user isolation tests added at `tests/rls/two-user-isolation.test.ts`.
- **Verifier confirms** no live code references any `_archive/` path (greps imports).

**M2 — Auth + Legal**
- Email + password signup with Resend verification (subject "Verify your email — Cova", from `hi@covainterior.com`, single CTA, 24h token expiry, single-use)
- Google OAuth via Supabase Auth dashboard config
- Apple OAuth (if G8 resolves; else V1.5)
- Magic link sign-in (60s resend cooldown)
- Forgot-password with anti-enumeration (always returns "If that email is registered, we sent a reset link.")
- Reset-password with zxcvbn 5-segment strength meter, min 8 chars (NIST), 1h token expiry, single-use
- Cloudflare Turnstile invisible mode on signup form, server-side verification
- Rate limit middleware: 3 signups/hour/IP via Upstash Redis or Cloudflare WAF
- 60s resend cooldown on verification + reset emails
- `/terms` page with Termly-templated ToS (16+ age requirement, FTC affiliate disclosure, governing law: Delaware after incorporation)
- `/privacy` page with full Privacy Policy (lists all processors, GDPR/CCPA rights enumerated)
- Account-deletion flow: type-DELETE-to-confirm modal + email confirmation field → POST `/api/auth/delete-account` → Supabase Edge Function `delete-user-cascade` → cascade delete via FK → `account_deletions` audit row (hashed user_id only via SHA256, no PII retained) → redirect to `/account-deleted`
- `account_deletions` table created with RLS service-role-only
- GDPR data export endpoint at `POST /api/users/export`. Returns zip of all user data (rooms, renders, swipes, refines as JSON + image URLs). Generated on-demand. Signed URL with 24h TTL.
- `/account-deleted` page with copy "We're sorry to see you go." Optional brief survey link.

**M3 — Operational hardening**
- `instrumentation.ts` at apps/web root for Sentry server runtime
- `next.config.js` wraps with `withSentryConfig` (sourcemaps upload on deploy)
- 3 Sentry config files: client, server, edge
- Sample rates: traces 0.1, profiles 0.05, replays-on-error 0.5, session replay 0.0
- `redactLogPayload()` at `apps/web/lib/log/redact.ts` strips emails, phones, addresses, payment data, forbidden field names (`password`, `apiKey`, `accessToken`, `refreshToken`, `secretKey`, `creditCard`, `cvv`, `ssn`, `dob`)
- CI grep check in `.github/workflows/lint.yml`: fails build if `console.error|console.log|console.warn(\s*\{` appears unwrapped
- Timeout chain in `apps/web/lib/config/timeouts.ts`: Vercel route 290s, Modal app 300s, fal client 320s, Anthropic Sonnet vision 60s, Sonnet director 30s, Haiku classifier 15s
- CI grep fails build on hardcoded numbers (180/290/300/320/420) outside `lib/config/timeouts.ts`
- EXIF strip pipeline at `apps/web/lib/capture/process.ts`. Sharp pipeline: `.rotate().resize(1536, 1536, {fit: 'inside', withoutEnlargement: true}).jpeg({quality: 90, mozjpeg: true}).withMetadata({}).toBuffer()`
- CI fixture test at `tests/exif/strip.test.ts` — fixture image with known GPS tags. Confirms re-encoded version has zero EXIF via `exiftool` parsing raw bytes.
- `render_cost_log` schema verified/recreated. Categories enum: `render`, `refine`, `quiz_descriptor`, `hard_room_classify`, `art_composite`, `art_generate`, `smart_tech_recommend`, `lighting_recommend`, `lens_query`, `clip_rerank`, `verifier`, `verifier_light`, `moderation_nsfw`, `moderation_borderline`, `moderation_csam`.
- `logCost()` wrapper at `apps/web/lib/cost/log.ts`. CI grep check fails build if any paid call (Anthropic, fal, Modal, SearchApi) appears without nearby `logCost` invocation.
- `failure_category` enum union at `apps/web/lib/errors/categories.ts`. Per-stage enums (preprocess, perception, director, empty_room, redesign, mood_relight, verifier, hotspot, delivery; auth signup/signin/reset/verify; capture upload/process/classify; etc.).
- PostHog client at `apps/web/lib/analytics/posthog.ts`. EU instance. Event taxonomy at `apps/web/lib/analytics/events.ts` — type-checked event names.
- PostHog dashboard alerts: verifier 7-day rolling mean drop, failure rate > 5%/24h, p95 render latency > 90s/1h, daily cost > 2× 7-day rolling avg.
- Cloudflare Images zone configured + R2 bucket `cova-renders` ready
- Feature flag infrastructure: `feature_flags` table (id, key, enabled bool, percent_rollout int, environment) + typed reader at `apps/web/lib/feature-flags/index.ts`. Phase 5+ consumes.

### 1B — UI (M2 screens)

**Shared layout** for all 6 auth screens. Centered ivory `#F5F0E8` card 480px on full-bleed navy `#091829`. 4px border-radius, 48px padding, `box-shadow: 0 8px 64px rgba(9,24,41,0.4)`. Cova logotype gold `#C9A84C` top-left always. Subtle ambient gold radial glow upper-left + 4-6 drifting gold particles low opacity. Disabled on `prefers-reduced-motion`.

**Mobile:** card becomes 100% width minus 24px each side, padding 32px.

**Form input.** 100% width, 48px height, ivory bg, navy 12% border, 4px radius. DM Sans 16px navy. Placeholder navy 40%. Focus state: 1.5px gold border, no glow. Error state: 1.5px warm-error `#A8443B` border, error message DM Sans 13px below. Label above: DM Sans 13px medium tracking 0.05em uppercase navy 70%.

**Primary button.** 100% width, 52px height. Bg navy, ivory text, DM Sans 16px medium tracking 0.02em. 4px radius. Hover: shifts to gold bg, navy text (200ms ease-out). Disabled: 40% opacity.

**Secondary button (OAuth).** Same dims, ivory transparent bg, navy 20% border, navy 90% text. Provider icon 20px left + 12px gap. Hover: bg fills navy 5%, border 30%.

The 6 screens:

| Screen | Route | Purpose |
|---|---|---|
| Signup | /auth/signup | Email + Google + Apple |
| Sign in | /auth/signin | + magic link option |
| Forgot password | /auth/forgot-password | Anti-enumeration |
| Reset password | /auth/reset-password?token | zxcvbn meter |
| Verify email sent | /auth/verify-email-sent | Auto-poll Supabase Auth, redirect on verify |
| Verify email success | /auth/verify-email-success | Animated gold checkmark, 3s auto-redirect to /welcome |

**Behavior:**
- OAuth flows on success → /welcome (not /dashboard yet — quiz required first)
- Email signup: Supabase Auth creates user → Resend sends verification → /auth/verify-email-sent
- All `/auth/*` routes check session on load. If authenticated, redirect to /dashboard (or /welcome if quiz incomplete)
- Magic link inline expansion on sign-in
- Error states: "Incorrect email or password." (don't disclose which); generic "If that email is registered..." for forgot; "Account locked. Try again in 15 minutes" after 5 failed attempts; toast top-of-card on network error (5s auto-dismiss)
- Accessibility: proper `<label>` associations, focus order top-to-bottom, visible gold focus rings on `:focus-visible`, form errors via `aria-live="polite"`, Enter submits, Escape doesn't dismiss, WCAG AA color contrast

**/account-deleted page.** Centered card with "We're sorry to see you go." headline, brief copy, optional 1-question survey link.

**/terms and /privacy pages.** Long-form Termly content rendered with consistent typography. Sticky "Last updated: YYYY-MM-DD" header. Anchor links for sections. Accessible navigation. No card wrap — full-bleed prose with max-width 720px centered.

### 1C — Integration + review

- Wire account-deletion flow end-to-end (modal → API route → Edge Function → cascade → audit row → redirect)
- GDPR data export endpoint generates zip with rooms.json, renders.json, swipes.json, image URLs list. Resend signed URL via email.
- Verifier 7-phase pass on M0, M1, M2, M3 separately
- Schema-reviewer pass on every migration
- Two-user isolation tests pass: User A cannot SELECT User B's data via any table
- All ~120 `console.error` instances replaced with `redactLogPayload`-wrapped calls
- Adversarial probes pass (see §17)

---

## 7. Out of scope (executor MUST NOT touch)

- Quiz UI / Bayesian engine / quiz schema (Phase 2)
- Capture flow (Phase 3)
- Personalization slots (Phase 4)
- Render pipeline (Phase 5)
- Refine flow (Phase 6)
- Product matching / shop screen (Phase 7)
- Token enforcement (Phase 8 builds infra; enforce stays false)
- Dashboard (Phase 9)
- Landing page redesign (Phase 10 — current landing stays as-is)
- iOS app (Hard rule — never touch in V1)
- 4 live Modal apps (`cova-perception`, `cova-empty-room`, `cova-redesign`, `cova-composite-art`) — verifier confirms reachable, executor doesn't modify
- Stripe / billing UI (V1.5)
- 2FA / TOTP (V1.5)
- Social sign-in beyond Google + Apple (V1.5)

---

## 8. Files touched (expected paths)

### Created
- `apps/web/instrumentation.ts`
- `apps/web/sentry.client.config.ts`
- `apps/web/sentry.server.config.ts`
- `apps/web/sentry.edge.config.ts`
- `apps/web/lib/log/redact.ts`
- `apps/web/lib/config/timeouts.ts`
- `apps/web/lib/cost/log.ts`
- `apps/web/lib/errors/categories.ts`
- `apps/web/lib/analytics/posthog.ts`
- `apps/web/lib/analytics/events.ts`
- `apps/web/lib/feature-flags/index.ts`
- `apps/web/lib/capture/process.ts` (EXIF pipeline; full capture wired in Phase 3)
- `apps/web/middleware.ts` (rate limiting; updated)
- `apps/web/app/auth/signup/page.tsx`
- `apps/web/app/auth/signin/page.tsx`
- `apps/web/app/auth/forgot-password/page.tsx`
- `apps/web/app/auth/reset-password/page.tsx`
- `apps/web/app/auth/verify-email-sent/page.tsx`
- `apps/web/app/auth/verify-email-success/page.tsx`
- `apps/web/app/account-deleted/page.tsx`
- `apps/web/app/terms/page.tsx`
- `apps/web/app/privacy/page.tsx`
- `apps/web/app/api/auth/signup/route.ts`
- `apps/web/app/api/auth/signin/route.ts`
- `apps/web/app/api/auth/oauth-callback/route.ts`
- `apps/web/app/api/auth/forgot-password/route.ts`
- `apps/web/app/api/auth/reset-password/route.ts`
- `apps/web/app/api/auth/magic-link/route.ts`
- `apps/web/app/api/auth/resend-verification/route.ts`
- `apps/web/app/api/auth/delete-account/route.ts`
- `apps/web/app/api/auth/sign-out/route.ts`
- `apps/web/app/api/users/export/route.ts`
- `supabase/functions/delete-user-cascade/index.ts`
- `cova-plan/subagents/verifier.md`
- `cova-plan/subagents/schema-reviewer.md`
- `cova-plan/subagents/frontend-visionary.md`
- `cova-plan/subagents/cost-monitor.md`
- `scripts/agents/verifier.ts`
- `scripts/agents/schema-reviewer.ts`
- `scripts/agents/frontend-visionary.ts`
- `scripts/agents/cost-monitor.ts`
- `.github/workflows/schema-review.yml`
- `.github/workflows/lint.yml` (CI grep checks)
- `tests/rls/two-user-isolation.test.ts`
- `tests/exif/strip.test.ts`
- `tests/fixtures/exif-with-gps.jpg`
- `tests/fixtures/heic-iphone-sample.heic` (placeholder; real fixture acquired in Phase 3)

### Migrations (all reversible with paired _down.sql)
- `supabase/migrations/{ts}-drop-dead-room-cols.sql` (28 columns)
- `supabase/migrations/{ts}-drop-dead-tables.sql` (17 tables)
- `supabase/migrations/{ts}-drop-dead-indexes.sql` (12 indexes)
- `supabase/migrations/{ts}-rls-consolidation.sql`
- `supabase/migrations/{ts}-account-deletions-table.sql`
- `supabase/migrations/{ts}-feature-flags-table.sql`
- `supabase/migrations/{ts}-render-cost-log-verify.sql` (recreate if shape wrong)

### Archived (moved, not deleted — recoverable)
- `_archive/scripts/` — ~70 `fix_*.mjs` files
- `_archive/modal_pipeline/` — 6 dead apps (anysplat, marble-mini, marble-plus, colmap-fastgs, flythrough, glb-render)
- `_archive/lib/` — ~20 dead files
- `_archive/components/` — ~12 dead components
- `_archive/lib/legacy-auth.ts` (former `lib/auth/legacy.ts`)

### Deleted (not recoverable; intentional)
- ALL existing `*.test.*`, `*.spec.*`, `tests/**`, `__tests__/**` files except those listed in "Created" above

### Modified (~120 files)
- Every file currently using `console.error|console.log|console.warn` of objects — wrapped in `redactLogPayload`
- `next.config.js` — `withSentryConfig` wrap

---

## 9. API contracts

### POST /api/auth/signup
```
Body: { email: string, password: string, turnstileToken: string }
Validation: zxcvbn score ≥2, email regex, Turnstile server-verify
Rate limit: 3/hr/IP
Returns: { ok: true } or { ok: false, failure_category, user_message }
Side effects: Supabase Auth user created, Resend verification email sent, token_ledger row +7
```

### POST /api/auth/signin
```
Body: { email: string, password: string } | { email: string, magicLink: true }
Returns: { ok: true, redirectTo: string } or error envelope
Side effects: session cookie set, sign-in event PostHog
```

### POST /api/auth/forgot-password
```
Body: { email: string }
Returns: { ok: true } ALWAYS (anti-enumeration)
Side effects: if email registered, Resend reset email; else no-op
Cooldown: 60s per email
```

### POST /api/auth/reset-password
```
Body: { token: string, newPassword: string }
Validation: zxcvbn ≥2, token unused + unexpired
Returns: { ok: true } or error envelope
```

### POST /api/auth/delete-account
```
Body: { confirmText: "DELETE", confirmEmail: string }
Validation: confirmEmail matches user.email; confirmText exact
Returns: { ok: true, redirectTo: "/account-deleted" }
Side effects: triggers Edge Function delete-user-cascade
```

### POST /api/users/export
```
Body: {} (auth from session)
Returns: { ok: true, downloadUrl: string, expiresAt: ISO } 
Side effects: generates zip, signed URL with 24h TTL, Resend email with link
```

All routes use Unit-1 error envelope: `{ ok: false, failure_category: '<category>', user_message: '<safe>', detail: '<dev-only>' }`

---

## 10. Schema migrations (full DDL)

### account_deletions
```sql
CREATE TABLE account_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hashed_user_id text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deletion_reason text CHECK (deletion_reason IN ('user_initiated','admin_initiated','gdpr_request','ccpa_request')),
  retention_period_days int NOT NULL DEFAULT 30
);
CREATE INDEX account_deletions_deleted_at_idx ON account_deletions(deleted_at DESC);
ALTER TABLE account_deletions ENABLE ROW LEVEL SECURITY;
-- No policies = service-role-only access
```
Down: `DROP TABLE account_deletions;`

### feature_flags
```sql
CREATE TABLE feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  percent_rollout int NOT NULL DEFAULT 0 CHECK (percent_rollout BETWEEN 0 AND 100),
  environment text NOT NULL CHECK (environment IN ('development','preview','production','all')),
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY feature_flags_read_all ON feature_flags FOR SELECT USING (true);
-- Writes service-role-only
```
Down: `DROP TABLE feature_flags;`

### render_cost_log (verify or recreate)
```sql
CREATE TABLE IF NOT EXISTS render_cost_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  render_id uuid,
  category text NOT NULL,
  stage text,
  cost_usd numeric(8,4) NOT NULL,
  model text,
  duration_ms int,
  failure_category text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS render_cost_log_user_idx ON render_cost_log(user_id);
CREATE INDEX IF NOT EXISTS render_cost_log_render_idx ON render_cost_log(render_id);
CREATE INDEX IF NOT EXISTS render_cost_log_category_idx ON render_cost_log(category);
CREATE INDEX IF NOT EXISTS render_cost_log_created_idx ON render_cost_log(created_at DESC);
ALTER TABLE render_cost_log ENABLE ROW LEVEL SECURITY;
-- Service-role-only writes; user reads own rows
CREATE POLICY render_cost_log_self_read ON render_cost_log FOR SELECT USING (auth.uid() = user_id);
```

### Drop dead room columns (planner enumerates exact names)
```sql
-- Pattern; exact names from planner Supabase MCP query
ALTER TABLE rooms DROP COLUMN IF EXISTS splat_url;
ALTER TABLE rooms DROP COLUMN IF EXISTS splat_thumbnail_url;
-- ... 26 more
```
Down: `ALTER TABLE rooms ADD COLUMN splat_url text;` etc. Data loss documented in migration comment.

### Drop dead tables (planner enumerates)
```sql
DROP TABLE IF EXISTS splat_renders CASCADE;
DROP TABLE IF EXISTS marble_jobs CASCADE;
-- ... 15 more
```

### RLS consolidation
```sql
-- Enable RLS on every table (idempotent)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
-- ... etc

-- Self-read/write policies on user-owned data
CREATE POLICY users_self_read ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY rooms_self_all ON rooms FOR ALL USING (auth.uid() = user_id);

-- Service-role-only on infrastructure tables
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
-- No policies = service-role-only

-- Storage bucket policies
INSERT INTO storage.buckets (id, name, public) VALUES ('quiz-images', 'quiz-images', true) ON CONFLICT DO NOTHING;
CREATE POLICY "quiz-images public read" ON storage.objects FOR SELECT TO public USING (bucket_id = 'quiz-images');

-- room-uploads bucket: users own folder
INSERT INTO storage.buckets (id, name, public) VALUES ('room-uploads', 'room-uploads', false) ON CONFLICT DO NOTHING;
CREATE POLICY "room-uploads user insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'room-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "room-uploads user read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'room-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
```

---

## 11. Failure handling

### Per-route failure_category enum

```typescript
// apps/web/lib/errors/categories.ts (excerpt)
export type AuthFailure =
  | 'auth_signup_email_taken'
  | 'auth_signup_password_weak'
  | 'auth_signup_turnstile_fail'
  | 'auth_signup_rate_limit'
  | 'auth_signup_resend_send_fail'
  | 'auth_signin_invalid_credentials'
  | 'auth_signin_account_locked'
  | 'auth_oauth_provider_error'
  | 'auth_oauth_email_mismatch'
  | 'auth_magic_link_send_fail'
  | 'auth_magic_link_expired'
  | 'auth_forgot_send_fail'  // returns generic to user, logged as detail
  | 'auth_reset_token_expired'
  | 'auth_reset_token_used'
  | 'auth_reset_password_weak'
  | 'auth_verify_token_expired'
  | 'auth_verify_token_used'
  | 'auth_delete_confirm_mismatch'
  | 'auth_delete_cascade_fail'
  | 'auth_export_zip_fail'
  | 'auth_session_expired';
```

### Recovery actions
| Category | Recovery |
|---|---|
| `auth_signup_turnstile_fail` | Re-render Turnstile, retry |
| `auth_signup_rate_limit` | Show "Try again in X minutes" with countdown |
| `auth_signup_resend_send_fail` | Mark user as unverified-pending, retry email send via cron |
| `auth_oauth_provider_error` | Show generic "Couldn't sign in with Google. Try email instead." |
| `auth_delete_cascade_fail` | Email Daksh + retry once + alert PostHog |
| Network / Sentry / DB transient | Toast "Couldn't reach our servers. Please try again." (5s auto-dismiss) |

---

## 12. Cost budget

| Source | Estimated cost |
|---|---|
| Claude credits (planner + executor + verifier × 2) | $50–80 |
| Resend test sends (~50) | <$1 |
| Cloudflare Turnstile | free tier |
| Supabase reads/writes during dev | within Pro tier |
| Vercel deploys | within Pro tier |
| Sentry events | within free tier (<50k/mo) |
| PostHog events | within free tier |
| **Total** | **~$50–85** |

---

## 13. Verifier focus areas (Layer 1 source-of-truth checklist)

Verifier session 1 reviews by criterion. Each acceptance criterion mapped to a verifiable artifact.

| Criterion | Verifier check |
|---|---|
| Subagents wired | `cova-plan/subagents/{name}.md` exists for all 4; `scripts/agents/{name}.ts` runnable |
| 28 dead columns dropped | Supabase MCP: `SELECT column_name FROM information_schema.columns WHERE table_name='rooms'` — none of the 28 match |
| 17 dead tables dropped | Supabase MCP: `SELECT table_name FROM information_schema.tables WHERE table_schema='public'` — none of the 17 match |
| ALL old tests deleted | `find . -name "*.test.*" -not -path "*/node_modules/*" -not -path "*/_archive/*"` returns only NEW Phase 1 tests |
| Dead code archived | `find _archive/` shows lib/, components/, scripts/, modal_pipeline/ subdirs populated |
| RLS consolidated | Run `tests/rls/two-user-isolation.test.ts` — passes |
| Sentry on all runtimes | `instrumentation.ts` exists; all 3 sentry.*.config.ts exist; `next.config.js` wraps |
| `redactLogPayload` enforced | CI grep returns no unwrapped console.* of objects |
| Timeout chain locked | `lib/config/timeouts.ts` exports correct values; CI grep confirms no hardcoded numbers elsewhere |
| EXIF strip works | `tests/exif/strip.test.ts` passes against fixture with known GPS |
| `render_cost_log` wired | Schema matches spec; `logCost()` exists; CI grep confirms paid calls have nearby `logCost` |
| failure_category enum | `lib/errors/categories.ts` exports per-stage union types |
| PostHog wired | `lib/analytics/posthog.ts` exists; events typed; dashboard alerts configured |
| Feature flags infra | `feature_flags` table exists; reader at `lib/feature-flags/index.ts` |
| 6 auth screens functional | Each route renders without error; form submission paths work |
| Turnstile + rate limit | Trigger 4 signups in 1 hour from same IP; 4th returns 429 |
| /terms + /privacy live | URLs return 200 with non-empty content; FTC disclosure present |
| Account-deletion cascade | Test user deletion: rooms, renders, swipes all cascade; `account_deletions` row written with hashed_user_id only |
| GDPR export | POST `/api/users/export` returns signed URL; downloaded zip contains expected JSON files |

### Verifier session 2 cross-check

Session 2 reads now-current code with no knowledge of session 1 fixes. Specifically hunts for:
- New issues introduced by session 1's fixes
- Issues session 1 might have rationalized past
- Disagreements with session 1's fix decisions (flag, don't re-edit)
- Test coverage of edge cases session 1 might have skipped

---

## 14. Adversarial code review checklist

Verifier specifically hunts for these patterns in Phase 1 surface:

- [ ] Any `console.error|console.log|console.warn(\s*\{` not wrapped in `redactLogPayload`
- [ ] Any hardcoded timeout number outside `lib/config/timeouts.ts`
- [ ] Any new table without RLS enabled
- [ ] Any Supabase storage bucket without policies
- [ ] Any API route without `failure_category` populated in error path
- [ ] Any paid call (Anthropic, fal, Modal, SearchApi, Resend) without nearby `logCost`
- [ ] Any image upload code path without Sharp `.withMetadata({})` strip
- [ ] Any signed URL with TTL < 24h for downloads, or > 1h for uploads
- [ ] Any auth route without rate limit middleware
- [ ] Any forgot-password endpoint that leaks whether email exists
- [ ] Any password reset that doesn't invalidate the token after use
- [ ] Any verify-email route that doesn't invalidate the token after use
- [ ] Any session cookie without `SameSite=Strict` and `Secure`
- [ ] Any account-deletion path that retains PII in audit row
- [ ] Any active code import referencing `_archive/` paths
- [ ] Any test file remaining outside the `tests/` directory or NOT in the Phase 1 created list
- [ ] Any reference to deprecated tables/columns/components in active code
- [ ] Any `legacy-*` import in non-archive code
- [ ] Any Modal app deploy command targeting an archived app
- [ ] Any `process.env.X` access without explicit check + fallback
- [ ] Any Sentry init call without sample rates configured
- [ ] Any PostHog event without typed name from `events.ts`

---

## 15. Manual click-script (human gate after verifier passes)

You execute this sequence, capturing screenshots at marked steps. Save to `cova-plan/manual-evidence/P1/`.

### Auth happy path
1. Open `https://covainterior.com` in incognito → click "Sign up" → /auth/signup loads **[screenshot A1: signup-empty.png]**
2. Enter test email + weak password ("123") → see zxcvbn meter at red, submit blocked
3. Enter strong password ("correct horse battery staple") → meter at green
4. Submit → /auth/verify-email-sent loads **[screenshot A2: verify-sent.png]**
5. Open Resend dashboard → confirm email sent → open in inbox → click "Verify email"
6. /auth/verify-email-success loads with gold checkmark animation → 3s auto-redirect to /welcome **[screenshot A3: verify-success.png]**
7. Sign out → return to /auth/signin **[screenshot A4: signin-empty.png]**
8. Enter wrong password 5 times → see lockout message **[screenshot A5: signin-locked.png]**
9. Wait 15 min OR clear lockout via Supabase admin → sign in successfully → /dashboard or /welcome

### OAuth path
10. Sign out → /auth/signup → click "Continue with Google" → Google OAuth flow → return to /welcome **[screenshot A6: oauth-google.png]**
11. (If Apple OAuth approved) Sign out → /auth/signup → "Continue with Apple" → return to /welcome **[screenshot A7: oauth-apple.png]**

### Magic link
12. Sign out → /auth/signin → click "Email me a magic link" → enter email → check inbox → click link → /welcome **[screenshot A8: magic-link.png]**

### Forgot/reset password
13. /auth/signin → "Forgot password?" → enter registered email → see "If that email is registered..." message **[screenshot A9: forgot-confirm.png]**
14. Repeat with unregistered email → SAME message (anti-enumeration verified) **[screenshot A10: forgot-anti-enum.png]**
15. Click reset link in email → /auth/reset-password loads with token in URL **[screenshot A11: reset-form.png]**
16. Enter new strong password → submit → success → redirect to /auth/signin
17. Sign in with new password → success
18. Try old reset link → "Token expired" message **[screenshot A12: reset-token-expired.png]**

### Rate limit
19. Open 4 incognito windows → attempt signup with 4 different emails from same IP within 1 hour → 4th returns 429 with countdown **[screenshot A13: rate-limit.png]**

### Turnstile
20. Disable JS in browser → attempt signup → submit blocked because Turnstile didn't fire **[screenshot A14: turnstile-block.png]**

### Legal pages
21. Open `/terms` → confirm full ToS renders, "Last updated" date present, FTC affiliate disclosure present **[screenshot A15: terms.png]**
22. Open `/privacy` → confirm full Privacy Policy, all processors listed, GDPR/CCPA rights enumerated **[screenshot A16: privacy.png]**

### Account deletion
23. Sign in as test user → navigate to (placeholder; real path lives in Phase 9 settings) → trigger delete-account API directly via Postman/curl
24. POST `/api/auth/delete-account` with `{confirmText: "DELETE", confirmEmail: "<email>"}` → returns 200 with redirectTo
25. Open /account-deleted → confirm page renders **[screenshot A17: account-deleted.png]**
26. Verify Supabase: user row gone from auth.users, all rooms cascade-deleted, `account_deletions` audit row exists with hashed_user_id only (no email)
27. Try to sign in with deleted email → fails normally (not "this account was deleted" — anti-enumeration)

### GDPR export
28. Sign in → POST `/api/users/export` → wait → check email for download link → download zip → confirm contains rooms.json, renders.json, swipes.json, image_urls.txt **[screenshot A18: gdpr-export.png]**

### Reduced motion
29. Set OS preference to reduce motion → reload /auth/signup → particles disabled, ambient glow disabled **[screenshot A19: reduced-motion.png]**

### Mobile responsive
30. Open all 6 auth screens on iPhone Safari → confirm card resizes to 100% minus 24px each side **[screenshots A20-A25: mobile-{signup,signin,forgot,reset,verify-sent,verify-success}.png]**

---

## 16. Manual evidence bundle

Save to `cova-plan/manual-evidence/P1/`:

- 25+ screenshots from §15 click-script
- Resend dashboard screenshot showing verification + reset emails sent
- Supabase dashboard screenshot showing `account_deletions` row after test deletion
- Supabase dashboard screenshot showing 28 dropped columns confirmed gone
- Supabase dashboard screenshot showing 17 dropped tables confirmed gone
- Modal control panel screenshot showing 6 dead apps removed
- `INDEX.md` linking each artifact to the spec criterion it evidences

---

## 17. Remediation budget

- **Round 1:** Verifier session 1 self-heals issues found.
- **Round 2:** Verifier session 2 finds new issues OR introduced regressions → fresh executor session fixes via remediation prompt.
- **Round 3 (escalation):** If verifier still fails → write `cova-plan/escalations/P1.md` describing what's blocked. Stop. Open planning conversation in cloud chat to revise Phase 1 scope.

If manual click-script fails after verifier passes → fresh executor session via remediation prompt. Manual gate does NOT count against the 2-round budget — your judgment is final.

---

## 18. Closing checklist (run at phase close)

- [ ] All 25+ screenshots captured in `cova-plan/manual-evidence/P1/`
- [ ] Manual click-script INDEX.md written
- [ ] `PHASE_STATUS.md` Phase 1 → CLOSED with date
- [ ] `OPEN_DECISIONS.md` created at this point with D-001..D-021 entries (the 21 hard rules from §5)
- [ ] `EMPIRICAL_FINDINGS.md` created at this point with any test results from Phase 1 that constrain later phases (e.g., zxcvbn score-2 threshold validated)
- [ ] Phase 2 prereq section reviewed for any assumptions changed
- [ ] Sentry dashboard shows Phase 1 deploy events captured cleanly
- [ ] PostHog dashboard shows Phase 1 events firing
- [ ] Verifier reports archived at `cova-plan/verifier-reports/P1-session-1.md` and `P1-session-2.md`
- [ ] Session handoffs at `cova-plan/SESSION_HANDOFFS/` for every executor session
- [ ] `git log` shows clean commits per milestone (no fixup commits squashed)

---

## 19. Rollback plan

If Phase 1 merge breaks production:

1. Revert merge commit on main → Vercel auto-deploys previous state → production restored
2. Run paired `_down.sql` migrations in reverse order via Supabase Studio:
   - render_cost_log_verify down (if recreated)
   - feature_flags down
   - account_deletions down
   - rls-consolidation down
   - drop-dead-indexes down
   - drop-dead-tables down (data loss documented; restore from backup if critical)
   - drop-dead-room-cols down (data loss documented)
3. Restore archived files from `_archive/` if needed
4. Update `PHASE_STATUS.md` Phase 1 → REMEDIATING
5. Open cloud chat, diagnose, prepare remediation prompt

Modal app archives can be redeployed via `modal deploy <app>.py` if needed for legacy iOS app dependency (verify before redeploy).

---

## 20. Feature flags introduced

| Flag key | Description | Default |
|---|---|---|
| `auth_apple_oauth` | Apple Sign In available on auth screens | false (true if G8 resolves) |
| `auth_magic_link` | Magic link option visible on /auth/signin | true |
| `email_verification_required` | Block signup completion until email verified | true |

Feature flag table seeded in M3 with these three rows. Phase 5+ adds more.

---

## 21. Document updates at phase close

These docs get updated/created when Phase 1 closes:

1. **`PHASE_STATUS.md`** — Phase 1 status → CLOSED with date; Phase 2 status → READY TO START
2. **`OPEN_DECISIONS.md`** — created at phase close. Seeded with D-001..D-021 from §5. Future decisions appended as they land.
3. **`EMPIRICAL_FINDINGS.md`** — created at phase close. Seeded with any test results from Phase 1 verifier reports that constrain future decisions. E.g., "Resend deliverability rate: 100% on 50 test sends. Verification email open rate: TBD post-launch."
4. **`cova-plan/phases/P02-quiz.md`** — review prereq section (§2 of P02) for any assumptions changed during Phase 1 execution. Most likely unchanged.
5. **Phase 1 handoff at `cova-plan/SESSION_HANDOFFS/NN-P1-close.md`** — final handoff capturing everything done.

---

## End of Phase 1 doc.

Next: Phase 2 (Style Quiz). Phase 2 doc lives at `cova-plan/phases/P02-quiz.md`.
