# Phase 2 Context Bundle — Tiers 3-7 Summary
*Companion document to be read alongside primary Phase 2 specs (PHASE_STATUS, P02-quiz, OPEN_DECISIONS, EMPIRICAL_FINDINGS, P01a doc, P01b doc, phase-1-final-audit).*

> Generated 2026-05-03, immediately post-P01b close. Code SHA at generation: `c1f7e3c` ish (HEAD `b287fa9` after Proposal-C gold-tuning). Live state probed against Supabase project `xdeacbmkdwqrwxonqaqh`.

---

## Section 1 — Code reality Phase 2 inherits

### 1.1 FailureCategory union (current state)

Source: `apps/web/lib/errors/categories.ts` (61 lines). Phase 2 will *extend* this file with a new `QuizFailure` slice and recompose `FailureCategory`. Comments note ownership.

Discriminated unions composed today:

```ts
// P01a-owned (cost.* + infra.* + subagent.* + capture.* preprocess only)
export type CostFailure =
  | "cost.log.write_fail"
  | "cost.monitor.cron_fail"
  | "cost.monitor.threshold_breach"
  | "cost.paidcall.fetch_fail"
  | "cost.paidcall.parse_fail";

export type InfraFailure =
  | "infra.cloudflare.images_unreachable"
  | "infra.cloudflare.r2_write_fail"
  | "infra.sentry.init_fail"
  | "infra.posthog.capture_fail"
  | "infra.feature_flag.read_fail";

export type SubagentFailure =
  | "subagent.verifier.run_fail"
  | "subagent.schema_reviewer.api_fail"
  | "subagent.cost_monitor.api_fail"
  | "subagent.sync.diff_detected";

// P01a — pre-process slice only; full capture stage names land in Phase 3
export type CaptureFailurePreprocess =
  | "capture.exif.strip_fail"
  | "capture.exif.read_fail"
  | "capture.image.too_large"
  | "capture.image.invalid_format";

// P01b-owned — 21 entries
export type AuthFailure =
  | "auth.signup.email_taken"
  | "auth.signup.password_weak"
  | "auth.signup.turnstile_fail"
  | "auth.signup.rate_limit"
  | "auth.signup.resend_send_fail"
  | "auth.signin.invalid_credentials"
  | "auth.signin.account_locked"
  | "auth.oauth.provider_error"
  | "auth.oauth.email_mismatch"
  | "auth.forgot.send_fail"
  | "auth.reset.token_expired"
  | "auth.reset.token_used"
  | "auth.reset.password_weak"
  | "auth.verify.token_expired"
  | "auth.verify.token_used"
  | "auth.delete.confirm_mismatch"
  | "auth.delete.cascade_fail"
  | "auth.export.zip_fail"
  | "auth.session.expired"
  | "auth.signin.silent_lockout"
  | "auth.oauth.email_exists";

export type FailureCategory =
  | CostFailure
  | InfraFailure
  | SubagentFailure
  | CaptureFailurePreprocess
  | AuthFailure;
// Phase 2 will extend with QuizFailure; etc.
```

The `// Phase 2 will extend with QuizFailure; etc.` line at EOF is the explicit handoff token. Phase 2 should add a `QuizFailure` union (suggestions inferable from `QUIZ_AUDIT.md` §6: `quiz.fingerprint.compute_fail`, `quiz.fingerprint.write_fail`, `quiz.next_pair.empty_set`, `quiz.image.upload_fail`, `quiz.swipe.persist_fail`, `quiz.descriptor.generate_fail`, `quiz.tweak.weight_invalid`) and recompose. **Do not add `ALTER TYPE` migrations** — this union is the app-layer source of truth (D-022 pattern).

### 1.2 CostCategory union (current state)

Source: `apps/web/lib/cost/categories.ts` (47 lines). Header comment is canonical: *"D-022: render_cost_log.category is text at the DB layer. This TypeScript union is the app-layer source of truth. Phases extend this union without ALTER TYPE migrations."*

```ts
export type CostCategory =
  | "render"
  | "refine"
  | "quiz_descriptor"
  | "hard_room_classify"
  | "art_composite"
  | "art_generate"
  | "smart_tech_recommend"
  | "lighting_recommend"
  | "lens_query"
  | "clip_rerank"
  | "verifier"
  | "verifier_light"
  | "moderation_nsfw"
  | "moderation_borderline"
  | "moderation_csam"
  | "auth.email.verification"
  | "auth.email.reset"
  | "auth.email.export"
  | "auth.email.deletion_confirmation";

export const ALL_COST_CATEGORIES: ReadonlyArray<CostCategory> = [...];
```

Phase 2 may add `quiz_card_render`, `quiz_image_classify`, `quiz_pair_generate`, etc., for any FLUX/Sonnet calls related to quiz card corpus regeneration. Both the union AND the `ALL_COST_CATEGORIES` runtime array must be kept in sync (used by tests/admin).

### 1.3 paidCall<>() wrapper contract

Source: `apps/web/lib/paid/call.ts` (44 lines). Shape:

```ts
export interface PaidCallOpts {
  provider: "anthropic" | "fal" | "modal" | "searchapi" | "resend";
  url: string;
  init: RequestInit;
  costEstimate: {
    category: CostCategory;       // required, must be in CostCategory union
    costUsd: number;
    model?: string;
    stage?: string;
  };
  failureCategoryOverride?: string;
}

export async function paidCall<T = unknown>(opts: PaidCallOpts): Promise<T>
```

Internal flow:

1. `start = Date.now()`.
2. `fetch(url, init)`. On non-2xx → set `failure = override ?? "cost.paidcall.fetch_fail"` and throw.
3. `await res.json()` → return parsed.
4. `finally`: fire-and-forget `logCost({ category, stage, cost_usd, model, duration_ms, failure_category })`. Always logs whether call succeeded or failed.

Caller obligation:

- Provide `costEstimate.category` from `CostCategory` (TypeScript will refuse otherwise).
- Pass `init` with full headers + body (auth, content-type) — wrapper does not synthesize.
- **No retry policy inside `paidCall`.** Caller owns retries.
- `provider` is descriptive metadata, not currently routed; Phase 2 may add `"openai"` etc. by extending the literal type.

ESLint enforcement:

- `cova-rules/no-direct-paid-fetch` (severity `"error"`, baseline 0 violations) flags any `fetch()` call to a paid-provider hostname outside of `lib/paid/call.ts` and `lib/config/timeouts.ts`. Promoting to `"error"` was completed in P01a round 2 after migrating 15 sites.
- One sanctioned exception: `apps/web/tests/ai/llm-judge.test.ts:248` carries an inline `// eslint-disable-next-line cova-rules/no-direct-paid-fetch`.
- File overrides: `lib/paid/call.ts` and `lib/config/timeouts.ts` are themselves exempted in `.eslintrc.json` `overrides`.

Phase 2 implication: every Sonnet vision descriptor call, every FLUX corpus generation, every CLIP re-rank goes through `paidCall<T>()`. No exceptions.

### 1.4 redactLogPayload contract

Source: `apps/web/lib/log/redact.ts` (60 lines).

```ts
export function redactLogPayload<T>(input: T): T
```

Behavior:

- Strings → run `redactString` which (1) replaces email regex, phone regex, US street-address regex with `[email]`/`[phone]`/`[address]`, then (2) feeds through `sanitizeForbiddenNames` from `@/lib/ai/forbidden-names` (D-008 layer 5 — strips raw style names from log strings).
- Arrays → recurse element-wise.
- Objects → for each key:
  - If `key in FORBIDDEN_KEYS` (`password`, `apiKey`, `accessToken`, `refreshToken`, `secretKey`, `creditCard`, `cvv`, `ssn`, `dob`, `authToken`, `magicLinkToken`) → `"[redacted]"`.
  - If `key in TRANSFORM_KEYS`:
    - `userId` → 8-char SHA-256 hex.
    - `sessionId` → `"[redacted]"`.
    - `ipAddress` → `"[redacted]"`.
    - `userAgent` → first 64 chars.
  - Else recurse.
- Null/non-string scalars → passthrough.

Internals exposed at `_internals` for unit tests.

ESLint enforcement:

- `cova-rules/no-unsafe-console` (severity `"warn"`, baseline **199 violations** post-P01a round 2 T5; was 267 → 265 → 199). Flags any `console.*(...)` call passed an object that isn't wrapped in `redactLogPayload(...)`.
- Severity stays at `"warn"` until pre-launch sweep clears the residue. Phase 2 must **not introduce new violations**; net new sites must wrap in `redactLogPayload(...)` or use `wrapLogger(Sentry.captureMessage)` pattern.
- Tests opt-out: `**/*.test.ts*` + `tests/**` + `__tests__/**` disabled per `.eslintrc.json` overrides.
- File-level disables already applied to canonical observability surfaces (`lib/logger.ts`, `lib/unsplash.ts`) where double-redaction adds no value.

### 1.5 Middleware routing pattern

Source: `apps/web/middleware.ts` (175 lines).

Three arrays drive routing decisions:

