# Phase 11 — Pre-launch validation gates

**Cova V1 implementation · Phase 11 of 12 · Self-contained**

---

## Phase identity

| | |
|---|---|
| **Phase number** | 11 of 12 |
| **Goal** | Run all pre-launch validation gates: M5/M6/M7/M-templates bake-offs, 50-render quality re-run end-to-end, 240-render nightly regression suite, 540-variant prompt snapshot in CI, daily/weekly review queues, user flag button, admin review UI. Lock V1 quality before deployment. |
| **Executor session estimate** | 3–4 sessions |
| **Calendar estimate** | 2–3 weeks (most of it is running tests + reviewing outputs) |
| **Predicted Claude credits** | ~$50–80 |
| **Predicted infra spend** | ~$200 (M5: 30 rooms × 2 routes; M6: 100 outputs × 4 candidates ~$15; M7: 50 hotspots × 4 combos ~$30; M-templates: 60 templates × 5 reference rooms ~$50; 50-render quality re-run ~$20; 240-render nightly ~$80; admin review tooling ~$5) |
| **Depends on** | Phases 1–10 closed |
| **Blocks** | Phase 12 deployment |

---

## 1. The session loop for this phase

1. **Open new claude.ai chat.** Paste this entire phase doc.
2. **Chat summarizes back.** Confirms understanding, confirms gate criteria. You confirm.
3. **Planner fires.** Fresh Claude Code session. Drift check: confirm Phases 1–10 all CLOSED in `PHASE_STATUS.md`. Verify Phase 5 50-render quality gate passed (≥80% first-attempt). Verify Phase 7 50-render hotspot bake-off passed (≥80%). Verify Phase 6 verifier_light operational. Uses Context7 MCP for: current FLUX Kontext API, current Nano Banana 2 endpoint, current SeedEdit 3.0 API, current CLIP-ViT-B/32 Modal patterns. Uses EXA MCP for: bake-off methodology, A/B output comparison patterns, regression test infrastructure for ML models. Uses web search for: latest pricing on candidate refine models. Writes executor prompt to `cova-plan/planner-output/P11-executor-prompt.md`.
4. **Executor prompt returns.** Verify covers all 4 bake-offs + admin review UI + 240-render nightly suite + user flag button. Check estimates against budget.
5. **Executor fires.** 3–4 sessions across the bake-offs + tooling.
6. **Verifier session 1 fires.** Reviews bake-off code correctness, scoring rubric application, sample selection methodology, admin review UI authentication, user-flag-button wiring. Self-heals.
7. **Verifier session 2 fires.** Independent. Hunts for: bake-off scoring bias (Sonnet vs human), regression suite false positives, nightly job not actually running, admin review queue auth bypasses.
8. **Manual review of bake-off outputs.** Daksh + Pranav review all bake-off side-by-side comparisons, score quality, lock the winners. ~2-3 days of human review time.
9. **Document updates.** `PHASE_STATUS.md`, `OPEN_DECISIONS.md`, `EMPIRICAL_FINDINGS.md` — bake-off results lock M5 routing, M6 refine model, M7 product matching detector+API combo, and template winners.

---

## 2. Prereq verification

### Phases 1–10 closure checks
- All 10 previous phases CLOSED in `PHASE_STATUS.md`
- Phase 5 50-render quality test gate passed (≥80% first-attempt, ≥95% after retry)
- Phase 7 50-render hotspot bake-off passed (≥80% match rate)
- Phase 6 verifier_light operational
- Phase 5 540-variant cleanPrompt snapshot in CI
- 4 Modal apps reachable (cova-perception, cova-empty-room, cova-redesign, cova-composite-art)
- 10 reference rooms at `cova-plan/render/reference-rooms/`
- 10 style codices at `cova-plan/render/style-codex/`
- fal.ai, Anthropic, SearchApi.io API keys all in `.env.local`
- Modal startup credits (or paying customer) for ~$200 in test compute
- Cloudflare R2 has space for bake-off outputs (~5GB)

### Halt conditions
- Phase 5 quality gate not actually passed → halt, escalate Phase 5 remediation
- Phase 7 hotspot gate not actually passed → halt, escalate Phase 7 remediation
- 10 reference rooms not curated → halt, generate before bake-offs
- Required MCPs not connected → halt

---

## 3. Pre-decisions

**G1. M5 two-pass routing bake-off (locked).** *Resolution:* compares two pipeline routes on 30 rooms × 5 styles. Routes:
- Route A (current locked): Stage 4 empty-room → Stage 5 FLUX.2 edit
- Route B (Block C candidate): direct-edit on cluttered photo (skip Stage 4)

