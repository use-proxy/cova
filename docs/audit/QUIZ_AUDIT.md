# Cova Style Quiz — Diagnostic Audit

**Date:** 2026-04-29
**Scope:** Full audit of the style quiz feature (UI, algorithm, assets, persistence,
integration with the V3 render pipeline) prior to redesign.
**TL;DR root cause:** The 24-pair swipe phase in `step-3` is **computationally
inert** — the API takes a "V3 fast path" that derives the fingerprint from the
3 anchor questions in `step-2` and **silently discards every swipe response**.
On top of that, the redesign route **never reads `users.style_blend`**, and
`rooms.create` doesn't seed `rooms.style_blend`, so even when the quiz produces
a usable blend, the renderer often falls back to `"Balanced Contemporary"`.

---

## 1. Quiz UI Inventory

### 1.1 Routes (V3 active flow)

Per `apps/web/CLAUDE.md` the V3 user flow is:
`/auth → step-1 → step-2 (anchors) → step-3 (12-pair quiz) → step-4 (reveal) → step-5 (budget) → step-6 (photo)`.

In code, the actual quiz spans **four** screens:

| Route | File | Purpose |
| --- | --- | --- |
| `/design/step-2` | `apps/web/app/design/step-2/page.tsx` (392 lines) | Room-type pick + 3 anchor questions (Q1 Nature/Structure, Q2 Warm/Cool, Q3 Refined/Bold) → posts `anchor_prior` to fingerprint API |
| `/design/step-3` | `apps/web/app/design/step-3/page.tsx` (840 lines) | 24-pair pairwise swipe + 3 non-visual questions; `COMPLETION_ROUTE = "/design/step-3b"` (line 57) |
| `/design/step-3b` | `apps/web/app/design/step-3b/page.tsx` (289 lines) | Confirm/adjust the computed blend with sliders; **only** writer of `users.style_blend` from the user-controlled UI (line 150) |
| `/design/step-4` | `apps/web/app/design/step-4/page.tsx` (1117 lines) | Fingerprint reveal (radar, particles), preview render, "tweak" free-text refinement |

### 1.2 Components

`apps/web/components/quiz/`:

- `CardStack.tsx` (237 lines) — Tinder-style 3-card stack; calls `/api/quiz/next-card` for cards and `/api/quiz/confidence` for live scoring. **`/api/quiz/confidence` does not exist in the route tree.**
- `SwipeCard.tsx` (122 lines) — Individual card with pointer-event drag (38% width or 0.5 px/ms threshold; ±15° rotation; gold/red edge glow).
- `ConfidenceBar.tsx` (37 lines) — 2 px gold-on-navy progress with three labels ("Learning your style…", "Almost there…", "Style captured ✓").
- `ReturningUserStrip.tsx` (123 lines) — Horizontal carousel of past `style_sessions` with checkmark selection.

**Important: the V3 quiz in `step-2`/`step-3` does NOT use `CardStack`/`SwipeCard`.** Those are quasi-orphaned — only `step-3` references the swipe pattern, and it implements the A/B picker inline with `<button>` tags backed by `background-image`. The Tinder-style stack components are still imported in tests/healers but not wired into the live flow.

### 1.3 States

`step-3` Phase enum (line 65–74): `room_type` → `anchors` → `non_visual` → `pairs` → `compute`. There is a fast-path: if a fingerprint already exists from `step-2` and `blendRatio >= 0.72 && competingStyles.length <= 1`, `step-3` jumps straight to `compute` (line 69), so users with a "decisive" anchor selection **never see the swipe phase at all**.

`step-3b` modes (line ~50): `confirm` (display + "feels right" / "Adjust" buttons) and `adjust` (sliders renormalised on change).

### 1.4 What's broken

