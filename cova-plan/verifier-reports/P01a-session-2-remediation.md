# P01a verifier session 2 — REMEDIATION re-verify

**Date:** 2026-05-02
**Mode:** session-2 remediation re-verify (observation only; no self-heal)
**Source spec:** `cova-plan/phases/P01a-demolition-ops.md`
**Scope:** §13 acceptance criterion #12 ONLY (Sentry on all runtimes — `withSentryConfig` wrap)
**Remediation commit under review:** `0437fc9` — "fix(p01a): wrap next.config.mjs with withSentryConfig for sourcemap upload (verifier session 2 finding)"

---

## Criterion #12 — exact wording (quoted from `P01a-session-2.md`)

From the §13 results table:

> | 12 | Sentry on all runtimes | PARTIAL | `apps/web/instrumentation.ts` (loads server + edge configs); all 3 sentry config files exist with sample rates (client: traces 0.1/1.0, profiles 0.05, replaysOnError 0.5, replaysSession 0.0; server: traces 0.1/1.0, profiles 0.05; edge: traces 0.05/1.0). **`next.config.mjs` is NOT wrapped with `withSentryConfig`** — sourcemap upload missing. Spec §10 + §13 requires the wrap. Documented as "low priority, deferred to before P12" only in `auto-evidence/P01a/INDEX.md` — no back-bug file. See "New findings" #1 |

Finding #1 expanded:

> **Spec source:** §10 step ("`next.config.js` wraps with `withSentryConfig` (sourcemaps upload on deploy)") and §13 row "Sentry on all runtimes" implicitly requires this for full criterion satisfaction.
> **Recommendation:** (a) add the wrap in P01a remediation (10-line edit) … OR (b) file a proper back-bug.

Round-2 routing chose option (a).

---

## Per sub-step results

### Sub-step 1 — Read `apps/web/next.config.mjs`

**Observed:** File at `/Users/daksh/Desktop/cova/apps/web/next.config.mjs` was read in full (80 lines).
**Result:** PASS (file is present and readable).

### Sub-step 2 — `withSentryConfig` imported from `@sentry/nextjs`

**Observed:** Line 1 of `next.config.mjs`:
```js
import { withSentryConfig } from "@sentry/nextjs";
```
**Result:** PASS.

### Sub-step 3 — Default export wrapped with `withSentryConfig(nextConfig, { ... })`

**Observed:** Lines 72–79:
```js
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  hideSourceMaps: true,
  disableLogger: true,
});
```
The default export is `withSentryConfig(nextConfig, {...})`, not the bare `nextConfig`.
**Result:** PASS.

### Sub-step 4 — Required keys in second-arg config

| Required key | Observed value | Status |
|---|---|---|
| `org: process.env.SENTRY_ORG` | line 74: `org: process.env.SENTRY_ORG` | PASS |
| `project: process.env.SENTRY_PROJECT` | line 75: `project: process.env.SENTRY_PROJECT` | PASS |
| `authToken: process.env.SENTRY_AUTH_TOKEN` | line 76: `authToken: process.env.SENTRY_AUTH_TOKEN` | PASS |
| `hideSourceMaps: true` | line 77: `hideSourceMaps: true` | PASS |
| `silent: true` | line 73: `silent: true` | PASS |
| `disableLogger: true` | line 78: `disableLogger: true` | PASS |

All 6 required keys are present with the spec'd values / shape.
**Result:** PASS.

### Sub-step 5 — `npm run build` exits 0

**Command:** `cd /Users/daksh/Desktop/cova/apps/web && npm run build`
**Exit code:** `0` (`BUILD_EXIT=0`).
**Build status:** `✓ Compiled successfully`. All 86 routes prerendered/registered as expected; no Sentry-related errors.

Sentry plugin behavior observed in build output:
- `[@sentry/nextjs] DEPRECATION WARNING` about renaming `sentry.client.config.ts` → `instrumentation-client.ts` (advisory, non-blocking; Turbopack future-proofing).
- `warn - It seems like you don't have a global error handler set up. It is recommended that you add a global-error.js file with Sentry instrumentation…` (advisory; not part of criterion #12).
- No source-map upload error (expected — `SENTRY_AUTH_TOKEN` is unset in local env, so the plugin silently skips upload at build time. At Vercel deploy with the env vars set, the wrap will trigger upload.).

The deprecation warning and global-error advisory are out-of-scope for criterion #12 (which only requires the wrap + sample-rates, both confirmed). They are reasonable follow-ups for a separate phase.
**Result:** PASS.

### Sub-step 6 — `cova-plan/auto-evidence/P01a/INDEX.md` reflects the change

**Observed:** Line 26 of `INDEX.md`:
> | `next.config.mjs` withSentryConfig wrap (sourcemap upload) | ✓ COMPLETE (verifier session 2 finding) | `apps/web/next.config.mjs` — `withSentryConfig(nextConfig, { silent, org, project, authToken, hideSourceMaps, disableLogger })`; build exits 0 with creds-at-deploy-time warning |

INDEX.md now lists the wrap as `✓ COMPLETE (verifier session 2 finding)`, names the file path, lists all 6 second-arg keys, and notes the build exit status. This is a faithful and traceable reflection of the remediation.
**Result:** PASS.

---

## Final verdict on §13 criterion #12

**PASS.**

The session-2 finding is fully resolved at HEAD:
- `next.config.mjs` imports `withSentryConfig` from `@sentry/nextjs`.
- Default export is wrapped, with all 6 required second-arg keys present.
- `npm run build` exits 0 with `✓ Compiled successfully`.
- `auto-evidence/P01a/INDEX.md` row 26 records the change.

Criterion #12 (Sentry on all runtimes including sourcemap upload wrap) now meets full §13 acceptance — no longer PARTIAL. Sample rates from the original session-2 evidence (client traces 0.1/1.0, profiles 0.05, replaysOnError 0.5, replaysSession 0.0; server traces 0.1/1.0, profiles 0.05; edge traces 0.05/1.0) were not re-checked here per the "single criterion" scope, but were already PASS-status in session-2 — only the wrap was missing, and it is now present.

Out-of-scope advisory follow-ups (NOT part of criterion #12, NOT blockers):
- Sentry deprecation: rename `sentry.client.config.ts` → `instrumentation-client.ts` for Turbopack compatibility.
- Add `app/global-error.js` with Sentry instrumentation for App Router render errors.

These are appropriate as a future P-prefix back-bug or as a Phase 9/M9 polish item; they do not block P01a closure.

---

## Files referenced (absolute paths)

- `/Users/daksh/Desktop/cova/apps/web/next.config.mjs`
- `/Users/daksh/Desktop/cova/cova-plan/verifier-reports/P01a-session-2.md`
- `/Users/daksh/Desktop/cova/cova-plan/auto-evidence/P01a/INDEX.md`
- `/tmp/p01a-build.log` (build log; `BUILD_EXIT=0`)
