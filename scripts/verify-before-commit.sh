#!/bin/bash
# Phase 0 verification gate. Run before any commit to main during prompts 2-6.
# Compares current state to docs/phase-0/baseline-state.md.
# Exits 0 if no new failures, exits 1 if regression detected.

set -e

echo "=== Verification Gate ==="

# 1. Build
echo "[1/4] Running build..."
pnpm --filter web build > /tmp/current-build.log 2>&1
if [ $? -ne 0 ]; then
  echo "BUILD FAILED. See /tmp/current-build.log"
  exit 1
fi

# 2. Tests
echo "[2/4] Running tests..."
pnpm --filter web test > /tmp/current-tests.log 2>&1 || true

CURRENT_FAILURES=$(grep -E "Tests.*failed" /tmp/current-tests.log | head -1 | grep -oE "[0-9]+ failed" | grep -oE "[0-9]+" || echo "0")
BASELINE_FAILURES=$(grep "Tests:" docs/phase-0/baseline-state.md | head -1 | grep -oE "[0-9]+ failed" | grep -oE "[0-9]+")

echo "  Current failures: $CURRENT_FAILURES"
echo "  Baseline failures: $BASELINE_FAILURES"

if [ "$CURRENT_FAILURES" -gt "$BASELINE_FAILURES" ]; then
  echo "REGRESSION DETECTED. $((CURRENT_FAILURES - BASELINE_FAILURES)) new test failure(s)."
  echo "Diff failing tests:"
  diff <(grep -E "FAIL|✗" docs/phase-0/baseline-tests.log | sort) <(grep -E "FAIL|✗" /tmp/current-tests.log | sort)
  exit 1
fi

# 3. tsc on edited files only
echo "[3/4] Checking edited files for new tsc errors..."
EDITED_TS_FILES=$(git diff --name-only HEAD | grep -E "\.(ts|tsx)$" | grep -v node_modules || true)
if [ -n "$EDITED_TS_FILES" ]; then
  echo "  Edited TS files:"
  echo "$EDITED_TS_FILES"
  cd apps/web
  for f in $EDITED_TS_FILES; do
    RELATIVE_F="${f#apps/web/}"
    if [ -f "$RELATIVE_F" ]; then
      npx tsc --noEmit --skipLibCheck "$RELATIVE_F" 2>&1 | grep -E "error TS" | head -5 || echo "    $RELATIVE_F: clean"
    fi
  done
  cd ../..
else
  echo "  No TS files edited."
fi

# 4. Diff summary
echo "[4/4] Diff summary:"
git diff --stat HEAD

echo ""
echo "=== Verification PASSED ==="
echo "Review the diff above. Then run: git add <files> && git commit -m '<msg>' && git push origin main"