| # | Symptom | File / line |
| --- | --- | --- |
| **A** | 24-pair swipe phase is dead code: server ignores `phase_b_responses` whenever `anchor_prior` is set | `apps/web/app/api/quiz/fingerprint/route.ts:913` |
| **B** | `rooms.style_blend` is never seeded from `users.style_blend` at room creation | `apps/web/app/api/rooms/create/route.ts:42-49` |
| **C** | Redesign route reads `users.style_fingerprint` but **not** `users.style_blend` | `apps/web/app/api/pipeline/redesign/route.ts:171, 288` |
| **D** | `swipe_history` table has RLS, schema, and seed scripts but **zero production writers** | grep `\.from\("swipe_history"\)` finds only `tests/security/rls-negative.test.ts` |
| **E** | `/api/quiz/confidence` is fetched by `CardStack.tsx:118` but no such route exists | dead endpoint |
| **F** | V2 fingerprints (no `anchor_prior` path) get `style_blend = undefined` from assembler | `apps/web/lib/ai/renderContext/assembler.ts:104` |
| **G** | "Test bypass" leaks service-role token check into prod-like envs (rate-limited but eyebrow-raising) | `redesign/route.ts:112-127` |
| **H** | `step-2` `Q3_FIXED_STYLES` = Art Deco + Industrial + Q1/Q2 winners — only 4 of 10 archetypes can ever win Q3, biasing priors | `step-2/page.tsx` (computePrior, lines 52-84) |

