#!/bin/bash
# Usage: ./scripts/dump-errors.sh
# Extracts ERROR and FATAL entries from the latest session log.
# Output is self-contained — paste directly into Claude Code for instant diagnosis.
# Run from apps/web/ directory: npm run logs:errors

LOG_DIR="$(cd "$(dirname "$0")/.." && pwd)/.dev-logs"
LATEST=$(ls -t "$LOG_DIR"/cova-*.ndjson 2>/dev/null | head -1)

if [ -z "$LATEST" ]; then
  echo "No log files found in $LOG_DIR"
  exit 1
fi

echo "=== COVA ERROR DUMP ==="
echo "Session log: $LATEST"
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""
echo "=== ERRORS (paste this block into Claude Code) ==="
echo ""
echo "COVA DEBUG SESSION — paste this into Claude Code:"
echo "Log file path: $LATEST (read the full file for surrounding context)"
echo ""

jq -rs '
  [ .[] | select(.level == "ERROR" or .level == "FATAL") ] |
  if length == 0 then
    "No errors found in this session. 🎉"
  else
    .[] | "[\(.sequence)] \(.timestamp) \(.level) \(.category) \(.event)\n  Message : \(.message)\n  Step    : \(.stepId // "-")  Room: \(.roomId // "-")  User: \(.userId // "-")\n  Duration: \(.durationMs // "-")ms\n  HTTP    : \(.httpMethod // "-") \(.httpRoute // "-") → \(.httpStatus // "-")\n  Error   : \(.error.message // "-")\n  Code    : \(.error.code // "-")  HTTP status: \(.error.httpStatus // "-")\n  Retries : \(.error.retryCount // "-")\n  Stack   :\n\(.error.stack // "(none)" | split("\n") | map("    " + .) | join("\n"))\n  Data    : \(.data // {} | tostring)\n"
  end
' "$LATEST"

echo ""
echo "=== END ERROR DUMP ==="
echo ""
echo "Context entries (5 before each error):"
echo ""

jq -rs '
  . as $all |
  [ range(length) | . as $i | select($all[$i].level == "ERROR" or $all[$i].level == "FATAL") |
    { errorIdx: $i, contextStart: ([$i - 5, 0] | max) } ] |
  .[] |
  . as $window |
  "=== Error at sequence \($all[$window.errorIdx].sequence) — context ===",
  ($all[$window.contextStart:$window.errorIdx + 1][] |
    "[\(.sequence)] \(.timestamp | split("T")[1] | split("Z")[0]) \(.level) \(.category) \(.event) — \(.message)"
  ),
  ""
' "$LATEST"
