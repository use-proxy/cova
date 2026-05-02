# Phase 6 — Refine

**Cova V1 implementation · Phase 6 of 12 · Self-contained**

---

## Phase identity

| | |
|---|---|
| **Phase number** | 6 of 12 |
| **Goal** | Free-form text refine on a delivered render. User types "make the sofa darker," sees new render in ~30s. Reuses Phase 5 pipeline stages with Stage 4 cache hit + lighter verifier. parent_render_id chain enables refine history. |
| **Executor session estimate** | 1–2 sessions |
| **Calendar estimate** | 1 week |
| **Predicted Claude credits** | ~$25–40 |
| **Predicted infra spend** | ~$10 (test refines, verifier_light tuning) |
| **Depends on** | Phase 5 closed |
| **Blocks** | Phase 9 dashboard (refine history chain visualization) |

---

## 1. The session loop for this phase

1. **Open new claude.ai chat.** Paste this entire phase doc.
2. **Chat summarizes back.** Confirms understanding, lists gaps. You confirm.
3. **Planner fires.** Fresh Claude Code session. Drift check confirms Phase 5 closed: pipeline_runs table exists, empty_room_cache table exists, renders table has architectural_baseline column, all 8 stages run end-to-end. Uses Context7 MCP for: current Anthropic Haiku 4.5 vision API, current Sonnet director prompt patterns for diff-merge. Uses EXA MCP for: prompt-merge logic patterns, refine UX modal patterns. Writes executor prompt to `cova-plan/planner-output/P6-executor-prompt.md`.
4. **Executor prompt returns.** Verify covers M12 acceptance criteria.
5. **Executor fires.** 1–2 sessions.
6. **Verifier session 1 fires.** Reviews refine pipeline reuse, cache hit verification, verifier_light Haiku rubric, parent_render_id chain integrity, architectural_baseline preservation across chained refines. Self-heals.
7. **Verifier session 2 fires.** Independent. Hunts for: cache key drift on refines, verifier drift across refine chains, race conditions when user fires refine while previous in-progress, refine prompt → director merge edge cases.
8. **Manual screenshot review.** §15 click-script. ~12 screenshots covering surgical refine + style-shift refine + add-product refine + chain visualization.
9. **Document updates.** `PHASE_STATUS.md`, `OPEN_DECISIONS.md`, `EMPIRICAL_FINDINGS.md` (cache hit rate at scale, refine cost per type, verifier_light vs full verifier accuracy delta).

---

## 2. Prereq verification

### Phase 5 closure checks
- `PHASE_STATUS.md` shows P5 → CLOSED
- 50-render quality test gate passed (≥80% first attempt)
- pipeline_runs, empty_room_cache, renders tables in place
- `renders.architectural_baseline` populated on at least one test render
- Stage 4 SHA256 cache verified working (test cache hit)
- /render/in-progress, /render/reveal, /render/select-cta routes operational
- All 4 Modal apps still reachable
- fal.ai, Anthropic API keys in `.env.local`

### Halt conditions
- Stage 4 cache not working → halt, fix in Phase 5 remediation
- architectural_baseline column missing → halt
- /render/select-cta route returns 404 → halt

---

## 3. Pre-decisions

**G1. Refine UI [D-018, locked].** Free-form text only. NOT canvas-based, NOT region-select, NOT inline edit chips. 200 char max. Example chips below input as suggestions ("Make the sofa darker," "Swap the rug for sisal," "More warm light," "Try Industrial style instead").

**G2. Token cost.** *Resolution locked:* 1 token per refine in V1.5+ enforcement; logged-not-enforced in V1 (per D-019).

**G3. Light vs heavy classifier.** Spec mentions Haiku classifier routes refines to "light" (FLUX Kontext or similar surgical edit) vs "heavy" (full FLUX.2 re-render). *Resolution for V1:* defer the light path. ALL refines go through full FLUX.2 in Phase 6. Light path becomes Phase 11 optimization (M6 bake-off candidate). This simplifies Phase 6 dramatically.

**G4. Verifier_light Haiku 4.5 2-dim.** Replaces full Sonnet 8-dim verifier on refines (Stage 6 in pipeline). Two dimensions only:
- `architecture_preservation` (did walls, ceiling, doors, windows stay?)
- `refine_intent_match` (did the change actually apply?)

Cost: ~$0.002 per call. Latency: ~1s. Cheaper and faster than $0.005 + 4s full verifier. Full verifier reserved for first render and "heavy" refines (deferred to V1.5). Each scored 0-10. Pass: both ≥7.

**G5. architectural_baseline tolerance widening.** Wall hex tolerance widens 5 ΔE per refine generation, capped at 20 ΔE. Prevents verifier_light from rejecting subtle drifts that compound over 4+ refines.