**Visuals are not the failure mode.** The components are polished (gold #C9A84C, navy #0A1628, EB Garamond + Inter, 200–600 ms cubic-bezier transitions, particle reveal in step-4). The breakage is downstream of pixels.

### 1.5 Documentation

`docs/audit/director.md`, `docs/phase-3/`, `docs/phase-5/CLOSEOUT.md` reference the quiz in passing. There is **no quiz-specific design doc**, no flow diagram, no spec for what `users.style_blend` should look like end-to-end.

---

## 2. Quiz Algorithm

### 2.1 Three implementations, only one is live

| Implementation | File | Status |
| --- | --- | --- |
| V1 12-dim quiz | older code, partially deleted | dead |
| V2 6-dim entropy + response-time engine (compiled fingerprint, multi-factor confidence) | `apps/web/app/api/quiz/fingerprint/route.ts:264-864`, `apps/web/lib/ai/style-match.ts`, `apps/web/app/api/quiz/next-pair/route.ts` | **dormant** — code path runs only when `anchor_prior` is absent |
| V3 12-dim Bayesian "fast path" | `route.ts:913-996` (V3 branch); `apps/web/lib/quiz/bayes.ts`; `apps/web/lib/quiz/style-archetypes.ts:179-209` (`fingerprintToStyleBlend`) | **live** — used whenever `anchor_prior` is present |

### 2.2 What actually runs in production

`step-2/page.tsx:181-196` posts to `/api/quiz/fingerprint` with `anchor_prior` derived from the 3 anchor questions (Q1 winner 40%, Q2 30%, Q3 20%, residual 10% spread). Because `anchor_prior` is present, the route takes the V3 fast path:

```ts
// apps/web/app/api/quiz/fingerprint/route.ts:913-995
if (body.anchor_prior && Object.keys(body.anchor_prior).length > 0) {
  const bayesState = initPosterior(v3Prior);              // build prior
  const v3Dims    = posteriorToFingerprint(bayesState);   // collapse to 12-dim
  const v3Blend   = fingerprintToStyleBlend(v3Dims);      // softmax T=0.35 over 10 archetypes
  // … writes users.style_blend, users.style_fingerprint (v3)
  return NextResponse.json({ … });
}
```

`fingerprintToStyleBlend` (style-archetypes.ts:179): cosine similarity of the user vector against each of 10 archetype vectors, softmax with `T=0.35`, drop weights `<0.10`, renormalise.

Then `step-3/page.tsx:283-297` posts the **same** call with `anchor_prior` AND `phase_b_responses`. The server still hits the V3 branch first, so **`phase_b_responses` is read by no production code path**. The 24-swipe loop is effectively a UX placebo.

### 2.3 Termination

- `TOTAL_PAIRS = 24` in `step-3/page.tsx:55` and `next-pair/route.ts`.
- Adaptive bonus swipes: `bayes.ts:216-221` `needsBonusSwipes()` returns true when >4 dimensions have `std > 0.25`, capped at `BONUS_SWIPES = 4`. Never triggers because the V3 fast path returns before any swipe is consumed.
- "Decisive" early-exit: `step-3/page.tsx:69` jumps to `compute` if `blendRatio >= 0.72 && competingStyles.length <= 1`.

### 2.4 Output

V3 fast path emits and persists to `users` (route.ts:970-979):
```json
{
  "style_blend": {"COVAJAPANDI": 0.41, "COVASCANDINAV": 0.27, "COVAMINIMAL": 0.18, …},
  "primary_style": "COVAJAPANDI",
  "secondary_style": "COVASCANDINAV",
  "primary_weight": 0.41,
  "secondary_weight": 0.27,
  "style_fingerprint": { dimensions, covariance: [10×10 zeros], confidence: 0.6, fingerprint_version: "v3" }
}
```

Note: `confidence: 0.6` is **hard-coded** on the V3 fast path (line 931), independent of how confident the user actually was.

---

## 3. Image Asset Inventory

### 3.1 Storage

Bucket: **`quiz-images`** (Supabase Storage, public read).
Base URL: `https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-images`.

Key paths:
- `/anchors/room-specific/phase-a-{styleSlug}-{roomSlug}.webp` (per-room anchor variants)
- `/pairs/dim-{N}/{pairIndex}-{a|b}.jpg` (24-pair phase)
- `step-2/page.tsx` directly inlines anchor URLs at module scope (look at the `Q1_STYLES`/`Q2_STYLES` constant block).

### 3.2 Tables

`quiz_anchor_images` (`apps/web/lib/types/supabase.ts:773-815`):
```
id (uuid) | style_index 1..10 | style_name | image_url | storage_path | flux_prompt
| dominant_colors text[] | livability_score float | room_images jsonb | round_images jsonb
| style_vector jsonb (12-dim)
```
Constraint: `style_index BETWEEN 1 AND 10` (per `supabase/migrations/20260416_quiz_v3_schema.sql:38-40`).

`quiz_comparison_pairs` (lines 818-876, expanded by `20260416_quiz_v3_schema.sql`):
```
id | dimension (old 12-dim name) | dimension_index | pair_index | room_type
| style_a / style_b | image_a_url / image_b_url | image_a_vector / image_b_vector (jsonb)
| a_dimension_value / b_dimension_value | livability_score_a/_b
| is_validated bool | is_anchor bool | anchor_style
| flux_prompt_a / flux_prompt_b
```
The migration **drops NOT NULL** on `image_a_stop`, `image_b_stop`, `image_a_vector`, `image_b_vector`, `*_storage_path`, `flux_prompt_*`, `image_b_url`, allowing rows that the V3 generator did not fill in.

### 3.3 Counts and tagging accuracy

- 9 rows in `quiz_anchor_images` per the seed scripts (`scripts/seed-quiz-database.ts` lines 60-194), expanded to 10 by the V3 schema constraint but the seed manifest was not updated to add a 10th — the registry in `apps/web/lib/styles/lora-registry.ts` lists 10 archetypes, so **one archetype has no anchor image** until the seed is rerun against an updated `anchor-images/manifest.json`.
- `quiz_comparison_pairs`: variable per dimension; seed targets 24 validated pairs minimum. `next-pair/route.ts:340-344` filters with `.eq("is_validated", true).ilike("image_a_url", "%new-pairs%")`. Rows that don't match `%new-pairs%` are silently excluded.
- Tag accuracy spot check: per `scripts/test_quiz_confidence.ts:24-34`, anchors are mapped to V2 6-dim centers — e.g. `Warm Japandi: [0.75, 0.20, 0.80, 0.25, 0.30, 0.70]` (warm, low complexity, organic, low density, modern, high character). These look directionally correct, but `style_index 2 ("Dark Moody Glam")` collides semantically with the registry's `COVAARTDECO` while having a different name surface — naming consistency is poor.
- **Multi-label tagging is absent.** Each image is tagged with exactly one `style_name` and one V2 vector. Modern industry pattern is multi-label per image (e.g. an image is 0.6 Japandi / 0.3 Scandinavian / 0.1 Coastal); we have no field for this.

### 3.4 Licensing

Images are in our private storage bucket; provenance for the `quiz-images` bucket isn't documented anywhere I could find. **Open question** — see §9.

---

## 4. Data Persistence

### 4.1 Tables

**`users.style_fingerprint` jsonb** + **`users.style_blend` jsonb** + `primary_style` / `secondary_style` / `primary_weight` / `secondary_weight`.

**`style_fingerprints`** (`supabase.ts:1782-1837`): one-row-per-quiz history table with `dimensions`, `covariance`, `confidence`, `quiz_responses`, `room_type`, `entry_path`, `fingerprint_version`.

**`swipe_history`** (`supabase.ts:1960-2015`): `card_id, card_image_url, card_phase, card_style, direction, dwell_time_ms, score_awarded, session_position, style_vector_before, style_vector_after, user_id`. RLS enabled by `supabase/migrations/20260419000000_enable_swipe_history_rls.sql`. **No production code writes to this table** (grep confirmed; only `tests/security/rls-negative.test.ts` references it).

**`rooms.style_blend` jsonb** + `rooms.render_context jsonb` + `rooms.style_blend_v3` (selectable via `apps/web/app/api/rooms/[roomId]/route.ts:47-48`).

### 4.2 What is actually written today

When a user finishes step-2:
- `style_fingerprints` row inserted with `dimensions`, `covariance: [[0,…],…]` (10×10 zeros), `confidence: 0.6`, `fingerprint_version: "v3"`, no `quiz_responses` (line 961-969 omits that field).
- `users` updated with `style_blend`, `primary_style`, `secondary_style`, `primary_weight`, `secondary_weight`, `style_fingerprint`.

When a user finishes step-3 swipes (with `anchor_prior` still in store):
- Same V3 path runs again. The 24 swipes are present in the request body but **never read**, never inserted to `swipe_history`, never used to update the fingerprint. Confidence stays at the hard-coded `0.6`.

When a user adjusts in step-3b:
- `users.style_blend` is overwritten with **display-name keys** (`{"Japandi": 0.7, …}`) via `step-3b/page.tsx:148-151`. Other rows in step-2/3 wrote **COVA\* keys** (`{"COVAJAPANDI": 0.7, …}`). `lora-registry.ts:110-123` `resolveCovaKey()` accepts both, so the renderer survives, but the data shape is genuinely heterogeneous between rows.

When `rooms.create` runs (`api/rooms/create/route.ts:42-49`):
- Inserts only `user_id` and `room_type`. **No copy of `users.style_blend` to `rooms.style_blend`.** No `render_context` initialised.

### 4.3 Spot-check of recent user data

We don't have a live DB connection in this audit, but the schema + writers tell us a fresh user record looks like:
- `users.style_blend`: `{COVAJAPANDI: 0.41, COVASCANDINAV: 0.27, …}` after step-2; possibly overwritten with display names after step-3b.
- `style_fingerprints`: 1 row per quiz attempt (no upsert; can grow unbounded).
- `swipe_history`: empty.
- `rooms.style_blend`: null until something else writes it (which today nothing does in the create path).

---

## 5. Integration with Render Pipeline

### 5.1 Read sites in the renderer

`apps/web/app/api/pipeline/redesign/route.ts`:
- Line 164: selects `style_blend` from **`rooms`** (not from `users`).
- Line 171: selects `style_fingerprint` from `users` (and **only** `style_fingerprint`).
- Line 288: `const styleBlendForAnchor = renderContext?.styleBlend ?? room?.style_blend ?? null;` — there is no `userRow.style_blend` fallback.
- Line 320: `getDnaTriggerFromBlend(styleBlendForAnchor)` resolves to `"cvscn"` (`COVASCANDINAV`) by default when blend is null.
- Line 282: `deriveStyleAnchorDisplay()` returns the literal string `"Balanced Contemporary"` when blend is null.

### 5.2 RenderContext assembly

`apps/web/lib/ai/renderContext/assembler.ts:99-107`:
```ts
function deriveStyleBlend(fingerprint) {
  if (!fingerprint) return undefined;
  if (fingerprint.fingerprint_version !== "v3") return undefined;  // v1/v2 → undefined
  return fingerprintToStyleBlend(fingerprint.dimensions);
}
```
Plus line 137-138: `style_blend: styleBlend, styleBlend: styleBlend` (both snake- and camel-case for legacy reasons).

`assembleRenderContext` is only called from `apps/web/lib/stores/area2Store.ts:391` (Zustand client store). It is **not called server-side** in the redesign route. So unless the client persists a freshly-assembled `render_context` to `rooms.render_context` before calling redesign, the renderer sees whatever stale value (if any) was left there.

### 5.3 Director consumption

`apps/web/lib/ai/design-director.ts:1132-1145` reads `ctxRaw?.style_blend` and calls `buildLorasFromBlend(styleBlend)` to produce `design_brief.style_weights.loras` (max 3, drop <0.10, normalise). When `style_blend` is null, the Director falls back to single-primary LoRA selection — the path that the F3-BLEND-CTX.1 patch was supposed to retire.

### 5.4 The data path today

```
step-2 anchors ──► /api/quiz/fingerprint (V3 fast path)
                      │
                      ├──► users.style_blend          (COVA* keys, often overwritten by step-3b)
                      ├──► users.style_fingerprint    (v3, hard-coded confidence 0.6)
                      └──► style_fingerprints         (audit row)

step-3 swipes ──► /api/quiz/fingerprint (same V3 fast path; phase_b_responses ignored)

step-3b adjust ──► users.style_blend     (display-name keys overwrite)

step-6 photo  ──► /api/rooms/create      (style_blend NOT copied; render_context NOT seeded)

step-7p "Generate" ──► /api/pipeline/redesign
                          ├── reads rooms.style_blend     → null (never written)
                          ├── reads renderContext.styleBlend → null (assembler not called server-side)
                          └── reads users.style_fingerprint  → v3 fingerprint, but only used for the *fingerprint* field, not for a fresh blend derivation
                       Director receives null → falls back to "Balanced Contemporary" / cvscn LoRA.
```

**The chain is broken at two distinct seams:**
1. `rooms.create` doesn't copy `users.style_blend` ➜ `rooms.style_blend`.
2. `redesign/route.ts` never reads `users.style_blend` directly.

If either gap were closed, the rendered output would actually reflect the quiz.

---

## 6. Failure Mode Analysis

The quiz is broken on **three independent axes**, in increasing order of severity:

### 6.1 UI layer (mostly fine)

- `CardStack.tsx` is a polished component but is **not wired into the V3 flow**; the live swipe UI is the inline `<button>` pair in `step-3/page.tsx:738-767`. Not "broken", but a maintenance trap.
- `/api/quiz/confidence` is fetched but does not exist (`CardStack.tsx:118`). When `CardStack` is reachable (it is in tests), every call 404s silently and `ConfidenceBar` stays at zero.
- `Q3_FIXED_STYLES` constrains Q3 to a 4-style subset, biasing priors away from the other 6 archetypes.

### 6.2 Data persistence (degraded)

- `swipe_history` has no production writer (point D in §1.4). We are throwing away the only signal that could re-train the model.
- `users.style_blend` keys are **inconsistent**: COVA\* keys after step-2/3, display names after step-3b. Both are tolerated by `resolveCovaKey()` but it's a recipe for partial matches and silent re-assignment.
- `style_fingerprints` is append-only with no de-dup; a user who retakes the quiz 5 times has 5 rows.

### 6.3 Algorithm (gutted)

- **The 24-pair swipe phase contributes nothing.** `phase_b_responses` is parsed by the request handler but never reaches `updatePosterior` or any V3 update function on the V3 fast path (`route.ts:913-995`). The fingerprint is determined entirely by the 3 anchor questions and a fixed 0.6 confidence.
- The full V2 entropy + response-time engine (`route.ts:264-864`) is dead code in the current flow — it only runs when `anchor_prior` is absent, which the live UI never does.
- `confidence` is hard-coded to `0.6` on the V3 path; the 800-line Phase-A/B blending logic is bypassed.

### 6.4 Integration (broken)

- `rooms.create` doesn't seed `rooms.style_blend` from `users.style_blend` (point B).
- `redesign/route.ts:171` reads only `style_fingerprint` from `users`, not `style_blend` (point C). `styleBlendForAnchor` is `null` for nearly every fresh render.
- `assembleRenderContext` is only used client-side. Server reuses whatever's already in `rooms.render_context`. On a brand-new room, that's null, so `renderContext.styleBlend` is null, and the Director falls back to single-primary `"Balanced Contemporary"` (`route.ts:282`).

**Net effect for a real user today:** they answer 3 multiple-choice questions, swipe 24 pairs (which do nothing), see a styled "reveal" in step-4, upload a photo, hit "Generate my room", and receive a `cvscn`/Balanced Contemporary render — regardless of what their quiz said.

---

## 7. Comparison to Industry Patterns

| Product | Pattern |
| --- | --- |
| **Pieter Levels' InteriorAI** | No quiz at all — user picks one of ~30 pre-defined styles from a dropdown. Style is a single label, not a blend. Preference is set per render. |
| **ReimagineHome** | Style picker grid (3×N). User selects one style + one room type. No multi-style blending. |
| **Decorilla** / **Modsy** (defunct) | Long-form quiz (~30 questions) → human designer interprets results into a multi-axis profile. Their quiz output was **never** consumed by a model directly. |
| **Pinterest "Style Quiz"** | 7-pair Tinder swipe over curated images, each tagged with 1–3 latent style dimensions. Output is a probability vector across ~12 styles. Termination is fixed at 7. |
| **The Expert / Houzz Pro** | Free-text "tell me about your style" + 3 photo uploads → LLM interpretation. Output is a paragraph, not a vector. |

**Consensus pattern for AI products in 2024–2026**: 8–15 swipes over curated images with **multi-label tags per image** (image carries weights across 2–3 styles), Bayesian update of a posterior over ~10 archetypes, soft-terminate when entropy drops below a threshold (typically 0.6–0.8 bits). Output is a **probability vector** that drives a weighted LoRA blend.

Cova's design is *aspirationally* aligned with this consensus (entropy logic in `next-pair/route.ts`, softmax in `fingerprintToStyleBlend`) but the live path bypasses it.

---

## 8. Recommended Redesign Direction

The diagnosis says the algorithm-level rebuild is small; the integration-level fix is mandatory.

### 8.1 Algorithm

- **Keep** Bayesian-over-Tinder as the model. The math in `apps/web/lib/quiz/bayes.ts` (Kalman-style update, contradiction detection) is sound and well-tested.
- **Make `phase_b_responses` actually update the posterior.** Either delete the V3 fast path early-return at `route.ts:913` or make it consume `phase_b_responses` after building the prior.
- **Replace the hard-coded `confidence: 0.6` on the V3 path** with a real entropy-derived score from the posterior covariance.
- **Drop V2** as a separate code path. Convert anchor responses into an initial prior on the V3 12-dim space (already done by `initPosterior`), then update with swipes.

### 8.2 UI

- **Hybrid: anchors + swipes**. Keep step-2's 3 anchor questions (they're high-signal and let us build a tight prior). Replace step-3's 24 forced pairs with **8–12 swipes selected adaptively** by entropy (already in `next-pair/route.ts`, just connect it to the live posterior).
- **Use `CardStack` / `SwipeCard`** for step-3. The V3 inline `<button>` A/B chooser is functional but loses the affordance — Tinder-style swipe is what users expect from a "style quiz" in 2026.
- **Always show step-3b.** Today users with `blendRatio >= 0.72` skip the blend confirmation entirely. The slider screen is the only place they can correct a wrong call.