Visual + automated metrics. Daksh + Pranav score 8-dim rubric. Lock the winner. If Route A wins (likely), confirm Stage 4 stays. If Route B wins, Phase 11 closes with decision to migrate (V1.5 work).

**G2. M6 refine model bake-off (locked).** *Resolution:* compares 4 refine models on 100 outputs (25 per model × 4 models). Candidates:
- FLUX.2 Pro/Max edit (current Phase 6 default)
- FLUX Kontext (surgical edits)
- Nano Banana 2
- SeedEdit 3.0

100 outputs × ~$0.15 = ~$15. Daksh + Pranav score visual quality + intent-match + cost + latency. Lock winner per refine type (surgical vs style-shift may have different winners).

**G3. M7 product matching bake-off (locked).** *Resolution:* compares 4 detector+API combos on 50 hotspots. Combos:
- SAM-3 + SearchApi.io Lens (current Phase 7 default)
- SAM-3 + Lens + CLIP-ViT-B/32 re-rank
- EVF-SAM + Lens
- Florence-2 + Lens

50 hotspots × 4 combos × $0.15 avg = ~$30. Score: top-1 match rate, retailer coverage, latency. Lock winner.

**G4. M-templates bake-off (locked).** *Resolution:* tests 60 prompt templates × 5 reference rooms = 300 renders. ~$0.17/render = ~$50. Each template scored by 8-dim verifier rubric + visual review. Lock top 30 templates per style codex. Bottom 30 retired or revised.

**G5. 50-render quality test re-run (mandatory gate).** *Resolution:* full Phase 5 quality test re-run after all Phase 11 changes integrated. Confirms no regressions from M5/M6/M7/M-templates winners. ≥80% first-attempt pass, ≥95% after 1 retry.

**G6. 240-render nightly regression suite (locked).** *Resolution:* 4 reference rooms × 60 winning templates = 240 renders run nightly (Vercel Cron at 04:00 UTC). SSIM diff alerts: if any render's SSIM drops >10% vs baseline (last passing render), email Daksh. Cost: 240 × $0.30 = $72/night × 30 days = $2160/month → reduce to weekly + paid cron tier. Locked: weekly Sunday 04:00 UTC, ~$72/week + $30/month for tier upgrade.

**G7. 540-variant prompt snapshot in CI (locked).** *Resolution:* the snapshot test from Phase 5 (60 templates × 9 personalization states = 540 variants) runs in GitHub Actions on every PR. Test compares cleanPrompt() output against committed snapshots. Failure = block merge.

**G8. Daily 10-render review queue (locked).** *Resolution:* random sample of 10 production renders/day routed to /admin/review. Daksh + Pranav spend ~5 min/day reviewing. Catches drift early. PostHog event `admin_render_reviewed`.

**G9. Weekly 50-render deep dive (locked).** *Resolution:* every Sunday, 50-render quality assessment by Daksh + Pranav. ~1-2 hours. Surfaces systemic issues (e.g., Industrial style underperforming, refines drifting on certain room types).

**G10. User flag button (locked).** *Resolution:* on every render in dashboard + per-design view, small "Report this render" link. Click → modal with reason chips (wrong style / poor quality / not photorealistic / other) + optional comment. Submission writes to admin queue. Triggers PostHog event for analytics. Visible only on completed renders (not in-progress).

**G11. Admin review UI (locked).** *Resolution:* `/admin/review` route. Auth-gated to admin user list (Daksh + Pranav user_ids in env var). Shows queue of: daily 10-sample + user-flagged renders. Per-render actions: mark reviewed / mark issue / add note. Bulk actions for high-volume days. Internal-facing UI; no design polish required.

**G12. Bake-off scoring methodology (locked).**
- Visual quality: 1-5 scale, both raters score independently, average
- 8-dim verifier rubric: Sonnet 4.5 vision scores each dim 0-10
- Cost: dollars per output
- Latency: seconds end-to-end p50

Final score = composite (visual quality 40% + verifier mean 40% + cost-normalized 10% + latency-normalized 10%).

---

## 4. Background context (self-contained)

### 4.1 What Phase 11 delivers

After Phase 11:
- M5 routing winner locked (Route A or B)
- M6 refine model winner locked per refine type
- M7 product matching detector+API combo winner locked
- M-templates: top 30 templates per style codex confirmed
- 50-render quality re-run passed end-to-end
- 240-render weekly regression suite running with SSIM diff alerts
- 540-variant prompt snapshot in CI passing on every PR
- Daily + weekly admin review queues operational
- User flag button live on dashboard + per-design view
- /admin/review UI usable by Daksh + Pranav

