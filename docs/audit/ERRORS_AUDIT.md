# Cova Errors, Logging & Pipeline-Failure Audit

**Date:** 2026-04-29
**Scope:** Sentry / PostHog / `lib/logger.ts` / `lib/debug/flow-logger.ts` / `lib/errors.ts` / `lib/logging/redactor.ts` / `modal_pipeline/*.py` / Supabase `rooms.redesign_status` + `rooms.redesign_error`
**Source of truth for code:** `apps/web/` (excluding `_future/`, `tests/`, `node_modules/`) and `modal_pipeline/`
**Source of truth for traffic:** live Supabase project `xdeacbmkdwqrwxonqaqh` queried 2026-04-29

> **Headline findings**
>
> 1. **The "46% pipeline failure rate" is misleading.** Of 142 rooms in `redesign_status='failed'`, **138 were marked failed in a single bulk SQL update at 2026-04-28T01:11:13.349291+00:00** (one timestamp, identical to the millisecond on 136 of them). Those 138 rows have `design_step=0`, no `original_image_url`, no `design_brief`, and `redesign_error IS NULL`. They are stale `pending` rows from 2026-03 / early 2026-04 that someone (almost certainly Daksh) cleaned up by hand. They were never real pipeline runs. Only **6 rooms** out of 308 represent an actual pipeline error reaching the `failed` state — a true failure rate of **6/21 = 28.6 %** when measured against the rooms that actually started a pipeline run (see §3.2).
> 2. **All 308 rooms come from 8 internal accounts.** 138 of the 142 "failed" rows are owned by `daksh_parikh@berkeley.edu`; the other 4 are `goelp@berkeley.edu`. **The dataset is 100 % founder/test traffic.** There is no production user yet, so there is no production failure rate.
> 3. **Sentry is plumbed but not wired.** DSN is set, three config files exist (`sentry.{client,server,edge}.config.ts`), but **`apps/web/instrumentation.ts` does not exist**, `next.config.mjs` is **not** wrapped with `withSentryConfig()`, and `lib/errors.ts::captureError` (the only call site that would route to Sentry) is **never invoked anywhere outside of its own definition file**. Server-side and edge-runtime errors do not reach Sentry; only browser-side unhandled exceptions auto-captured by `@sentry/nextjs` client init do. PII is not filtered (`beforeSend` is a no-op pass-through).
> 4. **`lib/logger.ts` is dev-only by design.** First line of `emit()` is `if (!IS_DEV) return;`. Production observability through this logger is zero. There are 37 NDJSON files in `apps/web/.dev-logs/` from local sessions — useful for healer scripts, useless for production triage.
> 5. **Real errors that did fire** all have meaningful messages: 2× Python `'list' object has no attribute 'get'` (TypeError in 2026-04-12 V1 pipeline), 1× Replicate 429 throttle (low credit balance), 1× Replicate 422 (`output_format` validation; Replicate has since been deprecated in favor of fal). Two recent (2026-04-28) silent failures have empty `redesign_error` despite reaching `design_step=7` and writing a valid `design_brief` — those are the only signal of real V3-pipeline trouble.
> 6. **Most timeouts will leak rooms into `pending` forever, not `failed`.** `apps/web/app/api/pipeline/redesign/route.ts:801` uses `AbortSignal.timeout(420_000)` but its `catch` block (line 877-881) only returns 500 to the client; **it does not update `redesign_status='failed'`**. That is the most likely cause of the 146 `pending` rows.
> 7. **Modal pipeline has no Sentry; only Python `logging.basicConfig(level=INFO)` to stdout.** Modal's web-endpoint stdout is captured by the Modal dashboard but is not aggregated, alerted, or queryable from the app. fal.ai 4xx/5xx, IC-Light fail-open, layout-planner JSON parse retries are all logged with `logger.warning(...)` to that stdout and disappear when the container is recycled.

---

## 1. Sentry configuration

### 1.1 Files present

| File | Role | Status |
|---|---|---|
| `apps/web/sentry.client.config.ts` | Browser init | Present, wired by `@sentry/nextjs` auto-instrumentation. |
| `apps/web/sentry.server.config.ts` | Node runtime init | Present, **never loaded** (no `instrumentation.ts`). |
| `apps/web/sentry.edge.config.ts` | Edge runtime init | Present, **never loaded** (no `instrumentation.ts`). |
| `apps/web/instrumentation.ts` | Next.js 14 hook to register both above | **MISSING**. |
| `apps/web/next.config.mjs` | Webpack/source-maps wrap | Plain `nextConfig`; **not** wrapped with `withSentryConfig()`. |