### 8.3 Termination

- Adaptive: stop when `entropy(posterior) < 0.6` or `n_swipes >= 12` (cap), whichever comes first. Minimum 6 to guarantee training data. Currently fixed 24 with a never-fired bonus mechanism — drop the 24 cap.

### 8.4 Output

- Single source of truth: **`users.style_blend = Record<COVAStyleKey, number>`** with COVA\* keys (drop the display-name variant in step-3b — translate at read time only).
- Persist a fresh `render_context` JSON (with `styleBlend` populated from the v3 fingerprint) to `rooms.render_context` at room creation time. Roof of truth becomes `rooms.render_context`, not `users`.
- Stop hard-coding `confidence: 0.6`.

### 8.5 Image curation

- **20 images per archetype × 10 archetypes = 200 source images**, every image tagged with 1–3 styles (multi-label) with weights summing to 1. Today we have ~9 single-label anchors + ~24 pairs.
- Add a `style_weights jsonb` column to `quiz_anchor_images` and `quiz_comparison_pairs` (multi-label vector). Migrate seed data accordingly.
- Source: licensed renders from our existing FLUX fine-tunes (we already produce these). Avoid stock interior photos whose licensing we can't trace.

### 8.6 Persistence schema

| Field | Today | Recommended |
| --- | --- | --- |
| `users.style_blend` | `Record<string, number>` (mixed key formats) | `Record<COVAStyleKey, number>` only |
| `users.style_fingerprint` | v1/v2/v3 mixed | v3 only; drop legacy paths |
| `style_fingerprints` | append-only audit | upsert per `(user_id, room_type)` with a `version` column |
| `swipe_history` | RLS-enabled but unwritten | actually write each swipe with `dwell_time_ms`, `card_id`, `direction`, `posterior_after` (jsonb) |
| `rooms.style_blend` | nullable, never seeded | seeded at `rooms.create` from `users.style_blend` |
| `rooms.render_context` | stale or null | seeded with full `assembleRenderContext()` output at `rooms.create` |

