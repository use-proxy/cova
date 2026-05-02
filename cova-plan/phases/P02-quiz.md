# Phase 2 — Style Quiz

**Cova V1 implementation · Phase 2 of 12 · Self-contained**

---

## Phase identity

| | |
|---|---|
| **Phase number** | 2 of 12 |
| **Goal** | Replace V0 swipe-or-skip quiz with forced-choice 12-pick Bayesian quiz. Ship the entire onboarding flow from /welcome through /onboarding/style-reveal Phase B (tweak mode) Continue. |
| **Executor session estimate** | 6–8 sessions across M4/M5/M6 with handoffs at 93–94% context |
| **Calendar estimate** | 3–4 weeks (largest UI milestone in V1) |
| **Predicted Claude credits** | ~$80–120 |
| **Predicted infra spend** | ~$10 (FLUX.1 Schnell card generation if M4 corpus regen runs ~$1.20; Sonnet descriptors during testing ~$5; misc) |
| **Depends on** | Phase 1 closed |
| **Blocks** | Phase 3, Phase 4, all subsequent phases (quiz feeds style_blend into render director) |

---

## 1. The session loop for this phase

1. **Open new claude.ai chat.** Paste this entire phase doc as first message.
2. **Chat summarizes back.** Confirms understanding, lists gaps, lists research targets. You confirm.
3. **Planner fires.** Fresh Claude Code session at `/Users/daksh/Desktop/cova/`. Uses Supabase MCP to verify Phase 1 closed cleanly (drift check), reads all Phase 1 handoffs, reads `OPEN_DECISIONS.md` for D-016/D-017/D-018 (forced-choice locked, 10 styles locked, 12-pick locked). Uses Context7 MCP for current Bayesian update libraries, current Sonnet 4.5 vision API patterns, current Anthropic SDK timeouts. Uses EXA MCP for: rendy.io card hover patterns, R3F looping demo patterns, Phase A/B reveal cinematic patterns. Writes executor prompt to `cova-plan/planner-output/P2-executor-prompt.md` and stops.
4. **Executor prompt returns.** You paste back into chat. Verify covers all M4/M5/M6 acceptance criteria, includes all 12 quiz prompts, all 10 style fragments, all 10 microcopy lines, all 10 CSS color grades.
5. **Executor fires.** 6–8 Claude Code sessions. M4 first (corpus), M5 second (backend), M6 last (UI). Handoffs at 93–94%.
6. **Verifier session 1 fires.** Fresh, no executor context. Reviews Bayesian math correctness, API route failure handling, cost telemetry, all UI screens against spec. Self-heals.
7. **Verifier session 2 fires.** Independent review. Hunts for: Bayesian edge cases (all-equal blend, single-style dominance), motion timing accuracy, descriptor template fallback wiring, race conditions in tweak mode.
8. **Manual screenshot review.** §15 click-script. ~30 screenshots. Captures cover quiz happy path + tweak mode + all 10 style reveals + edge cases.
9. **Document updates.** `PHASE_STATUS.md`, `OPEN_DECISIONS.md` (any new decisions), `EMPIRICAL_FINDINGS.md` (M4 validation results).

---

## 2. Prereq verification

### Phase 1 closure checks (drift detection)
- `PHASE_STATUS.md` shows Phase 1 → CLOSED
- Verify via Supabase MCP: 28 dead columns gone from `rooms`, 17 dead tables gone, RLS policies match Phase 1 spec
- `apps/web/lib/log/redact.ts` exists and exports `redactLogPayload`
- `apps/web/lib/config/timeouts.ts` exists with locked values
- `apps/web/lib/cost/log.ts` exists with `logCost()`
- `apps/web/lib/errors/categories.ts` exists with auth + general failure enums
- `apps/web/lib/analytics/posthog.ts` initialized
- `apps/web/sentry.{client,server,edge}.config.ts` all exist
- All 6 auth routes return 200 on healthy paths
- `account_deletions`, `feature_flags`, `render_cost_log` tables exist with correct schema

### Halt conditions
- Any drift from `PHASE_STATUS.md` → write `cova-plan/drift/P2-detected.md`, halt
- Phase 1 verifier reports show unresolved issues → halt, escalate
- Required MCPs (Supabase, EXA, Context7) not connected → halt

---

## 3. Pre-decisions (resolve before planner fires)

**G1. M4 corpus regeneration scope.** Phase 0 included a 50-card validation gate with Fleiss kappa ≥0.6. *Resolution before planner:* Daksh runs the validation in Phase 0. If existing corpus passes (≥0.6 kappa, ≥80% match-to-label) → skip M4 corpus regen, use existing cards. If fails → M4 runs full regen (~$1.20 in FLUX.1 Schnell, ~3-4 hours human curation across Daksh + Pranav).

**G2. Sonnet model version for descriptor.** *Resolution:* lock to Sonnet 4.5 (`claude-sonnet-4-5`) at Phase 2 start. If Sonnet 4.6 is available and pricing matches, planner can swap. Document in `OPEN_DECISIONS.md` as D-022.

**G3. Quiz card secondary_traits taxonomy.** Each card may have multiple traits beyond primary style (e.g., a Warm Japandi card with `["natural_materials", "low_furniture", "soft_light"]`). *Resolution:* planner produces full trait list (~12-15 traits total across 10 styles) before M4 curation begins. Traits used for mild cross-update in Bayesian math (`+0.02` to similar styles).

**G4. Memory fragment image source for finishing screen.** Spec calls for 6-8 floating image cards from user's right-swiped quiz history (since this is forced-choice, "right-swiped" = picked card). *Resolution:* fragments use the chosen card from each of the 12 picks (12 candidates → randomly sample 6-8 for the screen). Fallback: 6-8 generic editorial interiors at `/public/finishing-fallback/`.

**G5. Style reveal Phase A Veo clip generation.** Spec calls for 4 chained Veo 3.1 clips (~$1 total, one-time). *Resolution:* Daksh generates clips via Draftly Pro before M6 begins. Stored at Cloudflare R2 `cova-style-reveal/clip-{1,2,3,4}/frame-{n}.webp`. ~64MB total.

**G6. The 10 CSS color-grade calibrations.** Spec provides initial filter values per style. *Resolution:* values calibrated during M6 implementation against actual Veo cinematic frames. Tuning happens visually — verifier confirms values exist; manual review confirms they look right.

**G7. Resume flow UX state.** When user closes mid-quiz and returns. *Resolution locked:* /onboarding/quiz/resume shows single confirmation card "Welcome back, you're [N] questions in. Continue where you left off?" Single CTA "Continue." Picks back at question N+1 with `style_blend_provisional` intact.

**G8. Predictive prefetch payload size.** Spec calls for `<link rel="prefetch">` on next pair's images while current pair viewed. *Resolution:* planner sets prefetch hints for pair_index + 1 only (not deeper lookahead). Cards are 800×600 WebP q88, ~120-180KB each, total ~360KB prefetch per pair = acceptable.

**G9. Confirmation modal behavior on browser back / logo click.** *Resolution locked:* modal "Leave the quiz? Your progress is saved." Two CTAs: "Stay" / "Leave." Provisional save fires before modal opens (so leave is safe). Logo click and browser back trigger same modal.

**G10. Tweak mode max-active-styles enforcement.** Spec says max 3 active styles ≥10%. *Resolution locked:* slider enforces. If user tries to add a 4th style ≥10%, the lowest active style auto-drops to 0% with brief animation. Auto-rebalance keeps total = 100%.

