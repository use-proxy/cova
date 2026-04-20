# Phase 0: Main Branch Cleanup Summary

Captured: 2026-04-19
Operator: Claude Code (Opus 4.7)
Target: `main` at `/Users/daksh/Desktop/cova`

## Outcome

**Main is now clean and synced. Ready for baseline establishment.**

- Final local `main` HEAD: `329a3ac`
- `origin/main` HEAD: `329a3ac`
- `git status`: "Your branch is up to date with 'origin/main'."
- Divergence: 0 commits ahead, 0 behind
- Total commits pushed in this cleanup: **26** (21 pre-existing + 5 new)

## New commits (oldest → newest)

| # | SHA | Subject | Purpose |
|---|-----|---------|---------|
| 1 | `bdfe009` | Phase 0: Update .gitignore for experiments, backups, and runtime artifacts | Close .gitignore gaps + untrack runtime artifacts |
| 2 | `4e9e31b` | Phase 0: Audit deliverables | Commit 10 audit reports under `docs/audit/` |
| 3 | `ff59b11` | v8 pipeline: active in-progress work on generation and masking | WIP snapshot of v8 pipeline before v9 rewrite |
| 4 | `82689fe` | tests: commit fire-and-observe scripts as v9 test reference | Preserve `fire_v6/v7/v8_*.py` runners for later test build |
| 5 | `329a3ac` | chore: sync pnpm-lock.yaml with @fal-ai/client dependency | Sync lockfile with already-committed package.json |

## `.gitignore` changes (commit `bdfe009`)

Appended block:

```
# Phase 0 additions

# Large local LoRA backups (867 MB) - safely hosted in Supabase, never commit
lora-backups/

# Phase 0 experiment outputs
experiments/

# Runtime artifacts
tests/e2e/renders/
tests/e2e/v*_test_urls.txt
tests/e2e/budget.json
tests/e2e/progress.log

# Claude Code worktrees
.claude/worktrees/
```

Also untracked (`git rm --cached`):
- `tests/e2e/budget.json` (was tracked + runtime-mutated)
- `tests/e2e/progress.log` (was tracked + runtime-mutated)

## `pnpm-lock.yaml` disposition

**Case A** (from Step 2 investigation).

The lockfile added `@fal-ai/client@1.9.5` and `@fal-ai/server-proxy@1.2.1`.
`git log -S "@fal-ai/client" -- apps/web/package.json` showed the paired `package.json` edit already landed in commit `a9933cc "phase 0-5"` (one of the 21 pre-existing unpushed commits). The lockfile was simply out of sync with that prior commit. Committed as `329a3ac`.

## 21 pre-existing unpushed commits

Pushed as-is, no rebasing, no history rewrite. Range: `d4ba9ce..329a3ac` on the remote push, of which the first 21 were the pre-existing Cova render-pipeline / LoRA / scoring work (see `main-state-diagnostic.md` for full list).

## Untracked files left behind (outside task scope)

These are not part of the four clusters specified in the cleanup prompt, so they were **intentionally not touched**:

- `docs/phase-0/main-state-diagnostic.md` — the diagnostic itself (handle with baseline commit)
- `tests/e2e/iterations/iter_25.json`, `iter_26.json` — iteration state outputs (probably belong gitignored under a pattern like `tests/e2e/iterations/`, user decision)
- `tests/e2e/v6_diagnostic_urls.txt` — filename doesn't match the `v*_test_urls.txt` glob we added (the glob requires the suffix `_test_urls.txt`; this file is `_diagnostic_urls.txt`). Two options: broaden the glob to `tests/e2e/v*_urls.txt`, or add a second pattern. User decision.

These should be resolved before the baseline step but don't block it — none of them are tracked and none affect the build.

## Hook warnings (non-blocking)

Every commit triggered a husky deprecation warning:

```
husky - DEPRECATED
Please remove the following two lines from .husky/pre-commit:
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"
They WILL FAIL in v10.0.0
```

The pre-commit secret scan still ran and passed every time. Worth fixing before husky v10, but not a cleanup-blocker.

## Confirmation

**Main is now clean and synced. Ready for baseline establishment.**