### 8.7 Integration fixes (smallest fix that unblocks the renderer today)

1. `apps/web/app/api/rooms/create/route.ts:42-49` — read `users.style_blend` and include it in the insert.
2. `apps/web/app/api/pipeline/redesign/route.ts:171, 288` — also `select("style_blend")` from `users` and add it to the fallback chain: `renderContext?.styleBlend ?? room?.style_blend ?? userRow?.style_blend ?? null`.
3. Run `assembleRenderContext` server-side in `rooms.create` (or in a new `/api/render-context/refresh` route) and persist the result to `rooms.render_context`.

Even without redesigning the UI, these 3 changes make the existing quiz output actually drive the FLUX LoRA blend.

---

## 9. Open Questions (need human decision)

1. **Keep step-3 swipes at all?** If we accept the audit's finding, we can ship a quiz that is just 3 anchor questions + 1 confirmation screen and produce *exactly the same fingerprint* the renderer sees today. Is the swipe phase a UX promise we want to keep, or can we cut it?
2. **How many archetypes?** Code/docs alternate between 9 (`quiz_anchor_images` original constraint) and 10 (V3 schema, `LORA_REGISTRY`). Do we ship 9 or 10? `Biophilic` is the wobble.
3. **Image licensing.** Are the existing `quiz-images` bucket assets safe for commercial use? If they're stock, we need to back them with a license audit before launch. If they're our own FLUX renders, we should label and version them.
4. **Multi-label tagging budget.** Re-tagging ~200 images with 1–3 weighted styles takes ~30 minutes manual or one Sonnet vision pass at ~$0.40 total. Approve the spend?
5. **`step-3b` route.** apps/web/CLAUDE.md's V3 flow description omits step-3b but it's wired into `step-3/page.tsx:57` as `COMPLETION_ROUTE`. Is step-3b in or out of the V3 flow?
6. **`primary_style` / `secondary_style` columns.** With a full `style_blend` jsonb, these denormalised columns are redundant. Drop them, or keep for read convenience?
7. **Confidence semantics.** Today the V3 path emits `confidence: 0.6` hard-coded. Downstream renders have no use for it (Director ignores it). Compute it properly, or drop the field?
8. **Returning-user strip.** `ReturningUserStrip.tsx` reads `style_sessions` — that table isn't in the supabase types I inspected. Is it a planned feature, an alias, or dead?

---

**End of audit.**