---

## 4. Background context (self-contained)

### 4.1 What the quiz delivers

After 12 forced-choice picks, Cova produces:
- `users.style_blend` jsonb: 10 styles each with a percentage (sums to 1.0), plus primary/secondary/tertiary labels
- `users.style_descriptor` jsonb: Sonnet-generated italic-tone descriptor blending primary + secondary + tertiary (e.g., *"A home shaped by quiet light and natural wood, with a touch of ocean air."*)
- `users.onboarding_state.quiz_complete = true`

The style_blend feeds Stage 3 of the render pipeline (Phase 5) as the user's style anchor. Descriptor is shown on /onboarding/style-reveal Phase B and dashboard.

### 4.2 The forced-choice mechanic [D-018]

User sees 2 cards. Picks one. Next pair appears. After 12 picks, quiz ends.

NOT swipe-or-skip. NOT love/pass. Every pick is a relative preference between the two cards. Forced choice produces stronger Bayesian signal per interaction than absolute valence — validated UX pattern in dating apps and product preference research. Removes "decision fatigue" and prevents users from skipping every card with zero signal output.

### 4.3 The Bayesian style-blend model

**Prior:** uniform 10% per style at quiz start. All 10 styles equally probable.

**Per-pick update (server-side):**
- Card A's primary style gets `+0.10` evidence
- Card B's primary style gets `-0.05` evidence (asymmetric — picking is stronger signal than rejecting)
- Optional: secondary_traits each get `+0.02` to similar styles (cross-update)
- 10 style probabilities renormalize to sum to 1.0

**Pair selection for next round (entropy-max):**
- Compute entropy per style based on current `style_blend_provisional`
- Identify two styles with highest current uncertainty
- Query `quiz_cards` for one card from each, randomized within style
- This maximizes information gain per pick

**End state after 12 picks:**
- `primary` = highest probability style
- `secondary` = second highest, only if ≥15%
- `tertiary` = third highest, only if ≥7%
- All 10 percentages stored

### 4.4 Known limitation: archetype center clustering

Bayesian math has weakness — users picking consistently toward a region's "average" cluster at the centroid, not extremes. E.g., consistent Warm Japandi picker ends at "Warm Japandi 73%, Scandinavian 18%, Coastal 9%" because those three share traits.

This is NOT a bug. It's faithful reflection of taste similarity. Real Warm Japandi lovers also enjoy Scandinavian rooms.

The TWEAK feature on style-reveal Phase B lets users push toward extremes if they feel centroid is wrong. Drag arc tips, sliders, "Add another style," max 3 active.

### 4.5 The 10-style taxonomy [D-017]

Locked:
1. Warm Japandi
2. Coastal
3. Mid-Century Modern
4. Industrial
5. Bohemian
6. Modern Farmhouse
7. Traditional
8. Contemporary Minimalist
9. Mediterranean
10. Scandinavian/Organic Modern (combined)

Display names always — never expose internal style codenames in UI [D-008].

### 4.6 The 12 quiz prompts (locked, cycled in order)

```
Q1:  "Which one feels more like home?"
Q2:  "Which one would you walk into first?"
Q3:  "Which one feels more you?"
Q4:  "Where would you rather wake up?"
Q5:  "Which one feels easier to live in?"
Q6:  "Which one would you show off?"
Q7:  "Which one is more your taste?"
Q8:  "Which one feels more right?"
Q9:  "Which one would you spend Sunday in?"
Q10: "Which one would you keep coming back to?"
Q11: "Which one feels more like you?"
Q12: "Last one. Which one wins?"
```

### 4.7 The 10 style descriptor fragments (locked)

Used by client-side template descriptor (no Sonnet during drag).

| Style | Fragment |
|---|---|
| Warm Japandi | quiet light and natural wood |
| Coastal | ocean air and soft tides |
| Mid-Century Modern | clean lines and era optimism |
| Industrial | honest materials and bare structure |
| Bohemian | collected memories and layered intention |
| Modern Farmhouse | weathered comfort and gathered warmth |
| Traditional | inherited craft and timeless restraint |
| Contemporary Minimalist | intention and discipline of empty space |
| Mediterranean | sun-warmed earth and slow afternoons |
| Scandinavian/Organic Modern | light, breath, and the pull of nature |

### 4.8 The 10 style microcopy lines (locked, used in Phase A Beat 2-3)

| Style | Microcopy |
|---|---|
| Warm Japandi | "Quiet light. Natural texture. Restraint." |
| Coastal | "Soft tides. Salt-air light. Driftwood grain." |
| Mid-Century Modern | "Clean lines. Era optimism. Walnut warmth." |
| Industrial | "Honest materials. Bare structure. The weight of steel." |
| Bohemian | "Layered texture. Plant fronds. Candlelight warmth." |
| Modern Farmhouse | "Weathered wood. Gathered comfort. Linen calm." |
| Traditional | "Inherited craft. Wainscoting. Classical light." |
| Contemporary Minimalist | "Negative space. Discipline. Restraint." |
| Mediterranean | "Sun-warmed earth. Terracotta. Slow afternoons." |
| Scandinavian/Organic Modern | "Pale ash. Light. Breath. The pull of nature." |

### 4.9 The 10 CSS color-grade classes (initial values; calibrated at impl)

```css
.style-warm-japandi { 
  filter: sepia(0.15) saturate(1.05) brightness(1.02);
  background: linear-gradient(180deg, rgba(201,168,76,0.04) 0%, transparent 100%);
}
.style-coastal { 
  filter: hue-rotate(-8deg) saturate(0.92) brightness(1.03);
  background: linear-gradient(180deg, rgba(180,200,220,0.04) 0%, transparent 100%);
}
.style-industrial { 
  filter: saturate(0.78) brightness(0.96) contrast(1.08);
  background: linear-gradient(180deg, rgba(140,150,160,0.04) 0%, transparent 100%);
}
.style-bohemian { 
  filter: sepia(0.22) saturate(1.12) brightness(1.0);
  background: linear-gradient(180deg, rgba(180,130,90,0.05) 0%, transparent 100%);
}
.style-mid-century { 
  filter: sepia(0.12) saturate(1.10) brightness(1.04);
  background: linear-gradient(180deg, rgba(190,140,80,0.04) 0%, transparent 100%);
}
.style-modern-farmhouse { 
  filter: sepia(0.08) saturate(0.95) brightness(1.04);
  background: linear-gradient(180deg, rgba(220,210,195,0.04) 0%, transparent 100%);
}
.style-traditional { 
  filter: sepia(0.18) saturate(1.05) brightness(0.98);
  background: linear-gradient(180deg, rgba(170,140,100,0.05) 0%, transparent 100%);
}
.style-contemporary-minimalist { 
  filter: saturate(0.85) brightness(1.05) contrast(1.02);
  background: linear-gradient(180deg, rgba(220,220,220,0.03) 0%, transparent 100%);
}
.style-mediterranean { 
  filter: sepia(0.20) saturate(1.15) brightness(1.05);
  background: linear-gradient(180deg, rgba(200,150,100,0.05) 0%, transparent 100%);
}
.style-scandinavian-organic { 
  filter: saturate(0.92) brightness(1.06) contrast(0.98);
  background: linear-gradient(180deg, rgba(225,220,210,0.03) 0%, transparent 100%);
}
```

### 4.10 Client-side descriptor template (no Sonnet during tweak drag)