```ts
const PROTECTED_PAGE_ROUTES = [
  "/design/step-2", "/design/step-3", "/design/step-4", "/design/step-5",
  "/design/step-6", "/design/step-7", "/design/step-7p",
  "/design/step-8a", "/design/step-8b", "/design/step-9",
  "/dashboard",
];

const PUBLIC_AUTH_PAGES = [
  "/auth", "/auth/signin", "/auth/signup",
  "/auth/forgot-password", "/auth/reset-password",
  "/auth/verify-email-sent", "/auth/verify-email-success", "/auth/verify-email-invalid",
  "/auth/callback",
  "/account-deleted",
  "/terms", "/privacy",
];

const PUBLIC_API_ROUTES = [
  "/api/quiz/fingerprint", "/api/quiz/next-pair", "/api/quiz/next-card",
  "/api/quiz/mood-strip", "/api/quiz/mood-board", "/api/quiz/validation-renders",
  "/api/style-references/match",
  "/api/rooms/public-count",
  "/api/pipeline",
  "/api/auth/signup", "/api/auth/signin", "/api/auth/forgot-password",
  "/api/auth/reset-password", "/api/auth/resend-verification", "/api/auth/sign-out",
  "/api/cron/purge-deletion-audit", "/api/cron/cost-monitor",
];

const RATE_LIMITED_API: Array<{ prefix: string; route: RouteKey }> = [
  { prefix: "/api/auth/signup", route: "signup" },
  { prefix: "/api/auth/signin", route: "signin" },
  { prefix: "/api/auth/forgot-password", route: "forgot-password" },
  { prefix: "/api/auth/reset-password", route: "reset-password" },
  { prefix: "/api/auth/resend-verification", route: "resend-verification" },
  { prefix: "/api/users/export", route: "users-export" },
];
```

Order of operations inside `middleware()`:

1. **Per-IP rate-limit check FIRST** (before session refresh) — uses `checkPerIp(routeKey, ip)` from `@/lib/rate-limit/upstash`. On exceed: returns JSON 429 with `failure_category: "auth.signup.rate_limit"` (note: hardcoded literal — Phase 2 may want to refactor this if quiz routes get rate-limited separately) and `Retry-After` header.
2. Session refresh via `createServerClient` from `@supabase/ssr` with cookie `getAll`/`setAll` shim (the canonical Supabase Next 14 pattern).
3. `supabase.auth.getUser()` to materialize `user`.
4. Authenticated user hitting `/` → 302 to `/dashboard`.
5. Page route classification:
   - `isPublicAuthPage` if exact match or `startsWith(route + "/")`.
   - `isProtectedPage` if `pathname.startsWith(route)`.
   - Protected + unauthed + not public → 302 to `/auth/signin?next=<pathname>`.
6. API route classification:
   - `isApiRoute = pathname.startsWith("/api/")`.
   - `isPublicApi` via `startsWith` over `PUBLIC_API_ROUTES`.
   - API + protected + unauthed → 401 JSON `{error: "Unauthorized"}`.

Matcher excludes `_next/static`, `_next/image`, `favicon.ico`, `api/dev`, all common image extensions.

Phase 2 implications:

- Quiz pages today live at `/design/step-2`, `/design/step-3`, `/design/step-3b`, `/design/step-4`. **Currently `/design/step-3b` is NOT in `PROTECTED_PAGE_ROUTES`** (gap — confirm with planner whether quiz must be auth-gated or remain anonymous-first).
- The quiz **API routes are public today**. If Phase 2 keeps anonymous quiz, leave them; if it requires login, move them out of `PUBLIC_API_ROUTES` and add quiz pages to `PROTECTED_PAGE_ROUTES`.
- New quiz API routes (e.g. `/api/quiz/swipe`, `/api/quiz/posterior`) need a public/protected decision and possibly an entry in `RATE_LIMITED_API`.
- Hardcoded `failure_category: "auth.signup.rate_limit"` in the 429 response is a known wart — Phase 2's `QuizFailure` extension may want a `quiz.rate_limit` category and the middleware must look up the right category per route key.

### 1.6 Supabase client patterns

Two helpers exist; both wrap `@supabase/ssr` only:

`apps/web/lib/supabase/client.ts`:
```ts
export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

`apps/web/lib/supabase/server.ts`:
```ts
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createClient(URL, KEY, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) { try { ... } catch { /* RSC noop */ } },
    },
  });
}
```

Sibling files: `lib/supabase/admin.ts` (service-role), `lib/supabase/storage.ts` (storage helpers), `lib/supabase/migrations/` (migration scripts).

Hard rule (CLAUDE.md Rule 4 + Rule 5): **NEVER** import from `@supabase/supabase-js` directly in App Router code. Client Components → `createBrowserClient` from this module. Server Components / API routes → `createServerSupabaseClient` from this module. Middleware → `createServerClient` from `@supabase/ssr` (with explicit cookie callbacks).

Service-role client only in server-side code (Rule 7); never `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`.

### 1.7 Design language tokens (post-Proposal-C tuning)

Tailwind config (`apps/web/tailwind.config.ts`, 62 lines) exposes **two coexisting forms**:

**Form A — nested `cova` group:**
```ts
cova: {
  navy: "#091829",
  gold: "#C9A84C",
  "gold-bright": "#D4B460",
  ivory: "#F5F0E8",
  "warm-error": "#A8443B",
}
```

**Form B — flat `cova-*` keys mapping to CSS variables:**
```ts
"cova-bg": "var(--cova-bg)",
"cova-surface": "var(--cova-surface)",
"cova-surface-2": "var(--cova-surface-2)",
"cova-surface-3": "var(--cova-surface-3)",
"cova-gold": "var(--cova-gold)",
"cova-gold-light": "var(--cova-gold-light)",
"cova-gold-dim": "var(--cova-gold-dim)",
"cova-ivory": "var(--cova-ivory)",
"cova-ivory-dim": "var(--cova-ivory-dim)",
"cova-muted": "var(--cova-muted)",
"cova-subtle": "var(--cova-subtle)",
"cova-border": "var(--cova-border)",
"cova-border-gold": "var(--cova-border-gold)",
"cova-border-dim": "var(--cova-border-dim)",
"cova-success": "var(--cova-success)",
"cova-error": "var(--cova-error)",
"cova-warning": "var(--cova-warning)",
```

Plus legacy: `navy.{deep,darker}`, `gold.{DEFAULT,primary,light}`, `ivory`.

**Dual-form collision:** `cova.gold` (Form A `#C9A84C`) and `cova-gold` (Form B `var(--cova-gold)`) resolve to the same color today. P01b shipped both because UI artifacts use both forms. Phase 2 can use either. **Tailwind dot-prefix `bg-cova-gold` resolves to the Form B var; `bg-cova/gold` would resolve to Form A** — but the slash form is rarely used. Leave both; do not collapse.

**CSS tokens** (`styles/tokens.css`, 175 lines, imported via `apps/web/app/globals.css:1`):

Surfaces:
- `--cova-bg: #0A1628`
- `--cova-surface: #0F1F3D`
- `--cova-surface-2: #132847`
- `--cova-surface-3: #1A3258`

Gold:
- `--cova-gold: #C9A84C`
- `--cova-gold-light: #F0D080`
- `--cova-gold-dim: rgba(201, 168, 76, 0.30)`
- `--cova-gold-glow: rgba(201, 168, 76, 0.15)`

Text:
- `--cova-ivory: #F8F6F1`
- `--cova-ivory-dim: rgba(248, 246, 241, 0.70)`
- `--cova-muted: #8BA3C0`
- `--cova-subtle: rgba(139, 163, 192, 0.50)`

Borders:
- `--cova-border: #1E3A5F`
- `--cova-border-gold: rgba(201, 168, 76, 0.20)`
- `--cova-border-dim: rgba(30, 58, 95, 0.50)`

Semantic:
- `--cova-success: #4A9B7F` + `--cova-success-bg: rgba(74, 155, 127, 0.12)`
- `--cova-error: #C0504A` + `--cova-error-bg: rgba(192, 80, 74, 0.12)`
- `--cova-warning: #D4A017` + `--cova-warning-bg: rgba(212, 160, 23, 0.12)`

Step-6 detection UI (legacy keep/remove):
- `--cova-keep: #1A7A4A`, `--cova-keep-bright: #2ECC71`, `--cova-keep-bg: rgba(26, 122, 74, 0.18)`, etc.
- `--cova-remove: #E74C3C`, `--cova-remove-dark: #C0392B`, `--cova-remove-bg: rgba(192, 57, 43, 0.12)`

Type:
- `--font-serif: 'EB Garamond', 'Palatino Linotype', Georgia, serif`
- `--font-sans: 'Inter', system-ui, ...`
- `--font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace`
- 9-step `--text-{xs..5xl}` scale; 11-step `--space-{1..20}`; 6-step `--radius-{sm..2xl,full}`.

Shadows: `--shadow-{sm,md,lg}` plus `--shadow-gold: 0 0 20px rgba(201, 168, 76, 0.25)`.

Transitions: `--transition-fast: 100ms ease-out`, `--transition-base: 200ms ease-out`, `--transition-slow: 350ms ease-out`, `--transition-spring: 400ms cubic-bezier(0.34, 1.56, 0.64, 1)`.

**Proposal-C gold-tuning (commit `b287fa9`, 2026-05-03):** post-P01b close, 10 P01b screens received gold-presence opacity/halo tuning across the whole auth/legal/deletion set. The exact scope is in the commit body — Phase 2 inherits Proposal-C as the "current visual baseline." If Phase 2 spawns new screens, they should match Proposal-C tuning rather than original P01b ui-gen output.

