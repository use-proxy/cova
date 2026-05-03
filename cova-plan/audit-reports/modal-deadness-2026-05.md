# Modal app deadness audit — 2026-05

Generated: 2026-05-03 02:49 UTC
Method: code grep (`Grep`/`rg`) + Modal CLI (`modal app history`, `modal app list`, `modal container list`) + Supabase MCP
Auditor: read-only; no apps stopped, no files modified, no phase docs touched
Candidates: cova-preprocessing-pipeline, cova-structural-extraction, cova-professionalization, cova-generation
Live (excluded from audit): cova-perception, cova-empty-room, cova-redesign, cova-composite-art

---

## Summary table

| App | Code refs (active) | Last invocation | Writes to | Recommendation |
|---|---|---|---|---|
| cova-preprocessing-pipeline | 0 (orphan orchestrator + `.env.example` only) | unknown — Modal CLI offers no invocation history; `Tasks=0`, no active containers, last deploy 2026-04-13 | Supabase Storage `room-photos/preprocessed/{room_id}_opencv.jpg`. No DB columns directly. | **CONFIDENT-ARCHIVE** |
| cova-structural-extraction | 0 (orphan orchestrator only) | unknown — same; `Tasks=0`, no containers, last deploy 2026-04-14 | Supabase Storage `room-photos/depth/...` and `room-photos/canny/...`; **no DB write** in source. | **CONFIDENT-ARCHIVE** |
| cova-professionalization | 0 (orphan orchestrator + investigation doc) | unknown — same; `Tasks=0`, no containers, last deploy 2026-04-14; file header marks DORMANT/DISABLED 2026-04-13 | Supabase Storage `room-photos/professionalized/...` + `rooms.professionalized_image_url` | **CONFIDENT-ARCHIVE** |
| cova-generation | 0 active web; only orphan orchestrator + 4 V6/V7/V8 e2e test scripts | unknown — same; `Tasks=0`, no containers, last deploy 2026-04-17 | Supabase Storage `room-photos/...` + `rooms.redesign_pano_url`/`redesign_status`/`redesign_error`/`generation_seed` + `renders` insert | **CONFIDENT-ARCHIVE** |

> **Common cause:** all 4 candidates are stages of the V8 orchestrator
> `cova-redesign-pipeline`, which is **not deployed** today (`modal app history
> cova-redesign-pipeline` returns "Could not find a deployed app"). The
> orchestrator was the only runtime caller; with it gone, the 4 stages cannot
> be reached from the web app's normal pipeline. The web app's V9 path
> (`COVA_REDESIGN_URL` → `cova-redesign-v3`) bypasses these entirely.

---

## Per-app detail

### cova-preprocessing-pipeline

- **Local .py file:** `modal_pipeline/preprocessing.py` (declares `app = modal.App("cova-preprocessing-pipeline")` at line 33).
- **Code references in active surfaces:** **0 production-code callers**.
  - `apps/web/.env.example:25` — documents `PREPROCESS_PIPELINE_WEBHOOK_URL` env var, but **no `apps/web/` code reads this var** (grep returned only the example file). Phantom env entry.
  - `modal_pipeline/redesign_pipeline.py:186` — `modal.Function.lookup("cova-preprocessing-pipeline", "preprocess_room_photo")`. This file deploys to `cova-redesign-pipeline`, which is **NOT deployed**. So the call exists in source but never fires at runtime.