V1 is fully validated and ready for deployment (Phase 12).

### 4.2 Why these gates matter

Without Phase 11:
- Render quality drifts silently in production (no regression suite)
- Prompt template changes break existing renders (no snapshot test)
- Bad renders escape unnoticed (no review queue)
- User pain points stay invisible (no flag button)
- M5/M6/M7 architecture decisions remain assumptions, not validated

Phase 11 converts assumptions to evidence. Phase 12 deploys with confidence.

### 4.3 Bake-off methodology

All 4 bake-offs follow this pattern:

```
1. Pre-define candidate set (locked at planner session)
2. Pre-define test sample (locked at planner session)
3. Generate outputs in parallel (Modal jobs)
4. Run automated metrics (verifier rubric, cost log)
5. Daksh + Pranav score visual quality 1-5 independently
6. Compute composite score per candidate
7. Lock winner; document rationale
8. Update OPEN_DECISIONS.md with [D-XXX] decision entry
```

### 4.4 Edge cases

- **Bake-off candidate fails to generate (API down):** retry once; if still fails, exclude from score and document
- **Composite score tie:** prefer current default (avoid migration risk), prefer lower cost as tiebreaker
- **User-flag spike:** if >5% of renders flagged in a 24h window, alert Daksh; investigate before launch
- **Nightly regression false positive:** SSIM diff >10% but human review confirms quality OK → log as known-good drift, update baseline
- **Admin queue overflow:** if >100 unreviewed renders pile up, alert; consider raising sample rate threshold

---

## 5. Tech stack

| Component | Tool | Notes |
|---|---|---|
| Bake-off orchestration | Modal Python jobs + custom TS scripts | Parallel candidate runs |
| Automated metrics | Sonnet 4.5 vision verifier (existing Phase 5) | Re-used |
| SSIM computation | OpenCV in Modal job | Compares vs baseline render per template |
| Admin review UI | Next.js page at /admin/review | Internal |
| User flag button | Component on dashboard + per-design | Phase 9 component extended |
| Nightly cron | Vercel Cron + Modal job | Sunday 04:00 UTC |
| Snapshot test | Vitest in CI | 540 variants |
| CLIP re-rank | CLIP-ViT-B/32 on Modal A10G | M7 candidate only |
| Hive moderation pre-bake-off | Already wired (Phase 7) | Reused for safety on test renders |

---

## 6. Scope

### 11A — Bake-off infrastructure

1. **M5 two-pass routing bake-off**

```typescript
// scripts/bakeoff/m5-routing.ts
const ROOMS = await curatedReferenceRooms(30);
const STYLES = ['warm_japandi','coastal','mid-century','industrial','bohemian'];
const ROUTES = ['route-a-empty-room', 'route-b-direct-edit'];

for (const room of ROOMS) {
  for (const style of STYLES) {
    for (const route of ROUTES) {
      const result = await runRender({ room, style, route });
      const verifier = await runVerifier(result.renderUrl, room.url, /* ... */);
      await db.bakeoff_m5.insert({ room_id, style, route, render_url, verifier_scores, cost, duration });
    }
  }
}
```

Cost: 30 × 5 × 2 = 300 renders × $0.30 = ~$90.

Acceptance:
- Output table with composite scores per route
- Visual side-by-side gallery at `cova-plan/bakeoffs/m5-results/`
- Daksh + Pranav score 30 random pairs (1 vs 1)
- Lock winner in `OPEN_DECISIONS.md`

2. **M6 refine model bake-off**

```typescript
// scripts/bakeoff/m6-refine-models.ts
const REFINE_PROMPTS = await curatedRefinePrompts(25); // 25 surgical refines
const MODELS = ['flux2-pro', 'flux-kontext', 'nano-banana-2', 'seededit-3'];

for (const prompt of REFINE_PROMPTS) {
  for (const model of MODELS) {
    const result = await runRefine({ prompt, model });
    const verifier = await runVerifierLight(result.renderUrl, prompt.parentUrl);
    await db.bakeoff_m6.insert({ prompt_id, model, render_url, scores, cost, duration });
  }
}
```

Cost: 25 × 4 = 100 outputs × ~$0.15 avg = ~$15.

Acceptance:
- Side-by-side gallery for each prompt × 4 models
- Daksh + Pranav score visual quality + intent-match
- Composite score per model
- Lock winner per refine type (surgical / style-shift) — winners may differ
- `OPEN_DECISIONS.md` updated

3. **M7 product matching bake-off**