Hover-gold-reveal pattern + italic-serif headline gold treatment are both present in P01b screens; reference any auth screen for the canonical instance (signup, signin all show italic-serif hero + gold accent rule).

**Known font bug** (back-bug `P01b-prep-globals-css-font-bug.md`): `apps/web/app/globals.css:27-34` sets `body { font-family: "Palatino Linotype", ..., serif; }` which overrides the next/font CSS variable system loaded in `app/layout.tsx`. Result: Palatino renders by default; EB Garamond only renders where `font-serif` Tailwind utility is explicitly applied. Phase 2 may stumble into this — explicitly add `font-serif` on quiz typographic surfaces, or fix the bug as part of Phase 2 (one-line: replace `"Palatino Linotype", ...` with `var(--font-serif)`).

### 1.8 ESLint custom rules baseline

`apps/web/.eslintrc.json` (144 lines):

```json
"plugins": ["cova-rules"],
"rules": {
  "cova-rules/no-unsafe-console": "warn",        // baseline 199 — Phase 2 must not regress
  "cova-rules/no-direct-paid-fetch": "error",    // baseline 0 — load-bearing
  "@typescript-eslint/no-explicit-any": "error", // strict
  "@typescript-eslint/no-unused-vars": ["error", {argsIgnorePattern: "^_", varsIgnorePattern: "^_"}],
  "no-console": ["warn", {allow: ["warn", "error"]}],
  "@next/next/no-img-element": "off",
  "react-hooks/exhaustive-deps": "warn",
  "no-restricted-syntax": [
    "error",
    // 5 hardcoded timeout values ban (180000, 290000, 300000, 320000, 420000) → use lib/config/timeouts.ts
    // 6 forbidden style-name regex bans (Japandi, Bohemian, Coastal, Mid-Century Modern, Minimalist, Scandinavian) → use anchor-display.ts
    // Same 6 bans replicated for TemplateElement (template literals)
  ]
},
"overrides": [
  // lib/paid/call.ts + lib/config/timeouts.ts → no-direct-paid-fetch off, no-restricted-syntax off
  // **/*.test.* + tests/** → no-unsafe-console off
  // app/design/_future/** → no-restricted-syntax off
  // ~21 specific files involved in style-name routing → no-restricted-syntax off
]
```

The forbidden-name bans use look-around regex to allow qualified forms (e.g. `(?<!warm\s)\bjapandi\b/i` blocks bare "japandi" but allows "Warm Japandi"). This is layer 1 of a 5-layer D-008 defense (also layer 2 = husky pre-commit, layer 3 = runtime sanitizer, layer 4 = Zod refine, layer 5 = log redactor).

Phase 2 must:
- Not introduce new `cova-rules/no-unsafe-console` violations (each new `console.error(payload)` requires `redactLogPayload(payload)` wrap).
- Not introduce new direct paid-provider `fetch()` calls (use `paidCall<>()`).
- Not introduce raw forbidden style names in source strings or template literals (use `anchor-display.ts` / `forbidden-names.ts`).
- Add quiz files to the `overrides` array if they legitimately need to handle bare style strings (e.g. `app/api/quiz/style-preview/route.ts` is already exempted).

---

## Section 2 — Quiz domain audits

### 2.1 QUIZ_AUDIT.md key findings

`docs/audit/QUIZ_AUDIT.md` (378 lines, dated 2026-04-29) is the diagnostic that scoped Phase 2's intervention. **Root cause:** the 24-pair swipe phase in `step-3` is computationally inert. The fingerprint API takes a "V3 fast path" that derives the fingerprint exclusively from the 3 anchor questions in `step-2` and **silently discards every swipe response**. On top of that, the redesign route never reads `users.style_blend`, and `rooms.create` doesn't seed `rooms.style_blend`, so even when the quiz produces a usable blend, the renderer falls back to literal string `"Balanced Contemporary"` (cvscn LoRA).

Architecture today (V3 active flow): `/auth → step-1 → step-2 (anchors) → step-3 (24-pair quiz, broken) → step-3b (slider confirm) → step-4 (radar reveal) → step-5 (budget) → step-6 (photo)`. Quiz spans 4 screens; `CardStack` / `SwipeCard` components are quasi-orphaned — the live swipe UI is inline `<button>` pairs in `step-3/page.tsx:738-767`. `/api/quiz/confidence` is referenced by `CardStack.tsx:118` but does not exist (404 silently).

Algorithm: three implementations layered, only V3 fast path runs in production. V2 entropy + response-time engine (`route.ts:264-864`, `apps/web/lib/ai/style-match.ts`, `app/api/quiz/next-pair/route.ts`) is dormant. V3 12-dim Bayesian fast path (`route.ts:913-995`, `apps/web/lib/quiz/bayes.ts`, `apps/web/lib/quiz/style-archetypes.ts:179-209`) runs whenever `anchor_prior` is present — which is always, because `step-2` posts it. `confidence: 0.6` is **hard-coded** on V3 (line 931). `fingerprintToStyleBlend` cosines user's 12-dim vector against 10 archetype centers, softmax with `T=0.35`, drop weights <0.10, renormalize.

Locked algorithmic decisions (per OPEN_DECISIONS / phase doc cross-refs):
- **D-016 forced-choice locked** — every pair is A/B, no skip, no "neither."
- **D-017 12-pick locked** — total of 12 pairs, no adaptive bonuses for V1.
- **D-018 10 styles locked** — 10 archetype basis (`COVAJAPANDI, COVASCANDINAV, COVABIOPHILIC, COVAMINIMAL, COVAMIDCENTURY, COVACOASTAL, COVABOHEMIAN, COVAINDUSTRIAL, COVAFARMHOUSE, COVAARTDECO`).
- **D-020 mood feed dropped** — pre-quiz mood-strip explorer not in V1.
- 6-dim V2 (`warmth, complexity, formality, naturalism, modernity, character`) and 12-dim V3 fingerprint coexist; V3 is canonical for renderer integration.

UX pacing concerns called out:
- "Decisive" early-exit: `step-3` jumps to compute if `blendRatio >= 0.72 && competingStyles.length <= 1` — users with strong anchors never see swipes, a UX promise gap.
- Q3_FIXED_STYLES in `step-2` constrains the third anchor question to Art Deco + Industrial + Q1/Q2 winners — only 4 of 10 archetypes can win Q3, biasing priors.
- `step-3b` writes display-name keys (`{Japandi: 0.7, …}`) while step-2/3 write COVA* keys (`{COVAJAPANDI: 0.7, …}`); both are tolerated by `resolveCovaKey()` but the data shape is heterogeneous.

Persistence gaps (must be fixed in Phase 2 to unblock renderer):
- `swipe_history` has RLS, schema, seed scripts, and 0 production writers. Phase 2 must either start writing, or formally drop the table.
- `rooms.style_blend` not seeded from `users.style_blend` at room creation — `app/api/rooms/create/route.ts:42-49` inserts only `user_id` + `room_type`.
- `redesign/route.ts:171, 288` reads only `style_fingerprint` from `users`, never `style_blend`. `styleBlendForAnchor` is null for nearly every fresh render.
- `assembleRenderContext()` is called only client-side (`area2Store.ts:391`); server reuses stale `rooms.render_context`.

### 2.2 QUIZ_IMAGES_AUDIT.md key findings

`docs/audit/QUIZ_IMAGES_AUDIT.md` (340 lines, dated 2026-04-29). **Verdict: ship V1 with the existing image set, do not regenerate the bulk.** The image set is good; the metadata is broken.

Inventory (Supabase `quiz-images` bucket, public):
- **2,375 files, ~932 MB.** Format: 981 webp + 914 jpeg + 480 png. Anchors square 1024². Pairs mostly 4:3 1024×768 with parallel PNG copies.
- 9 anchor rows in `quiz_anchor_images` table (root variants `anchors/N-<slug>.webp`).
- 480 rows in `quiz_comparison_pairs` (referencing `pairs/dim-N/<idx>-{a,b}.jpg`).
- **240 room-specific anchors** (`anchors/room-specific/phase-a-<slug>-<room>(-rN)?.webp`) and **308 V3 `new-pairs/`** files are present in storage but **referenced by no DB row** (dark inventory).

Distribution across rooms × styles:
- 8 archetypes have 24-31 anchor images each.
- **COVASCANDINAV and COVAFARMHOUSE have only 6 each** (one per room, no `-rN` variants) — severe imbalance.
- DB anchor table missing 2 archetypes (COVASCANDINAV + COVAFARMHOUSE); contains a stale "Heritage Traditional" row that doesn't map to any V3 archetype.

Live broken-image bug:
- `step-2/page.tsx:35-37` constructs `quiz-images/<style_lc>_<room>.jpg` URLs that **do not exist** (0/60 hit). Anchor cards in step-2 render with browser broken-image fallback in production. One-line URL builder fix.

Pair quality (10 sample images via Sonnet vision):
- **Mean 5.0/5.0 across visual quality / aesthetic / style fidelity.** Production-ready.
- 8/10 single-label tags align with image content.
- 2/10 dimension-value tags are wrong (e.g. an image labeled "complexity LOW" actually shows medium-high complexity).
- Multi-label distributions are coherent — primary 60-85% with adjacent secondary.

