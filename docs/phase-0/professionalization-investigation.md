# Phase 0 — Professionalization DISABLED Contradiction Investigation

**Date:** 2026-04-19
**Investigator:** Claude (Phase 0 Prompt 3)
**Files in scope:**
- `modal_pipeline/professionalization.py`
- `modal_pipeline/redesign_pipeline.py`
- `docs/audit/modal.md` (prior audit flagged this)

## Code analysis

### professionalization.py

**Header comment (lines 1–5, verbatim):**

```python
# DISABLED 2026-04-13: FLUX img2img cannot do targeted cleanup.
# Professional quality achieved via:
# - Design director staging script (Session 4)
# - Unsplash IP-Adapter references (Session 5)
# - Main generation at strength 0.85 overrides input clutter
```

**Does the entry point short-circuit?** **No.** `professionalize_room()`
(lines 158–287) runs the full FLUX Kontext img2img pipeline through fal.ai:
downloads the image, estimates messiness, picks adaptive strength (0.30–0.35),
calls `fal_client.subscribe("fal-ai/flux-general/image-to-image", …)`,
uploads the result to Supabase, and writes `rooms.professionalized_image_url`.

The only partial bypass is a quality gate (line 224):
```python
if not needs_professionalization(img_bytes):
    return preprocessed_image_url
```
`needs_professionalization` skips generation when `mean_brightness >= 130 AND
contrast >= 40` — i.e. already well-lit images short-circuit to the input URL.
Dark or low-contrast images still hit fal.ai at full cost.

**Feature flags / env-var gates:** None. There is no `if os.environ.get("ENABLE_PROFESSIONALIZATION")` or similar. The only conditional is the brightness/contrast gate above.

**Last git activity on this file:**
- Commit `1502118` — **2026-04-15 19:43:50 -0700** — "Phase 4: Design Director
  Kontext-optimized prompts, floor preservation, removal target structure"
  - **Two days _after_ the `# DISABLED 2026-04-13` comment was added.**
  - Tuned adaptive strength values down (0.45/0.55/0.63/0.72 → 0.30/0.35/0.35/0.35)
    "to preserve room identity for downstream FLUX Kontext Pro editing."
  - Added prompt lines about preserving colors/positions/layout.
- Commit `a9933cc` — earlier "phase 0-5" bulk commit (file origin).

### redesign_pipeline.py

**All references to professionalization** (line numbers):

| Line   | What                                                         |
| ------ | ------------------------------------------------------------ |
| 10, 11 | Docstring lists Stage 2 = Professionalize                    |
| 16–17  | Stage-3-skip logic keyed on `professionalized_before_depth`  |
| 77     | Docstring "Runs preprocessing → structural → professionalization → generation" |
| 203–242 | **Stage 2 call site** — the live orchestrator call          |
| 244–277 | Stage 3 takes `professionalized_url` as depth/edge source    |
| 365    | Stage 4 generation receives `professionalized_photo_url=…`   |
| 478    | Status enum includes `professionalizing`                     |

**Call site detail (lines 215–227):**

```python
prof_fn = _modal.Function.from_name(
    "cova-professionalization", "professionalize_room"
)
professionalized_url = prof_fn.remote(
    preprocessed_url,
    preprocessed_url,   # depth fallback
    preprocessed_url,   # edge fallback
    room_id,
    removal_target_count=remove_count,
)
```

