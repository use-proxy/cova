#!/bin/bash
# Self-healing CI loop — runs Claude Code to fix failures
# Usage: ./scripts/ci-test-loop.sh
MAX_ATTEMPTS=3
cd apps/web

for ATTEMPT in $(seq 1 $MAX_ATTEMPTS); do
  echo "=== Test attempt $ATTEMPT/$MAX_ATTEMPTS ==="

  if npm test 2>&1; then
    echo "All tests passing on attempt $ATTEMPT"
    exit 0
  fi

  if [ $ATTEMPT -lt $MAX_ATTEMPTS ]; then
    echo "Tests failing — running Claude Code to fix..."
    claude --bare -p \
      "Run 'npm test' from apps/web and fix ALL failing tests.
       Fix root causes in source files, never weaken assertions.
       Re-run until all tests pass." \
      --allowedTools "Bash,Read,Edit,Glob,Grep" \
      --max-turns 20
  fi
done

# Final check
npm test
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  echo "Tests still failing after $MAX_ATTEMPTS attempts"
  exit 1
fi