Live filter bug:
- `next-pair/route.ts:342` filters with `.eq("is_validated", true).ilike("image_a_url", "%new-pairs%")`. Currently **0 of 480 rows** match (none `is_validated`, all reference `pairs/` not `new-pairs/`). The 24-pair swipe phase serves zero cards in production.

Replacement candidates / missing cells: see CATALOG_AUDIT_2026-04-30.md (§2.4).

Archetype-center cosine matrix (§7): all 45 off-diagonal pairs except MINIMAL↔BOHEMIAN have cosine distance < 0.30. Worst clusters: SCANDINAV↔COASTAL (0.979), JAPANDI↔BIOPHILIC (0.953), JAPANDI↔FARMHOUSE (0.944), MIDCENTURY↔FARMHOUSE (0.934). This is an algorithm/centers issue (all dims constrained to [0,1] non-negative, forcing same-orthant clustering); **no amount of image regeneration fixes it**. Phase 2 either accepts the clustering, or re-defines archetype centers as mean-zero `[-1, 1]` (would require recalibration and is post-V1 per F-CENTERS.1).

Recommended pre-V1 fixes (~$1.84-$2.94 + 30-60min eng):
1. Multi-label re-tag pass on all anchor + pair-half images (~720 Sonnet calls × $0.0017 ≈ $1.20).
2. Drop `is_validated = true` and `%new-pairs%` filters in `next-pair/route.ts` (or validate the 480 rows in a one-shot script).
3. Fix `step-2` URL builder to point at `anchors/room-specific/phase-a-<slug>-<room>.webp`.
4. Insert two missing `quiz_anchor_images` rows (COVASCANDINAV, COVAFARMHOUSE).
5. Repurpose dim-0 anchor pairs as same-room cross-style (zero regen — rewrite 60 dim-0 row URLs to use existing `anchors/room-specific/` images).
6 + 7 (optional, $1.44): generate 18 supplemental anchors each for COVASCANDINAV and COVAFARMHOUSE to reach 24 each.

### 2.3 IMAGEGEN_AUDIT.md key findings

`docs/audit/IMAGEGEN_AUDIT.md` (613 lines, dated 2026-04-29). Scope: LoRA assets, Modal apps, fal endpoints, render orchestration code, CLIP/product-matching.

V3 render pipeline parameters (locked):
- **Pass 1 (FLUX general i2i):** strength=0.92, 28 steps, guidance=3.5, LoRA stack (style + add-details + realism), depth ControlNet 0.80→0.85.
- **Pass 2 (per-surface decor loop):** strength=0.55, 22 steps, guidance=3.5.
- **Pass 3 (IC-Light v2):** lowres_denoise=0.88, highres_denoise=0.45 (non-default; critical), guidance=5.
- Prompt strength 0.82 for FLUX general at single-pass tier.
- Modal GPU: A10G only (CLAUDE.md).
- Production Modal apps: `cova-perception`, `cova-empty-room`, `cova-empty-room-v3` (Gemini), `cova-redesign-v3`, `cova-composite-art`. The web app talks to Modal in 4 places.

LoRA state (10 LoRAs trained 2026-04-17 via `fal-ai/flux-lora-fast-training`, FLUX.1-dev base):
- 4 USE-verdict: COVAARTDECO (cvdco), COVAINDUSTRIAL (cvind), COVACOASTAL (cvcst), COVAJAPANDI (cvwmn).
- 6 MARGINAL: COVAFARMHOUSE (cvfrm), COVABIOPHILIC (cvbio), COVASCANDINAV (cvscn), COVAMIDCENTURY (cvmcm), COVABOHEMIAN (cvboh), COVAMINIMAL (cvmin).
- **0 REGRESSION** — no LoRA hurts.
- **Trigger collision unresolved** between COVAMINIMAL and COVASCANDINAV — both meta files record `full_trigger: "cvscn interior"` while runtime registry exposes COVAMINIMAL with `cvmin`. Result: COVAMINIMAL loaded with zero T5 activation.

LoRA decision (D-003 in OPEN_DECISIONS): **archive for V1.5, ship V1 without LoRAs.** Bake-off shows FLUX.2 prompt-only beats flux1-lora 74.8 vs 62.2 (mean over 5 rooms, 0-90 rubric). Keep `lora-backups/` and Supabase mirror as cheap insurance. Mark LORA_REGISTRY entries in `apps/web/lib/styles/lora-registry.ts` and `modal_pipeline/redesign.py` as deprecated; do not delete (V3 pipeline still depends).

Pipeline implications for Phase 2 (V1 = quiz only):
- `quiz_descriptor` cost category exists for Sonnet descriptor calls.
- Quiz card **corpus** generation, if Phase 2 regenerates, runs on `fal-ai/flux/schnell` (used today for `art-preview`) at $1.20 budget for ~24 missing cells, OR `fal-ai/flux-pro/v1.1` at $0.04/image for the 18+18 supplemental anchors.
- Phase 2 is **not** in the render pipeline itself — quiz only writes `users.style_blend`. The render gap is in P3+ but Phase 2 must still write the canonical shape (COVA* keys) so the renderer can read it once P3 wires it in.

### 2.4 CATALOG_AUDIT findings (2026-04-30)

`cova-plan/CATALOG_AUDIT_2026-04-30.md`. Audit of `swipe-cards` + `showcase` + `quiz-pairs` + `quiz-images/{anchors,base-rooms,new-pairs}`.

Top-level numbers:
- **1,492 images audited.** 1,485 successful classifications; 7 errors.
- **1,428 useful** (`useful_for_quiz=true AND quality≥good AND in 12-style/6-room taxonomy`).
- **48 / 72 cells filled to target ≥6.** Sonnet 4.5 spend: $10.25 (2,643,792 in / 154,457 out tokens).

Coverage matrix is **12 styles × 6 rooms = 72 cells** (target 6 cards each = 432 total cards):
- styles: scandinavian, japandi, mid-century-modern, modern-farmhouse, industrial, traditional, contemporary-minimalist, bohemian, coastal, mediterranean, art-deco, organic-modern.
- rooms: living-room, bedroom, kitchen, dining-room, office, bathroom.

Top filled: japandi (360), contemporary-minimalist (343), organic-modern (181), traditional (97), mid-century-modern (93). Tail: mediterranean (17), modern-farmhouse (18), art-deco (33).

24 cells below target 6:
- **Empty (0):** mediterranean office, mediterranean bathroom, scandinavian bathroom.
- **+5 needed:** mediterranean bedroom, modern-farmhouse {living-room, bedroom, dining-room, office}.
- **+4 needed:** coastal {kitchen, bathroom}, mid-century-modern bathroom, modern-farmhouse bathroom.
- **+1 to +2 needed:** 12 cells.

Sourcing recommendation: 12 cells (≥4 gap) → FLUX-generate; 12 cells (1-3 gap) → Unsplash top-up.

Phase 2 inventory implication: the quiz can ship today on the 1,428 useful image set, but it has structural imbalance in 24/72 cells. If V1 quiz uses room-aware card sampling, those gaps will surface. Three responses: (a) skip the rare cells in card sampling; (b) FLUX-generate the 24 gap cells (~$3 + 2 hours); (c) collapse the 12-style audit taxonomy to the 10 V3 archetype taxonomy and accept residual imbalance. Note the audit uses 12 categories (modern-farmhouse + mediterranean + organic-modern + traditional + contemporary-minimalist + ...) while the V3 LORA registry uses 10. **This taxonomy mismatch is open** — Phase 2 phase chat must reconcile.

### 2.5 LORA_AUDIT findings (2026-04-30)

`cova-plan/LORA_AUDIT_2026-04-30.md`. Head-to-head LoRA vs prompt-only flux-general for the 12-style M5 catalog generation decision. 30 image pairs (10 styles × 3 room/seed/time) judged by `claude-sonnet-4-5` vision.

| Style | LoRA | trigger | scale | Δ fidelity | Win rate | Verdict |
|---|---|---|---:|---:|---:|---|
| art-deco | COVAARTDECO | cvdco | 0.82 | +3.67 | 100% | ✅ USE |
| industrial | COVAINDUSTRIAL | cvind | 0.80 | +2.00 | 100% | ✅ USE |
| coastal | COVACOASTAL | cvcst | 0.85 | +1.67 | 100% | ✅ USE |
| japandi | COVAJAPANDI | cvwmn | 0.88 | +1.67 | 67% | ✅ USE |
| modern-farmhouse | COVAFARMHOUSE | cvfrm | 0.85 | +1.00 | 67% | ⚠ MARGINAL |
| organic-modern | COVABIOPHILIC | cvbio | 0.92 | +1.00 | 100% | ⚠ MARGINAL |
| scandinavian | COVASCANDINAV | cvscn | 0.88 | +0.67 | 67% | ⚠ MARGINAL |
| mid-century-modern | COVAMIDCENTURY | cvmcm | 0.85 | +0.67 | 67% | ⚠ MARGINAL |
| bohemian | COVABOHEMIAN | cvboh | 0.78 | +0.67 | 67% | ⚠ MARGINAL |
| contemporary-minimalist | COVAMINIMAL | cvmin | 0.95 | +0.33 | 100% | ⚠ MARGINAL |
| traditional | — | — | — | — | — | 🚫 NO LoRA |
| mediterranean | — | — | — | — | — | 🚫 NO LoRA |

