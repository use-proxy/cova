# Session B — quiz image library generation

**Date:** 2026-04-08
**Branch:** main
**Prereq:** Session A (`8060281`) — 12-dim migration committed and clean.
**Goal:** Generate the 9-anchor + 60-pair quiz image library against the new 12-dim schema. Stay within the $20 Replicate ceiling. Verify and commit.

---

## Outcome

| Gate                                  | Result                                                             |
| ------------------------------------- | ------------------------------------------------------------------ |
| `quiz_anchor_images` table created    | ✅ via `supabase/migrations/20260408000000_quiz_image_library.sql` |
| `quiz_comparison_pairs` table created | ✅ same migration                                                  |
| `quiz-images` storage bucket created  | ✅ public, 10MB, jpeg/png/webp                                     |
| 9 anchor images in DB                 | ✅ all 9 livability ≥ 3                                            |
| Validated comparison pairs            | ✅ **60/60** validated (target: ≥36 across 12 dims)                |
| Per-dimension validated pairs         | ✅ **5/5** validated for every one of the 12 dims                  |
| All anchor URLs return HTTP 200       | ✅ verified inline by Phase E                                      |
| Sample quiz API query works           | ✅ `colorTemperature` returns 2 validated pairs                    |
| `npx tsc --noEmit`                    | ✅ exit 0                                                          |
| `npm run build`                       | ✅ Compiled successfully                                           |
| **Replicate spend**                   | ✅ **$8.06** (ceiling: $20)                                        |

Full report: `apps/web/scripts/quiz-library-report.md`

---

## What was built

### 1. Database schema (one-shot migration)

`supabase/migrations/20260408000000_quiz_image_library.sql` — applied via `supabase db push --linked` (cached creds; the 5 pre-existing local-only "before" migrations were temporarily stashed in `/tmp/migration-stash/` to unblock push, then restored). Defines:

- `quiz_anchor_images` — id, style_name, style_index (1–9), image_url, storage_path, style_vector (jsonb), dominant_colors (text[]), flux_prompt, livability_score, created_at
- `quiz_comparison_pairs` — id, dimension, dimension*index (0–11), pair_index, image_a*_, image*b*_, image_a_stop / image_b_stop (CHECK IN 2,3,4), image_a_vector / image_b_vector (jsonb), base_room_url, flux_prompt_a / flux_prompt_b, livability_score_a / \_b, is_validated, created_at
- Indexes: `idx_pairs_dimension`, `idx_pairs_validated`, `idx_anchors_style`
- RLS: both tables `ENABLE ROW LEVEL SECURITY` + public-read policy
- Storage bucket: `quiz-images` public, 10MB limit, allowed mime `image/jpeg|png|webp`, public-read storage policy

### 2. Generation script

`apps/web/scripts/generate-quiz-library.ts` — single-file `npx tsx` script. Sequential phases A → B → C → D (inline) → E. Resume-capable via `scripts/quiz-generation-progress.json`. 3× retry with 5s backoff on every Replicate call. Inline livability gate (Claude Sonnet 4.6, integer 1–5; pairs require both A+B ≥3 to be `is_validated=true`; anchors are kept regardless). Budget guard aborts if estimated spend exceeds $20.

### 3. Phase results

| Phase | What                         | Model                                | Count     | Notes                                                                                    |
| ----- | ---------------------------- | ------------------------------------ | --------- | ---------------------------------------------------------------------------------------- |
| A     | 9 anchor images              | `black-forest-labs/flux-1.1-pro`     | 9/9 ✅    | All livability ≥ 3 on first attempt; uploaded to `anchors/`                              |
| B     | 12 base rooms (one per dim)  | `black-forest-labs/flux-1.1-pro`     | 12/12 ✅  | Inputs to Phase C only; uploaded to `base-rooms/`                                        |
| C     | 5 comparison pairs × 12 dims | `black-forest-labs/flux-kontext-pro` | 60/60 ✅  | Both A (stop 2) + B (stop 4); style vectors = neutral 0.5 with target dim at 0.25 / 0.75 |
| D     | Livability validation        | `claude-sonnet-4-6`                  | 142 calls | Inline in A/B/C                                                                          |
| E     | Verify + report              | —                                    | —         | All acceptance criteria pass                                                             |

### 4. Bug caught + fixed mid-run

