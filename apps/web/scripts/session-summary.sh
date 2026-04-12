#!/bin/bash
# Usage: ./scripts/session-summary.sh
# Prints a full session summary — timeline of key events, error count, render count, timing.
# Paste the output directly into Claude Code when debugging a full session.
# Run from apps/web/ directory: npm run logs:summary

LOG_DIR="$(cd "$(dirname "$0")/.." && pwd)/.dev-logs"
LATEST=$(ls -t "$LOG_DIR"/cova-*.ndjson 2>/dev/null | head -1)

if [ -z "$LATEST" ]; then
  echo "No log files found in $LOG_DIR"
  exit 1
fi

echo "=== COVA SESSION SUMMARY ==="
echo "File: $LATEST"
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

jq -rs '
  . as $all |
  "Total entries    : \(length)",
  "Errors           : \([.[] | select(.level == "ERROR" or .level == "FATAL")] | length)",
  "Warnings         : \([.[] | select(.level == "WARN")] | length)",
  "Renders fired    : \([.[] | select(.event == "RENDER_TRIGGERED")] | length)",
  "Refinements fired: \([.[] | select(.event == "REFINEMENT_TRIGGERED")] | length)",
  "Supabase writes  : \([.[] | select(.event | startswith("DB_WRITE") or startswith("DB_UPSERT"))] | length)",
  "API calls        : \([.[] | select(.event == "API_REQUEST_START")] | length)",
  "",
  "=== KEY EVENT TIMELINE ===",
  (.[] | select(
    .event | IN(
      "AUTH_SIGN_IN_SUCCESS", "AUTH_SESSION_RESTORED",
      "PAGE_LOAD",
      "QUIZ_FINGERPRINT_POST_SUCCESS",
      "BUDGET_SELECTED",
      "UPLOAD_SUCCESS",
      "DETECTION_PREDETECT_SUCCESS", "DETECTION_POLL_COMPLETE",
      "CHAT_DESIGN_CTA_CLICK", "CHAT_PERSIST_CONTEXT_SUCCESS",
      "RENDER_TRIGGERED", "RENDER_COMPLETE", "RENDER_TIMEOUT",
      "RENDER_FLUX_PROMPT_BUILT",
      "REFINEMENT_TRIGGERED", "REFINEMENT_COMPLETE",
      "SHOP_PRODUCTS_LOADED", "SHOP_HEART_SAVE_SUCCESS",
      "PIPELINE_STATE_TRANSITION", "PIPELINE_CONTEXT_SNAPSHOT"
    )
  ) | "[\(.sequence | tostring | ltrimstr("0"))] \(.timestamp | split("T")[1] | split("Z")[0]) \(.event) — \(.message)"),
  "",
  "=== ALL ERRORS ===",
  (if ([.[] | select(.level == "ERROR" or .level == "FATAL")] | length) == 0 then
    "No errors! 🎉"
  else
    .[] | select(.level == "ERROR" or .level == "FATAL") |
    "[\(.sequence)] \(.event): \(.error.message // .message) | Code: \(.error.code // "-") | Step: \(.stepId // "-") | Room: \(.roomId // "-" | .[0:8])"
  end),
  "",
  "=== STEP COVERAGE ===",
  ([ .[] | .stepId ] | unique | map(select(. != null)) | sort |
    if length == 0 then "No stepId fields populated (add stepId to child logger calls)"
    else "Steps seen: " + join(", ") end
  ),
  "",
  "=== SUPABASE OPERATIONS ===",
  ([ .[] | select(.category == "SUPABASE") | .data.table // .data.operation // .event ] |
    group_by(.) | map("\(.[0]): \(length)") | .[]
  )
' "$LATEST"
