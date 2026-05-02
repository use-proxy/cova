# Phase 4 — Personalization

**Cova V1 implementation · Phase 4 of 12 · Self-contained**

---

## Phase identity

| | |
|---|---|
| **Phase number** | 4 of 12 |
| **Goal** | Three sequential personalization slots (Art, Smart Tech, Lighting) that drive the render pipeline. Each slot independent, each skippable. Output: `personalization_manifest` jsonb feeding Stage 3 of Phase 5 director. |
| **Executor session estimate** | 3–4 sessions |
| **Calendar estimate** | 1.5–2 weeks |
| **Predicted Claude credits** | ~$40–60 |
| **Predicted infra spend** | ~$15 (Sonnet smart-tech recommendations × test cases, Serper validation calls, FLUX/schnell art generation, cova-composite-art Modal pass-rate test) |
| **Depends on** | Phase 1, 2, 3 closed |
| **Blocks** | Phase 5 (render needs personalization_manifest) |

---

## 1. The session loop for this phase

1. **Open new claude.ai chat.** Paste this entire phase doc.
2. **Chat summarizes back.** Confirms understanding, lists gaps. You confirm.
3. **Planner fires.** Fresh Claude Code session. Drift check confirms Phase 3 closed and `rooms` table has new capture columns. Verifies cova-composite-art Modal app is deployed and reachable (Modal CLI list). Uses Context7 MCP for: current Sonnet 4.5 prompt patterns, current fal.ai/flux/schnell endpoint, current Serper Google Shopping API. Uses EXA MCP for: lifestyle-based product recommendation patterns, Approach A (composite) vs Approach C (side-panel) UX patterns. Writes executor prompt to `cova-plan/planner-output/P4-executor-prompt.md`.
4. **Executor prompt returns.** Verify covers M8 acceptance criteria.
5. **Executor fires.** 3–4 sessions. Slot 1 (Art) first, then Slot 2 (Smart Tech), then Slot 3 (Lighting), then integration.
6. **Verifier session 1 fires.** Reviews Sonnet→Serper validation flow, IP filter correctness, manifest assembly across all 8 skip/complete combinations, cova-composite-art pass rate. Self-heals.
7. **Verifier session 2 fires.** Independent. Hunts for: hallucinated product recovery, IP filter false-positive bypass, composite fallback to Approach C, manifest schema integrity.
8. **Manual screenshot review.** §15 click-script. ~25 screenshots covering all 3 slots × 3 modes for art, with skip variants.
9. **Document updates.** `PHASE_STATUS.md`, `OPEN_DECISIONS.md`, `EMPIRICAL_FINDINGS.md` (composite pass-rate, Sonnet→Serper validation rate).

---

## 2. Prereq verification

### Phase 1+2+3 closure checks
- `PHASE_STATUS.md` shows P1, P2, P3 → CLOSED
- `rooms` table has `hard_room_score`, `processed_url`, `is_room`, `contains_people`, `status` columns
- `users.style_blend` populated for test user
- Sentry, redactLogPayload, cost log, failure_category, PostHog all in place from Phase 1
- Quiz routes operational (Phase 2)
- Capture routes operational (Phase 3)
- cova-composite-art Modal app deployed on A10G — verify via Modal CLI: `modal app list | grep cova-composite-art`
- fal.ai API key in `apps/web/.env.local`
- Serper API key in `apps/web/.env.local` (or fresh setup if not)

### Halt conditions
- cova-composite-art not deployed → halt, escalate (Modal app must be live)
- Serper API key missing → halt, get key
- `rooms` table missing capture columns → halt, escalate (Phase 3 incomplete)

---

## 3. Pre-decisions

**G1. Lifestyle chip taxonomy (locked).** *Resolution:* 6 chips: `kids`, `pets`, `WFH`, `frequent_guests`, `single_person`, `couple`. User can select multiple. Multi-select on a chip group.

**G2. Budget tier strings (locked).** *Resolution:* `starter` (under $2k total room budget), `pro` ($2k–$5k), `studio` ($5k+). Used in Sonnet prompts as guidance for product price ranges. Not surfaced as $$ literal to user — surfaced as "Modest" / "Mid-range" / "Premium" tiles.

**G3. Smart-tech category list (locked).** *Resolution:* 6 sections shown based on room type:
- Living-Room Essentials (couch, lamp, side table — for living rooms)
- Work & Focus (desk, chair, monitor arm — for studios/studies)
- Lifestyle & Delight (speakers, e-reader, smart picture frame — universal)
- Smart Sleep (smart mattress, alarm, sleep-trackers — bedrooms)
- Ambient Lighting (smart bulbs, panels, strips — universal; overlap with Slot 3)
- Hidden Tech (cable management, mounts, hubs — universal)

Categories shown adaptively based on `rooms.is_room=true` + room_type from Stage 2 perception (which runs in Phase 5; for Slot 2 we get `room_type` via Haiku classifier inline as part of the recommendation request).

**G4. Lighting mood card sample renders (locked).** *Resolution:* 4 pre-generated FLUX renders, one per mood, stored at `/public/lighting-moods/{warm-cozy,bright-airy,dramatic-moody,focused-workspace}.jpg`. WebP q88, ~150KB each. Daksh + Pranav generate before M8 starts. Same sample room used across all 4 (different lighting only) so user can compare apples-to-apples.

**G5. cova-composite-art pass-rate target.** *Resolution locked:* ≥70% on 15 test cases (5 rooms × 3 art types). Phase 4 includes this validation as part of M8. If pass rate <70%, fall back to Approach C (side-panel preview) more aggressively, OR defer art slot to V1.5 (escalate).

