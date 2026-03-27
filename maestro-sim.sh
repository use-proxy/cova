#!/bin/bash
# Run the 5 approved Maestro smoke flows (or a single flow if passed as arg)
# Usage:
#   ./maestro-sim.sh                          # runs all 5 smoke flows
#   ./maestro-sim.sh apps/mobile/.maestro/flows/01_splash_and_auth.yaml  # runs one flow

FLOWS_DIR="apps/mobile/.maestro/flows"
SMOKE_FLOWS=(
  "$FLOWS_DIR/01_splash_and_auth.yaml"
  "$FLOWS_DIR/02_style_quiz_precise.yaml"
  "$FLOWS_DIR/04_render_pipeline_precise.yaml"
  "$FLOWS_DIR/05_panorama_viewer_precise.yaml"
  "$FLOWS_DIR/14_returning_user_precise.yaml"
)

UDID=$(xcrun simctl list devices | grep Booted | grep -E -o '[0-9A-F-]{36}' | head -1)
if [ -z "$UDID" ]; then
  echo "No booted Simulator found. Run: xcrun simctl boot 'iPhone 16e'"
  exit 1
fi
echo "Running on Simulator: $UDID"

if [ $# -gt 0 ]; then
  # Single flow mode
  maestro --device "$UDID" test "$@"
else
  # Run all 5 smoke flows
  PASSED=0
  FAILED=0
  for flow in "${SMOKE_FLOWS[@]}"; do
    echo ""
    echo "━━━ Running: $(basename "$flow") ━━━"
    if maestro --device "$UDID" test "$flow"; then
      PASSED=$((PASSED + 1))
    else
      FAILED=$((FAILED + 1))
    fi
  done
  echo ""
  echo "━━━ Results: $PASSED passed, $FAILED failed out of ${#SMOKE_FLOWS[@]} ━━━"
  [ "$FAILED" -gt 0 ] && exit 1
fi
