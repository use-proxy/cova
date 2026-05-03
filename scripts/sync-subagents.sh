#!/usr/bin/env bash
# scripts/sync-subagents.sh
# Syncs cova-plan/subagents/*.md → .claude/agents/*.md.
# Usage:
#   ./scripts/sync-subagents.sh         # apply
#   ./scripts/sync-subagents.sh --check # verify in sync; exit 1 if drift (CI)
set -euo pipefail

SRC_DIR="cova-plan/subagents"
DEST_DIR=".claude/agents"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "ERROR: $SRC_DIR does not exist" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"

MODE="apply"
if [[ "${1:-}" == "--check" ]]; then
  MODE="check"
fi

DRIFT=0
for src in "$SRC_DIR"/*.md; do
  name="$(basename "$src")"
  dest="$DEST_DIR/$name"
  if [[ ! -f "$dest" ]]; then
    if [[ "$MODE" == "check" ]]; then
      echo "DRIFT: $dest missing"
      DRIFT=1
    else
      cp "$src" "$dest"
      echo "synced: $name (created)"
    fi
    continue
  fi
  if ! diff -q "$src" "$dest" > /dev/null; then
    if [[ "$MODE" == "check" ]]; then
      echo "DRIFT: $dest differs from $src"
      DRIFT=1
    else
      cp "$src" "$dest"
      echo "synced: $name (updated)"
    fi
  fi
done

if [[ "$MODE" == "check" && "$DRIFT" -eq 1 ]]; then
  echo "Run ./scripts/sync-subagents.sh to fix." >&2
  exit 1
fi

echo "OK"