**G6. Art IP filter scope.** *Resolution locked:* Haiku 4.5 classifier on text prompt. Rejects: branded characters (Disney, Marvel, Nintendo), real public people (politicians, celebrities), trademarked artworks (Banksy, etc.), copyrighted song lyrics or book covers. Returns `{flagged: bool, reason: string}`. If flagged, modal *"That description references something we can't generate. Try describing the style or feeling instead."*

**G7. Skip flow per slot.** *Resolution locked:* each slot has prominent "Skip" link top-right (DM Sans 13px ivory 60% with gold hover). Click → writes `null` to that slot's key in manifest, advances to next slot.

**G8. Render method for user-picked products (locked Option 2).** *Resolution:* Stage 5 prompt captures SHAPE only (e.g., "sleek black soundbar with subtle perforated grille and rounded ends, 145cm wide, mounted below the TV"). Hotspot at Stage 7 links DIRECTLY to user-picked Sonos Arc Ultra page — no Google Lens query. For OTHER furniture, Lens runs at click time (Phase 7).

**G9. Approach C fallback for art.** *Resolution locked:* if cova-composite-art Modal QA pass rate <70% OR Sonnet QA flags composite as bad, fall back to Approach C: show "your art on this wall (preview)" with chosen art floating beside the rendered room (no spatial integration). Less impressive but trustworthy.

**G10. Mood-relight cost.** *Resolution locked:* IC-Light v2 mood relight is conditional on `lighting.mood` being set. If user skips lighting slot entirely, Stage 5b is skipped (saves $0.030 + 6s).

---

## 4. Background context (self-contained)

### 4.1 What personalization delivers

After all 3 slots complete (or skipped), Cova has:
- `rooms.personalization_manifest` jsonb populated
- `art` slot: `null` if skipped, else `{ method, selected_image_url, composite_attempted, composite_pass, composite_url, fallback_to_preview }`
- `smart_tech` slot: `null` if skipped, else `{ lifestyle_answers, budget_tier, candidates_generated, candidates_validated, selected_products[] }`
- `lighting` slot: `null` if skipped, else `{ mood, selected_products[] }`
- `completed_slots[]`, `skipped_slots[]`, `total_cost_usd`, `completed_at`

Manifest feeds Stage 3 director in Phase 5 to generate the enumerated prompt.

### 4.2 The 3-slot architecture (locked)

Was originally 6 tiles in pre-V1 design. Dropped to 3 slots after research. Mood feed dropped entirely (D-020). Persistent profile dropped. Plants/vibe/freetext slots dropped. Art / Smart Tech / Lighting are the three with highest visual impact per second of user time.

```
1. Art slot      (/onboarding/personalization/art)
2. Smart Tech    (/onboarding/personalization/smart-tech)
3. Lighting      (/onboarding/personalization/lighting)
   → routes to /render/in-progress (Phase 5 begins)
```

Sequential, not parallel. Each is a distinct screen.

### 4.3 Slot 1 — Art (Approach A primary, Approach C fallback)

**3 modes:**
1. **Generate from text prompt** — user types "abstract terrazzo print in muted earth tones" → IP filter via Haiku → fal-ai/flux/schnell renders 4 options → user picks one → cova-composite-art composites onto wall
2. **Generate from style mood** — Cova generates 4 thematically-matched poster options based on `style_blend` (no user prompt needed) → pick → composite
3. **Upload your own** — user uploads photo of print they own (JPEG/PNG, <10MB) → composite