Total spend: $3.96 (fal-general $3.69 + Sonnet $0.27). 30/30 valid judgments, 0 errors. LoRA latency tax: +3.8s/image.

**D-003 implication: V1 ships LoRA-free for the render pipeline.** The 4 USE LoRAs deliver large fidelity improvements but the prompt-only path already wins on the bake-off rubric for FLUX.2-Max (80/80 density-test), and operational complexity (URL pinning, training cost amortization) doesn't justify marginal gains on the other 6.

Phase 2 implication: the quiz produces a `style_blend` in 10-archetype space. The render pipeline (P3+) consumes that blend to drive prompts, not LoRAs. Phase 2 does not need to choose between LoRA archetypes and prompt archetypes — it just produces the canonical `Record<COVAStyleKey, number>`. P3+ owns whether to pass that blend to a LoRA stack (deprecated) or to a prompt-only system (V1 path).

---

## Section 3 — Process protocols

### 3.1 VERIFIER_PROTOCOL summary

`cova-plan/VERIFIER_PROTOCOL.md` (v1.0, 2026-05-02). Two-session fresh-context self-healing verifier.

Structure: every phase runs **two sequential verifier sessions**, both fresh-context, both blind to executor framing, second blind to first.

| Session | Reads | Doesn't read |
|---|---|---|
| **S1** | Phase doc, spec criteria, code at HEAD, live Supabase via MCP, prior verifier logs, its own self-heal log | executor's notes, handoff docs, PR description, commit messages |
| **S2** | Phase doc, spec criteria, **now-current** code at HEAD (post-S1 heals), live Supabase via MCP, prior verifier logs **excluding** S1's report | S1's report, S1's heal log, executor's notes, executor's PR description |

S1 may self-heal **mechanical defects only** (≤3 files OR ≤1 schema migration; no architecture changes; tests must pass post-heal). Self-heals logged to `cova-plan/manual-evidence/P{N}/verifier-session-1-heals.md`.

S2 is **read-only** — Edit/Write tools not in its prompt. S2 either confirms the criterion passes (S1's heal worked or wasn't needed) or flags a defect.

Disagreements:
- Convergent (both fail differently) → cloud chat unions findings into remediation backlog.
- Divergent (S1 PASS, S2 FAIL on same criterion) → cloud chat re-runs the concrete test, decides.
- Spec disagreement → recorded; cloud chat decides whether to amend spec.

Remediation budget: **at most 2 rounds per phase**. Round 3 = automatic escalation to `cova-plan/escalations/P{N}-{topic}.md`. Self-heals during a verifier session do **not** count as a remediation round.

Manual gate: Daksh runs the phase doc's manual click-script after both verifier sessions pass; archives evidence to `cova-plan/manual-evidence/P{N}/`. ACCEPT → CLOSED. REJECT → back-bug or future-phase log.

**Process learning from P01b (carry-forward to all future phase verifiers):** Verifier prompts must require **directory-wide grep for any pattern-class spec rule** ("no spinners anywhere in /auth/" → mandatory `grep -rn animate-spin apps/web/app/auth/`). Session 1 of P01b missed 5 spinner sites because it walked file-by-file; Session 2 caught them via global grep. Future verifier prompts: for each §13 row of the form "no X anywhere in Y", require the grep, not just file-by-file inspection. **This is the headline lesson Phase 2's verifier prompts must embed.**

Anti-patterns (do not do): reading executor PR description, sharing cache between sessions, auto-resolving disagreements, self-healing architecture decisions, skipping S2 because S1 said PASS, counting a self-heal as a remediation round, closing without manual gate.

### 3.2 PLANNER_PROTOCOL summary

`cova-plan/PLANNER_PROTOCOL.md` (v1.0, 2026-05-02). One fresh Claude Code session with 3 MCP servers: **Supabase** (live schema, tables, RLS, migrations), **Context7** (current API docs for Next.js, Supabase, fal.ai, Stripe, Sentry, PostHog, Resend, Anthropic), **EXA** (technique research, adversarial searches). Web search allowed for time-sensitive lookups (pricing, regulatory) but not as Context7 substitute for library docs.

Lifecycle:
1. Cloud chat selects phase doc + writes planner prompt.
2. Planner reads `PHASE_STATUS.md`.
3. Planner runs **DRIFT DETECTION** (mandatory): 3 queries — Supabase MCP for prior-phase schema state, file grep for code claims, `git log --oneline --grep "phase-{N}: closed"` for closing commits. Mismatch → halt + write `cova-plan/drift/P{N}-detected.md`.
4. Planner reads phase doc fully including "Pre-decisions" block.
5. Planner identifies unresolved pre-decisions; if any → halt + return to cloud chat.
6. Planner conducts research per phase doc's "Research required" block.
7. Planner authors executor prompt at `cova-plan/planner-output/P{N}-executor-prompt.md` and stops.

Research recording: findings inline in executor prompt where consumed, with version pin + date stamp ("Confirmed via Context7 2026-05-02; pattern verified against Upstash docs"). Versions matter — pin exact deps in `package.json` patches.

Pre-decision halt protocol: if a `D-NNN` is empty/TBD, contradicts another, references a non-current tool/library, or has external dependency unsatisfied → planner halts. No guessing.

Executor prompt structure: pre-decisions in force, scope (every file + may NOT touch list), step-by-step instructions, env vars, failure handling, verification commands, handoff window pattern (93-94% context).

For Phase 2 specifically (per planner protocol §4.4): research targets are **EXIF stripping with Sharp current API** (Context7) and **Anthropic Vision image-size limits** (Context7). The phase doc's own "Research required" block enumerates more.

### 3.3 Phase chat → Planner → Executor → Verifier flow

Full loop (timing estimates from Phase 1 actuals):

1. **Phase chat (cloud claude.ai):** 2-5 sessions. Daksh + cloud chat review phase doc, debate pre-decisions, lock D-NNN identifiers, finalize spec.
2. **Planner (fresh Claude Code session):** 1 session. Drift check + research + write executor prompt. Returns prompt to cloud chat.
3. **Executor (fresh Claude Code sessions):** 4-8 sessions across milestones, handoffs at 93-94% context written to `cova-plan/SESSION_HANDOFFS/`. P01a took 4 executor sessions; P01b took 5 (1A, 1B, 1C-partial, 1C-complete, R1 remediation).
4. **Verifier (fresh Claude Code sessions):** 2-4 sessions. S1 + S2 baseline; up to 2 remediation rounds adds 0-4 more sessions. P01a needed 0 remediation rounds (PASS-WITH-HEALS clean); P01b needed 2 rounds (3 verifier sessions total).
5. **Manual gate (Daksh):** click-script execution + screenshot/HAR/DB-output capture to `cova-plan/manual-evidence/P{N}/`. Evidence bundle + summary.md + ACCEPT/REJECT verdict.
6. **Close (1-2 sessions):** PHASE_STATUS.md flip, EMPIRICAL_FINDINGS append, OPEN_DECISIONS.md updates, back-bug filing for deferrals, closing commit `phase-{N}: closed`.

Total: ~12-20 sessions over 2-4 weeks, depending on phase complexity.

Phase 2 estimate from `P02-quiz.md` §1: 6-8 executor sessions across M4/M5/M6, **3-4 weeks** calendar (largest UI milestone in V1), ~$80-120 in Claude credits, ~$10 in infra.

Phase 1 actual total spend (per EMPIRICAL_FINDINGS): 12 sessions, 2 remediation rounds, 3 verifier passes, 10 frontend-visionary subagent invocations during P01b 1C.4.

---

## Section 4 — Open back-bugs

### 4.1 Phase 2 blockers

**None outright block Phase 2 from starting.** Phase 2's prereq verification §2 lists "P1 → CLOSED" and Supabase schema invariants — all satisfied.

### 4.2 Phase 2 complications