```typescript
// scripts/bakeoff/m7-product-matching.ts
const HOTSPOTS = await sample50Hotspots(); // diverse furniture/decor across renders
const COMBOS = [
  { detector: 'sam-3', api: 'searchapi-lens' },
  { detector: 'sam-3', api: 'searchapi-lens', rerank: 'clip-vit-b-32' },
  { detector: 'evf-sam', api: 'searchapi-lens' },
  { detector: 'florence-2', api: 'searchapi-lens' },
];

for (const hotspot of HOTSPOTS) {
  for (const combo of COMBOS) {
    const result = await runProductMatch({ hotspot, combo });
    await db.bakeoff_m7.insert({ hotspot_id, combo, top_match, retailer, score, latency });
  }
}
```

Cost: 50 × 4 = 200 matches × ~$0.15 = ~$30.

Acceptance:
- Top-1 match rate per combo
- Retailer coverage per combo (% with affiliate retailer)
- Latency per combo
- Lock winner; if CLIP re-rank wins, integrate in V1.5

4. **M-templates bake-off**

```typescript
// scripts/bakeoff/m-templates.ts
const TEMPLATES = await loadTemplates(); // 60 prompt templates total (~6 per style)
const REFERENCE_ROOMS = await curatedReferenceRooms(5); // 5 across room types

for (const template of TEMPLATES) {
  for (const room of REFERENCE_ROOMS) {
    const result = await runRender({ room, template });
    const verifier = await runVerifier(result.renderUrl, room.url);
    await db.bakeoff_templates.insert({ template_id, room_id, render_url, scores });
  }
}
```

Cost: 60 × 5 = 300 renders × $0.17 = ~$50.

Acceptance:
- Per-template composite score
- Visual review of all 300 renders by Daksh + Pranav (~3 hours)
- Top 30 templates per style codex confirmed
- Bottom 30 retired or revised

### 11B — Validation infrastructure

5. **50-render quality re-run** — full Phase 5 50-render test re-run with all Phase 11 changes integrated. Same methodology as Phase 5. ≥80% first-attempt pass, ≥95% after retry.

Cost: ~$20.

6. **240-render weekly regression suite**
   - 4 reference rooms × 60 winning templates = 240 renders
   - Vercel Cron Sunday 04:00 UTC
   - For each render: compute SSIM vs last passing baseline
   - If SSIM drops >10%: email alert with diff
   - Update baseline if human review confirms intentional change
   - Cost: ~$72/week

```typescript
// vercel.json
{
  "crons": [
    { "path": "/api/cron/regression-suite", "schedule": "0 4 * * 0" }  // Sunday 04:00 UTC
  ]
}
```

7. **540-variant cleanPrompt snapshot** — already from Phase 5; verify still passing in CI.

8. **Daily 10-render sample**
   - Vercel Cron daily at 23:00 UTC
   - SELECT 10 random renders from past 24h
   - INSERT into admin_review_queue with reason='daily_sample'
   - Email digest to Daksh + Pranav next morning

9. **Weekly 50-render deep dive**
   - Sunday automated email with 50 random renders from past week
   - Daksh + Pranav block ~1-2 hours
   - Surface patterns in admin notes
   - Updates EMPIRICAL_FINDINGS.md if systemic issue found

### 11C — Admin review UI + user flag button

10. **`/admin/review` page**
    - Auth-gated to admin user IDs (env var `ADMIN_USER_IDS=uuid1,uuid2`)
    - Layout: queue of unreviewed renders (daily samples + user flags)
    - Per-render: render image, input photo, prompt, scores, refine_prompt if applicable, reviewer notes field, action buttons
    - Actions: "Mark reviewed (good)" / "Mark issue" / "Bulk reviewed (10)"
    - On "Mark issue": tag reason from chip list, optional note, write to issues log
    - Internal-only UI; minimal design polish (Tailwind utility-first)

11. **Schema:**
```sql
CREATE TABLE admin_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  render_id uuid REFERENCES renders(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('daily_sample','weekly_deep_dive','user_flag')),
  user_flag_reason text,                   -- if reason='user_flag'
  user_flag_comment text,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewer_decision text CHECK (reviewer_decision IN ('good','issue','duplicate','noise')),
  reviewer_notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX admin_review_queue_unreviewed_idx ON admin_review_queue(created_at) WHERE reviewed_at IS NULL;
ALTER TABLE admin_review_queue ENABLE ROW LEVEL SECURITY;
-- Service-role-only; admin UI uses service role internally
```