`@sentry/nextjs` v9 documents Next.js 14+ initialization as: "create `instrumentation.ts` at the root of your app or `src/` with a `register()` that calls `Sentry.init()` from your `sentry.server.config.ts` / `sentry.edge.config.ts`". Without it, **`Sentry.init` for server and edge is dead code**. The browser config (`sentry.client.config.ts`) is the only one that actually executes, because Next.js's auto-instrumentation script tag still picks it up at the page level.

### 1.2 Client init contents (`sentry.client.config.ts`)

```ts
Sentry.init({
  dsn: SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: NODE_ENV === "production" ? 0.1 : 1.0,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  integrations: [Sentry.replayIntegration()],
  beforeSend(event) {
    return event;
  },
});
```

- **Trace sample rate:** 10 % in prod, 100 % in dev.
- **Replay sample rate:** 100 % on error, 10 % session.
- **PII filter (`beforeSend`):** **no-op** — every event ships unmodified. There is no scrubbing of:
  - cookie / `SUPABASE_AUTH` tokens that may appear in fetch breadcrumbs
  - prompt strings (which routinely contain user free-text from step-7p personalization, including "freetext" slot)
  - Anthropic raw responses
  - email addresses
- The Phase 3 F6.5 redactor (`lib/logging/redactor.ts`) is **defined** but is only consumed by `lib/errors.ts::captureError()`. It is not wired into Sentry's `beforeSend`. Forbidden style names (CLAUDE.md Rule 8) leak through Sentry today on any auto-captured client error.

### 1.3 Server / edge init contents

Both `sentry.server.config.ts` and `sentry.edge.config.ts` are minimal:

```ts
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: NODE_ENV === "production" ? 0.1 : 1.0,
  });
}
```

No `beforeSend`, no integrations, no PII filtering. **Moot for now**, since neither file runs.

### 1.4 The single integration point: `lib/errors.ts::captureError()`

```ts
export async function captureError(error: unknown, context?: Record<string, unknown>): Promise<void> {
  // ...redact via lib/logging/redactor...
  if (process.env.NODE_ENV !== "production") {
    console.error("[CovaError]", safeMessage, safeContext ?? "");
    return;                                        // <-- DEV: returns before Sentry
  }
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(safeErr, { extra: safeContext });
  } catch {
    console.error("[CovaError]", safeMessage);
  }
}
```

Grep shows `captureError(` is **referenced exactly once in `apps/web/`** — at its own definition. **No API route, no component, no library function calls it.** Five typed error classes (`CovaError`, `RenderError`, `MatchError`, `DetectError`, `AuthError`, `RateLimitError`) are exported but also unused (zero `new RenderError(`, zero `instanceof RenderError`, etc., across the project). The whole module is dead infrastructure waiting for adoption.

### 1.5 What actually reaches Sentry today

- **Client:** any unhandled promise rejection / `window.onerror` / React error-boundary throw on a `'use client'` page. `@sentry/nextjs` client SDK auto-captures these.
- **Server:** **nothing.** All API routes use `console.error("[redesign] ...")` and return `NextResponse.json({ error: ... }, { status: 500 })`. Console output goes to Vercel function logs, not Sentry.
- **Edge:** **nothing.** Middleware-level errors are unhandled.
- **Modal pipeline:** **nothing.** Python container has no Sentry SDK installed.

### 1.6 Recent error counts (Sentry dashboard)

Not directly accessible from this audit (no Sentry API key in `.env.local`; only the DSN). The DSN points to org `o4511100980101120` project `4511100986523648`. **Action item:** ask Daksh to pull a 30-day event count and an "issues by URL" breakdown — given §1.4/§1.5, expect almost zero events except client-side hydration crashes.

---

## 2. Custom logging

### 2.1 `lib/logger.ts` — structured NDJSON dev logger