**Approach A pipeline (composite):**
- SAM-3 detects wall in `rooms.processed_url` photo
- cv2 homography perspective-warps art image to fit detected wall plane
- IC-Light v2 lighting harmonize (so art doesn't look pasted-on)
- Sonnet 4.5 vision QA: "Does this composite look natural? Score 0-10." If ≥7, pass. Else fall back.

**Approach C fallback:** if SAM-3 wall confidence <0.6 OR Sonnet QA <7, show "your art on this wall (preview)" with chosen art rendered beside the room (separate floating frame, no spatial integration).

**Cost:** ~$0.05 per composite (SAM-3 + cv2 + IC-Light + Sonnet QA).
**Latency:** ~5–8s per composite.

**Persistence:**
```json
{
  "method": "generated_from_prompt" | "generated_from_style" | "uploaded",
  "prompt": "abstract terrazzo print in muted earth tones",
  "selected_image_url": "https://r2/.../art-{id}.jpg",
  "composite_attempted": true,
  "composite_pass": true,
  "composite_url": "https://r2/.../composite-{id}.jpg",
  "fallback_to_preview": false
}
```

### 4.4 Slot 2 — Smart Tech (lifestyle-driven, no catalog)

**Pipeline (no scraping, no maintenance debt):**

```
Step 1: Sonnet 4.5 generates 12 candidate products
  Input: room_type, lifestyle_answers[], budget_tier, room_dimensions_estimate
  Output: 12 candidates as JSON {name, brand, category, dims, price_range, why_it_fits}
  Cost: ~$0.03

Step 2: Validate via Serper Google Shopping
  For each: query "<brand> <name>"
  Keep if returns ≥1 result with price ±50% match + image URL
  Discard hallucinated silently
  ~8-10 of 12 validate
  Cost: ~$0.06

Step 3: Show user, grouped by section
  6 sections (G3): Living-Room Essentials, Work & Focus, Lifestyle & Delight, 
                   Smart Sleep, Ambient Lighting, Hidden Tech
  Each card: hero image, pitch, price, "why it fits this room",
             "Add to design" button
```

Total cost per session if user engages: **~$0.09**. Always fresh. No catalog.

**Render method (Option 2 locked):**
- Stage 5 prompt captures SHAPE descriptor (e.g., "sleek black soundbar 145cm wide mounted below TV")
- Stage 7 hotspot DIRECTLY links to user-picked product retail page + affiliate URL
- No Lens query for user-picked items

**Persistence:**
```json
{
  "lifestyle_answers": ["WFH", "frequent_guests"],
  "budget_tier": "starter",
  "candidates_generated": 12,
  "candidates_validated": 9,
  "selected_products": [
    {
      "name": "Sonos Arc Ultra",
      "brand": "Sonos",
      "category": "ambient_audio",
      "price_usd": 999,
      "image_url": "https://...",
      "shape_descriptor": "sleek black soundbar with subtle perforated grille...",
      "why_it_fits": "fills the long TV wall without competing with art",
      "retail_url": "https://www.sonos.com/.../arc-ultra",
      "affiliate_url": "https://www.amazon.com/dp/B0DK3VWXNF/?tag=cova03-20"
    }
  ]
}
```

### 4.5 Slot 3 — Lighting (mood + smart-lighting products)

**Layer 1 — Pick a mood (4 visual cards):**
- Warm & cozy (golden-hour, low warm 2700K)
- Bright & airy (cool daylight, lots of windows, 5000K)
- Dramatic & moody (selective accents, deep shadows)
- Focused workspace (cool, even, task-lit, 5500K)

User picks ONE.

**Layer 2 — Smart lighting products** (same Sonnet→Serper flow as Slot 2):
- Lutron Caseta dimmers/switches
- Hue Play bars and bulbs
- Nanoleaf panels
- Govee strips
- Statement floor lamps

~$0.09 per session if user engages.

**Pipeline impact (CRITICAL):**
Mood feeds enumerated prompt directly:
- `warm_cozy → "golden-hour ambient light at 2700K from west window, two table lamps glowing, fireplace ember accent"`
- `bright_airy → "5000K daylight pouring through tall windows, sheer linen drapes, even soft fill"`
- `dramatic_moody → "deep shadow regions, single warm directional accent, candle-like ember on fireplace"`
- `focused_workspace → "5500K even fill, minimal shadow, task-light cone over the work surface"`

After primary FLUX.2 render (Stage 5), **Stage 5b runs IC-Light v2 with mood profile** to relight scene. Same room, four moods, four feelings — highest-impact visual personalization.

**Persistence:**
```json
{
  "mood": "warm_cozy",
  "selected_products": [...]
}
```

### 4.6 What's NOT in V1 personalization

- Tier 3 persistent profile in /dashboard/settings (was in 6-tile, dropped)
- Hardcoded curated product catalog (rejected)
- Composite-pass for products (Option 3 rejected; Option 2 wins)
- Scraped retailer data (NEVER. Hard rule.)
- Plants slot, Vibe slot, Freetext slot (all dropped from 6-tile)

### 4.7 The personalization_manifest full shape

```json
{
  "art": null | { ...slot 1 shape... },
  "smart_tech": null | { ...slot 2 shape... },
  "lighting": null | { ...slot 3 shape... },
  "completed_slots": ["smart_tech", "lighting"],
  "skipped_slots": ["art"],
  "total_cost_usd": 0.18,
  "completed_at": "2026-05-15T14:45:32Z"
}
```

---

## 5. Tech stack for this phase

| Layer | Tool | Notes |
|---|---|---|
| Art generation | fal-ai/flux/schnell via fetch() | $0.003/image × 4 = $0.012/generation |
| Composite | cova-composite-art Modal A10G | SAM-3 + cv2 + IC-Light + Sonnet QA |
| Composite QA | Sonnet 4.5 vision | ~$0.005/QA call |
| IP filter | Haiku 4.5 vision | ~$0.001/check |
| Smart-tech recommendations | Sonnet 4.5 | ~$0.03 per 12-candidate generation |
| Lighting recommendations | Sonnet 4.5 | Same flow as smart-tech |
| Product validation | Serper Google Shopping API | $0.005/query × 12 = $0.06/session |
| Direct fetch | fal.ai + Anthropic + Serper via fetch() | NO SDKs (D-015) |

---

## 6. Scope

### 4A — Backend (M8)

#### Slot 1 Art

1. **POST /api/personalization/art/generate-prompt**
   - Body: `{ prompt: string }`
   - IP filter pre-pass: Haiku 4.5 with prompt:
     ```
     Does this art description reference any of:
     - Branded character (Disney, Marvel, DC, Nintendo, Pokémon, etc.)
     - Real public person (politician, celebrity, athlete)
     - Trademarked artwork (Banksy, named famous painting, etc.)
     - Song lyric, book cover, movie poster
     Return JSON: {flagged: bool, reason: string}
     ```
   - If flagged: return `{ ok: false, failure_category: 'art_ip_violation', user_message: "..." }`
   - Else: 4 parallel calls to fal-ai/flux/schnell with prompt + style hints from `users.style_blend.primary`
   - Returns: `{ ok: true, options: [{ id, image_url }, ...4 ] }`
   - Cost log: 1 row for IP filter, 4 rows for FLUX schnell

2. **POST /api/personalization/art/generate-style**
   - Body: `{}` (style_blend from session)
   - 4 parallel FLUX schnell calls, no user prompt; prompt is auto-generated from style_blend (e.g., for Warm Japandi: "minimalist abstract print, muted earth tones, hand-drawn line work, paper texture")
   - Returns: same shape as generate-prompt
   - Cost log: 4 rows for FLUX schnell

3. **POST /api/personalization/art/upload**
   - Body: signed URL flow (similar to capture)
   - Validates: image, <10MB, JPEG/PNG only (no HEIC for art uploads — simpler)
   - Returns: `{ ok: true, image_url: string }`

4. **POST /api/personalization/art/composite**
   - Body: `{ room_id, art_image_url, method }`
   - Triggers cova-composite-art Modal app:
     - SAM-3 wall detection on `rooms.processed_url`
     - If wall_confidence <0.6: returns `{ composite_pass: false, fallback_to_preview: true }`
     - cv2 homography warp art to wall
     - IC-Light v2 lighting harmonize
     - Sonnet 4.5 vision QA, score 0-10
     - If score <7: returns `{ composite_pass: false, fallback_to_preview: true }`
   - Returns: `{ ok: true, composite_url: string, composite_pass: bool, fallback_to_preview: bool }`
   - Cost log: composite + Sonnet QA
   - failure_category: `composite_modal_fail`, `sam3_wall_low_confidence`, `composite_qa_low_score`

#### Slot 2 Smart Tech

5. **POST /api/personalization/smart-tech/recommend**
   - Body: `{ room_id, lifestyle_answers: string[], budget_tier: 'starter' | 'pro' | 'studio' }`
   - Sonnet prompt:
     ```
     You are recommending smart tech for an interior design redesign.
     Room: {room_type from rooms table}
     Estimated dimensions: {est dimensions}
     Lifestyle: {lifestyle_answers}
     Budget tier: {budget_tier}
     Style: {style_blend.primary}
     
     Generate 12 distinct product candidates spanning these categories
     (only categories appropriate for room type + lifestyle):
     - Living-Room Essentials
     - Work & Focus
     - Lifestyle & Delight
     - Smart Sleep
     - Ambient Lighting
     - Hidden Tech
     
     For each: name, brand, category, dimensions, price_range_usd [low, high],
               why_it_fits (one sentence).
     
     Output ONLY JSON: { candidates: [...] }
     ```
   - For each candidate: Serper Google Shopping query "<brand> <name>"
     - If ≥1 result with price within ±50% of midpoint AND has image_url AND is from supported retailer: validated
     - Else: discarded
   - Cost log: Sonnet (~$0.03) + 12× Serper (~$0.06)
   - Returns: `{ ok: true, products: [...validated 8-10] }`
   - failure_category: `smart_tech_sonnet_fail`, `smart_tech_serper_fail`, `smart_tech_no_validated`

#### Slot 3 Lighting

6. **POST /api/personalization/lighting/recommend**
   - Body: `{ room_id, mood: string }` — only smart-lighting product layer
   - Same Sonnet→Serper flow as smart-tech, scoped to lighting category
   - Cost log: same shape

#### Manifest assembly

7. **POST /api/personalization/save-slot**
   - Body: `{ room_id, slot: 'art' | 'smart_tech' | 'lighting', data: object | null }`
   - Validates room belongs to user
   - Updates `rooms.personalization_manifest.{slot}` with provided data (or null for skip)
   - Appends slot to `completed_slots` or `skipped_slots`
   - Returns: `{ ok: true }`

8. **POST /api/personalization/finalize**
   - Body: `{ room_id }`
   - Validates room.personalization_manifest has all 3 slot keys (null or populated)
   - Sets `rooms.personalization_manifest.completed_at = now()`
   - Sets `rooms.status = 'ready_for_render'`
   - Returns: `{ ok: true, redirect_to: '/render/in-progress' }`

### 4B — UI

#### Personalization Art (/onboarding/personalization/art)

**Tool:** Frontend Visionary

**Layout:**
- Full-bleed navy
- Top: Cova logo gold left, "Step 1 of 3" tracking 0.18em uppercase ivory 60% center, "Skip →" ivory 60% gold-hover right
- Headline EB Garamond Italic 36px ivory: *"Pick a piece of art."*
- Subhead DM Sans 14px ivory 70%: *"It'll appear on a wall in your room."*
- 3-mode tab nav: "Generate from prompt" | "Pick from your style" | "Upload your own" (gold underline on active, ivory 60% on inactive)
- Below tabs: mode-specific UI

**Mode 1 — Generate from prompt:**
- Text input 480px wide, 64px tall, ivory bg, navy text, DM Sans 16px, placeholder *"e.g. abstract terrazzo print in muted earth tones"*
- Below input: 200 char counter
- Below counter: gold pill "Generate 4 options" CTA
- After click: 4 image cards 240×320 in 2×2 grid, generated FLUX outputs
- Each card hover: 1.04 scale + gold border outline
- Click card: card grows to centered preview 480×640, three sub-CTAs: "Use this" (gold pill) / "Generate again" (ghost) / "Try different prompt" (ghost)

**Mode 2 — Pick from your style:**
- No input. CTA "Show me 4 options" (gold pill) auto-fires generation based on style_blend
- Same card grid + preview flow as Mode 1
- Refresh CTA "Try different ones" (ghost) regenerates 4 fresh

**Mode 3 — Upload your own:**
- Drop zone same pattern as capture upload, but smaller (480×320)
- After upload: preview + "Use this" CTA

**After "Use this":**
- POST /api/personalization/art/composite triggers
- Loading state: ivory 30% overlay + spinner + caption *"Placing your art on the wall…"*
- ~5–8s
- Success → preview shows composited image (art on wall in room context). CTA "Continue →" gold pill
- Fallback to preview → shows "Your art (preview)" floating beside room. Caption *"We'll integrate this on a wall when we render."* Same CTA.
- Failure → toast + retry button

**Skip CTA (top right):**
- Click → confirmation "Skip art for now? You can add it later." → "Confirm skip" → POST /api/personalization/save-slot with data=null → routes to /onboarding/personalization/smart-tech

**IP-rejected modal:**
- Centered modal with copy: *"That description references something we can't generate. Try describing the style or feeling instead — like 'minimalist line drawing' or 'bold abstract color blocks'."*
- Single CTA "Try again" → input refocused

**Reduced motion:** card hover effects disabled; loading spinner replaced by static "Loading…"

#### Personalization Smart Tech (/onboarding/personalization/smart-tech)

**Tool:** Frontend Visionary

**Layout:**
- Full-bleed navy
- Top bar same pattern as art ("Step 2 of 3", Skip)
- Headline EB Garamond Italic 36px ivory: *"Tech for your space."*
- Subhead DM Sans 14px ivory 70%: *"We'll find what fits your life. Add what you like."*

**Step 1: Lifestyle chips** (multi-select)
- 6 chips, gold border default, gold-bg + navy-text on selected:
  - Kids
  - Pets
  - Work from home
  - Frequent guests
  - Live alone
  - Couple
- DM Sans 14px medium tracking 0.05em uppercase
- Below chips: small caption *"Pick what applies. Multi-select."*

**Step 2: Budget tier** (single-select tiles)
- 3 tiles, 200×120 each, 16px gap
  - Modest — *"Affordable picks under $200"*
  - Mid-range — *"Balanced quality $200–$500"*
  - Premium — *"Best-in-class $500+"*
- Active tile: gold border + ivory 5% bg
- Internal labels = `starter` / `pro` / `studio` for backend

**Step 3: CTA "Show me recommendations" (gold pill)**
- Triggers POST /api/personalization/smart-tech/recommend
- Loading state: ivory 30% overlay + spinner + caption *"Finding the right tech for your room…"*
- ~3–5s

**Step 4: Recommendations grid**
- Sectioned by category (only categories with ≥1 validated product shown)
- Each section: header DM Sans 13px medium tracking 0.18em uppercase ivory 60% (e.g., "WORK & FOCUS")
- Cards 240×320 in 2-3 columns: hero image (60% of card height), brand DM Sans 12px ivory 50%, name DM Sans 16px ivory, price DM Sans 14px gold, "why it fits" italic 13px ivory 70% (2 lines max), "Add to design" gold pill button
- Selected cards: gold border + checkmark badge top-right
- Below grid: persistent footer with "X added" counter + "Continue →" gold pill

**Skip:**
- Top-right "Skip →" same pattern

**Reduced motion:** loading spinner replaced by static; card hover effects disabled.

#### Personalization Lighting (/onboarding/personalization/lighting)

**Tool:** Frontend Visionary

**Layout:**
- Full-bleed navy
- Top bar same pattern as previous slots ("Step 3 of 3", Skip)
- Headline EB Garamond Italic 36px ivory: *"Set the mood."*
- Subhead DM Sans 14px ivory 70%: *"Lighting changes everything."*

**Layer 1: 4 mood cards** (single-select)
- 4 large cards 320×240 in 2×2 grid (responsive)
- Each shows pre-generated FLUX render of the same sample room in that mood
- Below image: mood name in DM Sans 16px medium ivory + 1-line italic descriptor
  - Warm & cozy — *"Golden-hour ambient. Soft and inviting."*
  - Bright & airy — *"Daylight and openness."*
  - Dramatic & moody — *"Deep accents. Quiet drama."*
  - Focused workspace — *"Cool, even, task-lit."*
- Hover: 1.04 scale + gold border outline
- Active: gold border 1.5px + 5% gold tint overlay

**Layer 2: Smart lighting products (after mood picked)**
- Caption *"Add smart lighting (optional)"* DM Sans 14px ivory 60%
- Same Sonnet→Serper flow as smart-tech, scoped to lighting category
- Same cards UI as smart-tech section

**Continue CTA:** gold pill "Continue → render" — triggers POST /api/personalization/finalize → routes to /render/in-progress (Phase 5)

**Skip:** click writes mood=null, smart-lighting=null, finalizes with skip flag, routes to /render/in-progress

**Reduced motion:** card hover effects disabled.

### 4C — Integration + review

- Wire frontend to all 7 backend routes
- personalization_manifest jsonb populated correctly across all 8 skip/complete combinations:
  1. all 3 complete
  2. art skipped, smart-tech + lighting complete
  3. smart-tech skipped, art + lighting complete
  4. lighting skipped, art + smart-tech complete
  5. art + smart-tech skipped, lighting complete
  6. art + lighting skipped, smart-tech complete
  7. smart-tech + lighting skipped, art complete
  8. all 3 skipped
- IP filter tested with: "Banksy" (rejected), "Disney character" (rejected), "abstract terrazzo" (passes), "Minecraft pixel art" (rejected)
- Composite pass rate measured on 15 cases (5 rooms × 3 art types). Target ≥70%.
- Sonnet→Serper validation rate measured: target ≥70% of 12 candidates validate (avg 8-10 reach user)
- Verifier 7-phase covers: happy paths × 8 combinations + IP filter trigger + composite-fail-fallback + Serper-down + Sonnet-down + lifestyle-empty + budget-tier-missing

---

## 7. Out of scope

- Render pipeline (Phase 5)
- Refine (Phase 6)
- Shop (Phase 7)
- 6-tile personalization (dropped to 3-slot)
- Persistent style profile (dropped)
- Plants/Vibe/Freetext slots (dropped)
- Catalog scraping (NEVER, hard rule)
- iOS app (never V1)

---

## 8. Files touched

### Created
- `apps/web/app/onboarding/personalization/art/page.tsx`
- `apps/web/app/onboarding/personalization/smart-tech/page.tsx`
- `apps/web/app/onboarding/personalization/lighting/page.tsx`
- `apps/web/app/api/personalization/art/generate-prompt/route.ts`
- `apps/web/app/api/personalization/art/generate-style/route.ts`
- `apps/web/app/api/personalization/art/upload/route.ts`
- `apps/web/app/api/personalization/art/composite/route.ts`
- `apps/web/app/api/personalization/smart-tech/recommend/route.ts`
- `apps/web/app/api/personalization/lighting/recommend/route.ts`
- `apps/web/app/api/personalization/save-slot/route.ts`
- `apps/web/app/api/personalization/finalize/route.ts`
- `apps/web/lib/personalization/art-ip-filter.ts`
- `apps/web/lib/personalization/sonnet-recommend.ts`
- `apps/web/lib/personalization/serper-validate.ts`
- `apps/web/lib/personalization/flux-schnell.ts`
- `apps/web/lib/personalization/composite-client.ts` (Modal client)
- `apps/web/lib/personalization/manifest.ts` (assembly + validation)
- `apps/web/components/personalization/ArtModeTabs.tsx`
- `apps/web/components/personalization/ArtPromptMode.tsx`
- `apps/web/components/personalization/ArtStyleMode.tsx`
- `apps/web/components/personalization/ArtUploadMode.tsx`
- `apps/web/components/personalization/ArtCompositePreview.tsx`
- `apps/web/components/personalization/IpRejectedModal.tsx`
- `apps/web/components/personalization/LifestyleChips.tsx`
- `apps/web/components/personalization/BudgetTier.tsx`
- `apps/web/components/personalization/ProductCard.tsx`
- `apps/web/components/personalization/MoodCard.tsx`
- `apps/web/components/personalization/SkipModal.tsx`
- `public/lighting-moods/warm-cozy.jpg`
- `public/lighting-moods/bright-airy.jpg`
- `public/lighting-moods/dramatic-moody.jpg`
- `public/lighting-moods/focused-workspace.jpg`
- `tests/personalization/art-ip-filter.test.ts`
- `tests/personalization/sonnet-recommend.test.ts`
- `tests/personalization/serper-validate.test.ts`
- `tests/personalization/manifest-assembly.test.ts`
- `tests/personalization/composite-fallback.test.ts`

### Migrations
- `supabase/migrations/{ts}-rooms-personalization-manifest.sql` + `_down.sql`

### Modified
- `apps/web/lib/analytics/events.ts` (personalization events)
- `apps/web/lib/errors/categories.ts` (PersonalizationFailure union)

---

## 9. API contracts

(All routes use Phase 1 error envelope; auth required; redactLogPayload on errors)

### POST /api/personalization/art/generate-prompt
```
Body: { room_id: string, prompt: string }
Validation: prompt 3-200 chars, room belongs to user
Returns: { ok: true, options: [{ id, image_url }, ...4] }
Or: { ok: false, failure_category: 'art_ip_violation' | 'flux_schnell_fail' | 'art_prompt_too_short', user_message }
Cost log: 1 IP filter row + 4 FLUX schnell rows
```

### POST /api/personalization/art/generate-style
```
Body: { room_id: string }
Returns: { ok: true, options: [...4] }
Cost log: 4 FLUX schnell rows
```

### POST /api/personalization/art/upload
```
Body: { fileName, contentType }
Returns: { ok: true, signedUrl, bucketPath } (signed PUT to art-uploads bucket)
TTL: 1h
```

### POST /api/personalization/art/composite
```
Body: { room_id, art_image_url, method: 'generated_from_prompt' | 'generated_from_style' | 'uploaded' }
Returns: 
  Success: { ok: true, composite_url, composite_pass: true, fallback_to_preview: false }
  Fallback: { ok: true, composite_url: art_image_url, composite_pass: false, fallback_to_preview: true }
  Error: { ok: false, failure_category, user_message }
Cost log: composite + Sonnet QA rows
```

### POST /api/personalization/smart-tech/recommend
```
Body: { room_id, lifestyle_answers: string[], budget_tier: 'starter'|'pro'|'studio' }
Returns: { ok: true, products: [...8-10 validated] }
Cost log: Sonnet + 12 Serper rows
```

### POST /api/personalization/lighting/recommend
```
Body: { room_id, mood: 'warm_cozy'|'bright_airy'|'dramatic_moody'|'focused_workspace' }
Returns: { ok: true, products: [...validated] }
```

### POST /api/personalization/save-slot
```
Body: { room_id, slot: 'art'|'smart_tech'|'lighting', data: object | null }
Returns: { ok: true }
Side effect: updates rooms.personalization_manifest.{slot}
```

### POST /api/personalization/finalize
```
Body: { room_id }
Validates: rooms.personalization_manifest has all 3 keys
Returns: { ok: true, redirect_to: '/render/in-progress' }
Side effect: rooms.status = 'ready_for_render', completed_at set
```

---

## 10. Schema migrations

```sql
-- {ts}-rooms-personalization-manifest.sql
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS personalization_manifest jsonb DEFAULT '{
  "art": null,
  "smart_tech": null,
  "lighting": null,
  "completed_slots": [],
  "skipped_slots": [],
  "total_cost_usd": 0,
  "completed_at": null
}'::jsonb;

-- Down: ALTER TABLE rooms DROP COLUMN personalization_manifest;
```

---

## 11. Failure handling

```typescript
export type PersonalizationFailure =
  | 'art_ip_violation'
  | 'art_prompt_too_short'
  | 'flux_schnell_fail'
  | 'art_upload_fail'
  | 'composite_modal_fail'
  | 'sam3_wall_low_confidence'
  | 'composite_qa_low_score'
  | 'smart_tech_sonnet_fail'
  | 'smart_tech_serper_fail'
  | 'smart_tech_no_validated'
  | 'lighting_sonnet_fail'
  | 'lighting_serper_fail'
  | 'manifest_save_fail'
  | 'manifest_finalize_validation_fail';
```

| Category | Recovery |
|---|---|
| art_ip_violation | Show modal "Try describing style/feeling instead" |
| flux_schnell_fail | Retry once after 5s; if still fails, show error toast |
| sam3_wall_low_confidence | Auto-fall back to Approach C preview |
| composite_qa_low_score | Auto-fall back to Approach C preview |
| smart_tech_sonnet_fail | Retry once; if still fails, show "Couldn't generate recommendations. Skip for now?" |
| smart_tech_no_validated | Show "Couldn't find products that match. Try different lifestyle/budget." |
| Serper API down | Mark candidates as unvalidated, show subset; cost log notes degradation |

---

## 12. Cost budget

| Source | Estimated cost |
|---|---|
| Claude credits | $40–60 |
| FLUX schnell test runs (mode 1+2 testing) | ~$2 |
| Sonnet smart-tech testing | ~$3 |
| Serper validation testing | ~$5 |
| cova-composite-art pass-rate test (15 cases) | ~$1 |
| Mood card sample renders (one-time) | ~$0.50 |
| **Total** | **~$50–72** |

---

## 13. Verifier focus areas

| Criterion | Verifier check |
|---|---|
| 3 slots wired | Routes /onboarding/personalization/{art,smart-tech,lighting} all return 200 |
| Art mode 1 (prompt) | IP filter rejects "Banksy", accepts "abstract terrazzo" |
| Art mode 2 (style) | Auto-generates 4 from style_blend |
| Art mode 3 (upload) | Signed URL flow works for art-uploads bucket |
| Composite happy path | cova-composite-art returns composite_url with pass=true on 5 test rooms |
| Composite fallback | Force SAM-3 low confidence → Approach C preview |
| Smart-tech recommend | Sonnet returns 12 candidates, Serper validates ≥70% (8-10) |
| Lighting recommend | Same pattern, lighting category |
| 8 skip/complete combinations | All produce valid manifest |
| Cost log per call | render_cost_log rows for IP filter, FLUX schnell, Sonnet, Serper, composite, Sonnet QA |
| All 14 PersonalizationFailure enums used | Verify via grep |
| Manifest finalize validation | Reject if any slot key missing (not null OR populated) |
| Status transition | rooms.status moves pending → ready_for_personalization → ready_for_render |
| Mobile responsive | All 3 screens work on iPhone Safari |

---

## 14. Adversarial code review checklist

- [ ] IP filter Haiku call has timeout from `lib/config/timeouts.ts`
- [ ] IP filter false-negative bypass: try "Mickey Mouse" → confirms rejected
- [ ] Sonnet smart-tech prompt enforces JSON output (no preamble) — test with malformed response handling
- [ ] Serper response parsing validates each candidate has price + image_url before counting validated
- [ ] Composite Modal call has 60s timeout
- [ ] Composite pass-rate measured on real fixtures, not synthetic
- [ ] Composite fallback to Approach C is graceful, not just an error
- [ ] cleanup on partial failure: art generated but composite fails → art_image_url retained for retry
- [ ] save-slot validates room belongs to user (auth.uid() = rooms.user_id)
- [ ] save-slot only allows 3 valid slot keys ("art", "smart_tech", "lighting")
- [ ] save-slot writes are idempotent (calling twice with same data has no side effect)
- [ ] finalize validates ALL 3 slots exist as keys (null OR object)
- [ ] finalize sets rooms.status only after manifest validates
- [ ] No hardcoded fal.ai or Sonnet URLs (use env var)
- [ ] FLUX schnell calls in parallel (Promise.all), not sequential
- [ ] Lifestyle chip multi-select sends array, not comma-separated string
- [ ] Budget tier validates against enum ('starter' | 'pro' | 'studio')
- [ ] Mood validates against enum (4 values)
- [ ] No console.log of art_image_url or product retail_url (PII via redactLogPayload)
- [ ] Affiliate URL appender (Amazon cova03-20) actually applies — test sample
- [ ] Skip modal: confirms before writing null (not auto-skip)
- [ ] Reduced motion CSS query honored
- [ ] Approach A vs C labeled clearly in cost log entries (so we can A/B post-launch)
- [ ] If Modal app times out, return Approach C fallback, not error to user
- [ ] All 7 routes tested with malformed bodies (zod validation)
- [ ] Rate limit on /art/generate-prompt (prevent IP-filter abuse): 10/hr/user

---

## 15. Manual click-script

Save to `cova-plan/manual-evidence/P4/`.

### Art mode 1 — Generate from prompt
1. Sign in test user with completed quiz + capture (rooms row exists, processed_url set, hard_room_score < 0.5)
2. Navigate to /onboarding/personalization/art **[D1: art-empty.png]**
3. Click "Generate from prompt" tab → input shows
4. Type "abstract terrazzo print in muted earth tones" → click Generate
5. Wait ~3-5s → 4 options appear in 2×2 grid **[D2: art-options.png]**
6. Click first option → grows to centered preview **[D3: art-preview.png]**
7. Click "Use this" → loading state "Placing your art on the wall…"
8. ~5-8s → composite shows art on wall in room context **[D4: art-composite.png]**
9. Click "Continue →" → routes to smart-tech

### Art mode 1 — IP rejection
10. Navigate back to /onboarding/personalization/art → mode 1
11. Type "Banksy print of girl with balloon" → click Generate
12. IP filter modal appears **[D5: ip-rejected.png]**
13. Click "Try again" → input refocused

### Art mode 2 — Style-generated
14. Click "Pick from your style" tab → no input
15. Click "Show me 4 options" → 4 thematically-matched options appear **[D6: art-style-options.png]**
16. Pick one → composite flow same as mode 1

### Art mode 3 — Upload
17. Click "Upload your own" tab → drop zone shows
18. Upload a JPEG → preview → "Use this" → composite flow

### Art skip
19. Click "Skip →" top-right → confirmation modal **[D7: skip-modal.png]**
20. Click "Confirm skip" → routes to smart-tech with manifest.art = null

### Smart Tech happy path
21. /onboarding/personalization/smart-tech loads **[D8: smart-tech-empty.png]**
22. Select chips: WFH + Frequent guests **[D9: lifestyle-chips.png]**
23. Select budget: Mid-range **[D10: budget-tier.png]**
24. Click "Show me recommendations" → loading "Finding the right tech…"
25. ~3-5s → recommendations grid appears, sectioned by category **[D11: smart-tech-recs.png]**
26. Click "Add to design" on Sonos Arc Ultra → checkmark appears
27. Click 3 more products → counter shows "4 added"
28. Click "Continue →" → routes to lighting

### Smart Tech skip
29. Click Skip → smart_tech = null in manifest

### Lighting happy path
30. /onboarding/personalization/lighting loads **[D12: lighting-empty.png]**
31. Click "Warm & cozy" mood card → gold border + 5% tint **[D13: mood-selected.png]**
32. Below mood: smart-lighting product cards appear (Sonnet→Serper flow ran)
33. Add 1-2 products → counter updates
34. Click "Continue → render" → routes to /render/in-progress

### All-skip flow
35. Sign in fresh test user, complete quiz + capture
36. /onboarding/personalization/art → Skip → confirms → smart-tech
37. /onboarding/personalization/smart-tech → Skip → lighting
38. /onboarding/personalization/lighting → Skip → confirms → routes to /render/in-progress
39. Verify manifest via Supabase MCP: art=null, smart_tech=null, lighting=null, skipped_slots=[all 3]

### Composite fallback (force Approach C)
40. Upload a room photo with extreme angle (high hard_room_score) but is_room=true
41. Slot 1 art: pick any option, click "Use this"
42. cova-composite-art SAM-3 returns wall_confidence < 0.6 (or force via env flag)
43. Approach C preview shows: "Your art (preview)" floating beside room **[D14: approach-c-fallback.png]**

### Reduced motion
44. Enable OS reduced motion → all 3 slot screens render with hover effects disabled **[D15-17: reduced-motion-slots.png]**

### Mobile responsive
45. iPhone Safari: open all 3 slot screens, confirm chip wrapping, card sizing, mood card 2×2 grid stays 2×2 (or stacks to 1×4 if narrow)

---

## 16. Manual evidence bundle

- 17+ screenshots from §15
- Sample manifest jsonb for all 8 skip/complete combinations
- Composite pass-rate test results (15 cases, table format) at `cova-plan/composite-pass-rate-report.md`
- Sonnet→Serper validation rate sample (10 sessions, table) at `cova-plan/serper-validation-report.md`
- INDEX.md linking artifacts to spec criteria

---

## 17. Remediation budget

- Round 1: Verifier session 1 self-heals
- Round 2: Verifier session 2 finds new issues → remediation
- Round 3 (escalation): write `cova-plan/escalations/P4.md`

If composite pass rate <70%: escalation = adjust Approach A/C threshold to fall back more aggressively, OR defer art slot to V1.5 (art slot becomes Approach C only).

---

## 18. Closing checklist

- [ ] All screenshots in `cova-plan/manual-evidence/P4/`
- [ ] Composite pass-rate report archived
- [ ] Serper validation rate report archived
- [ ] INDEX.md written
- [ ] `PHASE_STATUS.md` Phase 4 → CLOSED
- [ ] `OPEN_DECISIONS.md` updated: composite Approach A primary / C fallback (with thresholds), 6 lifestyle chips, 3 budget tiers, 6 smart-tech categories, 4 lighting moods, render method Option 2 confirmed
- [ ] `EMPIRICAL_FINDINGS.md` updated: composite pass rate %, Sonnet→Serper validation rate %, smart-tech card avg user-add count, slot completion rate (% users completing all 3 vs skipping)
- [ ] Phase 5 prereq section reviewed
- [ ] Verifier reports archived
- [ ] Session handoffs written

---

## 19. Rollback plan

Revert merge → run paired _down.sql:
1. rooms-personalization-manifest down (drops column)

Slot-level rollback: feature-flag-disable individual slots (`art_slot_enabled=false`), redirect to next slot.

If composite Modal app fails entirely: feature flag `art_composite_enabled=false` → all art slots use Approach C only.

---

## 20. Feature flags introduced

| Flag key | Description | Default |
|---|---|---|
| `art_slot_enabled` | Slot 1 active | true |
| `smart_tech_slot_enabled` | Slot 2 active | true |
| `lighting_slot_enabled` | Slot 3 active | true |
| `art_composite_enabled` | Approach A composite (false = always Approach C) | true |
| `art_ip_filter_enabled` | Haiku IP filter | true |
| `personalization_serper_enabled` | Serper validation (false = show all 12 unvalidated) | true |

---

## End of Phase 4 doc.

Next: Phase 5 (Render Pipeline) — the heaviest phase.