**G6. Concurrency policy.** *Resolution locked:* if user fires refine while previous refine in-progress, return 409 Conflict with copy *"Previous refine still processing. Wait or cancel."* Single in-flight refine per user at a time.

**G7. Refine cost target.** *Resolution locked:* ~$0.15 per refine (Stage 4 cache hit + Stage 5 + 5b + verifier_light + Stage 7 + Stage 8). Latency target: ~30s p50 (no Stage 2 + Stage 4).

**G8. Refine input validation.** *Resolution locked:*
- Min 3 chars non-whitespace
- Max 200 chars
- Reject profanity via Haiku 4.5 classifier (~$0.001) — toast "Try a different phrasing"
- Strip PII (email, phone, address) via redactLogPayload-style regex; show warning if stripped
- Empty submit → button disabled

**G9. Refine pipeline reuses Stage 4 cache.** *Resolution locked:* SHA256 of `processed_url` bytes + dimensions = cache key. On refine, ALWAYS hit cache (same processed_url as parent render). Saves 25s + $0.140.

**G10. parent_render_id chain depth.** *Resolution locked:* unbounded in V1 (user can refine indefinitely). UI shows last 10 in chain with "View all N refines" if >10. Phase 9 dashboard displays full tree.

---

## 4. Background context (self-contained)

### 4.1 What refine delivers

After refine completes, Cova has:
- New `renders` row with: `parent_render_id` (= original render.id), `refine_prompt`, `refine_index = parent.refine_index + 1`
- Same room_id, same processed_url
- New render_url
- New hotspots (regions can change)
- New verification_scores (verifier_light 2-dim instead of full 8-dim)
- Same `architectural_baseline` snapshot inherited from parent

### 4.2 The refine flow

```
User on /render/select-cta after initial render
   ↓
Clicks "Refine this design →"
   ↓
Refine modal opens: free-form text input + 4 example chips + character counter (200 max)
   ↓
User types e.g. "Make the sofa darker."
   ↓
Click submit
   ↓
Validation: ≥3 chars, ≤200 chars, no profanity
   ↓
1 token deducted (logged not enforced in V1)
   ↓
Modal closes; full-screen render-in-progress (cinematic same as Phase 5 M11)
   ↓
Backend: POST /api/render/refine with {render_id, refine_prompt}
   ↓
Refine pipeline (~30s, ~$0.15):
  Stage 1: skip (processed_url already exists)
  Stage 2: skip (cached perception from parent)
  Stage 3: director (Sonnet 4.5 merges parent enumerated prompt + refine diff)
  Stage 4: CACHE HIT (same processed_url) → 0s, $0
  Stage 5: FLUX.2 Pro/Max edit with merged prompt
  Stage 5b: mood relight (only if mood changed in refine)
  Stage 6: verifier_light Haiku 4.5 2-dim (architecture preservation + intent match)
  Stage 7: hotspot re-detection (regions can change)
  Stage 8: delivery (new render_id linked to parent)
   ↓
/render/reveal cinematic plays with new render
   ↓
User can refine again, or proceed to shop, or save and exit
```

### 4.3 Refine cost & latency (final)

| Stage | Cost | Latency |
|---|---|---|
| 1 Preprocess | $0.000 | 0s (skipped) |
| 2 Perception | $0.000 | 0s (cached from parent) |
| 3 Director (re-run with refine prompt) | $0.012 | 5s |
| 4 Empty-room | $0.000 | 0s (cache hit) |
| 5 Redesign (FLUX.2) | $0.100 | 12s |
| 5b Mood relight (conditional) | $0.030 | 6s |
| 6 Verification (Haiku 4.5 verifier_light) | $0.002 | 1s |
| 7 Hotspot re-detection | $0.005 | 5s |
| 8 Delivery | $0.001 | 1s |
| **Total** | **$0.150** | **30s** |

With mood relight skipped (most refines): **$0.120 / 24s.**

### 4.4 The 3 refine types (categorized for analytics, NOT routed differently in V1)

| Type | Example | Backend behavior |
|---|---|---|
| Surgical | "Make the sofa darker" | Director identifies clause 2, modifies text, preserves all else |
| Style-shift | "Try Industrial style instead" | Director recognizes style change, reloads codex, regenerates clause set, preserves architecture preamble |
| Add-product | "Add a Sonos Arc soundbar" | Director appends new clause, updates personalization_manifest.smart_tech.selected_products |

All 3 types go through same FLUX.2 pipeline in V1. Phase 11 M6 bake-off may route surgical → FLUX Kontext for cost savings.

### 4.5 Director merge logic (Stage 3 on refines)