12. **User flag button**
    - Component at `apps/web/components/dashboard/UserFlagButton.tsx`
    - Visible on dashboard render thumbnails + per-design view
    - Click → modal with chip list (wrong style / poor quality / not photorealistic / other) + optional 200-char comment
    - POST `/api/dashboard/render/[id]/flag` writes to `admin_review_queue` with reason='user_flag'
    - Toast confirmation "Thanks for the feedback. We'll take a look."
    - PostHog event `render_flagged`

13. **Admin email digest** — Resend daily email with sample preview + link to /admin/review

### 11D — Integration + review

- All 4 bake-offs run end-to-end
- Winners locked in `OPEN_DECISIONS.md`
- 50-render quality re-run passed
- 240-render nightly suite running with SSIM alerts
- 540-variant snapshot test enforced in CI
- Daily + weekly review queues populated
- User flag button on dashboard + per-design
- /admin/review accessible by admins
- Verifier 7-phase: bake-off result integrity + admin auth gate + user flag button wiring + cron job firing

---

## 7. Out of scope

- Automated retraining based on flag patterns (V1.5 / V2)
- Public stats dashboard (V1.5)
- A/B testing framework (V1.5)
- Multi-region rendering routing (V2)
- Per-user quality tracking (V1.5)

---

## 8. Files touched

### Created
- `apps/web/app/admin/review/page.tsx`
- `apps/web/app/api/dashboard/render/[id]/flag/route.ts`
- `apps/web/app/api/admin/review/list/route.ts`
- `apps/web/app/api/admin/review/[id]/route.ts` (GET single, POST decision)
- `apps/web/app/api/cron/regression-suite/route.ts`
- `apps/web/app/api/cron/daily-sample/route.ts`
- `apps/web/components/admin/ReviewQueue.tsx`
- `apps/web/components/admin/RenderReviewCard.tsx`
- `apps/web/components/admin/BulkActions.tsx`
- `apps/web/components/dashboard/UserFlagButton.tsx`
- `apps/web/components/dashboard/UserFlagModal.tsx`
- `apps/web/lib/admin/auth-gate.ts` (env-var-based admin gate)
- `apps/web/lib/regression/ssim.ts`
- `apps/web/lib/regression/baseline.ts`
- `scripts/bakeoff/m5-routing.ts`
- `scripts/bakeoff/m6-refine-models.ts`
- `scripts/bakeoff/m7-product-matching.ts`
- `scripts/bakeoff/m-templates.ts`
- `scripts/bakeoff/score-bakeoff.ts` (composite score logic)
- `scripts/bakeoff/generate-comparison-gallery.ts` (HTML output for human review)
- `scripts/quality/run-50-render-test.ts`
- `cova-plan/bakeoffs/m5-results/` (output directory)
- `cova-plan/bakeoffs/m6-results/`
- `cova-plan/bakeoffs/m7-results/`
- `cova-plan/bakeoffs/m-templates-results/`
- `cova-plan/bakeoffs/50-render-rerun-results/`
- `tests/regression/baseline-renders.test.ts`
- `modal_pipeline/cova-bakeoff/main.py` (helper for parallel bake-off runs)

### Migrations
- `supabase/migrations/{ts}-admin-review-queue.sql` + `_down.sql`

### Modified
- `apps/web/components/dashboard/RecentRendersGrid.tsx` (add UserFlagButton)
- `apps/web/components/dashboard/PerDesignView.tsx` (add UserFlagButton)
- `apps/web/lib/analytics/events.ts` (admin + flag events)
- `apps/web/vercel.json` (add cron entries for regression-suite + daily-sample)

---

## 9. API contracts

### POST /api/dashboard/render/[id]/flag
```
Auth: required
Body: { reason: 'wrong_style' | 'poor_quality' | 'not_photorealistic' | 'other', comment?: string }
Validation: render belongs to user, comment max 200 chars, profanity check via Haiku
Returns: { ok: true }
Side effect: insert admin_review_queue row with reason='user_flag'
PostHog: render_flagged event
```

### GET /api/admin/review/list
```
Auth: admin only (via env-var ADMIN_USER_IDS check)
Query: ?limit=20&cursor=ISO+id&filter=user_flag|daily_sample|all
Returns: { ok: true, items: [...], next_cursor }
```

### POST /api/admin/review/[id]
```
Auth: admin only
Body: { decision: 'good' | 'issue' | 'duplicate' | 'noise', notes?: string }
Returns: { ok: true }
Side effect: update admin_review_queue row
```

### GET /api/cron/regression-suite
```
Auth: Vercel cron secret check
Side effect: triggers 240-render regression suite via Modal job
Returns: { ok: true, started_at }
```