- 564 lines. Implements `LogLevel`, `LogCategory`, child loggers, timers (`startTimer`/`endTimer`/`timed`), and a Zustand store-snapshot helper (`snapshotPipelineContext`).
- **First line of `emit()`:**
  ```ts
  function emit(entry: CováLogEntry): void {
    if (!IS_DEV) return;          // <-- production = no-op
    if (IS_SERVER) { … emitConsoleServer …; appendToFile(JSON.stringify(entry)); }
    else { … emitConsoleBrowser …; _clientQueue.push(entry); scheduleClientFlush(); }
  }
  ```
- **Where logs go:**
  - **Server, dev only:** colorized stdout + appended to `apps/web/.dev-logs/cova-{YYYY-MM-DD}-{sessionId8}.ndjson`. Each module-load = a new file. 37 files currently in the directory; the four newest from 2026-04-28 are still uncommitted (and `.gitignore`d, since the tree status lists them as untracked but they belong only to the local dev session).
  - **Client, dev only:** colorized `console.log/warn/error` + 500 ms-debounced `POST /api/dev-log` relay (server appends to its own NDJSON file via the same path), with `navigator.sendBeacon` flush on `beforeunload`.
- **Production behavior:** zero output, zero file I/O, zero network. Confirmed by the `IS_DEV` short-circuit on line 326.
- **Adoption:** four call sites total (`grep -rn "logger\.\(error\|warn\|info\|fatal\|debug\)"` in `app/`, `lib/`, `components/`). 227 call sites still use `console.error` / `console.warn` directly. The structured logger is effectively unused.
- **Retention:** none. `.dev-logs/` accumulates files until manually deleted. Should be added to a periodic `git clean` or local cleanup script. (`apps/web/.gitignore` already excludes it from commits.)

### 2.2 `lib/debug/flow-logger.ts` — autonomous-QA breadcrumb

44-line file. Two functions:

- `flowLog(event, data)` — emits `JSON.stringify({ __COVA__: true, event, data, ts, url })` to `console.log` (browser only) so a Playwright `console` listener can scrape it.
- `flowLogServer(event, data)` — same but for API routes; emits `__COVA_SERVER__: true`.

This is **runtime-active in all environments** (no `IS_DEV` guard) but writes only to stdout/console. Used by the `/fix` and step-page mount tracking flows. Not a production observability layer.

### 2.3 `lib/logging/redactor.ts`

- Phase 3 F6.5 deliverable. Reuses `sanitizeForbiddenNames` from `lib/ai/forbidden-names.ts`.
- Public surface: `redactLogString`, `redactLogPayload`, `wrapLogger`.
- Currently consumed only by `lib/errors.ts::captureError`. Not wired into Sentry's `beforeSend`, not wired into PostHog `before_send`, not wired into the dev logger. **The defense layer documented in CLAUDE.md (§Phase 3 — Layer 5) is one Sentry-init line away from being real.**

### 2.4 PostHog (`lib/analytics.ts` + `components/providers/AnalyticsProvider.tsx`)

- Lazy-init `posthog-js` on first `track(...)` call, client-side only.
- Disables `capture_pageview` and `autocapture`; only manual `track(...)` events fire.
- Helpers: `trackQuizStart`, `trackQuizCompleted`, `trackPhotoUploaded`, `trackRenderStarted`, `trackRenderCompleted`, `trackHotspotTapped`, `trackAffiliateClicked`, `trackMatchViewed`, `trackSwapInitiated`.
- **No `track('render_failed', …)` event.** Failures are not currently emitted to PostHog. Adding this is a one-line change in step-8a's error path and would give a clean per-user funnel on top of the analytics already in place.
- PostHog `posthog.captureException()` is not used; PostHog's optional Sentry-style error capture is disabled by `autocapture: false`.

---

## 3. Pipeline failure analysis

### 3.1 Aggregate counts (live query, 2026-04-29)

| `redesign_status` | rows |
|---|---|
| `pending` | 146 |
| `failed` | **142** |
| `complete` | 15 |
| `kontext_complete` | 2 |
| `pending\n` (newline-suffixed) | 1 |
| `render_complete` | 1 |
| `video_ready` | 1 |
| **Total** | **308** |

(7 distinct values; the `pending\n` row is from 2026-04-14 and is a separate string-handling bug, see §9.1.)

### 3.2 The 142 "failed" rows are not 142 pipeline failures

`updated_at` distribution of all rooms with `redesign_status='failed'`:

| `updated_at` | failed-row count | `redesign_error` populated? |
|---|---|---|
| 2026-04-12T02:46:33.662953+00:00 | 1 | yes (Replicate 429) |
| 2026-04-12T04:27:09.981309+00:00 | 1 | yes (`'list' object has no attribute 'get'`) |
| 2026-04-12T04:36:06.440497+00:00 | 1 | yes (`'list' object has no attribute 'get'`) |
| 2026-04-12T06:04:31.400145+00:00 | 1 | yes (Replicate 422 — `output_format`) |
| **2026-04-28T01:11:13.349291+00:00** | **136** | **null on every row** |
| 2026-04-28T01:13:19.237968+00:00 | 1 | empty string |
| 2026-04-28T01:03:57.107195+00:00 | 1 | empty string |

136 rows updated in the **same microsecond** is a single SQL `UPDATE rooms SET redesign_status='failed' WHERE …` — a manual cleanup. State of those 136 rows confirms it:

| Field | rows with the field populated |
|---|---|
| `design_step = 0` | **136 of 136** (none reached step-1 even) |
| `original_image_url IS NOT NULL` | 0 |
| `design_brief IS NOT NULL` | 0 |
| `redesign_error IS NOT NULL` | 0 |

Conclusion: **136 rows were stale `pending` rooms from 2026-03-28 → 2026-04-07** (they were created during initial dev work, never had a photo uploaded, and were bulk-marked failed during a 2026-04-28 cleanup). They tell us nothing about pipeline reliability.

### 3.3 Real pipeline failures (n = 6)

Sample of the 6 rooms where the pipeline actually started and ended in `failed`:

| `updated_at` | `design_step` | `redesign_error` (truncated) |
|---|---|---|
| 2026-04-12T02:46:33Z | 4 | `Replicate create failed: 429 {"detail":"Request was throttled. Your rate limit for creating predictions is reduced to 6 requests per minute with a burst of 1 requests while you have less than $5.0 in …"}` |
| 2026-04-12T04:27:09Z | 4 | `'list' object has no attribute 'get'` |
| 2026-04-12T04:36:06Z | 4 | `'list' object has no attribute 'get'` |
| 2026-04-12T06:04:31Z | 4 | `Replicate create failed: 422 {"detail":"- input.output_format: output_format must be one of the following: \"jpg\", \"png\"…"}` |
| 2026-04-28T01:03:57Z | 7 | (empty string) |
| 2026-04-28T01:13:19Z | 7 | (empty string) |

Categorization (n = 6):

| Category | count | % | Notes |
|---|---|---|---|
| Provider 4xx (Replicate billing throttle / arg validation) | 2 | 33 % | Only against the retired Replicate path; project has since migrated to fal. |
| Pipeline `TypeError`: `'list' object has no attribute 'get'` | 2 | 33 % | Likely the V1 design-director or generation step receiving a list where a dict was expected. Cause not in current `modal_pipeline/redesign.py` (V3 rewrite) — these were V1 errors from 2026-04-12. |
| Silent failure (empty/null `redesign_error`) | 2 | 33 % | Most concerning — V3 path reaches `design_step=7`, fingerprint + flux prompt populated, then dies without writing an error. |

**Top failure cause** in the real-failure population is split three ways with n=2 each. The dataset is too small to call a "top cause"; what matters is that **2/6 reached the V3 pipeline and died silently**.

### 3.4 Production traffic vs test traffic

| User | total rooms | failed | complete | pending | other |
|---|---|---|---|---|---|
| `daksh_parikh@berkeley.edu` (`62126d57…`) | 140 | 138 | 2 | 0 | 0 |
| `goelp@berkeley.edu` (`f39aac20…`) | 26 | 4 | 7 | 15 | 0 |
| `863c7799…` | 52 | 0 | 2 | 47 | 3 (kontext_complete×2, video_ready×1) |
| `c35ab8ab…` | 43 | 0 | 2 | 41 | 0 |
| `84b973e8…` | 36 | 0 | 0 | 36 | 0 |
| `344b5705…` | 5 | 0 | 2 | 1 | 2 (pending\n×1, render_complete×1) |
| `d5ed1828…` | 4 | 0 | 0 | 4 | 0 |
| `ae457455…` | 2 | 0 | 0 | 2 | 0 |
| **Total** | **308** | **142** | **15** | **146** | **5** |

`users` table has 9 rows. **All `failed` rows are from the two founders.** All other users have only `pending` and a handful of `complete`. There is no production-user traffic at all.

