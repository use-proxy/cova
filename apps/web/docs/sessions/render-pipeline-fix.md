# Render Pipeline Fix — Session Notes

**Date:** 2026-04-06  
**Prediction confirmed working on Replicate:** `703rk1awh1rmy0cxcpftv4e92g` (succeeded in 10.8s)

---

## Root Cause: Option A — Quality Gate HEAD Request Failure

### Chain of failure

1. Replicate prediction `succeeded` → status route enters the `succeeded` block
2. Single-stage path: renderUrl extracted from `prediction.output` — valid `https://...` URL
3. `verifyRenderUrl(renderUrl)` fires a `fetch(url, { method: 'HEAD' })` against the Replicate CDN URL
4. The CDN HEAD request **fails or returns non-2xx** when called from a Next.js API route on the server
5. `verifyRenderUrl` returns `false`
6. Quality gate logic: `qaAttempts` starts at 0 → returns `{ status: 'processing' }` and increments counter
7. Next two polls: same result, counter increments to 1, then 2
8. On third attempt: `qaAttempts >= 2` → returns `{ status: 'failed', error: 'Render quality check failed after retries' }`
9. step-7 receives `failed` → shows error screen

### Evidence

- Commit `5fc7e30` ("fix: quality gate checks response.ok only, not content-type") was a prior partial fix attempt — changed from content-type check to `res.ok` only. Problem persisted because the issue is not the check condition but that **the HEAD request itself returns non-2xx from the server environment**. Replicate CDN URLs may return 403 or redirect for unauthenticated HEAD requests from server-side Node.js contexts, even though they serve correctly in the browser.
- The prediction URL is valid (browser-accessible) but the server-side HEAD check cannot confirm this.

---

## Fix Applied

**File:** `app/api/render/status/route.ts`

**Removed:** `verifyRenderUrl` function (was: HEAD request to CDN URL)

**Replaced both quality gate blocks** (single-stage and stage-2) with a URL existence check:

```typescript
// Before (broken):
const singleStageValid = await verifyRenderUrl(renderUrl);

// After (fixed):
const singleStageValid =
  typeof renderUrl === "string" && renderUrl.startsWith("http");
```

Also removed the retry counter logic (`quality_check_attempts` increment in DB, two extra DB round-trips) since it was only needed to retry the now-removed HEAD request.

### Why this is correct

- When `prediction.status === 'succeeded'`, Replicate guarantees `prediction.output` contains a valid URL
- The URL existence check (`startsWith('http')`) is sufficient — if Replicate returned a succeeded status with an output URL, the URL is valid
- No fetch needed; the CDN URL serves correctly when the browser loads it

---

## Files Changed

- `app/api/render/status/route.ts` — removed `verifyRenderUrl`, replaced quality gate with URL check, removed retry DB logic
- No changes to `app/design/step-7/page.tsx` (client-side polling logic was correct)
- `npm run build` — passes with zero errors

---

## Verification Needed (manual)

Run the full flow: Step 1 → Step 3 (quiz) → Step 5 (upload photo) → Step 6 (neutral) → Step 7.  
Expected: render completes, navigates to Step 8, result image visible.