### GET /api/cron/daily-sample
```
Auth: Vercel cron secret
Side effect: SELECT 10 random renders from past 24h, INSERT admin_review_queue rows
Returns: { ok: true, sampled: 10 }
```

---

## 10. Schema migrations

```sql
-- {ts}-admin-review-queue.sql
CREATE TABLE admin_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  render_id uuid REFERENCES renders(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('daily_sample','weekly_deep_dive','user_flag')),
  user_flag_reason text,
  user_flag_comment text,
  flagging_user_id uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewer_decision text CHECK (reviewer_decision IN ('good','issue','duplicate','noise')),
  reviewer_notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX admin_review_queue_unreviewed_idx ON admin_review_queue(created_at) WHERE reviewed_at IS NULL;
CREATE INDEX admin_review_queue_render_idx ON admin_review_queue(render_id);
ALTER TABLE admin_review_queue ENABLE ROW LEVEL SECURITY;
-- No policies = service-role-only

-- Down: DROP TABLE admin_review_queue;
```

---

## 11. Failure handling

```typescript
export type ValidationFailure =
  | 'bakeoff_candidate_generation_fail'
  | 'bakeoff_verifier_fail'
  | 'bakeoff_score_aggregation_fail'
  | 'regression_ssim_compute_fail'
  | 'regression_alert_send_fail'
  | 'admin_review_queue_insert_fail'
  | 'admin_unauthorized'
  | 'user_flag_profanity_rejected'
  | 'user_flag_render_not_owned';
```

| Category | Recovery |
|---|---|
| bakeoff_candidate_generation_fail | Retry once; if still fails, exclude from final score and document |
| regression_ssim_compute_fail | Log to Sentry; retry next week |
| admin_unauthorized | 403 + redirect to /dashboard |
| user_flag_profanity_rejected | Toast "Try a different phrasing" |
| user_flag_render_not_owned | 404 (anti-enumeration) |

---

## 12. Cost budget

| Source | Estimated cost |
|---|---|
| Claude credits | $50–80 |
| M5 routing bake-off | ~$90 |
| M6 refine models bake-off | ~$15 |
| M7 product matching bake-off | ~$30 |
| M-templates bake-off | ~$50 |
| 50-render quality re-run | ~$20 |
| 240-render regression first run | ~$72 |
| Misc (admin tooling test renders) | ~$5 |
| **Total** | **~$330–360** |

This is the most expensive phase by infrastructure spend. Scoped because it directly de-risks production launch.

---

## 13. Verifier focus areas

| Criterion | Verifier check |
|---|---|
| All 4 bake-offs ran | Output dirs at cova-plan/bakeoffs/ each contain results |
| M5 winner locked | OPEN_DECISIONS.md has [D-XXX] M5 routing decision |
| M6 winner locked | Same for M6 refine model |
| M7 winner locked | Same for M7 product matching combo |
| M-templates winners locked | 30 templates per style codex confirmed; 30 retired |
| 50-render quality re-run | ≥80% first-attempt, ≥95% after retry (gating) |
| 540-variant snapshot in CI | GitHub Actions config has snapshot test step |
| 240-render regression cron | Vercel cron entry; first run executed; SSIM logic verified |
| Daily sample cron | Vercel cron entry; daily 10-render sample populates admin_review_queue |
| User flag button on dashboard | Component renders on render thumbnails |
| User flag button on per-design | Component renders in side panel |
| /admin/review auth-gated | Non-admin user sees 403; admin sees queue |
| /admin/review usable | All actions (mark good/issue/bulk) work |
| Composite score logic | M5/M6/M7/M-templates all use same composite formula |
| Visual gallery generation | comparison-gallery.html files exist for each bake-off |
| All 9 ValidationFailure codes used | grep confirms |

---

## 14. Adversarial code review checklist

