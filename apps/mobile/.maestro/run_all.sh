#!/bin/bash
# Run all Maestro test flows for the Cova app
# Usage: bash .maestro/run_all.sh

set -e

DEVICE_UDID="00008120-000C44D91AE3601E"
APPLE_TEAM_ID="C9VU4B58CG"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FLOWS_DIR="$SCRIPT_DIR/flows"
PASS=0
FAIL=0
FAILED_FLOWS=""

echo "=== Cova Maestro Test Suite ==="
echo "Bundle ID: ai.cova.app"
echo "Running all flows from: $FLOWS_DIR"
echo ""

for flow in "$FLOWS_DIR"/*.yaml; do
  flow_name=$(basename "$flow")
  echo "--- Running: $flow_name ---"
  if "$HOME/.maestro/bin/maestro" --udid "$DEVICE_UDID" --apple-team-id "$APPLE_TEAM_ID" test "$flow"; then
    echo "PASS: $flow_name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $flow_name"
    FAIL=$((FAIL + 1))
    FAILED_FLOWS="$FAILED_FLOWS  - $flow_name\n"
  fi
  echo ""
done

echo "=== Results ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo "Total:  $((PASS + FAIL))"

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "Failed flows:"
  echo -e "$FAILED_FLOWS"
  exit 1
fi

echo ""
echo "All flows passed!"
exit 0