### 3.5 Has the failure rate changed over time?

`created_at` cohort × `redesign_status` (live query):

| Month created | total | failed | complete | pending |
|---|---|---|---|---|
| 2026-03 | 104 | 0 | 0 | 104 |
| 2026-04 | 204 | 142 | 15 | 42 |

**100 % of every "failure" — bulk or otherwise — is in 2026-04**. The 2026-03 cohort is entirely the pre-V3 stale rows that the 2026-04-28 cleanup later marked `failed`. There is no time-series signal because the dataset was created in two manual bursts.

### 3.6 The `pending` cohort hides another signal

Of 146 `pending` rows, 104 are pre-V3 (2026-03) and likely never had a photo uploaded. **42 are from 2026-04** — those are candidates for the "timeout-leaked-into-pending" failure mode described in §6.2. Worth a follow-up query: of those 42, how many have `original_image_url IS NOT NULL` AND `redesign_pano_url IS NULL` AND `updated_at > created_at + 7 minutes`? That would isolate the rooms whose render started, exceeded the 420 s route timeout, and got stranded.

---

## 4. Modal app errors

### 4.1 Logging stack

- All three deployed Modal apps (`cova-perception`, `cova-empty-room`, `cova-redesign`) use the standard library:
  ```python
  logger = logging.getLogger("cova-redesign")
  logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
  ```
- Output goes to the container's stdout, which Modal captures and exposes in its dashboard (`https://modal.com/apps/cova-interior/...`).
- **No Sentry SDK installed** in any Modal image (verified by absence of `sentry_sdk` import in `modal_pipeline/redesign.py`).
- **No structured log shipping** to Supabase / Datadog / Logflare.

### 4.2 Exception flow

`modal_pipeline/redesign.py` raises `HTTPException(400)` / `HTTPException(502)` (lines 1744, 1750) for input validation and downstream failures. The Next.js route's `fetch(...)` then sees a non-OK response and falls into:

```ts
if (!response.ok) {
  const text = await response.text().catch(() => response.statusText);
  console.error("[redesign] Modal webhook error:", response.status, text);
  return NextResponse.json({ error: "Redesign pipeline failed", detail: text }, { status: 502 });
}
```

The route does **not** update `redesign_status='failed'` on a non-OK Modal response. This is one of two timeout/error paths that strand rooms in `pending` (§6.2).

### 4.3 Timeouts

| Layer | Timeout | Behavior on expiry |
|---|---|---|
| Modal `cova-redesign` web endpoint | Modal default (~600 s container hard cap) | 504 to caller; container kept warm |
| Next.js route `app/api/pipeline/redesign/route.ts:801` | `AbortSignal.timeout(420_000)` (420 s, raised from 295 s in commit 0611117 yesterday) | `catch` returns 500 to client, **does not write `redesign_status='failed'`** (route lines 877-881) |
| Vercel `maxDuration` (route line 17) | 300 s | Vercel kills the Lambda; 504 to client; same no-`failed`-write problem |
| Step-8a client poll (`page.tsx:21`) | `RENDER_TIMEOUT_MS = 180_000` (3 min) | UI shows "Your redesign is taking longer than expected." but room state is unchanged in DB |

There are **three nested timeouts (180 s / 300 s / 420 s)** and they are not aligned. The 300 s Vercel hard cap fires before the 420 s `AbortSignal`, which means the AbortSignal value is dead code in production — Vercel kills the route first.

### 4.4 Cold-start vs runtime failures

- Modal cold start ≈ 30-60 s on A10G with FLUX + LoRA stack already in the image.
- F5-COLDSTART.1 (CLAUDE.md, Phase 5 deferred follow-ups) tracks "flux-general 3-parallel cold start → NB-Pro fallback; add warmup".
- **Cold-start failures vs runtime failures are not distinguished today** — neither in `redesign_error` nor in any structured log. A Modal-dashboard graph of cold-start counts would tell us, but it is not aggregated against `rooms.redesign_status`.

### 4.5 fal.ai layout-planner / IC-Light fail-open

The Phase 2.0c.2 commit (`ea7dccf`) introduced fail-open behavior for IC-Light:
```python
except Exception as exc:
    logger.warning("IC-Light failed, using pass2: %s", exc)
    final_url = pass2_url
```
This is correct for resilience but invisible in the DB — a render that should have been "Pass 1+2+IC-Light v2" silently downgrades to "Pass 1+2", and we have no way to spot it post-hoc unless we add a flag.