- **Code references in archived/test/doc surfaces:**
  - `tests/quality/test_professionalization.py:102` — manual test scaffold.
  - `docs/audit/modal.md`, `docs/audit/CODEBASE_AUDIT.md`, `docs/audit/IMAGEGEN_AUDIT.md`, `docs/debug/cova_full_audit.md` — audit/historical documentation.
  - `cova-plan/planner-output/P01a-executor-prompt.md`, `cova-plan/SESSION_HANDOFFS/03-P01a-planner-complete.md` — planner artifacts (this audit's predecessor).
- **Modal CLI signal:**
  - `modal app history cova-preprocessing-pipeline` → 3 deployments (v1–v3) on 2026-04-13. Latest version was deployed 2026-04-13 15:33 PDT. **No deployments since.**
  - `modal app list`: status `deployed`, **Tasks=0**.
  - `modal container list`: zero active containers in environment.
  - Modal CLI lacks a built-in invocation-counter command; `modal app stats` does not exist (`Error: No such command 'stats'`). Available commands: `list`, `logs`, `rollback`, `stop`, `history`, `dashboard`. `modal app logs` is a streaming command (no `--since` flag); piping a tail produced no output within an 8-second sample window — consistent with no recent activity.
- **Writes to (per `preprocessing.py` analysis):**
  - **Supabase Storage:** bucket `room-photos`, paths `preprocessed/{room_id}_opencv.jpg` (line 152). Uses service-role key.
  - **Supabase tables:** none directly (orchestrator caller writes URL to `rooms.preprocessed_image_url`, not the app itself).
  - **External APIs:** none beyond input image download from a URL.
- **Table write activity related to outputs (last 30 days):**
  - `rooms.preprocessed_image_url`: 9 rows non-null, max `updated_at = 2026-04-17 21:09 UTC` (16 days ago). No activity in the last 14 days.
- **Recommendation:** **CONFIDENT-ARCHIVE**.
- **Rationale:** Zero active production callers (the only runtime caller, `cova-redesign-pipeline`, is not deployed). Zero active containers, zero in-flight tasks. Last code deploy was Apr 13. Output column `preprocessed_image_url` last touched 2026-04-17 with 9 historical rows — consistent with the V8 era, not recent traffic. The web app's V9 path (`COVA_REDESIGN_URL` → cova-redesign-v3) bypasses preprocessing entirely; preprocessing was a V8 stage.

---

### cova-structural-extraction

- **Local .py file:** `modal_pipeline/structural_extraction.py` (declares app at line 31).
- **Code references in active surfaces:** **0 production-code callers**.
  - `modal_pipeline/redesign_pipeline.py:232,235` — invokes `extract_depth_map` and `extract_canny_edges`. Same orphan-orchestrator situation.
- **Code references in archived/test/doc surfaces:**
  - `docs/phase-1/modal-audit.md:54,168` — Phase 1 audit explicitly recommended **KEEP ACTIVE** at the time, citing "Production consumer via orchestrator". That recommendation is now stale: the orchestrator (`cova-redesign-pipeline`) was decommissioned later.
  - `docs/phase-1/follow-ups-deferred.md:20`, `docs/phase-1/sam3-decision.md:94`, `docs/audit/CODEBASE_AUDIT.md:651`, `docs/audit/IMAGEGEN_AUDIT.md:246`, `docs/audit/modal.md:14` — historical documentation.
- **Modal CLI signal:**
  - `modal app history cova-structural-extraction` → 3 deployments. Latest 2026-04-14 14:06 PDT.
  - `Tasks=0`, no active containers.
- **Writes to (per `structural_extraction.py` analysis):**
  - **Supabase Storage:** bucket `room-photos`, paths under `depth/...` and `canny/...` (helper at line 47–60).
  - **Supabase tables:** **none directly** (no `client.table(...)` calls in file).
  - **External APIs:** fal.ai `imageutils/depth` (Depth-Anything-V2). The orchestrator stores returned URLs to `rooms.depth_map_url` / `rooms.canny_map_url`.
- **Table write activity related to outputs (last 30 days):**
  - `rooms.depth_map_url`: 31 rows non-null, max `updated_at = 2026-04-28 01:11 UTC` — initially looked recent, but **investigation showed all 10 sampled recent rows have identical `updated_at` of 2026-04-28 01:11:13.349291** and the URL values are `https://replicate.delivery/yhqm/.../grey.png` (placeholder grey-depth fallbacks emitted by `grey_depth.toString()` per `apps/web/docs/sessions/foundation-repair-progress.md:17`). The rows themselves were created 2026-04-08 with `redesign_status='failed'` and `pipeline_version='v3'` (a pre-V8 era).
  - **Conclusion:** the 2026-04-28 update was a **bulk DB tweak** (a script wrote placeholder grey URLs across pre-existing failed rows), NOT a real invocation of `cova-structural-extraction`. The app's actual outputs would land at `https://...supabase.co/storage/v1/object/public/room-photos/depth/...` (NOT `replicate.delivery`).
  - `rooms.canny_map_url`: **0 rows non-null.** The app has never produced canny output that landed in the table.
  - `rooms.depth_map_url_v2`: 3 rows, max `updated_at = 2026-04-14`.
- **Recommendation:** **CONFIDENT-ARCHIVE**.
- **Rationale:** Zero active production callers. The "recent" depth_map_url activity is a bulk script, not a Modal invocation (URL host pattern doesn't match the app's storage-upload path). Canny output column has zero rows ever. Last deploy was Apr 14. Phase-1 modal-audit's KEEP-ACTIVE call has aged out — the orchestrator is gone.

---

### cova-professionalization

- **Local .py file:** `modal_pipeline/professionalization.py` (declares app at line 42). **File header explicitly states:**
  - Line 1: `# DORMANT — FLUX img2img cleanup pass`
  - Line 2–4: `# Removed from active orchestrator on 2026-04-19 after Modal dashboard confirmed the app was Inactive (State 2: deployed but not running, errors silently swallowed by orchestrator try/except).`
  - Line 9: `# DISABLED 2026-04-13: FLUX img2img cannot do targeted cleanup.`
- **Code references in active surfaces:** **0 production-code callers**.
  - `modal_pipeline/redesign_pipeline.py:205` — invocation site, with comment `# Modal app cova-professionalization was Inactive (State 2) per investigation.`
- **Code references in archived/test/doc surfaces:**
  - `docs/phase-0/professionalization-investigation.md` (entire document; lines 68, 79, 130, 135, 165, 170, 210–211, 236) — investigation thread. Conclusion in that doc: deployed but never invoked / inactive.
  - `docs/audit/modal.md:24` — marked **DORMANT**.
  - `docs/audit/CODEBASE_AUDIT.md:212` — "Removed from active orchestrator 2026-04-19".
  - `docs/audit/IMAGEGEN_AUDIT.md:247` — "explicitly disabled in code header".
- **Modal CLI signal:**
  - `modal app history cova-professionalization` → 15 deployments. Latest 2026-04-14 14:07 PDT.
  - `Tasks=0`, no active containers.
- **Writes to (per `professionalization.py` analysis):**
  - **Supabase Storage:** bucket `room-photos`, path `professionalized/...` (line 81–86).
  - **Supabase tables:** `rooms` UPDATE setting `professionalized_image_url` (line 288).
  - **External APIs:** fal.ai FLUX Kontext at strength 0.55 with ControlNet depth conditioning.
- **Table write activity related to outputs (last 30 days):**
  - `rooms.professionalized_image_url`: 9 rows non-null, max `updated_at = 2026-04-17 21:09 UTC`. Same 9 rows as `preprocessed_image_url` (V8-era cohort). No activity in the last 14 days.
- **Recommendation:** **CONFIDENT-ARCHIVE**.
- **Rationale:** Code header explicitly documents DORMANT + DISABLED 2026-04-13. Phase 0 investigation already concluded the app was Inactive (State 2). Removed from orchestrator 2026-04-19. Zero active production callers, zero invocations, last DB write 2026-04-17. This is the safest archive of the four — the file itself says don't use it.

---

### cova-generation

- **Local .py file:** `modal_pipeline/generation.py` (declares app at line 88; ~1,826 LOC).
- **Code references in active surfaces:** **0 active web/scripts callers**.
  - `modal_pipeline/redesign_pipeline.py:327` — `modal.Function.from_name("cova-generation", "generate_redesign_phase4b")`. Orphan orchestrator.
- **Code references in archived/test/doc surfaces:**
  - `tests/e2e/fire_v6_diagnostic.py:27`, `tests/e2e/fire_v6_tests.py:64`, `tests/e2e/fire_v7_tests.py:85`, `tests/e2e/fire_v8_tests.py:35` — V6/V7/V8 e2e diagnostic scripts that called the app directly. Test scaffolding from the V6–V8 development era; not part of the production CI suite.
  - `docs/audit/CODEBASE_AUDIT.md:211` — "V8 pre-Phase-5 monolithic orchestrator (~2000 lines). Not deployed. **Strong archive candidate.**" (audit's own recommendation matches mine).
  - `docs/CODEBASE_AUDIT_2026_04_21.md:520` — "Actively wired as the production render pipeline via V8 orchestrator webhook (REDESIGN_PIPELINE_WEBHOOK_URL)" — that wiring is now broken (orchestrator gone).
  - `docs/audit/IMAGEGEN_AUDIT.md:244,343,509` — historical.
- **Modal CLI signal:**
  - `modal app history cova-generation` → **79 deployments** (most-iterated of the four). Latest 2026-04-17 13:58 PDT — the candidate with the most-recent deploy. No deploys since 2026-04-17.
  - `Tasks=0`, no active containers.
- **Writes to (per `generation.py` analysis):**
  - **Supabase Storage:** bucket `room-photos`, multiple paths (lines 182, 188).
  - **Supabase tables:**
    - `rooms` UPDATE on failure: `redesign_status='failed'` + `redesign_error` (line 1377, 1630).
    - `renders` INSERT per scored candidate (line 1731) — writes `pipeline_version='v8-vision-director'`, `composite_score`, `was_selected`, `render_type='candidate'`.
    - `rooms` UPDATE on success: `redesign_pano_url`, `redesign_status='complete'`, `generation_seed` (line 1799).
  - **External APIs:** fal.ai `flux-pro/v1/fill` (Stage 1 + Stage 2, x4 candidates), Anthropic Claude Sonnet (Stage 1.5 vision-aware design director).
- **Table write activity related to outputs (last 30 days):**
  - `rooms.redesign_pano_url`: 21 rows non-null, max `updated_at = 2026-04-17 21:09 UTC`. No activity in the last 14 days.
  - `rooms.redesign_status='complete'`: 15 rows, max 2026-04-17.
  - **`renders` table where `pipeline_version='v8-vision-director'`: 0 rows.** The V8 generator's `renders.insert` call (line 1731) has produced **zero** persisted rows, ever — either every V8 run failed before that point, or the column was never populated as expected.
- **Recommendation:** **CONFIDENT-ARCHIVE**.
- **Rationale:** Zero active production callers (orphan orchestrator gone; e2e scripts are old test scaffolding). Zero in-flight tasks, zero containers. Last deploy Apr 17. Output evidence: `redesign_pano_url` last touched 2026-04-17 (cohort of 21 V8-era rows); `renders` where `pipeline_version='v8-vision-director'` has zero rows. The V9 stack (`cova-redesign-v3`) supersedes this entirely. CODEBASE_AUDIT.md already calls this out as a "Strong archive candidate."

---

## Recommendations summary

**CONFIDENT-ARCHIVE (all 4):**
- `cova-preprocessing-pipeline`
- `cova-structural-extraction`
- `cova-professionalization`
- `cova-generation`

**KEEP:** none.

**INVESTIGATE FURTHER:** none. Initial concern about `rooms.depth_map_url` having a 2026-04-28 `updated_at` was resolved during the audit — the touched rows hold `replicate.delivery/.../grey.png` placeholder URLs from a foundation-repair script, not real `cova-structural-extraction` outputs. The Modal app's actual outputs would have Supabase-Storage URLs.

### Common evidence pattern across all four

1. The single runtime caller of all four was the orchestrator `cova-redesign-pipeline`. That orchestrator is **NOT deployed** (`modal app history cova-redesign-pipeline` returns "Could not find a deployed app named 'cova-redesign-pipeline'"). With the orchestrator gone, no production path reaches any of these stages.
2. Every candidate shows `Tasks=0` in `modal app list`, and `modal container list` returns no active containers in the environment.
3. The web app's active render path is `apps/web/app/api/pipeline/redesign/route.ts` — it prefers `COVA_REDESIGN_URL` (V9 `cova-redesign-v3`); the legacy `REDESIGN_PIPELINE_WEBHOOK_URL` fallback would dead-end at the missing orchestrator if hit.
4. The `REDESIGN_PIPELINE_WEBHOOK_URL` env var IS still listed `required: true` in `apps/web/lib/env.ts:24` — boot would fail if it's unset, but as long as the value is *any* string it satisfies the check. **This is technical debt the executor should remove when archiving the orchestrator** (out of scope for this audit; flag for P3 cleanup or P01a M3).
5. Last write activity for each app's primary output column ranges from 2026-04-17 (preprocessed/professionalized/redesign_pano) to 2026-04-28 (depth_map, but proven to be a bulk-script artifact, not real). For comparison, the V9 cohort writes are happening through different columns / different code paths.

---

## What I couldn't determine

- **Exact 30-day and 90-day invocation counts.** Modal CLI provides:
  - `modal app history <name>` — deployment history (commit hashes + timestamps), not invocation counts.
  - `modal app logs <name>` — streaming logs only, no `--since` flag, no count aggregation. Streaming for ~6–8 s produced zero output for these apps.
  - `modal app list` — shows current `Tasks` count (in-flight executions only), not historical.
  - `modal container list` — shows currently-running containers only.
  - `modal app stats` — **does not exist** in the installed Modal CLI version.
  Modal's web dashboard (modal.com/apps/.../...) exposes invocation graphs but is not scriptable from this audit. Recommendation: Daksh manually opens the dashboard for each app and confirms zero invocations in the 30-day chart before any `modal app stop`. Dashboard URL pattern: `https://modal.com/apps/cova-interior/main/<app-id>` — app IDs from the planner's earlier inventory (e.g. `ap-FElGd2FhTf5QKGfuE4b9vF` for `cova-preprocessing-pipeline`).
- **Whether any iOS app code references these apps.** No `apps/mobile/` directory exists in this repo (per CLAUDE.md it's frozen and the source presumably lives in a separate workspace). All grep coverage was the V1 web monorepo. If the iOS-V0 codebase elsewhere directly POSTs to `*.modal.run` URLs for any of the four, this audit cannot see it. Per CLAUDE.md, **"iOS runtime is not protected"** — the answer to "would archiving these break iOS?" is "we accept that risk by policy."
- **Whether the bulk update on 2026-04-28 to `rooms.depth_map_url` came from a checked-in script.** Grep for `replicate.delivery.*grey.png` in `apps/web/` and `scripts/` returned only one hit (`apps/web/docs/sessions/foundation-repair-progress.md:17` documenting the pattern). The actual update script may live outside the repo or have been an ad-hoc psql session — the source is unrecoverable from the current tree, but the artifact pattern (`grey.png` fallback URL across rows aged from a different era) is unambiguous: it's a placeholder write, not an app invocation.