```
IF primary ≥ 70%: 
  "A home shaped by [primary fragment]."
ELIF primary 50-70% AND secondary 20-30%: 
  "A home shaped by [primary fragment], with a touch of [secondary fragment]."
ELIF primary 40-50% AND secondary 30-40%: 
  "A home shaped by [primary fragment] and [secondary fragment]."
ELSE (primary <40%, layered): 
  "A home of layered styles — [primary], [secondary], and [tertiary]."

EDGE: all-equal blend (no clear primary, all within 3% of 10%): 
  "Eclectic mix" descriptor + neutral color grade.
```

---

## 5. Tech stack for this phase

| Layer | Tool | Notes |
|---|---|---|
| Quiz card image generation | fal.ai/flux/schnell | M4 corpus regen, ~$0.003/image × 40 × 10 = ~$1.20 |
| Card image hosting | Supabase Storage `quiz-images` bucket | RLS read-anyone (locked Phase 1) |
| Bayesian engine | Custom TS at `apps/web/lib/quiz/bayesian.ts` | Server-side compute |
| Style descriptor LLM | Anthropic Sonnet 4.5 | ~$0.005/call, fire-and-forget on quiz finalize + tweak save |
| Quiz API | Next.js route handlers (App Router) | 6 routes |
| State management | Server-side `style_blend_provisional` (every 3 picks); client TanStack Query | Resume-safe |
| Idempotency | UNIQUE constraint on `(user_id, swipe_index)` in swipe_history | Replays return existing state |
| Welcome demo animation | React Three Fiber (R3F) + GSAP | 6s seamless loop |
| Quiz card hover | rendy.io pattern: CSS perspective + 3D tilt | Pure CSS transforms, GPU-accelerated |
| Click selection animation | Framer Motion | 1.5s sequence per pick |
| Finishing screen 3-layer animation | SVG for brand mark + HTML/CSS for fragments + canvas for particles | 4.8s total |
| Style reveal Phase A | Draftly Pro (Veo 3.1 clips) + GSAP ScrollTrigger | ~7200px desktop / 5000px mobile |
| Style reveal Phase B | Frontend Visionary (custom interactivity) + Framer Motion | Tweak mode |
| Smooth scroll | Lenis | Phase A scroll-pinned |
| Asset CDN | Cloudflare R2 + Cloudflare Images | Phase 1 wired |

---

## 6. Scope

### 2A — Backend

**M4 — Card corpus regeneration (HARD GATE if Phase 0 validation failed)**

If 50-card validation in Phase 0 returned Fleiss kappa <0.6 OR <80% match-to-label, M4 runs full regen.

Acceptance:
1. Write 10 distinctive-style FLUX.1 Schnell prompts with REQUIRED + AVOID markers per style. Documented at `cova-plan/quiz/prompt-bible.md`.
   - Warm Japandi REQUIRED: "paper lantern OR wabi-sabi ceramic OR linen sheer", "low furniture", "natural wood floor". AVOID: "steel beam", "concrete floor", "macramé", "neon", "Edison bulb".
   - Industrial REQUIRED: "exposed steel beam OR concrete floor OR brick wall", "matte black metal", "Edison bulb". AVOID: "wabi-sabi", "boucle", "rattan", "macramé", "linen sheer".
   - Bohemian REQUIRED: "layered textile OR macramé OR rattan", "plant fronds", "warm earth palette". AVOID: "steel beam", "minimalist", "negative space".
   - Mid-Century Modern REQUIRED: "atomic-age silhouette", "walnut wood", "tapered legs". AVOID: "wabi-sabi", "macramé", "boucle".
   - Coastal REQUIRED: "white shiplap OR linen drape OR weathered wood", "blue/white palette", "natural light". AVOID: "industrial", "dark moody".
   - Modern Farmhouse REQUIRED: "shiplap OR barn door OR wide-plank wood", "neutral palette", "vintage iron". AVOID: "minimalist", "neon", "concrete".
   - Traditional REQUIRED: "wainscoting OR crown molding OR oriental rug", "rich wood", "classical symmetry". AVOID: "minimalist", "neon", "concrete".
   - Contemporary Minimalist REQUIRED: "negative space", "monochrome palette", "clean horizontal lines". AVOID: "wabi-sabi (rustic)", "boucle", "macramé".
   - Mediterranean REQUIRED: "terracotta OR plaster wall OR archway", "warm earth palette", "wrought iron". AVOID: "minimalist", "industrial".
   - Scandinavian/Organic Modern REQUIRED: "pale ash wood", "white wall", "single houseplant", "soft natural light". AVOID: "industrial", "ornate", "dark moody".

2. Generate 40 candidate cards per style via FLUX.1 Schnell (~$1.20 total, ~30 min). Stored at `cova-plan/quiz/candidates/{style}/`.

3. Curate to 20-25 unmistakable cards per style (~3-4 hours human time, Daksh + Pranav). Criteria:
   - Card unambiguously triggers style on first glance
   - Card photo quality: editorial-grade, well-lit, clean composition
   - Variety within style: covers different room types (living, bed, kitchen)
   Curated set at `cova-plan/quiz/final/{style}/`.

4. Validation: 30-card sample protocol. 2-3 raters independently classify 30-card sample. Compute:
   - Inter-rater agreement: ≥85%
   - Match-to-label: ≥80%
   Pass → corpus locked. Fail → tighten AVOID clauses, regenerate failing style, re-validate.
   Documented at `cova-plan/quiz/validation-report.md`.

5. Upload curated cards to Supabase Storage `quiz-images` bucket.

6. Populate `quiz_cards` table:
```sql
CREATE TABLE quiz_cards (
  id text PRIMARY KEY,                  -- e.g. "warm_japandi_living_001"
  primary_style text NOT NULL,
  image_url text NOT NULL,               -- public bucket URL
  secondary_traits jsonb DEFAULT '[]'::jsonb,
  room_type text,                         -- living | bed | kitchen | dining | study
  created_at timestamptz DEFAULT now()
);
CREATE INDEX quiz_cards_primary_idx ON quiz_cards(primary_style);
```

**M5 — Bayesian backend**

Acceptance:

1. **Schema migration:**
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS style_blend jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS style_descriptor jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_state jsonb DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS style_blend_provisional jsonb;