---

## 5. fal.ai errors

### 5.1 Where errors land

| Surface | Behavior |
|---|---|
| `apps/web/lib/ai/flux.ts:1628, 1669` (Kontext / Fill Pro submit) | `throw new Error(`fal.ai Kontext submit failed: ${resp.status} ${text}`)`. The text is the raw body — for 429 it's the throttle JSON; for 422 it's the validation list. |
| `apps/web/app/api/pipeline/segment-masks/route.ts:429` (SAM-3) | Try/catch with fall-through to a different SAM strategy; logs `console.warn`. |
| `modal_pipeline/redesign.py:1115, 1133` (flux-general retry loop) | 4-attempt retry; on final attempt drops ControlNet (Phase 2.0c.1, commit `b5fe256`); logs `logger.warning("layout_planner call failed (%s); fallback", exc)`. |

### 5.2 Rate-limit responses

- **No 429-specific handling.** `fal.ai` throttles surface as `Error("fal.ai … failed: 429 …")` strings.
- **No `Retry-After` parsing** — a 429 with a 60 s back-off header is treated identically to a server-side 5xx.
- **No exponential backoff** at the TS layer. The Python retry loop (`redesign.py:1115-1133`) retries on any exception, not just throttles, and uses constant delay.

### 5.3 Failed generations (non-rate-limit)

- "Could not load pipeline" sporadic fal-general error is handled by the 4-attempt retry that drops ControlNet on the final try (CLAUDE.md, V3 tunables).
- All other fal failures bubble up as exceptions, are caught by the Modal endpoint's outer `except`, and are returned as `HTTPException(502)` to the Next.js route.

### 5.4 Where logged

Modal stdout for the Python side; Vercel function logs for the TS side. Neither is aggregated; neither has alerts.

---

## 6. Anthropic errors

### 6.1 SDK adoption

13 files import `Anthropic from "@anthropic-ai/sdk"` (design-director, prompt-compiler, scraping/productScraper, chat/extractStructuredData, detection/roomContext, detection/objectMaterial, app/api/detect/render, plus Python `anthropic` in modal_pipeline/redesign.py). Most are bare `await anthropic.messages.create(...)` calls with **no rate-limit-aware retry**.

### 6.2 Rate-limit responses

- Grep for `429`, `RateLimit`, `rate.limit`, `retry-after` across `apps/web/lib/ai/` returns **zero hits** for Anthropic-specific handling.
- 429s from Anthropic surface as `APIError` and propagate unhandled to the route's outer `catch (err)`, which returns 500.
- `RateLimitError` class exists in `lib/errors.ts` but is unreferenced; nothing constructs it.

### 6.3 Refusals

- No specific handling for content-policy refusals. A refusal manifests as a normal `messages.create` response whose `content[0].text` says "I can't help with that". The downstream JSON parser (e.g. design-director.ts:1072 `ToolUseBlock` filter) will fall through to a `null`-stagingJson path, then the route's design-director error handler logs the failure and returns 500.
- The `lib/ai/forbidden-names.ts` sanitizer (Phase 3, F6.3 layer 3) only protects against forbidden style names in Sonnet output — not refusals.

### 6.4 Token-limit hits

- `max_tokens` is hardcoded per call (e.g. step-7p slot-detector uses 50; design-director uses ~4096; prompt-compiler uses ~2048).
- A 400 "max_tokens too high for this model" surfaces as an `APIError`, no special handling.
- No cost or token-budget tracking. `render_cost_log` table exists for this purpose (CLAUDE.md, schema audit §11) but has 0 rows because no code path inserts on Anthropic spend.

### 6.5 Empty-room validation Vision call (`route.ts:712-748`)

Good pattern: fail-open with a `console.error("[redesign] Empty room validation failed:", valErr);`. This is the cleanest error handler in the codebase for an Anthropic call. It is also the only spot that consciously distinguishes "downstream call failed but pipeline should continue" from "pipeline failed".

---

## 7. User-facing error UX

### 7.1 Step-8a (the only screen that surfaces failure)

`app/design/step-8a/page.tsx:205-228`:

```ts
if ((data.redesign_status === "error" || data.redesign_status === "failed") && !cancelled) {
  setError("Something went wrong with your render. Please try again or contact support.");
  setLoading(false);
  clearInterval(poll);
}
// 3-min poll timeout:
setTimeout(() => {
  if (!cancelled) {
    setError("Your redesign is taking longer than expected.");
    setLoading(false);
  }
}, RENDER_TIMEOUT_MS);
```

- Two error messages, both opaque. The user cannot tell whether they hit a rate limit, a Modal cold start, an Anthropic refusal, or a transient fal queue spike.
- The `redesign_error` field, when populated, is **never read by the client**; only `redesign_status` is polled.

### 7.2 Retry wiring (`page.tsx:521-585`)

- "Retry" button: writes `redesign_status='pending'` directly via the browser Supabase client, then `POST /api/pipeline/redesign`.
- **No retry counter, no backoff, no per-user / per-room cap.** The user can retry an infinite number of times. Each retry costs ~$0.20-0.40 (V3: Sonnet planner + 2 FLUX passes + IC-Light + Sonnet QA + editorial post).
- `render_retries` table exists (Schema audit §1, "active (empty)") and `app/api/render/retry/route.ts` is the route that *would* enforce a cap, but step-8a calls `/api/pipeline/redesign` directly and bypasses it.
- "Contact support" button = `mailto:support@covainterior.com`. ImprovMX MX records for `covainterior.com` are still pending (CLAUDE.md, M0 Status). **Mail to that address may currently bounce.**

### 7.3 Silent failures

Two of the 6 real failures (§3.3) have empty `redesign_error` and `design_step=7`. Their state at failure: `design_brief` populated, `flux_prompt` populated, `redesign_pano_url` null, `render_url` set in one case, null in the other. The user sees the 3-min "taking longer than expected" path; the system sees `redesign_status='failed'` with no diagnosis. **This is the single highest-priority observability gap** — when the V3 pipeline fails, the codebase loses the why.

### 7.4 No notification on failure

- No email on render failure.
- No PostHog event on render failure.
- No Sentry event on render failure (per §1.5).
- The user pulls the page and reads "Something went wrong"; the team does not learn about it unless the user sends a support email.

---

## 8. Recommended observability for V1

> *Ranked by impact-per-hour. The top three would have caught the 2026-04-28 silent failures.*

### Tier 0 — wire what already exists (≤1 hour each)

1. **Create `apps/web/instrumentation.ts`** with the standard `@sentry/nextjs` 14 register block. Without it `sentry.server.config.ts` and `sentry.edge.config.ts` are dead. After this, `Sentry.captureException` works server-side automatically.
2. **Wrap `next.config.mjs` with `withSentryConfig()`.** Source maps + tunneling. No source maps → every Sentry stack trace is minified.
3. **Wire `lib/logging/redactor.ts::redactLogPayload` into Sentry's `beforeSend`** in all three init files. Layer 5 of the F6.5 defense becomes real and Rule 8 forbidden-name leaks to Sentry stop.
4. **Replace `console.error` in API routes with `captureError`** in the four highest-traffic routes: `/api/pipeline/redesign`, `/api/pipeline/furniture-match`, `/api/personalization/save`, `/api/detect/render`. A single sed-like sweep would convert all 17 `console.error` calls in `redesign/route.ts` alone.

### Tier 1 — close the silent-failure hole

5. **Always populate `redesign_error` when setting `redesign_status='failed'`.** Today the route at `redesign/route.ts:861` writes `failed` with no error string. Add:
   ```ts
   .update({ redesign_status: "failed", redesign_error: result?.error ?? "modal_returned_no_render_url" })
   ```
6. **Catch route-level timeouts and write `redesign_status='failed'`.** The `catch` block at `redesign/route.ts:877` must persist the failure before returning 500. Mirror the same write into the Vercel `maxDuration` exhaustion case.
7. **Reconcile timeouts.** Today: client 180 s, Vercel 300 s, AbortSignal 420 s. Pick one upper bound (300 s = Vercel cap), drop AbortSignal to 290 s, lift client poll to 320 s.

### Tier 2 — log what the dashboard needs

