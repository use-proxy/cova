#!/bin/bash
LOG_DIR="$(cd "$(dirname "$0")/.." && pwd)/.dev-logs"
LATEST=$(ls -t "$LOG_DIR"/cova-*.ndjson 2>/dev/null | head -1)

if [ -z "$LATEST" ]; then
  echo "No log files found in $LOG_DIR"
  echo "Start the dev server and load the app in your browser first."
  exit 1
fi

echo "Tailing: $LATEST"
echo "---"

tail -f "$LATEST" | jq -r '"[\(.timestamp | split("T")[1] | split("Z")[0])] \(.level) \(.category) #\(.sequence) \(.event) — \(.message)"'