The first Phase C run failed with `output_format must be one of "jpg", "png"` from `flux-kontext-pro` (it doesn't accept `webp`, unlike `flux-1.1-pro`). The script's retry logic logged it as a single rejection in the report. Fix: changed pair output_format → `'png'`, content type → `'image/png'`, storage extension → `.png`. Resumed from progress file — phases A and B were preserved, only Phase C re-ran from scratch. Total wall-clock loss from the bug: ~30 seconds + 3 wasted Replicate calls ≈ $0.17.

### 5. Style vectors

- **Anchors** use the authoritative 12-dim vectors from the original spec, in the canonical order `[colorTemperature, colorSaturation, density, formality, era, material, texture, pattern, lineQuality, lightPreference, nature, culturalInfluence]`.
- **Pairs** are computed deterministically from the neutral midpoint vector (all dims = 0.5):
  - Image A (stop 2, low end) = neutral with target dim set to **0.25**
  - Image B (stop 4, high end) = neutral with target dim set to **0.75**
- Both A and B always stay strictly inside the liveable midrange (stops 2–4 only). No stop 1 or stop 5 — enforced by the spec, by the prompts, and by the livability gate.

---

## Step 8 — CLIP projection check (read-only)

Per Session B spec, this is a _report-only_ step. **No code was added or changed.**

- `apps/web/lib/ai/clip.ts` does **not** contain any 768→N projection layer. It defines `embedImage` (returns the raw 768-dim CLIP vector for product matching), `cosineSimilarity`, `fingerprintToStyleTags` (just-migrated text-tag mapping), `computeFingerprintAlignment`, and `computeBudgetFit`. The 768-dim CLIP embedding is used directly against `products.clip_embedding_data` for product matching — it is **never projected into the 12-dim style fingerprint space**.
- The `inspo_photo` value is declared in the legacy fingerprint route's `entry_path` type union (`apps/web/app/api/quiz/fingerprint/route.ts:37`) but **not implemented**. The route handles only the new 3-phase `phase_a_selections` / `phase_b_responses` format and the legacy `pairs` format; `natural_language` and `inspo_photo` branches are absent.
- A future session that wants to support "upload an inspiration photo → fingerprint" would need: (1) a CLIP-768 → fingerprint-12 projection (learned matrix, or a Claude Vision pipeline that returns a 12-dim vector directly), and (2) a new code path in the fingerprint route that accepts an `image_url` and returns a `StyleFingerprint`.

---

## What is _still_ not wired

The new tables exist and contain real data, but **none of the existing quiz API routes read from them yet**. Specifically:

- `/api/quiz/next-card` still queries `swipe_cards` (now empty, wiped in Session A)
- `/api/quiz/next-pair` still queries `swipe_cards` (still empty)
- `/api/style-references/match` still queries `style_references` (still empty)
- `/design/step-3` Phase A still calls `/api/quiz/next-card` (still empty)

So at runtime end of Session B, the live quiz UX is **still non-functional** even though the data is now sitting in the new tables. This is intentional — wiring the routes to `quiz_anchor_images` / `quiz_comparison_pairs` is a third session of work (call it "Session C"). The cleanest path is probably to point those routes directly at the new tables and decommission `swipe_cards` + `style_references` entirely, but that decision belongs to the user.

---

## Spend summary

| Cost line                                                                      | Calls | Unit   | Subtotal  |
| ------------------------------------------------------------------------------ | ----- | ------ | --------- |
| flux-1.1-pro (anchors + base rooms)                                            | 22    | $0.055 | $1.21     |
| flux-kontext-pro (pair edits, incl. 3 wasted calls from the output_format bug) | 122   | $0.055 | $6.71     |
| Claude Sonnet livability checks                                                | 142   | $0.001 | $0.14     |
| **Total**                                                                      |       |        | **$8.06** |

Ceiling was $20. Final spend = **40% of ceiling**.

---

## Files created / modified in Session B

**Created:**

- `supabase/migrations/20260408000000_quiz_image_library.sql`
- `apps/web/scripts/generate-quiz-library.ts`
- `apps/web/scripts/quiz-library-report.md`
- `apps/web/scripts/quiz-generation-progress.json`
- `apps/web/scripts/_verify-quiz-schema.ts` (one-shot smoke test)
- `apps/web/docs/sessions/session-quiz-library-progress.md` (this file)

**Modified:** none. Session B touched zero application source code (per instruction — Session A migration is left untouched).

---

## Session C handoff — what comes next

1. **Wire the quiz API routes** to read from `quiz_anchor_images` and `quiz_comparison_pairs`:
   - `/api/quiz/next-card` → return random anchor images for Phase A image grid (or a curated subset by room type)
   - `/api/quiz/next-pair` → return random validated pair from `quiz_comparison_pairs`, optionally biased toward the highest-variance dimension from the user's covariance diagonal
   - `/api/style-references/match` → match user fingerprint against `quiz_anchor_images.style_vector` (cosine similarity over the 12 dims)
2. **Decommission** `swipe_cards` and `style_references` tables (or leave their schemas in place but mark deprecated). The 12-dim system has no use for them.
3. **End-to-end smoke test** the quiz on `/design/step-3` against real images.
4. **Optional:** implement `inspo_photo` entry path with CLIP→12-dim projection.