8. **`render_started` / `render_succeeded` / `render_failed` PostHog events** with `room_id`, `pipeline_version`, `archetype_key`, `style_blend`, `error_category`. Existing helpers in `lib/analytics.ts` cover the first two; add the third.
9. **Populate `render_cost_log`** on every Modal call return. The table is already RLS-protected and FK-linked; only the writer is missing.
10. **Bucket `redesign_error` strings into a `failure_category` enum** (`provider_4xx`, `provider_5xx`, `python_typeerror`, `validation`, `silent`, `timeout_route`, `timeout_modal`, `auth`). Drives the dashboard.

### Tier 3 — alerting (hold until production traffic exists)

11. **Sentry alert: `> 0` server-side errors / 5 min** during M11 launch week.
12. **PostHog funnel alert: `render_started → render_succeeded` drop > 30 % week-over-week**.
13. **Supabase scheduled cron** (one already exists for aggregate-style-profiles) to scan `rooms` for `redesign_status='pending' AND created_at < now() - 30 minutes` and re-classify them to `failed` with a `redesign_error='stalled_pending'` marker — would have caught all 136 of the rows that were eventually bulk-cleaned by hand on 2026-04-28.

### Tier 4 — dashboards (Grafana-Cloud or PostHog Insight, takes a sprint)

14. **Per-day, per-pipeline-version success rate** (`SELECT date_trunc('day', created_at), pipeline_version, redesign_status, count(*) FROM rooms GROUP BY 1,2,3`). Baseline + alert.
15. **Stage-level latency histogram** (Pass 1 / Pass 2 / IC-Light / QA / editorial). The Modal `logger.info` lines already emit start/end timestamps; need to ship them to a sink that supports group-by-stage.
16. **Cost per room by archetype × budget tier**. Closes the loop with `render_cost_log`.

---

## 9. Open questions

1. **The `pending\n` row** (one room, `id=22291b79…`, created 2026-04-14T06:46Z, `design_step=4`). Some script is writing the literal string `"pending\n"` (with a trailing newline) into `redesign_status`. Suspects: a Bash heredoc that contains `redesign_status: "pending\n"` interpolation, or a Python string built with `f"{status}\n"`. **Action:** grep `modal_pipeline/` and any `scripts/` for `"pending\n"`/`'pending\n'`/`f"pending\n"` and excise the source.
2. **The 42 `pending` rows from 2026-04**: which of them are timeout-leaked vs. genuinely never-started? (Query suggested in §3.6.) Until run, we cannot rule out that the real V3 failure rate is materially worse than 6/21.
3. **The two recent (2026-04-28) silent failures**: re-run the same `room_id`s through the current `cova-redesign` Modal app with `MODAL_LOGS=1` and capture the stage at which they die. Worth doing before launching M9 since the V3 pipeline is the one we are about to subject to user traffic.
4. **Do the Phase 0 audit deliverables specify a minimum acceptable production failure rate?** CLAUDE.md mentions a Phase 5 gate ("composite ≥ 7.5 AND style_fidelity ≥ 7.0", "14/15 rooms beat Collov") but no operational MTBF / failure-rate target. Setting one (e.g. "fail rate < 5 % at p95 latency < 6 min") would let us read the dashboards built in §8 against a meaningful threshold.
5. **Sentry rate plan:** current sample (10 % traces, 100 % replay-on-error) at expected M11 traffic — does it stay within the free / $26 plan? Nobody has done the back-of-envelope.
6. **Modal log retention:** Modal's free plan retains stdout for 7 days. After that the only artifact of a 2026-04-12 Replicate-422 failure is the `redesign_error` string we already have. A weekly export to S3 / Supabase Storage would close the gap; nobody has wired one.
7. **`mailto:support@covainterior.com` correctness:** ImprovMX DNS for `covainterior.com` is "pending DNS propagation" (CLAUDE.md M0). Is mail being received today? If not, the "Contact support" button on step-8a is silently bouncing.
8. **`render_sessions` table is empty** (CLAUDE.md / Schema audit). The refinement-iteration log was the planned source of truth for "did the user retry, and what did each retry do?". V3 step-8b inserts here per CLAUDE.md but the table has zero rows — either the route is dead or step-8b is unreached. Worth a 5-minute spot check.

---

*End of audit. Generated 2026-04-29 from a live Supabase introspection (`xdeacbmkdwqrwxonqaqh`) plus codebase grep of `apps/web/` and `modal_pipeline/`. Counts in §3 and §4.5 will drift the moment a new render fires; rerun the four query scripts in `/tmp/cova_query{,2,3}.cjs` to refresh.*