- [ ] Bake-off candidate generation has try/catch; failures excluded from score, documented
- [ ] Composite scoring formula is consistent across all 4 bake-offs
- [ ] Score aggregation uses median or trimmed-mean to avoid outlier bias
- [ ] Visual review gallery shows images side-by-side at same resolution
- [ ] Visual review captures BOTH input + all candidate outputs (not just outputs)
- [ ] Daksh + Pranav score independently before seeing each other's scores
- [ ] Composite formula weights documented in `cova-plan/bakeoffs/methodology.md`
- [ ] M5 routing winner re-tested on full 50-render quality re-run (avoid winner-by-luck)
- [ ] M6 winner per refine TYPE (surgical vs style-shift) tracked separately
- [ ] M7 retailer coverage % calculated per combo, not just top-1 match rate
- [ ] M-templates retiring decisions reviewed (don't retire if user-popular)
- [ ] 50-render re-run uses SAME 50 reference rooms as Phase 5 (not new sample — avoid easy/hard set drift)
- [ ] 240-render regression baseline rotates (not stale)
- [ ] SSIM threshold tuned: 10% drop catches real regressions but not too noisy
- [ ] SSIM alert email throttled (no spam if multiple drops same week)
- [ ] Admin queue insertion idempotent (same render_id + reason='daily_sample' twice on same day → one row)
- [ ] /admin/review auth gate uses env var, not hardcoded user IDs
- [ ] /admin/review uses service role for queries (read-all, not RLS-self)
- [ ] User flag button visible only on completed renders, not in-progress
- [ ] User flag modal profanity check via Haiku (not just regex)
- [ ] User flag rate limit (5/day/user) prevents spam
- [ ] Cron secrets verified before triggering jobs
- [ ] Vercel cron entries match expected paths
- [ ] Daily sample cron handles edge case of <10 renders in past 24h (low-traffic days)
- [ ] Weekly digest email format readable (not raw JSON dump)
- [ ] Bake-off scripts log to render_cost_log even though they're test renders (so we can audit total Phase 11 spend)
- [ ] Test renders flagged with `tags: ['internal_bakeoff']` to exclude from production analytics
- [ ] Test renders use a dedicated test user (not admin user) to avoid polluting admin's dashboard
- [ ] Image comparison gallery delivered as static HTML at cova-plan/bakeoffs/{name}/gallery.html
- [ ] M-templates retiring policy: bottom 30 retired but kept in `_archive/templates/` for V1.5 reconsideration

---

## 15. Manual click-script

Save to `cova-plan/manual-evidence/P11/`.

### M5 routing bake-off review
1. Run `pnpm tsx scripts/bakeoff/m5-routing.ts` (or wait for executor session)
2. Outputs at `cova-plan/bakeoffs/m5-results/gallery.html`
3. Open gallery in browser, review 30 rooms × 5 styles × 2 routes side-by-side **[K1: m5-gallery.png]**
4. Daksh + Pranav score 1-5 visual quality independently
5. Composite scores computed; lock winner (likely Route A based on prior testing) **[K2: m5-results-table.png]**
6. Update OPEN_DECISIONS.md with [D-XXX] entry

### M6 refine models bake-off
7. Run `pnpm tsx scripts/bakeoff/m6-refine-models.ts`
8. Outputs at `cova-plan/bakeoffs/m6-results/gallery.html`
9. Score 25 prompts × 4 models **[K3: m6-gallery.png]**
10. Lock winner per refine type (surgical / style-shift) **[K4: m6-results.png]**
11. Update OPEN_DECISIONS.md

### M7 product matching bake-off
12. Run `pnpm tsx scripts/bakeoff/m7-product-matching.ts`
13. Outputs include top-1 match rate, retailer coverage, latency per combo **[K5: m7-table.png]**
14. Lock winner; if CLIP re-rank wins, decision = "deferred to V1.5 integration"
15. Update OPEN_DECISIONS.md

### M-templates bake-off
16. Run `pnpm tsx scripts/bakeoff/m-templates.ts`
17. Outputs at `cova-plan/bakeoffs/m-templates-results/gallery.html`
18. Review 60 templates × 5 rooms = 300 renders
19. Score and lock top 30; retire bottom 30 **[K6: m-templates-gallery.png]**
20. Move retired templates to `_archive/templates/`
21. Update OPEN_DECISIONS.md

### 50-render quality re-run
22. Run `pnpm tsx scripts/quality/run-50-render-test.ts`
23. Verify: ≥80% first-attempt pass, ≥95% after retry **[K7: 50-render-rerun-summary.png]**
24. If fails: halt and remediate Phase 5 changes; re-run

### 240-render regression suite
25. Trigger first manual run via `/api/cron/regression-suite` endpoint (auth as cron secret)
26. Verify Modal job spawns 240 jobs; ~30 min wall-clock
27. Verify SSIM compare against baseline runs; no false alerts on first run **[K8: regression-first-run.png]**
28. Confirm Vercel Cron registered for Sunday 04:00 UTC

### 540-variant snapshot in CI
29. Push a PR with intentional cleanPrompt regression
30. Verify CI fails on snapshot test **[K9: ci-snapshot-fail.png]**
31. Revert; verify CI passes

### Daily sample cron
32. Trigger /api/cron/daily-sample manually
33. Verify admin_review_queue has 10 new rows with reason='daily_sample' **[K10: daily-sample-rows.sql.txt]**

### Admin review UI
34. Sign in as admin user → navigate to /admin/review **[K11: admin-review.png]**
35. Try as non-admin → 403 redirect **[K12: admin-403.png]**
36. Click first item → review card with input + render + scores
37. Click "Mark reviewed (good)" → row updates, removed from queue
38. Click another → "Mark issue" → reason chip + note, save
39. Bulk actions: select 10, mark all reviewed **[K13: admin-bulk.png]**

### User flag button
40. Sign in as test user
41. /dashboard → hover render thumbnail → small "Report" link visible **[K14: flag-button-dashboard.png]**
42. Click → modal opens with reason chips **[K15: flag-modal.png]**
43. Pick "Poor quality" + comment → submit
44. Toast: "Thanks for the feedback."
45. Verify in admin_review_queue: new row with reason='user_flag' **[K16: user-flag-row.sql.txt]**
46. /dashboard/render/[id] also has flag button (per-design view)

### User flag rate limit
47. Submit 6 flags in rapid succession → 6th returns 429
48. Verify Sentry log shows rate limit hit

### Profanity in user flag comment
49. Submit flag with profanity in comment → modal error "Try a different phrasing"

### Weekly digest email
50. Trigger weekly digest manually (script run)
51. Verify email arrives with 50 random renders from past week + summary stats **[K17: weekly-digest-email.png]**

### Adversarial: bake-off rerun consistency
52. Re-run M5 bake-off on same input → composite scores within ±5% (deterministic seeds)

### Mobile dashboard flag button
53. iPhone Safari: render thumbnail flag button accessible (44×44 tap target) **[K18: mobile-flag.png]**

---

## 16. Manual evidence bundle

- 18+ screenshots from §15
- 4 bake-off result tables + galleries
- 50-render quality re-run report
- 240-render regression first run report
- Sample admin review queue SQL dump
- Sample weekly digest email screenshot
- INDEX.md linking artifacts to spec criteria

---

## 17. Remediation budget

- Round 1: Verifier session 1 self-heals
- Round 2: Verifier session 2 finds new issues → remediation
- Round 3 (escalation): write `cova-plan/escalations/P11.md`

If 50-render quality re-run fails: halt Phase 11, escalate to Phase 5 remediation. Cannot proceed to Phase 12 deployment without quality gate passing.

If a bake-off winner is unclear (composite scores within 3%): default to current implementation (avoid migration risk); document tie in OPEN_DECISIONS.md.

---

## 18. Closing checklist

- [ ] All 18+ screenshots in `cova-plan/manual-evidence/P11/`
- [ ] 4 bake-off result reports archived
- [ ] 50-render quality re-run report archived
- [ ] First 240-render regression report archived
- [ ] INDEX.md written
- [ ] `PHASE_STATUS.md` Phase 11 → CLOSED
- [ ] `OPEN_DECISIONS.md` updated with bake-off winners locked: M5 routing, M6 refine model per type, M7 product matching combo, M-templates winners
- [ ] `EMPIRICAL_FINDINGS.md` updated: bake-off composite scores, 50-render re-run %, baseline SSIM thresholds, daily review acceptance rate, user flag rate at scale (initial)
- [ ] Phase 12 prereq section reviewed (final phase, special attention)
- [ ] Verifier reports archived
- [ ] Session handoffs written

---

## 19. Rollback plan

- Bake-off winners can be reverted by editing OPEN_DECISIONS.md and reverting integration code
- 240-render regression suite can be paused via Vercel cron toggle without redeploy
- Daily sample cron can be paused similarly
- User flag button: feature flag `user_flag_button_enabled=false` hides button without redeploy
- /admin/review: feature flag `admin_review_ui_enabled=false` returns 404
- admin_review_queue table: down migration drops table

---

## 20. Feature flags introduced

| Flag key | Description | Default |
|---|---|---|
| `bakeoff_m5_route` | Locked routing winner (route_a or route_b) | route_a |
| `bakeoff_m6_refine_model` | Locked refine model | flux2-pro |
| `bakeoff_m7_product_combo` | Locked product matching combo | sam3-lens |
| `regression_suite_enabled` | 240-render weekly cron | true |
| `daily_sample_enabled` | Daily 10-render cron | true |
| `user_flag_button_enabled` | Flag button on dashboard + per-design | true |
| `admin_review_ui_enabled` | /admin/review accessible | true |

---

## End of Phase 11 doc.

Next: Phase 12 (Deployment) — final phase, ~5 pages.