Sonnet 4.5 prompt:
```
You are merging a user's refine request into an existing enumerated prompt.

Original enumerated prompt (16 clauses):
{parent_render.enumerated_prompt}

User's refine request: "{refine_prompt}"

Apply the change. Preserve all unchanged clauses. Do NOT change the
camera-anchor preamble or wall paint hard-constraint.

Output the new enumerated prompt with the same number of clauses
(or +1/-1 if user is adding/removing an item).
```

Examples:
- *"Make the sofa darker"* → clause 2 "Low boucle sofa, cream" → "Low boucle sofa, deep charcoal"; all else preserved
- *"Try Industrial style instead"* → director loads Industrial codex, regenerates clauses 1-13 (interior content), preserves clause 14-16 (camera + paint + architecture hard constraints), preserves clause 8 (art composite if applicable from parent)
- *"Add a Sonos Arc soundbar"* → director appends clause 17 with shape descriptor, updates personalization_manifest.smart_tech in renders row

### 4.6 Edge cases

- **Refine while previous in-progress:** 409 Conflict. User sees toast "Wait for current refine to finish."
- **Empty/trivial refine prompt (<3 chars non-whitespace):** button disabled.
- **Profanity in refine prompt:** Haiku classifier rejects → modal "Try a different phrasing."
- **PII in refine prompt:** redactLogPayload regex strips → user warned via toast "We removed personal info from your prompt."
- **Cache miss on Stage 4 (rare, 30-day TTL passed):** regenerate empty-room. User notified subtly: in-progress caption "Generating fresh empty room — this might take a bit longer." Adds ~25s.
- **Verifier_light fail after 1 retry:** ship best-of-2, log failure_category='verifier_light_fail_after_retry_on_refine'.
- **architectural_baseline drift across refines:** wall hex tolerance widens 5 ΔE per generation, capped 20 ΔE. Beyond cap, verifier_light fails strictly.
- **User refines from non-latest render in chain:** allowed (branching). New refine has parent_render_id = the chosen ancestor, not necessarily latest.

---

## 5. Tech stack

| Layer | Tool | Notes |
|---|---|---|
| Refine pipeline | Same as Phase 5 stages 3-8, with stages 1+2+4 skipped/cached | Reuses orchestrator |
| Director merge | Sonnet 4.5 with merge prompt | ~$0.012 per call |
| Verifier_light | Haiku 4.5 vision 2-dim | ~$0.002 per call, ~1s |
| Profanity check | Haiku 4.5 | ~$0.001 per check |
| Refine modal UI | Frontend Visionary + Framer Motion | Modal slide-up, 400ms |
| Cinematic in-progress + reveal | Reuses Phase 5 templates | Same captions |

---

## 6. Scope

### 6A — Backend (M12)

1. **Schema migration:**
```sql
-- renders table already has parent_render_id, refine_prompt, refine_index from Phase 5
-- No new columns needed in Phase 6
-- Verify indexes are in place:
CREATE INDEX IF NOT EXISTS renders_parent_idx ON renders(parent_render_id);
CREATE INDEX IF NOT EXISTS renders_user_chain_idx ON renders(user_id, parent_render_id, refine_index);
```

2. **Director merge logic** at `apps/web/lib/render/stage3-director-merge.ts`:
```typescript
export async function mergeDirectorPrompt(params: {
  parentEnumeratedPrompt: string;
  parentArchitecturalBaseline: object;
  refinePrompt: string;
  styleBlend: object;
  personalizationManifest: object;
  userId: string;
}): Promise<{ mergedPrompt: string; styleShifted: boolean; manifestDelta?: object }> {
  const startMs = Date.now();
  
  const sonnetPrompt = `You are merging a user's refine request into an existing enumerated prompt.

Original enumerated prompt (preserve unchanged clauses):
${params.parentEnumeratedPrompt}

User's refine request: "${params.refinePrompt}"

Style blend (only relevant if user requests style change):
${JSON.stringify(params.styleBlend)}

Personalization manifest (update if user adds/removes products):
${JSON.stringify(params.personalizationManifest)}

Apply the change:
- Preserve camera-anchor preamble exactly
- Preserve wall paint hex hard-constraint exactly
- Preserve architecture hard-constraint exactly
- For surgical edits: identify the clause, modify it, preserve all else
- For style-shift: regenerate interior content clauses (1-13) using new style codex; preserve preamble
- For add-product: append new clause with shape descriptor; update manifest

Output JSON ONLY:
{
  "merged_prompt": "...",
  "style_shifted": bool,
  "manifest_delta": object | null
}`;

  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    timeout: TIMEOUTS.sonnetDirector, // 30s
    messages: [{ role: 'user', content: sonnetPrompt }],
  });
  
  const parsed = JSON.parse(/* parse + validate */);
  
  await logCost({
    userId: params.userId,
    category: 'render',
    stage: 'director_merge',
    costUsd: estimateCost(resp.usage),
    model: 'claude-sonnet-4-5',
    durationMs: Date.now() - startMs,
  });
  
  return parsed;
}
```

