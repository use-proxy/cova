#!/bin/bash
UDID=$(xcrun simctl list devices | grep Booted | grep -E -o '[0-9A-F-]{36}' | head -1)
if [ -z "$UDID" ]; then
  echo "No booted Simulator found. Run: xcrun simctl boot 'iPhone 16e'"
  exit 1
fi
echo "Running on Simulator: $UDID"
maestro --device "$UDID" test "$@"