Hits Modal app **`cova-professionalization`**, function
**`professionalize_room`**. Payload is the preprocessed Supabase URL (used as
its own depth/edge fallback since those haven't been extracted yet), the room
id, and a `remove_count` int. The response is a URL; orchestrator writes it to
`rooms.professionalized_image_url` and passes it downstream as the source for
depth/edge extraction and generation.

**Graceful fallback on failure (lines 240–242):**

```python
except Exception as prof_err:
    print(f"[orchestrator] Stage 2 FAILED — using preprocessed as fallback: {prof_err}")
    professionalized_url = preprocessed_url
```

Yes — if the Modal function raises (e.g. app undeployed, timeout), the
pipeline falls through to the preprocessed URL and keeps going. **This means
the pipeline would appear to work fine even if the Modal app were removed
entirely**, with only a warning in the logs.

**Feature flags / env vars gating the call:** None. The call is unconditional
except for the `professionalized_url` idempotency check (skip if already
written to DB).

### Summary of the contradiction

The `# DISABLED 2026-04-13` comment asserts the file is off. But:

1. The entry point does full, expensive work (FLUX img2img on fal.ai).
2. The orchestrator calls it on every render.
3. **The file was actively tuned two days _after_ the "DISABLED" date** —
   strength values were lowered in commit `1502118` (2026-04-15) to make the
   pass more conservative, not to disable it. A developer editing live code
   contradicts the comment's claim.
4. The orchestrator has no feature flag to bypass it; only a try/except
   fallback that hides undeployed-app failures silently.

## Production state determination

**Investigation path: Path C (code-only reasoning).**

Reason: This worktree has no authenticated access to the Modal dashboard, no
ability to trigger live test renders against the deployed orchestrator from
here, and the $1 budget for Path B doesn't justify firing a multi-stage live
render just to read one log line. Path A is preferred but must be completed
by a human with dashboard access.

### The three possible states

#### State 1 — Running (Modal app deployed, comment is stale)

**What it would mean:** `cova-professionalization` is live. Every render pays
for a FLUX Kontext img2img call at fal.ai (minus quality-gate skips for
well-lit images).

**Evidence that would confirm it:**
- Modal dashboard shows `cova-professionalization` deployed with recent invocations.
- Render logs contain `[prof] fal.ai output: …` lines.
- fal.ai usage dashboard shows ongoing `flux-general/image-to-image` calls.
- `rooms.professionalized_image_url` column is non-null for recent rooms.

**Evidence already on hand pointing this way:**
- Commit `1502118` on 2026-04-15 (two days after "DISABLED") tuned live
  generation parameters. Nobody tunes a dead function.
- `docs/audit/modal.md:11` already lists `cova-redesign-pipeline` as **ACTIVE**
  and the orchestrator unconditionally calls professionalization.

#### State 2 — Deployed no-op (app live but returns input unchanged)

**What it would mean:** The Modal app is deployed and responds fast, but
`professionalize_room` returns `preprocessed_image_url` unchanged without
doing fal.ai work.

**Evidence that would confirm it:**
- Modal dashboard shows deployment + recent invocations with consistent short runtimes (<5s).
- fal.ai usage for `flux-general/image-to-image` is zero.
- `rooms.professionalized_image_url` rows match the preprocessed URLs exactly.

**Why unlikely given the code:** there is no early-return in the function
body other than the brightness/contrast gate. For a room captured under
typical indoor lighting (`mean_brightness < 130` is easy to hit), the full
generation path runs. A pure no-op would require a code change that isn't
present.

#### State 3 — Undeployed / silently failing

**What it would mean:** `cova-professionalization` was never deployed (or was
deleted). Every render's Stage 2 throws a `NotFound` error, the orchestrator
logs it, and falls through via the try/except on lines 240–242.

**Evidence that would confirm it:**
- `modal app list` does not show `cova-professionalization`.
- Render logs contain `[orchestrator] Stage 2 FAILED — using preprocessed as fallback: …`
- `rooms.professionalized_image_url` is always null (or equals preprocessed URL
  only because Stage 2 also updates nothing when it fails).

**Why plausible:** the DISABLED comment suggests someone decided this step was
wrong. If the deploy was never refreshed after the comment was added, every
render would be silently falling back — with zero cost but broken telemetry.

### Best-available inference (still Path C)

Based on code evidence alone, **State 1 (running) is most likely**:
- Recent (2026-04-15) live tuning of strength values.
- Orchestrator code path is the critical redesign flow; an always-failing
  Stage 2 would have been noticed by now.
- The audit doc (`docs/audit/modal.md`) tags this as "may be deployed but
  possibly no-ops in practice" — its author also did not confirm.

But **confirming this requires Modal dashboard access**. Do not act on
State 1 blindly.

## Recommendation

**State: likely State 1 (running), unconfirmed.**

**Do NOT apply a code fix yet.** The right next step is 15 minutes on the
Modal dashboard, not a code change. Actions differ by a factor of 10× in
scope depending on which state is true:

- If State 1: decide policy (keep + document, or remove call + mark dormant).
  Per-render cost estimate: ~$0.035–0.05 on fal.ai for one FLUX img2img call
  at 15 steps, plus Modal CPU time. Across all renders this adds up — worth
  a deliberate decision, not a silent inheritance.
- If State 2: $0 savings, but remove the wasted orchestration hop and mark
  dormant.
- If State 3: $0 savings, but remove the broken call and mark dormant so
  the orchestrator stops logging spurious failures.

**Recommended follow-up to determine state (hand off to human with Modal access):**

1. `modal app list | grep cova-professionalization` — confirms deploy presence.
2. Modal dashboard → `cova-professionalization` → invocations last 7 days.
   Runtime distribution will distinguish State 1 (20–40s, GPU-ish) vs State 2
   (<5s).
3. fal.ai dashboard → filter `flux-general/image-to-image` for last 7 days.
   Non-zero usage confirms State 1.
4. Spot-check `rooms.professionalized_image_url` on 5 recent rooms: does it
   differ from `preprocessed_image_url`? Different = State 1; same = State 2
   or State 3.

Once the state is known, the code action is trivial:
- State 1 + keep → replace `# DISABLED 2026-04-13` header with a real
  docstring; note the tuning history and the cost-per-render.
- State 1 + remove, State 2, or State 3 → delete the Stage 2 block in
  `redesign_pipeline.py` and the `professionalized_image_url` dependency in
  Stage 3/4, then mark `professionalization.py` `# DORMANT` per the Phase 0
  pattern. Preserve the file.

**Action in this prompt: commit the investigation doc only. Skip
Commit Checkpoint 2.**