**`P01a-eslint-rule-severity-pending-cleanup.md` — `cova-rules/no-unsafe-console` at warn, 199 baseline.** Phase 2 must:
- Not introduce new violations (every new `console.error(payload)` requires `redactLogPayload(payload)` wrap).
- Optionally clean residual sites in lib/errors.ts, lib/interactions.ts, lib/env.ts, lib/stores/area2Store.ts, ~15 step pages under app/design/, less-traveled API routes (rooms/capture, render/status, render/tweak, swap, quiz/*, pipeline/redesign, pipeline/segment-masks, render/refinement/apply).
- Final promotion to "error" severity is a P02-P04 progressive task per back-bug.
File path: `cova-plan/back-bugs/P01a-eslint-rule-severity-pending-cleanup.md`. Blast radius: warn-only — won't fail build. Phase 2 should address: progressive — wrap any quiz logger in `redactLogPayload`. Goal: drop residue toward 0 so the rule can be promoted to error before launch.

**`P01a-m2-m4-active-refs.md` — 11 deferred load-bearing column drops on `rooms` table.** 4 of 11 cols are P2-owned: `personalization_context`, `capture_photo_urls`, `capture_mode`, `video_url`. They're consumed by the V3 design pipeline today and the back-bug says "Phase 2 (capture rewrite — only photo intake survives)" / "Phase 2 (quiz/capture refactor consolidates this onto users.style_blend)". **Phase 2 needs to retire these consumers, then drop the columns in a tail migration.** Files affected: `app/api/rooms/[roomId]/route.ts`, `app/capture/[roomId]/page.tsx`, `app/api/pipeline/redesign/route.ts`, `lib/ai/design-director.ts`. Blast radius if dropped while consumers still active: production outage on V3 redesign + capture flow. Phase 2 must address: retire `personalization_context` + `capture_*` consumers as part of step-6 capture refactor, then queue tail migration for P3 to apply.

**`P01b-prep-globals-css-font-bug.md` — body font-family override.** `apps/web/app/globals.css:27-34` sets `body { font-family: "Palatino Linotype", ... }` overriding next/font CSS variable system. Result: Palatino renders by default; EB Garamond only via explicit `font-serif` Tailwind utility. Suggested fix: replace body rule with `font-family: var(--font-serif);`. Blast radius: cosmetic — affects default body text rendering app-wide. Phase 2 may want this fixed before quiz screens land (or accept and explicitly font-serif everywhere). One-line fix.

### 4.3 Unrelated to Phase 2

**`P01a-python-test-imports.md` — RESOLVED.** Already closed in commit `c87df47` (Option A: archive moved). Listed for completeness; Phase 2 ignores.

**`P01a-stale-data-flagging.md` — Phase 9 owner.** 138 stale `redesign_status='failed'` rooms need a `tags jsonb` column for `internal_test_data_pre_v1` filtering. Owner: Phase 9 dashboard or dedicated mini-migration. Phase 2 does not address.

**`P01b-launch-prep-email-deferred.md` — launch-prep window.** Resend gated behind `EMAIL_SENDING_ENABLED` env var (default false). Affects forgot-password, email verification, GDPR export delivery, deletion confirmation. V1 mitigation: OAuth-only signup, OR support burden via hi@covainterior.com manual reset, OR invite-only alpha. Owner: Daksh, launch-prep. Phase 2 ignores (auth flow already handles `EMAIL_SENDING_ENABLED=false` short-circuit).

**`P01b-launch-prep-termly-deferred.md` — launch-prep window.** /terms and /privacy ship with placeholder htmlContent. CCPA/regulatory exposure for public launch but acceptable for invite-only. Owner: Daksh, launch-prep. Phase 2 ignores.

---

## Section 5 — Recent close context

### 5.1 P01b close handoff summary

`cova-plan/SESSION_HANDOFFS/17-P01b-close.md` (2026-05-03, code SHA `c1f7e3c` at close).

What shipped: 10 screens (signup, signin, forgot-password, reset-password, verify-email-{sent,success,invalid}, account-deleted, terms, privacy), 9 auth API routes + 1 internal cron (`purge-deletion-audit`), `account_deletions` table with RLS and zero-PII audit retention, GDPR data export with 7-day signed URL (service-role-authenticated storage download), `feature_flags` seed for `auth_apple_oauth=false@0%` and `email_verification_required=true@100%`.

Final §13 tally (verifier session 3): **18 PASS + 7 PASS-CODE (live fire deferred to manual gate) + 1 PARTIAL (cron boot-halt deviation, P01a precedent) + 2 PENDING-VERIFIER (forgot-password constant-time + GDPR export sync/queued split) + 0 FAIL.**

Verification trail: 3 verifier sessions, 2 remediation rounds. S1 found 6 defects (3 spinners + TTL doc inconsistency + missing PasswordStrengthMeter wiring + unauthenticated storage fetch). R1 fixed those. S2 surfaced 5 *additional* spinner sites via global grep (S1 had walked file-by-file). R2 fixed those + removed `cova-spinner` keyframe block. S3 verified all R2 fixes individually + globally; 0 FAIL. **Verifier 3 clear → close.**

Pre-decisions locked during P01b (carry forward):
- **C-3a γ silent-lockout** — signin reveals only `auth.signin.invalid_credentials`; lockout state never surfaces to user; DoS surface accepted.
- **Session cookie `SameSite=Lax`** — pragmatic accept (`@supabase/ssr` default; Strict breaks OAuth).
- **Cron boot-halt deviation** — runtime 401 on missing `CRON_SECRET` rather than module-load halt. P01a precedent.
- **GDPR export TTL = 7 days** — locked phase chat State 2 decision T8.
- **Resend gated behind `EMAIL_SENDING_ENABLED=false`** — D-021 scope clarification.
- **Termly free tier** — D-021; legal content deferred to launch prep.
- **Apple OAuth deferred** — flag seeded false@0%.

Open items rolling forward to manual gate (Daksh post-deploy):
- 4 signups in 1h same IP → 4th 429 (Upstash rate-limit live).
- Small/power-user export → sync `{downloadUrl}` <7s OR queued + Resend email <5min (Resend account required).
- Download zip → JPEG/PNG bytes in `images/`.
- Forgot-password timing variance ≤50ms over 20 trials.
- 5-fail signin + 6th → silent lockout in Sentry (no user-visible state).
- Plus 7 PASS-CODE that need live confirmation: Turnstile end-to-end, session cookie inspection, token single-use second-call 401, account-deletion cascade dry-run, account lockout silent confirmation, email deferral env-flip, GDPR export bytes.

Process learnings (already added to VERIFIER_PROTOCOL §11):
1. Verifier prompts must require directory-wide grep for any pattern-class spec rule.
2. Phase-doc edits must sweep all sections (§13 stale TTL → §1 prose stale on a separate line).
3. Stale enumeration phrases ("6 form screens", "all form pages") must be re-audited when scope expands.
4. Schema-MCP-check non-frozen tables before referencing columns in API routes (R4 found `final_image_url` / `redesign_pano_url` on `renders` — neither exists; real columns: `image_url`, `panoramic_url`, `empty_room_url`).

### 5.2 Pre-close session context (last 2-3 handoffs)

**Handoff 16 (P01b remediation 1, 2026-05-03, commits `47ddaf7..0a01905`).** 4 fixes shipped post-S1: §13 GDPR TTL doc fix (R1), spinner removal in 2 sites (R2 — `verify-email-sent` + `reset-password VALIDATING`), wire `PasswordStrengthMeter` into reset-password (R3), authenticated storage fetch in GDPR export with parseSupabaseStorageUrl + content-type/byte-length validation (R4 — also caught the stale `final_image_url`/`redesign_pano_url` column references). `tsc --noEmit` exit 0; `next lint` 0 errors with only baseline warnings; `next build` clean. Surfaced session 2 followup: `ValidBlock` submit button still has `animate-spin` on isLoading — left for verifier 2 to flag, became R2 sweep.

**Handoff 15 (P01b 1C complete, 2026-05-03).** Thin completion pass on top of handoff 14: 1C.4 frontend-visionary subagent run × 10 screens (2 batches of 5 in parallel). Aggregate findings — 25 blockers + ~50 nits across 10 screens. Themes: Wordmark vs sticky-header z-index collision on /terms+/privacy; touch-target failures on every 10px microtype link (none reach 44×44 floor); WCAG AA contrast misses on `text-cova-ivory/35`, `/40`, `text-cova-gold/60` at 10px size; loading-state α spec violations (spinners that should be italic-serif). All caught and triaged into the §13 acceptance checklist for verifier review. **Lesson: frontend-visionary subagent in parallel pass × N screens is an effective UI-spec-violation finder** — use the same pattern in Phase 2.

**Handoff 14 (P01b 1C partial, 2026-05-03).** 1A backend (`account_deletions` migration, `delete-user-cascade` Edge Function deployed, Upstash rate-limit + per-email cooldown + silent signin lockout, cost categories extension `auth.email.*`, `RESEND_BLENDED_RATE_USD=0.0008`, `AuthFailure` union 21 entries, Resend short-circuit pattern, 4 React Email templates, 9 auth API routes + 1 cron + auth callback, middleware update, 7 env vars in `.env.example`, vercel.json cron entry). 1B UI (Wordmark, Toast, AnimatedCheckmark, PasswordStrengthMeter, LegalPage component, 9 ui-gen artifacts wired to routes). 1C integration partial (feature_flags seed, Edge Function deployed, GDPR sync/queued integration test plan written). Apple OAuth not rendered (refinement collapsed to Google-only; flag seeded false). 1C.4 frontend-visionary deferred to handoff 15.

**Pattern observed across the P01b chain:** sustained execution at 93-94% context handoffs, executor produces detailed per-commit `## What was fixed` sections in handoff docs, lint baseline maintained throughout, schema-MCP queries used at every code-touches-DB juncture. Phase 2 should emulate.

---

## Section 6 — Live database state (Phase 2 relevant)

Probed 2026-05-03 against `xdeacbmkdwqrwxonqaqh`.

### 6.1 Tables Phase 2 will read/write

| Table | Rows | RLS | Notes |
|---|---:|---|---|
| `users` | 11 | on | 22 columns. Has `style_fingerprint jsonb NOT NULL`, `style_blend jsonb NULL`, `style_blend_v3 jsonb NULL`, `primary_style/secondary_style text`, `primary_weight/secondary_weight double`, `interactions_count int`. **Phase 2 source-of-truth target = `style_blend`.** |
| `rooms` | 308 | on | 47 columns (including 11 deferred load-bearing P01a M2 cols). Has `style_blend jsonb NOT NULL`, `render_context jsonb`, `personalization_context jsonb` (deferred drop, Phase 2 owns retirement). |
| `style_fingerprints` | **117** | on | Append-only audit table. 13 columns: `vector_data, dimensions, covariance, confidence (double NOT NULL), quiz_responses jsonb NOT NULL, fingerprint_version text, entry_path, room_type, budget_tier, created_at`. Stale rows present (V2 confidence + V3 confidence mixed). |
| `swipe_history` | **0** | on | 13 columns: `card_id, card_image_url, card_phase, card_style, direction, dwell_time_ms, score_awarded, session_position, style_vector_before, style_vector_after`. RLS enabled by `20260419000000_enable_swipe_history_rls.sql`. **Zero production writers** — Phase 2 must either start writing or formally drop. |
| `quiz_anchor_images` | **9** | on | 12 columns. `style_index BETWEEN 1 AND 10` constraint (loosened by `20260416_quiz_v3_schema.sql:38-40`). 9 rows present, 10 expected. Missing COVASCANDINAV + COVAFARMHOUSE; stale "Heritage Traditional" present. Has `style_vector jsonb NOT NULL, dominant_colors text[] NOT NULL, flux_prompt text NOT NULL, livability_score numeric, room_images jsonb, round_images jsonb`. |
| `quiz_comparison_pairs` | **480** | on | 22 columns including `image_a_url NOT NULL, image_b_url, image_a/b_vector jsonb, image_a/b_storage_path, base_room_url, flux_prompt_a/b, livability_score_a/b, is_validated bool, room_type, is_anchor bool, style_a/b, anchor_style, dimension, dimension_index, dimension_tested, a/b_dimension_value double`. **All rows `is_validated=false`; `next-pair/route.ts` filter is `is_validated=true AND image_a_url ILIKE '%new-pairs%'` → 0 matches.** |
| `render_sessions` | 63 | on | 9 cols. P3+ owns; Phase 2 ignores. |
| `render_cost_log` | **0** | on | 10 cols (V1-spec post-P01a M4): `id, user_id, render_id, category text NOT NULL, stage, cost_usd numeric NOT NULL, model, duration_ms, failure_category, created_at NOT NULL`. Zero rows because no `paidCall` has fired yet in production deployment. Phase 2 quiz descriptors will be the first writers. |
| `feature_flags` | 2 | on | 8 cols: `id, key text NOT NULL, enabled bool NOT NULL, percent_rollout int NOT NULL, environment text NOT NULL, description, created_at, updated_at`. Currently seeded `auth_apple_oauth=false@0%` + `email_verification_required=true@100%`. Phase 2 may add `quiz_v3_active=true@100%` or similar. |
| `account_deletions` | 0 | on | 5 cols: `id, hashed_user_id text NOT NULL, deleted_at NOT NULL, deletion_reason, audit_retention_days int NOT NULL`. P01b shipped; zero-PII audit. |
| `interactions` | 0 | on | 7 cols: `user_id, room_id, product_id, action text NOT NULL, fingerprint_id, created_at`. P9+ feature. |
| `chat_messages` | 0 | on | P9+. |
| `redesign_feedback` | 0 | on | P9+. |
| `saved_products` | 0 | on | P9+. |
| `room_products` | 201 | on | P7. |
| `style_loras` | 10 | on | All 10 LoRAs registered; D-003 says don't use in V1. |
| `style_vectors` | 9 | on | Static archetype centers. |
| `app_config` | 2 | on | Misc kv. |
| `sam_embeddings` | 15 | on | Phase 1 SAM 2 cache. |
| `empty_room_cache` | 0 | on | Phase 2 deferred (F2-CACHE.1). |
| `rate_limits` | 4 | on | Upstash mirror (P01b). |
| `products` | 15,902 | on | M2/M6 catalog (frozen schema per CLAUDE.md). |
| `products_v1` | 15,774 | on | V1 catalog dimension. |
| `renders` | 40 | on | Real columns: `image_url, panoramic_url, empty_room_url` (NOT `final_image_url` / `redesign_pano_url` — those don't exist; bit Phase 2 in P01b R4). |

### 6.2 Existing data in quiz-related tables

- `users` 11 rows. Mix of test accounts; some have `style_blend` populated with COVA* keys, some with display-name keys (per QUIZ_AUDIT.md — `step-3b` writes display names, others write COVA*).
- `style_fingerprints` 117 rows. Append-only with no upsert / dedup. Phase 2 should consider whether to upsert per `(user_id, room_type)` per QUIZ_AUDIT §8.6 recommendation.
- `swipe_history` **0 rows.** RLS enabled, schema present, no writers.
- `quiz_anchor_images` 9 rows (gap: COVASCANDINAV + COVAFARMHOUSE missing; stale Heritage Traditional row present).
- `quiz_comparison_pairs` 480 rows, all `is_validated=false`.
- `style_vectors` 9 rows; `style_loras` 10 rows; `quiz_anchor_images` 9 rows — three independent style enumerations exist with slightly different shapes. Phase 2 must reconcile or accept.

### 6.3 Foreign-key cascade chain to auth.users

Verified during P01b (per handoff 17 §"Pre-decisions locked"): `delete-user-cascade` Edge Function relies on `auth.users` CASCADE chain. Phase 2 schema additions must respect this pattern — any new quiz-related table whose row identity is per-user must:
- Have `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`.
- Enable RLS (per PHASE_STATUS / VERIFIER_PROTOCOL pattern).
- Add a P1-prefix policy convention (per `schema-reviewer` subagent rules).
- Pass `schema-reviewer` PR review (idempotency, paired `_down.sql`, RLS-on-new-tables, naming, data-loss declarations, CASCADE blast radius, D-022 compliance).

Existing quiz-tables already have CASCADE: `swipe_history.user_id`, `style_fingerprints.user_id` (verified in P01b cascade test).

---

## Section 7 — Phase 2 risk assessment (from this synthesis)

### 7.1 Technical risks

**(R1) Algorithm-correctness drift between client and server.** Today the V3 fast path runs in `app/api/quiz/fingerprint/route.ts:913-995` while step-3 displays a 24-pair UI that doesn't feed any update. If Phase 2 wires swipes → posterior update, the client's local `style_blend_provisional` (UX prefetch / preview) must stay in sync with the server's authoritative posterior. Bayesian update math in `apps/web/lib/quiz/bayes.ts` is sound (Kalman-style + contradiction detection), but the server-client drift surface is new and easy to mis-wire. Mitigation: server is single source of truth; client only receives the final posterior.

**(R2) Image curation quality vs livability.** QUIZ_IMAGES_AUDIT shows 8/10 single-label tags align with image content but 2/10 dimension-value tags are wrong. The dim-0 anchor cross-style pairs are systematically muddled (room type AND style differ between A/B). If Phase 2 ships without the multi-label re-tag pass + dim-0 rebuild, the swipe signal will be noisy on those pairs. Cost to fix is small ($0.40-$1.20 Sonnet + 30 min eng). Risk if not addressed: measurable but bounded — Bayesian update will absorb noise across 12 picks.

**(R3) UX pacing and the swipe phase's existential question.** QUIZ_AUDIT §9 #1 asks: "Keep step-3 swipes at all? If we accept the audit's finding, we can ship a quiz that is just 3 anchor questions + 1 confirmation screen and produce *exactly the same fingerprint* the renderer sees today." Phase 2's locked decision (D-016 forced-choice + D-017 12-pick) preserves the swipe phase as a UX promise. If the swipes don't *materially* change the fingerprint after 12 picks, users may sense placebo. The Bayesian update under D-016+D-017 must measurably move the posterior on contrarian swipe sequences (e.g. user picks all warm anchors then swipes against warmth in pairs).

**(R4) Catalog-taxonomy mismatch.** CATALOG_AUDIT_2026-04-30.md classifies into **12 categories** (modern-farmhouse, mediterranean, organic-modern, traditional, contemporary-minimalist + 7 others); LORA_AUDIT_2026-04-30.md and the V3 LORA_REGISTRY use **10 archetypes** (10 COVA* keys). 9 cells in catalog audit (mediterranean × 6 + traditional + organic-modern overflow) don't have a 1:1 V3 archetype. Phase 2 must collapse 12 → 10, reassign images, and accept residual class imbalance. Open question for phase chat.

**(R5) Heterogeneous `style_blend` keys.** Today: COVA* keys after step-2/3, display names after step-3b. Both pass `resolveCovaKey()` but the data shape is genuinely heterogeneous. Phase 2 should normalize to COVA* keys at all writers and translate to display only at the read site (per QUIZ_AUDIT §8.4). Migration of existing 11 user rows is mechanical.

### 7.2 Process risks

**(P1) Verifier coverage of pattern-class rules.** P01b's lesson #1 (lost 5 spinner sites in S1, caught only by S2's directory-wide grep) applies directly to Phase 2. Quiz-related anti-patterns (raw forbidden style names in source, direct paid-fetch outside `paidCall<>()`, unsafe console logs) need explicit grep queries enumerated in the §13 acceptance checklist for both verifier sessions. The pattern classes Phase 2's verifier must grep:
- `grep -rn 'fetch(.*anthropic.com\|fetch(.*fal.run\|fetch(.*replicate' apps/web/app/api/quiz` → should be 0 (paidCall).
- `grep -rn 'console\.\(log\|error\|warn\|info\|debug\)' apps/web/app/api/quiz` cross-checked against `redactLogPayload` wrapping.
- Forbidden style-name regex (the 6 patterns from `.eslintrc.json`).
- `is_validated = true` filter site (the bug from QUIZ_IMAGES §6.1) — should be removed.
- `phase_b_responses` ignored on V3 path (the bug from QUIZ_AUDIT §1.4 A) — should now feed the posterior.

**(P2) Executor handoff discipline at 93-94% context.** Phase 2 is 6-8 sessions (largest UI milestone). M4 (corpus regen) → M5 (backend) → M6 (UI) is a natural milestone split but a single milestone may overflow one session, especially M5 backend with the Bayesian update + RLS + cost logging. Handoff template proven in P01a + P01b: per-commit `## What was fixed`, lint baseline, tsc/build exit codes, files-changed table, "Verifier session N — please re-check these criteria" table.

**(P3) Decision drift across 3-4 weeks.** D-016/D-017/D-018 are locked but the calendar window is long. Cloud chat must guard against new decision creep during phase chat. Pre-decision halt protocol in PLANNER_PROTOCOL §5.3 catches contradictions; the discipline is to write D-NNN identifiers immediately when a new locked decision emerges, not at phase close.

### 7.3 Schema drift risks

**(S1) `users.style_blend` shape contract.** Today: `Record<string, number>` with mixed key formats. Phase 2 normalizes to `Record<COVAStyleKey, number>` only. Migration (in-place text-substitution on the JSONB) is non-trivial under RLS — service-role required. Affects 11 existing user rows. Must declare data-loss carve-outs in the migration header per `schema-reviewer` rules.

**(S2) `quiz_anchor_images.style_index` constraint.** Loosened to `BETWEEN 1 AND 10` by `20260416_quiz_v3_schema.sql:38-40` but seed never updated to add the 10th row. Phase 2 must insert COVASCANDINAV + COVAFARMHOUSE rows AND remove the stale "Heritage Traditional" row. If Heritage is re-classified to existing archetypes via the multi-label re-tag pass, image storage paths stay the same — only the row metadata changes.

**(S3) Cascade chain integrity.** Any new Phase 2 table (e.g. a `quiz_swipe_log` if `swipe_history` is replaced) must add `user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE` + RLS + `p1_*`-prefix policy. Schema-reviewer subagent enforces.

**(S4) P01a M2 deferred drop tail.** 4 of 11 deferred load-bearing rooms columns are explicitly P2-owned (`personalization_context, capture_photo_urls, capture_mode, video_url`). Phase 2 retires the consumers, then queues the tail migration to P3 to apply. If Phase 2 forgets to retire, P3 either repeats the deferral or breaks production.

**(S5) `style_fingerprints` append-only growth.** 117 rows for 11 users = ~10 retakes/user average. Without dedup/upsert, this grows unbounded. Phase 2 should add unique index `(user_id, room_type)` with upsert behavior, or accept append-only and add a TTL cron.

---

## Section 8 — Recommended Phase 2 phase-chat agenda

Derived from open questions in `cova-plan/phases/P02-quiz.md` §3 (Pre-decisions G1-G10) + QUIZ_AUDIT.md §9 + QUIZ_IMAGES_AUDIT.md §9 + the synthesis above.

The phase chat should walk through these decision points, in this order, BEFORE firing the planner:

1. **G1 — M4 corpus regen scope.** Decision: skip regen (use existing 1,428 useful images post catalog audit + 5 dark inventory rebinds), or full regen (~$1.20 + 3-4 hours). If skip, also decide Sonnet multi-label re-tag pass (yes / no, $0.40-$1.20) and dim-0 anchor pair rebuild (yes / no, $0).

2. **G2 — Sonnet model version.** Lock Sonnet 4.5 vs 4.6 for descriptor calls; document as D-NNN.

3. **G3 — secondary_traits taxonomy.** Planner produces full trait list (~12-15 traits) before M4 curation.

4. **G4 — Memory fragment image source for finishing screen** (style-reveal Phase B). Use chosen cards from 12 picks vs generic editorial.

5. **G5 — Style reveal Phase A Veo clips.** Daksh generates 4 chained Veo 3.1 clips before M6 begins (~$1, ~64MB stored at Cloudflare R2).

6. **G6 — 10 CSS color-grade calibrations.** Tuning during M6 implementation.

7. **G7-G10 — Resume flow, prefetch, leave-modal, max-active-styles.** Already locked per phase doc; phase chat confirms.

8. **Q1 — Keep step-3 swipes at all?** (QUIZ_AUDIT.md §9.1) D-016/D-017 lock 12-pick forced-choice; reaffirm vs revisit. If we keep 12 picks, the Bayesian update wiring is mandatory (not a fast-path early return).

9. **Q2 — How many archetypes (9 vs 10)?** (QUIZ_AUDIT.md §9.2) Reconcile `quiz_anchor_images` constraint (1..10) with seed reality (9 rows + 1 stale Heritage). Lock to 10.

10. **Q3 — Image licensing / provenance.** (QUIZ_AUDIT.md §9.3) Confirm all `quiz-images` are FLUX-1.1-pro / FLUX Kontext renders we generated (per QUIZ_IMAGES_AUDIT §9.6). Optionally write `docs/audit/asset-provenance.md`.

11. **Q4 — Multi-label tagging budget.** (QUIZ_AUDIT.md §9.4) Approve $0.40-$1.50 Sonnet vision spend for re-tag pass. Decide: write to `style_weights jsonb` new column, or shoehorn into existing `style_vector jsonb`. (QUIZ_IMAGES_AUDIT.md §9.1 same question.)

12. **Q5 — `step-3b` route in or out of V3 flow.** (QUIZ_AUDIT.md §9.5) Phase doc and CLAUDE.md disagree; reconcile.

13. **Q6 — `primary_style` / `secondary_style` columns.** (QUIZ_AUDIT.md §9.6) Drop denormalized columns or keep for read convenience?

14. **Q7 — Confidence semantics.** (QUIZ_AUDIT.md §9.7) Compute properly from posterior covariance, or drop the field?

15. **Q8 — `ReturningUserStrip.tsx` / `style_sessions`.** (QUIZ_AUDIT.md §9.8) Planned, alias, or dead?

16. **C1 — Heritage Traditional row.** (QUIZ_IMAGES_AUDIT §9.2) Drop, reclassify via multi-label, or add as 11th archetype?

17. **C2 — Cross-style dim-0 pairs rebuild.** (QUIZ_IMAGES_AUDIT §9.3) Same-room cross-style rebuild via storage path rewrite vs remove from 24-pair set.

18. **C3 — Archetype center re-spacing F-CENTERS.1.** (QUIZ_IMAGES_AUDIT §9.4) Defer to post-launch (recommended) vs block V1.

19. **C4 — `new-pairs/` cold storage.** (QUIZ_IMAGES_AUDIT §9.5) Wire up via DB row insert vs delete.

20. **C5 — PNG/JPEG duplicates in `pairs/dim-0/`.** (QUIZ_IMAGES_AUDIT §9.7) Delete PNG copies (~5 MB freed) vs keep.

21. **C6 — Catalog taxonomy reconciliation.** (Synthesis §7.1 R4) 12-class catalog audit vs 10-class V3 archetype. Define mapping table, accept residual class imbalance.

22. **C7 — `style_blend` key normalization.** (Synthesis §7.3 S1) Migrate 11 existing user rows to COVA* keys; lock writer convention for all 4 quiz routes.

23. **C8 — `swipe_history` populate vs drop.** (Synthesis §6.1) Either start writing each swipe with `dwell_time_ms`, `card_id`, `direction`, `posterior_after` jsonb (per QUIZ_AUDIT.md §8.6 recommendation), or formally drop the table and remove the migration.

24. **C9 — Render integration glue.** (QUIZ_AUDIT.md §8.7) Smallest fix that unblocks the renderer:
    - `app/api/rooms/create/route.ts:42-49` — read `users.style_blend` and include in insert.
    - `app/api/pipeline/redesign/route.ts:171,288` — also `select("style_blend")` from `users` and add to fallback chain.
    - Run `assembleRenderContext` server-side at room creation, persist to `rooms.render_context`.
    Decide: in Phase 2 scope or leave for Phase 3 (the spec says Phase 2 owns `style_blend` end-to-end; suggest in scope).

25. **C10 — `cova-rules/no-unsafe-console` residue cleanup target.** (Section 4.2) Set Phase 2 target: drop residue from 199 to <100, OR commit to no-net-new violations only.

26. **C11 — Deferred P01a M2 column retirement.** (Section 4.2) Plan to retire `personalization_context, capture_photo_urls, capture_mode, video_url` consumers as part of Phase 2 step-6 capture refactor. Sequence the tail migration for Phase 3.

27. **C12 — Verifier prompt requirements.** (Section 7.2 P1) Enumerate the directory-wide grep queries for verifier sessions to run, embedding P01b lesson #1 directly into the §13 acceptance checklist.

28. **C13 — Frontend-visionary subagent invocation count.** (Section 5.2) Plan parallel invocations across each new quiz screen (step-2, step-3 / step-3b new UI, step-4 reveal, mood feed if reintroduced — note D-020 dropped). Budget: ~10 screens × 1 visionary invocation per UI milestone.

After this agenda is walked, the phase doc's Pre-decisions block should have all D-NNN identifiers locked, no contradictions, and Daksh has signed off on each. Planner can then fire.

---

End of context bundle.