CREATE TABLE IF NOT EXISTS swipe_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  swipe_index int NOT NULL,
  card_a_id text NOT NULL,
  card_b_id text NOT NULL,
  picked_card_id text NOT NULL,
  picked_style text NOT NULL,
  rejected_style text NOT NULL,
  prompt_text text NOT NULL,
  time_to_decision_ms int,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT swipe_history_unique_index UNIQUE (user_id, swipe_index)
);
CREATE INDEX swipe_history_user_idx ON swipe_history(user_id);
ALTER TABLE swipe_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY swipe_history_self_read ON swipe_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY swipe_history_self_insert ON swipe_history FOR INSERT WITH CHECK (auth.uid() = user_id);
```
   Paired down migrations.

2. **Bayesian engine** at `apps/web/lib/quiz/bayesian.ts`:
   - `initialBlend()` returns uniform 10% per style
   - `updateBlend(blend, pickedStyle, rejectedStyle, secondaryTraits)` applies +0.10/-0.05/+0.02
   - `entropyMaxPair(blend, availableCards)` returns top-2-uncertain styles + cards
   - `finalizeBlend(blend)` returns primary/secondary/tertiary labels + percentages

3. **POST /api/quiz/next-pair**
   - Reads current `style_blend_provisional` (or initial uniform)
   - Computes entropy-max pair
   - Queries `quiz_cards` for one card from each of those two styles, randomized
   - Returns `{ card_a: {id, image_url}, card_b: {id, image_url}, prompt: "...", swipe_index: N }`
   - Edge: if user is on swipe 12, returns final-pair signal
   - Edge: if entropy difference small, falls back to random pair
   - failure_category: `quiz_pair_select_fail`, `quiz_pair_no_cards_available`

4. **POST /api/quiz/submit-pick**
   - Body: `{ swipe_index, card_a_id, card_b_id, picked_card_id, time_to_decision_ms }`
   - Validates swipe_index matches expected (server-side counter)
   - Records to `swipe_history` (UNIQUE on user_id+swipe_index for idempotency)
   - Computes Bayesian update on `style_blend_provisional`
   - Returns updated provisional blend
   - Edge: duplicate pick → `INSERT ... ON CONFLICT DO NOTHING`, returns current state
   - failure_category: `quiz_pick_record_fail`, `quiz_pick_swipe_index_mismatch`, `quiz_pick_invalid_card`

5. **POST /api/quiz/finalize**
   - Called after swipe 12
   - Copies `style_blend_provisional` → `style_blend` with version: 1, computed_at: now()
   - Sets `users.onboarding_state.quiz_complete = true`, `quiz_completed_at = now()`
   - Fires Sonnet 4.5 descriptor generation in background (fire-and-forget)
   - Returns final blend + null descriptor (descriptor populates within ~3s on style-reveal)
   - failure_category: `quiz_finalize_fail`

6. **POST /api/quiz/regenerate-descriptor**
   - Sonnet 4.5 prompt: `"Generate a single italic-tone descriptor (1-2 sentences) blending these styles: {style_blend}. Output only the descriptor, no preamble."`
   - Cost: ~$0.005, ~2-3s latency
   - Persists to `users.style_descriptor` with version+1
   - On Sonnet failure: falls back to client-side template, sets `is_template_fallback: true`
   - Writes render_cost_log with category `quiz_descriptor`
   - failure_category: `quiz_descriptor_sonnet_fail`, `quiz_descriptor_template_fallback`

7. **POST /api/quiz/tweak-save**
   - Body: `{ tweaked_blend: { warm_japandi: 0.6, coastal: 0.3, ... } }`
   - Validation: percentages sum to 1.0 (±0.01 tolerance), max 3 styles ≥10%, all values [0, 1]
   - Persists to `users.style_blend` with version+1, `tweaked: true`
   - Triggers descriptor regen (background)
   - failure_category: `quiz_tweak_validation_fail`, `quiz_tweak_save_fail`

8. **POST /api/quiz/resume**
   - Reads `users.onboarding_state`
   - If `quiz_pick_count > 0 AND quiz_pick_count < 12`: returns `{ resumable: true, picks_completed: N }`
   - Else: `{ resumable: false }`

### 2B — UI

**M6 — Quiz UI screens**

All screens responsive (mobile + desktop) with reduced-motion alternatives.

#### Welcome screen (/onboarding/welcome)

**Tool:** Frontend Visionary in Claude Code (custom R3F animation)

**Intent:** show forced-choice mechanic before user commits.

**Layout:**
- Full-bleed navy backdrop, no nav, no logo, no skip
- Headline: *"Welcome, [first_name]."* EB Garamond Light 64px, ivory
- Subhead: *"Let's find your style."* EB Garamond Italic 28px, ivory 75%
- Demo animation: centered, 600×400 desktop / 90% width mobile
- CTA: "Begin the quiz →" gold pill
- Microcopy below CTA: *"Twelve picks. About 90 seconds."* DM Sans 13px ivory 50%

**Demo animation (3D, 6-second loop):**
- 0.0–0.5s: Two interior cards fly in from opposite sides, settle side-by-side with 3D tilt and parallax depth, thin gold frames
- 0.5–1.5s: Brief hold, subtle 1.0→1.02→1.0 breathing
- 1.5–2.0s: Gold glowing cursor dot glides to right card, taps it. Right card pulses 1.06 + gold border glow
- 2.0–3.0s: Chosen card floats up/forward toward camera with gold particle trail; other card fades and recedes
- 3.0–4.0s: Subtle gold progress arc upper-right fills slightly
- 4.0–5.5s: New pair flies in (different rooms, different styles), settles
- 5.5–6.0s: Hold, seamlessly loops to start

**Production:**
- Three.js / React Three Fiber via Frontend Visionary
- 2 flat plane meshes per card, stacked 3 layers each for parallax
- Card textures: 6 hand-picked interior images, 800×600 WebP, total <300KB
- Cursor dot: SVG overlay (HTML, not WebGL)
- Progress arc: SVG overlay
- Animation orchestration: GSAP timeline, 6s loop, perfect seamless loop
- Total bundle: <500KB
- 60fps target on mid-tier devices

**Smoothness requirements:**
- All card movements: cubic-bezier(0.22, 1, 0.36, 1)
- Card flight in: 500ms with 30px overshoot then settle
- Card scale on selection: 200ms ease-out
- Card exit: 1000ms gentle-out parallel scale + fade + translation
- Particle trail: smooth gold gradient with motion blur baked into texture
- Loop seam: imperceptible — last frame matches first frame exactly
- Frame timing locked to requestAnimationFrame; <50fps drops trigger reduced-motion auto-fallback

**Performance budget:**
- LCP: text + CTA renders within 800ms
- Animation lazy-loads after critical paint, fades in 600ms once ready
- If R3F bundle not loaded within 1.5s, show static placeholder (two card silhouettes with cursor near one, tally at "3 of 12")
- 60fps target on devices ≥4 years old
- If GPU/CPU strain detected (>25ms frame time sustained), auto-degrade

**Entrance choreography (page load):**
1. Page fades in from black 600ms ease-out
2. Headline reveals letter-by-letter at 60ms stagger (gentle-out 800ms each)
3. Subhead fades in 200ms after headline (600ms gentle-out)
4. Animation fades in 400ms after subhead (600ms ease, R3F canvas mounts)
5. CTA fades in 400ms after animation visible (600ms gentle-out, 1.04→1.0 settle)
6. Microcopy fades in 200ms after CTA
- Total: ~3.5s

**Reduced motion:** animation freezes on a single still — two cards side-by-side, gold cursor near right card, progress arc at "3 of 12". Caption: *"You'll pick between two rooms. Twelve picks. About 90 seconds."*

**Behavior:**
- Click CTA → routes directly to /onboarding/quiz (NO separate quiz intro)
- Onboarding gated: dashboard checks `users.onboarding_state.quiz_complete`; if false, redirects here
- Demo auto-fade-out when CTA clicked (200ms)

**Edge cases:**
- User name special characters: truncate at 30 chars
- Non-Latin script names: fallback to Georgia for headline
- No name (rare): "Welcome." headline alone
- Slow connection: text-first within 1s, animation lazy-loads, static placeholder until ready

**Analytics:**
- onboarding_welcome_viewed
- onboarding_welcome_animation_loaded {time_ms}
- onboarding_quiz_started

#### Quiz screen (/onboarding/quiz)

**Tool:** Frontend Visionary

**Intent:** forced-choice A vs B. Premium minimal. Cards are the only loud element.

**Layout:**
- Full-bleed navy
- Top bar: Cova logo gold left, "Question N of 12" DM Sans 13px medium tracking 0.18em uppercase ivory 60% right
- No menu, no settings, no help icon, no profile
- Cards: ~480×640px each desktop / ~85% viewport width × 1.33 aspect mobile, centered. 96px gap desktop, 24px mobile
- Below cards: italic prompt 24px ivory 80%. 80px margin from cards
- Bottom: 1px gold progress bar fills smoothly between question changes

**Card structure (4 layers per card):**
1. Background: Gaussian-blurred copy of room photo, scaled 110%
2. Shadow: `0 24px 80px rgba(9,24,41,0.4)`
3. Image: actual interior photo at full resolution, WebP q88, ~120-180KB
4. Frame + caption: 1px gold border (visible only on hover); bottom 56px caption strip with letter "A" or "B" in EB Garamond Italic 28px gold (NO style name shown — avoid label bias)

**Hover state (rendy.io pattern, locked):**
```css
.quiz-card {
  width: 480px; height: 640px;
  perspective: 1200px;
  cursor: pointer;
  transition: transform 600ms cubic-bezier(0.22, 1, 0.36, 1);
  transform-style: preserve-3d;
  --rotate-x: 0deg; --rotate-y: 0deg;
}
.quiz-card:hover {
  transform: rotateX(var(--rotate-x)) rotateY(var(--rotate-y)) scale(1.04);
}
.quiz-card-inner {
  width: 100%; height: 100%; position: relative;
  border-radius: 4px; overflow: hidden;
  box-shadow: 0 12px 24px rgba(9, 24, 41, 0.3);
  transition: box-shadow 600ms cubic-bezier(0.22, 1, 0.36, 1);
}
.quiz-card:hover .quiz-card-inner {
  box-shadow: 0 32px 64px rgba(9, 24, 41, 0.5);
  outline: 1px solid #C9A84C;
}
.quiz-card img { transition: transform 600ms cubic-bezier(0.22, 1, 0.36, 1); }
.quiz-card:hover img { transform: scale(1.06); }
```

JS handler updates `--rotate-x` and `--rotate-y` based on mouse position relative to card center, max ±6°. Other card simultaneously fades to 70% opacity over 600ms.

**Click / tap selection (1.5s total):**
- 0–250ms: Selected pulses to 1.06 scale, 1.5px gold border at full opacity, brief gold inner glow. Other card fades to 30% opacity, scales to 0.96. Pointer events disabled on both cards.
- 250–650ms: Hold. Progress bar advances 1/12 over this 400ms.
- 650–1450ms: Exit. Selected lifts up 40px + scales 1.10 + fades over 800ms cubic-bezier(0.65,0,0.35,1). Other recedes scale 0.88 + fades 600ms ease-out. 3-particle gold trail behind selected.
- 1100–1700ms: New pair flies in from opposite sides, 100ms stagger, 700ms gentle-out, 30px overshoot then settle.

**Behavior:**
- A/B keyboard support: press A or B to select
- Logo click or browser back: confirmation modal "Leave the quiz? Your progress is saved." Two CTAs: "Stay" / "Leave."
- Auto-save provisional `style_blend_provisional` every 3 picks
- Predictive prefetch of next pair while current pair viewed (`<link rel="prefetch">`)
- Resume flow: if user returns mid-quiz, /onboarding/quiz/resume shows confirmation card
- Image load failure: silhouette fallback, auto-skip after 5s

**Mobile:**
- Cards stack vertically (top/bottom)
- Same dimensions ratio
- No hover state (touch device)
- Tap to select: slight scale-down on touch-down (0.98), back to 1.0 on touch-up if not committed
- Single tap commits

**Reduced motion:**
- Scale animations collapse to opacity fade-only
- Parallax-on-hover disabled
- Card transitions: 300ms cross-fade
- Particle trail disabled
- Progress bar fills instantly on click

**Edge cases:**
- Card image fails to load: navy gradient placeholder with ivory "Image unavailable" italic 60%. Logged with `image_load_failed: true`. Auto-skips next pair after 3-5s.
- Rapid double-click: first commit wins, subsequent ignored during transition
- Network interruption mid-pick: click registers locally, queues for upload. Reconnection within 30s syncs silently.
- Out-of-order swipes: server reconciles via swipe_index, takes first received

**Analytics:**
- quiz_question_viewed {question_index, card_a_id, card_b_id}
- quiz_card_selected {question_index, card_id, time_to_decision_ms}
- quiz_card_hovered {question_index, card_side, hover_duration_ms} (desktop only, sampled 10%)
- quiz_question_abandoned {question_index, time_on_question_ms}
- quiz_completed {duration_ms, questions_answered}
- quiz_resumed {questions_completed_before_resume}
- quiz_pair_auto_skipped (image load fail)

#### Finishing screen (/onboarding/quiz/finishing)

**Tool:** Frontend Visionary (custom multi-layer animation)

**Intent:** pause; build anticipation; not a loading spinner.

**Three motion layers:**

**Layer 1 — Brand mark (center, anchor):**
- 3 concentric gold SVG arcs with stroke gradient (ivory→gold→ivory)
- Outer arc: 3px stroke, 1200ms draw, cubic-bezier(0.65, 0, 0.35, 1)
- Middle arc: 2px stroke, 1000ms draw, starts at 200ms
- Inner arc: 1.5px stroke, 800ms draw, starts at 400ms
- Two breath cycles after drawing: scale 1.0→1.04→1.0 over 1400ms each, with box-shadow glow 0→32px→0

**Layer 2 — Memory fragments (peripheral, ambient):**
- 6-8 floating image cards from user's chosen quiz cards (sampled from swipe_history right-swiped) OR fallback `/public/finishing-fallback/` editorial images
- Each: 240×320px, 12px Gaussian blur, 25-40% opacity, ±3-6° rotation, slight gold tint
- Drift at 0.5-2px/sec random direction, slow rotation (1-3°/sec)
- Greater depth (lower opacity) drifts slower (parallax)
- Off-screen drift triggers fade + respawn at random edge
- Preloaded after Q6 (~600KB total)

**Layer 3 — Ambient particles (atmospheric):**
- 12-16 small gold dots (2-4px each)
- Opacity 0.4-0.7, slight blur for glow
- Ascend from bottom at 30-60px/sec, slight horizontal sin wave
- Highest concentration converges toward brand mark center
- Fade as they approach mark

**Caption:**
- *"Reading your style."* for first 2.4s
- Word-by-word cross-fade over 600ms to *"Almost there."*
- EB Garamond italic 32px ivory 90%, 80px below brand mark

**Total duration:** ~4.8 seconds. Server-side Bayesian computation completes in ~50-100ms; screen exists for narrative pacing.

**Transition out:** 400ms fade to black, then style reveal fades in. Brand mark position carries to next screen for visual continuity.

**Performance:**
- Fragment images preloaded after quiz Q6 (~600KB)
- All animations GPU-accelerated (transforms + opacity only)
- Lower-end device fallback: 4 fragments, 8 particles, no breath glow

**Reduced motion:**
- Arcs appear simultaneously with simple fade-in
- Fragments static at fixed positions (no drift, no rotation)
- Particles disabled
- Caption transition still occurs
- Compressed duration: 1.5s

**Edge cases:**
- Computation >8s: caption changes to *"Just a moment more…"*
- Computation >15s: error state with retry CTA
- Network loss: provisional saves protect; server reconciles on reconnect
- Refresh: dashboard if complete server-side, resume flow otherwise

**Analytics:**
- quiz_finishing_started, quiz_finishing_completed {duration_ms}, quiz_finishing_timeout

#### Resume screen (/onboarding/quiz/resume)

**Tool:** Frontend Visionary

**Layout:** centered ivory card 480px on full-bleed navy. Headline EB Garamond Italic 32px navy: *"Welcome back, you're [N] questions in."* Subhead DM Sans 14px navy 70%: *"Continue where you left off?"* Single CTA gold pill: "Continue."

**Behavior:** click CTA → routes to /onboarding/quiz, picks up at swipe_index = N+1 with `style_blend_provisional` intact.

#### Style reveal (/onboarding/style-reveal) — Phase A + Phase B

**Tool:** Draftly Pro for cinematic spine + Frontend Visionary for overlays

**Architecture (LOCKED):** ONE generic Draftly cinematic (4 chained Veo clips, ~$1 one-time) + dynamic CSS color-grade overlay + dynamic HTML/SVG personalization layer (Option B locked, NOT 10 per-style cinematics).

**Total scroll:** ~6500px desktop / ~5000px mobile. Two phases:
- Phase A (scroll 0-5000px): cinematic reveal
- Phase B (scroll 5000-6500px): interactive tweak

**Phase A beats:**

| Beat | Scroll | What happens |
|---|---|---|
| Anticipation | 0–800px | Brand mark holds from finishing screen, eyebrow "YOUR STYLE IS" gold letter-stagger 80ms. Pulsing scroll hint at bottom. |
| Approach | 800–1900px (Veo clip 1) | Camera through gold particles toward generic editorial threshold (warm-wood doorframe). Italic at 1100px: *"This is what you've been imagining."* |
| Arrival | 1900–3000px (Veo clip 2) | Camera enters editorial interior, holds details, lifts. Italic 2200px: *"It's what you keep coming back to."* 2700px: style-specific microcopy (one of 10 locked phrases from §4.8). |
| Fingerprint reveal | 3000–4000px (STATIC OVERLAY) | Canvas holds, HTML/SVG arcs grow to TRUE percentages (outer = primary 73%, middle = secondary 18%, inner = tertiary 9%). DM Sans 12px tracking 0.18em labels at arc tips with thin gold connector lines. Pulse + gold glow flourish. |
| Naming | 4000–5000px (Veo clip 3) | Camera pulls back, fingerprint migrates to upper-right ~120px. Headline EB Garamond Light Italic 96px gold letter-stagger 100ms ("Warm Japandi."). Sub italic 32px ivory 80% word-by-word stagger ("with a touch of Coastal."). Descriptor italic 22px ivory 70% max-width 540px from `users.style_descriptor`. |

**Phase B (scroll 5000-6500px):**

At scroll 5000px, cinematic settles into ambient loop (last clip frames 180-200 looped seamlessly at 24fps, dimmed 60% opacity).

**Foreground content:**
- Eyebrow "YOUR STYLE"
- Headline + sub holds from cinematic
- Interactive fingerprint visualization
- Personalized descriptor below fingerprint
- Two CTAs: "Tweak this" (ghost ivory 70% gold underline) | "Continue →" (gold pill)
- Microcopy: *"Next: art, lighting, smart tech."*

**TWEAK MODE (activated by "Tweak this" click):**
- Fingerprint arc tips become draggable handles (drag forward/back to adjust %)
- Per-style sliders below fingerprint for direct manipulation
- "Add another style" link expands to show all 10 styles
- Auto-rebalance keeps total = 100%
- Max 3 active styles at any time (4th replaces lowest)
- Live descriptor regeneration via client-side template (instant) during drag
- Sonnet 4.5 refinement called on "Save changes" (~$0.005, polished version overwrites template after ~2s)
- Two CTAs in tweak mode: "Reset to quiz" | "Save changes →"
- After save: tweak collapses, "Style updated" confirmation, Continue CTA pulses

**Color grade overlay** (CSS filter applied via class from `users.style_blend.primary`, see §4.9 for all 10 classes). Mix-blend-mode overlay between canvas and HTML overlay.

**Production:**
- 1 generic Draftly cinematic (4 chained Veo clips), ~$1 cost, one-time
- 10 CSS color-grade variants
- 10 style-specific microcopy lines (§4.8)
- 10 style-specific descriptor fragments (§4.7)
- Frame storage on Cloudflare R2, ~64MB total
- Sonnet 4.5 generates personalized blended descriptor at quiz completion (~$0.005/user)

**Per-user runtime cost:**
- Sonnet descriptor at quiz completion: ~$0.005
- Sonnet descriptor regen on tweak save: ~$0.005

**Continue CTA:** routes to `/onboarding/personalization/art` (Phase 4 begins).

**Edge cases:**
- All-equal blend: top 3 with equal weight, "Eclectic mix" descriptor, neutral color grade
- User tweaks then refreshes mid-tweak: client-side state lost, returns to last-saved state
- User clicks Continue before saving tweak: warning modal "Save your changes? / Discard / Cancel"
- Sonnet descriptor regen fails: falls back to client-side template, log error
- Tweak then immediate Continue: Sonnet call still happens in background; user moves forward without waiting

**Analytics:**
- style_reveal_viewed
- style_reveal_scroll_complete (reached Phase B)
- style_tweak_opened
- style_tweak_save (with delta from quiz-derived percentages)
- style_tweak_reset
- style_reveal_continue_clicked
- style_descriptor_generated_failed

### 2C — Integration + review

- Wire frontend to all 6 quiz API routes
- Predictive prefetch next pair
- Auto-skip on image load failure (5s timeout)
- Confirmation modal on logo click / browser back during quiz
- PostHog events fire correctly across all flows
- Reduced-motion alternatives tested for all screens
- Mobile responsive tested for all screens
- Verifier 7-phase covers happy path + 4 adversarial:
  - Network drop mid-quiz (recovery via resume)
  - Image load fail on a pair (auto-skip)
  - Browser back mid-tweak (confirmation modal)
  - Tab close mid-finishing (resume flow handles correctly)

---

## 7. Out of scope

- Capture flow (Phase 3)
- Personalization (Phase 4)
- Render pipeline (Phase 5)
- Refine (Phase 6)
- Shop (Phase 7)
- Token enforcement (Phase 8)
- Dashboard (Phase 9)
- Landing page (Phase 10)
- Existing iOS app (never touch in V1)

---

## 8. Files touched

### Created
- `apps/web/app/onboarding/welcome/page.tsx`
- `apps/web/app/onboarding/quiz/page.tsx`
- `apps/web/app/onboarding/quiz/finishing/page.tsx`
- `apps/web/app/onboarding/quiz/resume/page.tsx`
- `apps/web/app/onboarding/style-reveal/page.tsx`
- `apps/web/app/api/quiz/next-pair/route.ts`
- `apps/web/app/api/quiz/submit-pick/route.ts`
- `apps/web/app/api/quiz/finalize/route.ts`
- `apps/web/app/api/quiz/regenerate-descriptor/route.ts`
- `apps/web/app/api/quiz/tweak-save/route.ts`
- `apps/web/app/api/quiz/resume/route.ts`
- `apps/web/lib/quiz/bayesian.ts`
- `apps/web/lib/quiz/sonnet-descriptor.ts`
- `apps/web/lib/quiz/template-descriptor.ts`
- `apps/web/lib/quiz/style-fragments.ts` (10 fragments)
- `apps/web/lib/quiz/style-microcopy.ts` (10 microcopy lines)
- `apps/web/lib/quiz/style-color-grades.ts` (10 CSS classes)
- `apps/web/components/quiz/QuizCard.tsx`
- `apps/web/components/quiz/QuizPair.tsx`
- `apps/web/components/quiz/QuizPrompt.tsx`
- `apps/web/components/quiz/Finishing.tsx`
- `apps/web/components/quiz/MemoryFragments.tsx`
- `apps/web/components/quiz/AmbientParticles.tsx`
- `apps/web/components/welcome/DemoAnimation.tsx` (R3F)
- `apps/web/components/style-reveal/PhaseA.tsx`
- `apps/web/components/style-reveal/PhaseB.tsx`
- `apps/web/components/style-reveal/Fingerprint.tsx`
- `apps/web/components/style-reveal/TweakMode.tsx`
- `apps/web/components/style-reveal/StyleSlider.tsx`
- `cova-plan/quiz/prompt-bible.md` (M4)
- `cova-plan/quiz/validation-report.md` (M4)
- `cova-plan/quiz/final/{style}/` (M4 — 200-250 cards if regen runs)
- `tests/quiz/bayesian.test.ts` (NEW Phase 2 test, not Phase 1)
- `tests/quiz/api-routes.test.ts`
- `tests/quiz/idempotency.test.ts`

### Migrations (reversible)
- `supabase/migrations/{ts}-quiz-cards-table.sql` + `_down.sql`
- `supabase/migrations/{ts}-swipe-history-table.sql` + `_down.sql`
- `supabase/migrations/{ts}-users-quiz-cols.sql` + `_down.sql`

### Modified
- `apps/web/lib/analytics/events.ts` (add quiz events)
- `apps/web/middleware.ts` (gate dashboard on `quiz_complete`)

---

## 9. API contracts

### POST /api/quiz/next-pair
```
Body: {} (auth from session)
Returns: {
  ok: true,
  card_a: { id: string, image_url: string },
  card_b: { id: string, image_url: string },
  prompt: string,
  swipe_index: number
}
Or: { ok: false, failure_category, user_message }
```

### POST /api/quiz/submit-pick
```
Body: {
  swipe_index: number,
  card_a_id: string,
  card_b_id: string,
  picked_card_id: string,
  time_to_decision_ms: number
}
Validation: zod schema, swipe_index 0..11, card_a/b_id must exist in quiz_cards
Returns: { ok: true, updated_blend: object, next_swipe_index: number }
Idempotency: UNIQUE(user_id, swipe_index) → re-POSTs return current state
```

### POST /api/quiz/finalize
```
Body: {} (auth from session, swipe_index 11 confirmed)
Returns: { ok: true, final_blend: object, descriptor_pending: true }
Side effect: fires Sonnet descriptor generation in background
```

### POST /api/quiz/regenerate-descriptor
```
Body: { reason?: 'tweak_save' | 'manual_refresh' }
Returns: { ok: true, descriptor: { text, generated_by, version, is_template_fallback } }
On failure: falls back to template, returns with is_template_fallback: true
```

### POST /api/quiz/tweak-save
```
Body: { tweaked_blend: { warm_japandi: 0.6, coastal: 0.3, ... } }
Validation: sum=1.0 ±0.01, max 3 styles ≥10%, all values [0,1]
Returns: { ok: true, descriptor_pending: true }
```

### POST /api/quiz/resume
```
Body: {} (auth from session)
Returns: { resumable: boolean, picks_completed?: number }
```

All routes return Phase 1 error envelope on failure.

---

## 10. Schema migrations

(See §6 M5 for full DDL)

---

## 11. Failure handling

```typescript
// apps/web/lib/errors/categories.ts (additions)
export type QuizFailure =
  | 'quiz_pair_select_fail'
  | 'quiz_pair_no_cards_available'
  | 'quiz_pick_record_fail'
  | 'quiz_pick_swipe_index_mismatch'
  | 'quiz_pick_invalid_card'
  | 'quiz_finalize_fail'
  | 'quiz_descriptor_sonnet_fail'
  | 'quiz_descriptor_template_fallback'
  | 'quiz_tweak_validation_fail'
  | 'quiz_tweak_save_fail'
  | 'quiz_resume_fail';
