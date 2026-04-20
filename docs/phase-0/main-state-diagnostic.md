# Main Branch State — Phase 0 Baseline Precondition Diagnostic

Captured: 2026-04-19
Branch inspected: `main` at `/Users/daksh/Desktop/cova` (primary worktree)
Local HEAD: `6ffd9ce Merge branch 'main' of https://github.com/pgoel813/cova`
Origin: 21 commits behind local
Working tree: DIRTY (6 modified files, 5 untracked dir categories)

**Bottom line:** Main is not in a shape where a meaningful Phase 0 baseline can be captured. Neither the 21 unpushed commits nor the 6 dirty files look like accidental Phase 0 audit leakage — they look like real in-progress Cova pipeline / LoRA / scoring work that has been landing directly on local `main` for weeks. Before baselining, these need a decision: ship to origin, park on a branch, or revert.

---

## STEP 1 — 21 unpushed commits on local `main`

All 21 commits in order (newest → oldest):

| # | SHA | Subject | Classification |
|---|-----|---------|----------------|
| 1 | `6ffd9ce` | Merge branch 'main' of https://github.com/pgoel813/cova | Merge commit |
| 2 | `c764eb5` | Fix scoring prompt: same-room context, original photo comparison | **Feature work** (render pipeline) |
| 3 | `8b1b5a8` | 6 render quality fixes: spatial templates, exclusion, composition, LoRA position | **Feature work** (render pipeline) |
| 4 | `a4952c2` | Phase 2 plateau at iter 23: room_type fix deployed, pivoting to Phase 3 | **WIP/progress note** (likely contains progress.log commits) |
| 5 | `c49b5e4` | CRITICAL: Pass room_type through entire pipeline to Fill Pro | **Feature work** (pipeline) |
| 6 | `01307d6` | Phase 2 iteration 17: Room B at 81-83, Room A at 40-50 (room-type issue) | **WIP/progress note** |
| 7 | `caa401b` | Phase 2 progress: 11 renders scored, 4 pipeline fixes deployed | **WIP/progress note** |
| 8 | `daab3f9` | Fix room-type drift: Fill Pro now specifies bedroom in inpainting prompt | **Feature work** (pipeline) |
| 9 | `c14fe65` | Fix 3 render pipeline blockers: timeout, scoring cache, SAM masks | **Feature work** (pipeline) |
| 10 | `5e76a4a` | Cova autonomous audit: Phase 1 complete (8 fixes), Phase 2 data (7 renders scored) | **Autonomous-audit work committed to main** (note: distinct from Phase 0 security audit) |
| 11 | `c209911` | Phase 2 update: 6 renders scored (81-83 Room B, 58-68 Room A), blockers documented | **WIP/progress note** |
| 12 | `fbf0a63` | Phase 2 render loop: 6 scored renders, automated pipeline testing infrastructure | **Feature work** (test infra) |
| 13 | `040d17d` | Cova full autonomous audit: Phase 1 complete, 8 issues fixed, tsc+build clean | **Autonomous-audit work committed to main** |
| 14 | `b188ace` | Sessions 7-10: DB schema, Design Director overhaul, scoring ensemble, personalization moments | **Large multi-session feature commit** |
| 15 | `ff8c8e0` | Session B: quiz restructure, LoRA registry, style archetypes V3, all session changes | **Large multi-session feature commit** |
| 16 | `7bf0108` | Session B complete: 10 COVA LoRAs trained, 1100 quiz images generated, 480 DB rows seeded | **Large data/training work** |
| 17 | `c510362` | Phase 4b-7 partial: selective inpainting, Design Director rewrite, Phase 6 scoring, Phase 7 post-processing | **Large multi-phase feature commit** |
| 18 | `1502118` | Phase 4: Design Director Kontext-optimized prompts, floor preservation, removal target structure | **Feature work** |
| 19 | `be9b07a` | Phase 3 complete: Grounded-SAM2 segmentation, pixel-perfect masks, keep/remove UI, documentation | **Feature work** |
| 20 | `749b632` | Phase 3 complete: Grounded-SAM2 pixel-perfect segmentation, all items masked including ceiling fan and window blinds, canvas overlay, loading UX, keep/remove redesign | **Feature work** (likely duplicate/amend of #19) |
| 21 | `401d3fb` | Phase 2 complete: quiz, style preview, comparison pairs all room types | **Feature work** |

### Flags

- **None are obviously security-sensitive** (no credential/RLS/auth commits in this window — those landed on `phase-0/rls-fixes`).
- **None look like accidental Phase 0 audit branch commits.** The "Phase 2/3/4" references are *Cova autonomous-render-audit phases*, a different audit stream from the Phase 0 security/RLS audit.
- **Many WIP/progress-log commits** (#4, #6, #7, #11) that are really just snapshots of the iteration loop — typical of direct-to-main iteration.
- **Two "autonomous audit" commits** (#10, #13) — these merged audit-stream work directly into main.
- **Several large multi-session commits** (#14, #15, #17) that bundle unrelated changes — unusual for clean history but consistent with the recent workflow.

**Interpretation:** These 21 commits are genuine accumulated Cova pipeline work that has been committed locally but never pushed. They are not mis-parked from the Phase 0 branches. They should be pushed (or rebased and pushed) before Phase 0 prompts 2-6 begin, otherwise every baseline and verification comparison will include them.

---

## STEP 2 — Dirty file analysis

| File | Last committed in | Diff size | Character |
|------|-------------------|-----------|-----------|
| `modal_pipeline/generation.py` | `8b1b5a8` (commit #3 above) | **+688 / −470** over 1158 lines changed | Massive rewrite in progress — **active feature work** |
| `modal_pipeline/mask_build.py` | `b188ace` (commit #14) | 442 lines changed | Large refactor in progress — **active feature work** |
| `modal_pipeline/postprocess.py` | `b188ace` (commit #14) | 3 lines added | Tiny guard: skips lighting-harmonize step when `furniture_mask is None` with a `v7 no-composite mode` print. **Intentional small fix**, tied to v8 pipeline direction (per user memory: "v8 Pipeline — no composite"). |
| `pnpm-lock.yaml` | `1fdc6fa` | +67 lines | **Meaningful**: adds `@fal-ai/client@1.9.5` and `@fal-ai/server-proxy@1.2.1` (plus msgpack, eventsource-parser transitives). Not noise — implies a `package.json` change or missing matching edit. Worth checking if `apps/web/package.json` or root has a corresponding change. |
| `tests/e2e/budget.json` | `c764eb5` | 10 lines | Iteration counters/cost accumulators: `fal 0→0.9`, `modal 0→0.15`, `anthropic_calls 0→5`, `renders_completed 0→1`, timestamp bumped. **Runtime state**, not code — this is the iteration harness writing to disk. |
| `tests/e2e/progress.log` | `a4952c2` | +141 lines | Append-only log entries from iteration 25 Room_B runs on 2026-04-17. **Runtime artifact**, not code. |

### Flags

- `generation.py` + `mask_build.py` are real in-progress engineering work — **the v8 pipeline rewrite per memory file `project_v8_pipeline.md`**. Not accidental. Losing them would be bad.
- `postprocess.py` (3 lines) is a coherent small patch — looks commit-ready.
- `pnpm-lock.yaml` is a **red flag for missing paired edit**: a lockfile diff this clean almost always has a matching `package.json` change. Neither `package.json` nor `apps/web/package.json` shows in `git status`, which means either (a) the lockfile was regenerated from an unchanged package.json but with a newly-cached resolution (unlikely for new packages), or (b) the package.json edit was already committed earlier. Worth one grep before any decision.
- `budget.json` and `progress.log` are **runtime mutation artifacts** — they get rewritten every iteration. These two files should probably be in `.gitignore` (see Step 4).

---

## STEP 3 — Untracked file inventory

| Category | Count | Size | Samples | Recommendation |
|----------|-------|------|---------|----------------|
| `docs/audit/*.md` | 10 files | small | `director-quick-check.md`, `lora-quality-eval.md`, `lora-spot-test.md`, `loras.md`, `modal.md`, `pgvector.md`, `supabase.md`, `tests.md`, `lora-backup-report.md`, `lora-registry.backup-urls.patch` | **Phase 0 / Cova-audit audit reports.** These are the deliverables of the recent audit work. Decide: commit to repo under `docs/audit/`, or move to a separate docs branch. Currently they're just sitting untracked. |
| `experiments/*/` | 6 dirs | unmeasured | `fal_endpoint_smoke_test`, `lora_audit`, `lora_quality_eval`, `lora_spot_test`, `v9_validation`, `v9_validation_r2` | **Almost certainly should be gitignored.** Experiment outputs are ephemeral. Add `experiments/` to `.gitignore`. |
| `lora-backups/` | 21 files (10 LoRA + 10 meta + 1) | **867 MB** | `COVAARTDECO_2026-04-17.safetensors`, `COVABIOPHILIC_2026-04-17.safetensors`, ... × 10 styles + `.meta.json` each | **MUST be gitignored immediately.** 867 MB of `.safetensors` binaries have no business in git. If Phase 0 work accidentally `git add .`'s anything in this directory, the repo is permanently bloated. |
| `tests/e2e/renders/` | 33 untracked files | ~medium | `v6_*.jpg`, `v7_A_*.jpg`, `v7_B_*.jpg`, `v7.1_*.jpg`, `v7.2_*.jpg`, `v8_A_*.jpg`, `v8_B_*.jpg`, `Room_A_iter_26.jpg`, `Room_B_iter_25.jpg` | **Gitignore.** Render outputs are reproducible artifacts, not source. Add `tests/e2e/renders/` to `.gitignore` (and optionally keep a placeholder). |
| `tests/e2e/fire_v*_tests.py` | 4 files | small | `fire_v6_diagnostic.py`, `fire_v6_tests.py`, `fire_v7_tests.py`, `fire_v8_tests.py` | **Decide per file.** If these are the active test runners for v6/v7/v8 iterations they should be committed. If they're superseded by a newer runner, delete. User judgment required. |
| `.claude/worktrees/` | (this worktree) | — | — | Already implicitly excluded via `.claude/` patterns but not fully — see Step 4. |
| `tests/e2e/v*_test_urls.txt` | 4 files | tiny | `v6_diagnostic_urls.txt`, `v6_test_urls.txt`, `v7_test_urls.txt`, `v8_test_urls.txt` | Looks like generated URL lists. **Gitignore.** |

---

## STEP 4 — `.gitignore` gap analysis

Current `.gitignore` covers:
- env files, node_modules, .pnpm-store, .next, dist
- Supabase temp/branches
- `apps/mobile/.env*`
- 3D furniture assets (`assets/3d/furniture/*.glb`, `.gltf`, Quaternius/kenney)
- `scripts/raw-data/`, `scripts/backfill-*`
- `.github/workflows/verify.yml`
- macOS `.DS_Store`
- `**/__pycache__/`, `*.pyc`, `*.pyo`
- `modal_pipeline/test_trimmed.mp4`, `modal_pipeline/test1*.mp4`
- Large catalog data (`etsy_products.json`, `overstock_products.json`)
- `diagnostic_report.json`
- `.expo/`, iOS build artifacts
- `data/scraped/`, `data/processed/`, `data/state/`, `data/failed/`, `.agents/`
- `lora-training/*.zip`, `lora-training/results.json`
- `scripts/generation-progress.json`
- `swipe-pairs/manifest.json`, `anchor-images/manifest.json`, `training-data/*/manifest.json`
- `SESSION_NOTES.md`
- `.claude/settings.local.json`, `.claude/settings.json` (but not `.claude/worktrees/`)

### Gaps (directories present in working tree but not ignored)

| Untracked path | In gitignore? | Should be? |
|----------------|---------------|------------|
| `lora-backups/` | ❌ NO | **YES — URGENT** (867 MB of .safetensors) |
| `experiments/` | ❌ NO | **YES** (ephemeral) |
| `tests/e2e/renders/` | ❌ NO | **YES** (reproducible artifacts) |
| `tests/e2e/budget.json` | ❌ NO, but it's a tracked file with runtime mutations — cannot simply gitignore | **Consider** `git rm --cached` then ignore, OR reset state to zeros on every commit |
| `tests/e2e/progress.log` | ❌ NO, same as above — tracked but mutated at runtime | **Consider** `git rm --cached` then ignore |
| `tests/e2e/v*_test_urls.txt` | ❌ NO | **YES** |
| `.claude/worktrees/` | ❌ NO (only `.claude/settings*.json` are ignored) | **YES** — worktrees are per-developer, not repo state |
| `docs/audit/` | — | **NO** — these look like deliverables worth committing |

None of the major offenders (`lora-backups/`, `experiments/`, `tests/e2e/renders/`) are already listed. They are all genuinely untracked-but-unignored.

---

## STEP 5 — Consolidated findings & precondition for Phase 0 baseline

The baseline task (prompts 2-6) assumes `main` ≈ `origin/main` and a clean tree. Neither holds. Before baselining:

### Must resolve first

1. **The 21 unpushed commits must land somewhere.** Options:
   - Push `main` → `origin/main` (straightforward if origin's HEAD is an ancestor of local HEAD — `6ffd9ce` is a merge, so this is likely already reconciled).
   - If origin has diverged beyond the merge, rebase / re-merge before pushing.
   - If any commit is not meant for main long-term (the WIP progress notes), that's a rewrite-history decision the user owns.
2. **The 6 dirty files must be handled.** Three clusters:
   - **Real v8 pipeline work** (`generation.py`, `mask_build.py`, `postprocess.py`): commit to a feature branch — not main — so Phase 0 baseline isn't measuring mid-rewrite code.
   - **Runtime artifacts** (`budget.json`, `progress.log`): gitignore + `git rm --cached`, or reset to zeroes and commit.
   - **`pnpm-lock.yaml`**: investigate the new `@fal-ai/*` entries — look for the paired `package.json` edit (possibly already committed in an earlier commit; if not, one of the 21 unpushed commits may contain it).
3. **`.gitignore` gaps must be closed before any baseline commits.** Priority: `lora-backups/` (867 MB), `experiments/`, `tests/e2e/renders/`, `.claude/worktrees/`. A single `git add .` during prompts 2-6 without these entries would pollute the repo.

### After resolution

Only then will `git status` = clean and `git log origin/main..main` = empty hold, so a Phase 0 baseline against `main` will compare like-for-like against future prompt 2-6 commits.

### What this worktree (phase-0/rls-fixes) can do meanwhile

Nothing blocking. The RLS fixes at `55f3d2c` are already pushed and independent of the dirty primary tree. Phase 0 prompts 2-6 can run in this worktree against `phase-0/rls-fixes` if the baseline methodology is flexible — but the original task specified `main`, so that's a call for the user.

---

*End of diagnostic. No files modified. No git write operations performed.*