3. **Verifier_light** at `apps/web/lib/render/stage6-verifier-light.ts`:
```typescript
const VERIFIER_LIGHT_PROMPT = `You are verifying a refined room render against its parent.

Original render (parent): {parent_render_url}
Refined render: {refined_render_url}
Architectural baseline (from parent's first successful render):
- camera_angle: {ax, ay, az}
- wall_color_hex: {hex}
- architecture_mask: {mask_summary}

User's refine intent: "{refine_prompt}"

Score 0-10 on TWO dimensions:

1. architecture_preservation:
   - Did walls, ceiling, doors, windows stay structurally identical?
   - Wall hex within tolerance ({tolerance_delta_e} ΔE)?
   - Camera angle within ±3°?
   - 0-3 = drifted significantly (HARD FAIL)
   - 7-10 = preserved well

2. refine_intent_match:
   - Did the user's requested change actually apply?
   - 0-3 = no change OR wrong change
   - 7-10 = change applied correctly

Output JSON only:
{
  "architecture_preservation": 0-10,
  "refine_intent_match": 0-10,
  "summary": "...",
  "pass": bool (both ≥7),
  "retry_recommended": bool,
  "retry_dimension": string | null
}`;

export async function verifyRefineLight(params: {
  parentRenderUrl: string;
  refinedRenderUrl: string;
  architecturalBaseline: object;
  refinePrompt: string;
  refineIndex: number;
  userId: string;
}): Promise<VerifierLightResult> {
  const tolerance = Math.min(5 * params.refineIndex, 20); // widens 5 ΔE per gen, cap 20
  // ... Haiku 4.5 vision call with both images base64-encoded
}
```

4. **Profanity check** at `apps/web/lib/refine/profanity.ts`:
```typescript
export async function checkProfanity(prompt: string, userId: string): Promise<{ flagged: bool; reason?: string }> {
  // Haiku 4.5: classify if prompt contains profanity, hate speech, sexual content, violence
  // Returns { flagged: bool, reason: string | null }
  // Cost ~$0.001
}
```

5. **PII strip** at `apps/web/lib/refine/pii-strip.ts`:
```typescript
export function stripPii(prompt: string): { stripped: string; warnings: string[] } {
  // Apply same regex patterns as redactLogPayload
  // Strip emails, phones, addresses, payment data
  // Return cleaned prompt + array of warning codes
}
```

6. **Refine pipeline orchestrator** at `apps/web/lib/render/orchestrator-refine.ts`:
```typescript
export async function runRefinePipeline(params: {
  parentRenderId: string;
  refinePrompt: string;
  userId: string;
}): Promise<{ renderId: string }> {
  // 1. Validate parent render belongs to user, is succeeded
  // 2. Check concurrency: no other refine in-progress for this user
  // 3. Strip PII, check profanity
  // 4. Deduct token (logged in V1, enforced V1.5+)
  // 5. Create new renders row: parent_render_id set, refine_index = parent.refine_index + 1
  // 6. Acquire advisory lock keyed on (room_id, attempt_number=1)
  // 7. Fire async pipeline:
  //    a. Stage 3: director merge (NEW prompt = merge of parent's + refine diff)
  //    b. Stage 4: cache lookup (HIT — same processed_url as parent)
  //    c. Stage 5: FLUX.2 with merged prompt
  //    d. Stage 5b: mood relight if lighting.mood changed
  //    e. Stage 6: verifier_light Haiku 4.5
  //       If fail: 1-retry budget Stage 5 with edit_strength 0.75
  //    f. Stage 7: hotspot re-detection
  //    g. Stage 8: delivery
  // 8. Return new render_id immediately (status='running'); client polls /api/render/status
}
```

7. **API routes:**

**POST /api/render/refine**
```
Body: { render_id: string, refine_prompt: string }
Validation:
  - render_id belongs to user
  - parent render status='succeeded'
  - no concurrent refine in-progress for this user → 409 if violated
  - refine_prompt 3-200 chars non-whitespace
  - profanity check passes
  - PII stripped
Returns:
  { ok: true, render_id: string (NEW) }
  | { ok: false, failure_category, user_message }
Cost: token deduction logged (not enforced V1)
Side effects: creates renders row, kicks off orchestrator-refine async
```

**GET /api/render/[id]/refine-history**
```
Returns: {
  parent: { id, render_url, refine_index, created_at },
  chain: [
    { id, render_url, refine_index, refine_prompt, created_at },
    ... up to 10 most recent
  ],
  total_count: number
}
```

### 6B — UI

#### Refine modal (component, not separate route)

**Tool:** Frontend Visionary + Framer Motion

**Trigger:** click "Refine this design →" CTA on /render/select-cta or render detail view

**Modal layout:**
- Slide-up modal from bottom on mobile, centered modal on desktop
- 480×420 desktop / 100% width × 60% height mobile
- Ivory bg, 4px radius, padding 32px, shadow `0 8px 64px rgba(9,24,41,0.4)`
- Backdrop: navy 70% opacity, click-to-close
- Close X icon top-right, navy 60%

**Content:**
- Headline EB Garamond Italic 24px navy: *"What would you like to change?"*
- Text input 100% width, 80px tall, ivory bg, navy border 12%, focus 1.5px gold
- Placeholder: *"Describe your change in plain words…"*
- Character counter below input, right-aligned: "0 / 200" DM Sans 12px navy 50%
- Below counter: 4 example chips (gold border, navy text, DM Sans 13px, 8px padding, 4px radius)
  - "Make the sofa darker"
  - "Swap the rug for sisal"
  - "More warm light"
  - "Try a different style"
- Click chip → text inserted into input
- Bottom: 2 CTAs side-by-side
  - Cancel (ghost ivory bg, navy text)
  - "Apply refine →" (gold pill, primary; disabled until ≥3 chars)

**Behavior:**
- Submit triggers POST /api/render/refine
- On success: modal closes, navigates to /render/in-progress (cinematic plays)
- On 409 concurrent: toast "Previous refine still processing. Wait or cancel."
- On profanity rejection: modal stays open, error message below input "Try a different phrasing"
- On PII strip: warning toast "We removed personal info from your prompt"
- Escape key closes modal
- Click backdrop closes modal

**Reduced motion:**
- Modal appears via opacity fade (no slide-up)
- No animation on submit

**Mobile UX:**
- Slide-up from bottom feels like native action sheet
- Full-width, 60% height
- Keyboard pushes modal up smoothly

**Analytics:**
- refine_modal_opened {render_id}
- refine_chip_clicked {chip_text}
- refine_submitted {prompt_length, has_pii_stripped}
- refine_rejected_profanity
- refine_rejected_concurrent
- refine_started {new_render_id}

#### Refine in-progress (reuses /render/in-progress)

Same template as Phase 5. Captions cycle based on stage. New text:
- Stage 3 caption: *"Adjusting your design…"*
- Stages 5/5b: same as initial render
- Caption "Cache hit on empty room" only shown in dev mode (saves ~25s — user might wonder why faster than initial)

#### Refine reveal (reuses /render/reveal)

Same template as Phase 5. New cinematic captures the change applied.

#### Refine history visualization (component, lives in dashboard Phase 9)

This is a Phase 6 component that Phase 9 dashboard consumes. Built in Phase 6 for completeness but only surfaced after Phase 9 ships.

**RefineHistoryChain component:**
- Visual chain: parent → refine 1 → refine 2 → … → refine N
- Each node: 80×60 thumbnail of render + small caption "Refined: {first 30 chars of refine_prompt}"
- Click thumbnail → navigates to /render/[id]/shop (Phase 7) or /dashboard/render/[id] (Phase 9)
- "View all N refines" link if chain >10

### 6C — Integration + review

- Wire refine modal to /render/select-cta CTA
- Wire submit flow to /api/render/refine
- Cache hit verified on refines from same processed_url (Stage 4 in pipeline_runs has 0 cost + ~0s)
- parent_render_id chain works (can fetch chain via /api/render/[id]/refine-history)
- architectural_baseline preserved across chained refines (verifier_light tolerance widens correctly)
- 1-retry budget logic on refines (verifier_light fail → re-fire Stage 5 with edit_strength 0.75)
- Concurrency: 409 returned when refine in-progress
- Verifier 7-phase: surgical refine + style-shift refine + add-product refine + cache-miss-edge + verifier-fail-retry + architectural-drift-after-N-refines

---

## 7. Out of scope

- Light-path FLUX Kontext routing (deferred to Phase 11 M6 bake-off)
- Region-select / canvas-based UI (deferred to V1.5)
- Voice refine (V1.5)
- Side-by-side refine comparison (V1.5)
- Refine history visualization in dashboard UI (built component, surfaced in Phase 9)

---

## 8. Files touched

### Created
- `apps/web/app/api/render/refine/route.ts`
- `apps/web/app/api/render/[id]/refine-history/route.ts`
- `apps/web/lib/render/orchestrator-refine.ts`
- `apps/web/lib/render/stage3-director-merge.ts`
- `apps/web/lib/render/stage6-verifier-light.ts`
- `apps/web/lib/refine/profanity.ts`
- `apps/web/lib/refine/pii-strip.ts`
- `apps/web/lib/refine/concurrency-check.ts`
- `apps/web/components/refine/RefineModal.tsx`
- `apps/web/components/refine/ExampleChips.tsx`
- `apps/web/components/refine/RefineHistoryChain.tsx` (consumed by Phase 9)
- `tests/refine/director-merge.test.ts`
- `tests/refine/verifier-light.test.ts`
- `tests/refine/profanity.test.ts`
- `tests/refine/pii-strip.test.ts`
- `tests/refine/cache-hit.test.ts`
- `tests/refine/parent-chain.test.ts`
- `tests/refine/architectural-drift.test.ts`

### Modified
- `apps/web/components/render/SelectCta.tsx` (wire Refine CTA to modal)
- `apps/web/lib/analytics/events.ts` (refine events)
- `apps/web/lib/errors/categories.ts` (RefineFailure union)

---

## 9. API contracts

### POST /api/render/refine
```
Auth: required
Body: { render_id: string, refine_prompt: string }
Validation:
  - render_id exists, belongs to user, status='succeeded'
  - refine_prompt 3-200 chars non-whitespace
  - profanity check passes
  - PII stripped (warns user if stripped, doesn't block)
  - no concurrent refine in-progress for user → 409
Returns:
  { ok: true, render_id: string (NEW) }
  | { ok: false, failure_category: 'refine_concurrent_in_progress' | 'refine_profanity_rejected' | 'refine_prompt_invalid' | 'refine_parent_not_succeeded' | 'refine_pipeline_fail', user_message }
Cost log: token deduction logged
Side effects: creates renders row, kicks off orchestrator-refine async
```

### GET /api/render/[id]/refine-history
```
Auth: render belongs to user
Returns: {
  parent: { id, render_url, refine_index, created_at },
  chain: [...up to 10 most recent],
  total_count: number
}
```

---

## 10. Schema migrations

No new tables/columns. Phase 5 already created parent_render_id, refine_prompt, refine_index in renders table.

Verify indexes:
```sql
CREATE INDEX IF NOT EXISTS renders_parent_idx ON renders(parent_render_id);
CREATE INDEX IF NOT EXISTS renders_user_chain_idx ON renders(user_id, parent_render_id, refine_index);
```

Down: DROP INDEX (idempotent).

---

## 11. Failure handling

```typescript
export type RefineFailure =
  | 'refine_concurrent_in_progress'    // 409
  | 'refine_profanity_rejected'
  | 'refine_prompt_invalid'             // <3 chars or >200 chars
  | 'refine_pii_stripped'                // warning, not error
  | 'refine_parent_not_succeeded'        // can't refine a failed render
  | 'refine_parent_not_owned'            // RLS check
  | 'director_merge_sonnet_fail'         // retry once, then fall back to template merge
  | 'verifier_light_haiku_fail'         // non-fatal, ship without verification
  | 'verifier_light_fail_after_retry'   // both attempts <7 in either dim
  | 'refine_cache_miss'                  // logged but not error (regenerates Stage 4)
  | 'refine_pipeline_fail';
```

| Category | Recovery |
|---|---|
| refine_concurrent_in_progress | Toast "Wait for current refine to finish" |
| refine_profanity_rejected | Modal error message; user retries |
| refine_pii_stripped | Toast warning; pipeline still proceeds with stripped prompt |
| director_merge_sonnet_fail | Retry once; if still fails, fall back to "naive append" merge (refine prompt appended as new clause) |
| verifier_light_haiku_fail | Non-fatal; ship without verification flag |
| verifier_light_fail_after_retry | Ship best-of-2 by sum scores; log warning |
| refine_cache_miss | Caption updates to "Generating fresh empty room…"; +25s, +$0.140 |

---

## 12. Cost budget

| Source | Estimated cost |
|---|---|
| Claude credits | $25–40 |
| Test refines (~50 cases covering surgical/style-shift/add-product) | ~$8 |
| Verifier_light tuning (50 calls) | ~$0.10 |
| Profanity check tuning (20 cases) | ~$0.02 |
| **Total** | **~$33–48** |

---

## 13. Verifier focus areas

| Criterion | Verifier check |
|---|---|
| Refine modal renders | UI matches spec on desktop + mobile |
| Modal opens from select-cta | Click flow works |
| Profanity rejected | Test with "fuck this sofa" → modal error |
| PII stripped | Test with "make sofa darker, send to test@example.com" → email stripped, warning shown |
| Concurrency 409 | Fire 2 refines back-to-back → 2nd returns 409 |
| Director merge surgical | Test "make sofa darker" → clause 2 changed only |
| Director merge style-shift | Test "try Industrial" → clauses 1-13 regenerated, preamble preserved |
| Director merge add-product | Test "add Sonos Arc" → new clause appended, manifest updated |
| Stage 4 cache HIT on refine | pipeline_runs row for stage 4 has 0 cost + 0 duration |
| Verifier_light 2-dim only | Output JSON has only architecture_preservation + refine_intent_match keys |
| 1-retry budget on verifier_light | Force fail → Stage 5 re-runs with edit_strength 0.75 |
| architectural_baseline preserved | After 5 chained refines, baseline same camera/wall as original |
| Tolerance widens correctly | Refine 3: tolerance = 5*3 = 15 ΔE; Refine 5: capped at 20 |
| parent_render_id chain | /api/render/[id]/refine-history returns correct chain |
| Cost log on refines | render_cost_log shows all stages with correct categories |
| Refine cost ~$0.15 | Sample 10 refines, mean cost $0.12-$0.18 |
| Refine latency ~30s p50 | Sample 10 refines, p50 latency 24-35s |
| All 11 RefineFailure codes used | Grep confirms |

---

## 14. Adversarial code review checklist

- [ ] Refine modal disabled state correctly enforced (button disabled <3 chars)
- [ ] Char counter updates on every keystroke (controlled component)
- [ ] Example chips actually populate input (not just visual)
- [ ] Submit during invalid state ignored (defense in depth)
- [ ] PII regex strips before profanity check (so "fuck@example.com" doesn't reveal email in logs)
- [ ] Profanity check uses Haiku timeout from lib/config/timeouts.ts
- [ ] Concurrency check uses Postgres row lock or advisory lock (not just app-level mutex)
- [ ] Concurrency check counts only renders with status='running' (not orphaned)
- [ ] Stale running renders cleanup cron (set status='failed' if older than 10 min)
- [ ] Director merge prompt EXACTLY matches §4.5 — including hard-constraint preservation directive
- [ ] Director merge JSON parse failure → retry once, then naive-append fallback
- [ ] Naive-append fallback adds refine prompt as final clause; preserves all else
- [ ] Verifier_light prompt uses dynamic tolerance based on refine_index
- [ ] Verifier_light tolerance capped at 20 ΔE
- [ ] verifier_light JSON has only 2 dim keys (no leftover 8-dim from full verifier copy-paste)
- [ ] Stage 4 cache key derived from processed_url bytes + dimensions (NOT from refine_prompt; that would defeat the cache)
- [ ] Cache miss on refine logged but not errored (graceful degradation)
- [ ] Cache miss caption updates user-visibly
- [ ] parent_render_id NOT NULL on refine inserts (verify via DB constraint)
- [ ] refine_index = parent.refine_index + 1 enforced
- [ ] User CANNOT refine another user's render (RLS check before pipeline)
- [ ] Refine on a failed parent render rejected (status check)
- [ ] Refine pipeline writes pipeline_runs rows with parent_run_id linking back
- [ ] Cost log uses category 'refine' (not 'render') so analytics distinguish
- [ ] PostHog events have refine_started + refine_completed (NOT just render_*)
- [ ] Chain depth >10: API returns last 10 + total_count, doesn't OOM on large chains
- [ ] No console.log of refine_prompt (PII via redactLogPayload)
- [ ] Concurrency 409 returns Retry-After hint
- [ ] Verifier_light Haiku timeout 15s (lib/config/timeouts haikuClassifier)
- [ ] Director merge Sonnet timeout 30s (sonnetDirector)

---

## 15. Manual click-script

Save to `cova-plan/manual-evidence/P6/`.

### Surgical refine happy path
1. Sign in test user with completed render (Warm Japandi, parent_render exists)
2. Navigate to /render/select-cta?render_id={parent_id}
3. Click "Refine this design →" → refine modal slides up **[F1: refine-modal.png]**
4. Type "Make the sofa darker" → counter updates to "23 / 200"
5. Click "Apply refine →" → modal closes, navigates to /render/in-progress
6. Watch cinematic ~24s (mood relight skipped if no mood change) **[F2: refine-in-progress.png]**
7. /render/reveal plays with new render → sofa visibly darker, all else identical **[F3: refine-reveal-surgical.png]**
8. /render/select-cta loads with same 2 CTAs

### Style-shift refine
9. Click Refine again → modal opens
10. Click chip "Try a different style" → text inserted
11. Edit to "Try Industrial style instead" → submit
12. Watch cinematic ~30s
13. New render: industrial materials replace Japandi, but architecture preserved (walls/windows/doors same) **[F4: refine-style-shift.png]**

### Add-product refine
14. Click Refine → type "Add a Sonos Arc soundbar below the TV"
15. Submit → new render with soundbar mounted below TV mount **[F5: refine-add-product.png]**

### Concurrency 409
16. Fire 2 refines in rapid succession
17. 2nd attempt: toast "Previous refine still processing. Wait or cancel." **[F6: concurrency-toast.png]**

### Profanity rejection
18. Refine modal → type "make this fucking sofa darker"
19. Submit → modal stays open, error below input "Try a different phrasing" **[F7: profanity-error.png]**

### PII stripping
20. Refine modal → type "make sofa darker, send to test@example.com"
21. Submit → toast "We removed personal info from your prompt" + pipeline proceeds **[F8: pii-stripped.png]**
22. Verify in Sentry/logs: refine_prompt logged as "make sofa darker, send to [redacted]"

### Refine chain (3 refines deep)
23. Run surgical refine 1: "make sofa darker"
24. From new render's select-cta, refine 2: "swap rug for sisal"
25. From that, refine 3: "more warm light"
26. Verify via Supabase MCP: 4 renders rows, parent_render_id chain (refine 3 → refine 2 → refine 1 → parent)
27. GET /api/render/{refine_3_id}/refine-history returns chain of 4 **[F9: chain-history.png]**

### Verifier_light retry
28. Force a refine that drifts wall color (force via prompt "paint walls deep red")
29. Verifier_light architecture_preservation < 7 → Stage 5 re-runs with edit_strength 0.75
30. If second attempt also fails, ship best-of-2 + log failure_category='verifier_light_fail_after_retry_on_refine'

### Cache hit verified
31. Run 2 refines on same parent within 30 days
32. Both have Stage 4 cache hit (pipeline_runs.cost_usd = 0, duration_ms < 100)
33. empty_room_cache.hit_count incremented

### Architectural baseline preserved across 5 refines
34. Run 5 refines in a chain
35. Verify all 5 have same architectural_baseline jsonb (copied from parent's first successful)
36. Verifier_light tolerance: refine 1 = 5 ΔE, refine 5 = 20 ΔE (capped)

### Mobile responsive
37. iPhone Safari: refine modal slides up from bottom **[F10: mobile-refine-modal.png]**

### Reduced motion
38. Enable OS reduced motion → modal appears via fade, no slide animation **[F11: reduced-motion-modal.png]**

---

## 16. Manual evidence bundle

- 11+ screenshots from §15
- Sample refine chain SQL dump (parent + 5 refines)
- Cost telemetry SQL dump for sample refines (showing Stage 4 cache hits at $0)
- Director merge prompt + output samples (3 examples: surgical, style-shift, add-product)
- Verifier_light output samples (5 cases including pass + retry + fail-after-retry)
- INDEX.md linking artifacts to spec criteria

---

## 17. Remediation budget

- Round 1: Verifier session 1 self-heals
- Round 2: Verifier session 2 finds new issues → remediation
- Round 3 (escalation): write `cova-plan/escalations/P6.md`

If director merge fails frequently (Sonnet hallucinates clauses): escalation = tighten merge prompt OR fall back to naive-append-only mode.

---

## 18. Closing checklist

- [ ] All screenshots in `cova-plan/manual-evidence/P6/`
- [ ] Refine chain SQL dump archived
- [ ] Director merge samples archived
- [ ] Verifier_light samples archived
- [ ] INDEX.md written
- [ ] `PHASE_STATUS.md` Phase 6 → CLOSED
- [ ] `OPEN_DECISIONS.md` updated: refine UI text-only locked, verifier_light 2-dim, tolerance widening rule, concurrency 409 policy, refine cost target $0.15, latency target 30s
- [ ] `EMPIRICAL_FINDINGS.md` updated: actual Stage 4 cache hit rate on refines (target ≥85%), verifier_light vs full verifier accuracy delta on 50 sample renders, mean refine cost actual vs predicted, mean refine latency actual vs predicted
- [ ] Phase 7 prereq section reviewed
- [ ] Verifier reports archived
- [ ] Session handoffs written

---

## 19. Rollback plan

- Revert merge commit on main → Vercel rolls back
- No new tables/migrations to revert
- If refine pipeline broken in prod: feature flag `refine_enabled=false` hides Refine CTA, shows "Refine coming soon" placeholder

---

## 20. Feature flags introduced

| Flag key | Description | Default |
|---|---|---|
| `refine_enabled` | Master switch | true |
| `refine_profanity_check_enabled` | Haiku profanity check | true |
| `refine_verifier_light_enabled` | Use verifier_light (false = full Sonnet 8-dim) | true |
| `refine_concurrency_check_enabled` | Block concurrent refines | true |

---

## End of Phase 6 doc.

Next: Phase 7 (Product Matching).