```

| Category | Recovery |
|---|---|
| quiz_pair_no_cards_available | Falls back to random pair from any styles; logs as warning |
| quiz_pick_swipe_index_mismatch | Server returns expected swipe_index; client re-syncs |
| quiz_descriptor_sonnet_fail | Falls back to template descriptor (instant); user sees no error |
| quiz_tweak_validation_fail | Form shows inline error; user retries |
| Resume after long gap | Server still has provisional; client resumes |

---

## 12. Cost budget

| Source | Estimated cost |
|---|---|
| Claude credits | $80–120 |
| FLUX.1 Schnell card regen (M4 if runs) | ~$1.20 |
| Veo 3.1 cinematic (Phase A, one-time) | ~$1 |
| Sonnet descriptors during testing | ~$5 |
| **Total** | **~$90–130** |

---

## 13. Verifier focus areas

| Criterion | Verifier check |
|---|---|
| 200-250 cards in quiz_cards table | `SELECT COUNT(*) FROM quiz_cards GROUP BY primary_style` — each style has 20-25 |
| All cards in quiz-images bucket | Spot-check 10 random card image_urls return 200 |
| Bayesian engine correctness | `tests/quiz/bayesian.test.ts` covers initialBlend, updateBlend asymmetry, entropyMaxPair, finalizeBlend |
| API idempotency | `tests/quiz/idempotency.test.ts` POSTs same swipe_index twice, expects same result |
| failure_category enums | All 11 quiz failure codes exist in lib/errors/categories.ts |
| Sonnet cost telemetry | Each /finalize and /tweak-save writes render_cost_log row with category 'quiz_descriptor' |
| Welcome demo loads | R3F bundle loads < 1.5s on 4G; static fallback if slower |
| Quiz hover state | Manual review confirms 600ms tilt + 1.04 scale + box-shadow expansion |
| Click selection sequence | Manual review confirms 1.5s timing |
| Finishing screen 3 layers | Manual review confirms brand mark + fragments + particles all render |
| Style reveal Phase A scroll | Manual review confirms 4 Veo clips chain seamlessly |
| Phase B tweak mode | Drag arc → blend updates → descriptor regenerates client-side instantly |
| Tweak save | Triggers Sonnet regen in background; descriptor updates within ~2s |
| Resume flow | Close mid-quiz, reopen → /resume shows correct N |
| Auto-skip on image fail | Block one card image URL via DNS, confirm 5s skip fires |
| Reduced motion | OS preference set → all animations degrade per spec |
| Mobile responsive | All 5 screens (welcome, quiz, finishing, resume, style-reveal) work on iPhone Safari |

---

## 14. Adversarial code review checklist

- [ ] Bayesian update — does asymmetric +0.10 / -0.05 actually apply, not symmetric?
- [ ] Renormalization — does sum stay 1.0 across all picks (no float drift accumulation)?
- [ ] Entropy-max pair selection — does it actually select highest-uncertainty styles, not random?
- [ ] Idempotency — `INSERT ... ON CONFLICT DO NOTHING` on swipe_history works correctly
- [ ] Server-side swipe_index validation — rejects out-of-order picks
- [ ] All 11 failure_category enum values used in actual error paths
- [ ] Sonnet descriptor regen — fire-and-forget, doesn't block /finalize response
- [ ] Sonnet failure — falls back to template, not error to user
- [ ] Tweak validation — sum=1.0 tolerance is ±0.01 (not 0.0 exact)
- [ ] Tweak max-3-active — 4th style attempt actually drops the lowest
- [ ] cards image URLs — RLS allows public read on quiz-images bucket
- [ ] All client-side state survives refresh — provisional in DB, descriptor in DB
- [ ] No raw style codenames in user-facing copy — only display names
- [ ] R3F bundle — lazy-loaded, doesn't block LCP
- [ ] Quiz hover — `--rotate-x` and `--rotate-y` updated via JS not CSS-only
- [ ] Click selection — pointer events disabled on both cards during 1.5s sequence
- [ ] Predictive prefetch — uses `<link rel="prefetch">`, not eager fetch
- [ ] Confirmation modal on browser back — actually fires (popstate listener)
- [ ] Logo click triggers same modal as browser back
- [ ] Reduced-motion CSS query honored across all 5 screens
- [ ] Memory fragments preloaded after Q6 (not on screen mount)
- [ ] Style reveal Phase A scroll math — 11 beats map to correct scroll positions
- [ ] Phase B tweak — descriptor uses CLIENT template during drag (no Sonnet calls per tick)
- [ ] All quiz events typed via lib/analytics/events.ts (no string literals at call sites)
- [ ] EXIF strip pipeline NOT used here (not capture phase) but verifier confirms it's still wired from Phase 1

---

## 15. Manual click-script

Save screenshots to `cova-plan/manual-evidence/P2/`.

### Welcome happy path
1. Sign in → /welcome loads → static placeholder shows briefly → R3F demo animation begins **[B1: welcome-loaded.png]**
2. Watch 12-second loop → confirm seamless seam **[B2: welcome-loop.png]** (capture mid-loop)
3. Click "Begin the quiz →" → /onboarding/quiz loads with first pair **[B3: quiz-q1.png]**

### Quiz happy path
4. Hover left card → confirm 1.04 scale + parallax tilt + box-shadow expansion + outline gold + image scale 1.06 **[B4: quiz-hover.png]**
5. Click left card → watch 1.5s selection sequence + particle trail + new pair fly in
6. Press 'A' on Q2 → confirm keyboard works **[B5: quiz-q2.png]**
7. Press 'B' on Q3
8. Continue all 12 picks at varying speeds (some <1s decisions, some ~5s) **[B6-B14: quiz-q4 through quiz-q12.png]** (sample 9)
9. After Q12 click → /onboarding/quiz/finishing loads
10. Watch ~4.8s 3-layer animation → brand mark draws + fragments drift + particles ascend + caption transitions **[B15: finishing-layer.png]**
11. Auto-redirects to /onboarding/style-reveal

### Style reveal Phase A
12. Scroll to ~800px → Beat 2 microcopy appears **[B16: reveal-approach.png]**
13. Scroll to ~2700px → Beat 3 style-specific microcopy appears (e.g., "Quiet light. Natural texture. Restraint." for Warm Japandi primary) **[B17: reveal-arrival.png]**
14. Scroll to ~3500px → Beat 4 fingerprint static overlay → arcs grow to TRUE percentages **[B18: reveal-fingerprint.png]**
15. Scroll to ~4500px → Beat 5 naming → "Warm Japandi." headline appears **[B19: reveal-naming.png]**

### Style reveal Phase B + tweak
16. Scroll to ~5500px → Phase B foreground stable → CTAs visible **[B20: reveal-phaseB.png]**
17. Click "Tweak this" → fingerprint becomes interactive **[B21: tweak-active.png]**
18. Drag outer arc tip → blend updates → descriptor regenerates client-side instantly **[B22: tweak-drag.png]**
19. Click "Add another style" → all 10 styles visible
20. Increase Coastal slider to 30%, decrease Warm Japandi to 50% **[B23: tweak-multistyle.png]**
21. Try to set 4 styles ≥10% → confirm lowest auto-drops to 0%
22. Click "Save changes →" → ~2s later descriptor updates with Sonnet polished version **[B24: tweak-saved.png]**
23. Click "Continue →" → routes to /onboarding/personalization/art (Phase 4 not built yet, expect 404 — confirm route correct in URL bar)

### Resume flow
24. Sign in as new test user → start quiz → make 5 picks → close tab
25. Reopen tab, navigate to /welcome → redirects to /onboarding/quiz/resume **[B25: resume.png]**
26. Click "Continue" → resumes at Q6 with style_blend_provisional intact

### Reduced motion
27. Enable OS reduced motion → reload /welcome → animation freezes on still **[B26: welcome-reduced.png]**
28. Quiz: hover does not trigger parallax; click is cross-fade only **[B27: quiz-reduced.png]**
29. Finishing: arcs appear simultaneously, no fragment drift **[B28: finishing-reduced.png]**

### Mobile responsive
30. iPhone Safari: open all 5 screens → cards stack vertical, text resizes correctly **[B29-B33: mobile-{welcome,quiz,finishing,reveal-A,reveal-B}.png]**

### Adversarial
31. Disconnect WiFi mid-quiz on Q5 → make pick → reconnect → confirm pick synced
32. Block one card image URL via browser devtools → confirm 5s auto-skip fires **[B34: image-fail-skip.png]**
33. Click logo on Q7 → confirmation modal appears **[B35: leave-modal.png]**

---

## 16. Manual evidence bundle

- 30-35 screenshots from §15
- INDEX.md linking each to spec criterion
- Recording (mp4, optional) of: full quiz happy path, full style reveal scroll, tweak mode interactions
- Sonnet descriptor sample outputs for 5 different style_blend distributions
- M4 validation report (`cova-plan/quiz/validation-report.md`)

---

## 17. Remediation budget

- Round 1: Verifier session 1 self-heals
- Round 2: Verifier session 2 finds new issues → remediation prompt → fresh executor session fixes
- Round 3 (escalation): write `cova-plan/escalations/P2.md`, halt

Manual gate failure → fresh executor session via remediation prompt. Doesn't count against 2-round budget.

---

## 18. Closing checklist

- [ ] All 30+ screenshots in `cova-plan/manual-evidence/P2/`
- [ ] INDEX.md written
- [ ] `PHASE_STATUS.md` Phase 2 → CLOSED
- [ ] `OPEN_DECISIONS.md` updated with D-022 (Sonnet 4.5 vs 4.6 for descriptor)
- [ ] `EMPIRICAL_FINDINGS.md` updated with: M4 validation results (Fleiss kappa, match-to-label %), R3F demo loading time on 4G, average quiz completion time, Sonnet descriptor latency p50/p95
- [ ] Phase 3 prereq section reviewed
- [ ] Verifier reports archived
- [ ] Session handoffs written

---

## 19. Rollback plan

Revert merge commit on main → run paired _down.sql in reverse:
1. users-quiz-cols down (drops style_blend, style_descriptor, onboarding_state, style_blend_provisional)
2. swipe-history down
3. quiz-cards down (drops table; cards remain in bucket but unreferenced)
4. Restore Phase 1 routing (auth → /welcome falls through to dashboard fallback)

If only UI broken but backend solid: feature-flag-disable the 5 quiz routes with `quiz_ui_enabled=false`, redirect to a "We're polishing the experience" placeholder.

---

## 20. Feature flags introduced

| Flag key | Description | Default |
|---|---|---|
| `quiz_resume_enabled` | /onboarding/quiz/resume route active | true |
| `quiz_tweak_mode_enabled` | Phase B tweak interactivity | true |
| `quiz_descriptor_sonnet_enabled` | Use Sonnet (vs always template) | true |
| `quiz_predictive_prefetch_enabled` | Prefetch next pair images | true |

---

## End of Phase 2 doc.

Next: Phase 3 (Capture).
