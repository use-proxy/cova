#!/bin/bash
# ==============================================================================
# COVA — Complete Verification (zero tolerance)
# ==============================================================================
# Every check must pass. Any failure aborts the run with non-zero exit.
#
# What it runs (in order):
#   1. npm run build         — production bundle compiles
#   2. tsc --noEmit          — strict TypeScript across the app
#   3. Start `next start` on :3001 in the background
#   4. Verifier scripts that hit real APIs:
#        verify-depth.ts                  (Replicate Depth Anything V2)
#        verify-matching.ts               (Serper + Google Lens)
#        verify-quiz-personalization.ts   (Supabase + fingerprint route)
#        verify-swap.ts                   (FLUX Fill Pro creation)
#   5. Playwright api-contracts project    (real HTTP calls to /api/*)
#   6. Playwright e2e project              (real click-through, real render)
#
# Cost per full run: ~$2-5 (Replicate render, FLUX Fill, Anthropic, Serper).
# Wall time: ~7-12 minutes.
#
# Usage:
#   cd apps/web && bash scripts/verify-all.sh
# ==============================================================================
set -e
set -o pipefail

# Move into apps/web (the script lives in apps/web/scripts/)
cd "$(dirname "$0")/.."

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== COVA COMPLETE VERIFICATION ===${NC}"
echo -e "${YELLOW}Zero tolerance. Every step must pass.${NC}"
echo ""

cleanup() {
  local exit_code=$?
  if [ -n "${SERVER_PID:-}" ]; then
    echo ""
    echo -e "${YELLOW}[cleanup] stopping server pid=$SERVER_PID${NC}"
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  # Best effort: also kill anything else listening on :3001
  lsof -ti :3001 2>/dev/null | xargs kill -9 2>/dev/null || true
  if [ "$exit_code" -ne 0 ]; then
    echo ""
    echo -e "${RED}=== VERIFICATION FAILED (exit $exit_code) ===${NC}"
    if [ -f /tmp/cova-verify-server.log ]; then
      echo -e "${RED}--- last 40 lines of server log ---${NC}"
      tail -40 /tmp/cova-verify-server.log || true
    fi
  fi
  exit "$exit_code"
}
trap cleanup EXIT

# ── 1. Build ─────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[1/6] npm run build${NC}"
npm run build 2>&1 | tail -20
echo -e "${GREEN}✓ build passed${NC}"
echo ""

# ── 2. TypeScript ────────────────────────────────────────────────────────────
echo -e "${YELLOW}[2/6] tsc --noEmit${NC}"
npx tsc --noEmit
echo -e "${GREEN}✓ TypeScript clean${NC}"
echo ""

# ── 3. Start production server ───────────────────────────────────────────────
echo -e "${YELLOW}[3/6] starting production server on :3001${NC}"
# Free the port first
lsof -ti :3001 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

# `npm run start -- -p 3001` starts next start. Send all output to a log.
> /tmp/cova-verify-server.log
npm run start -- -p 3001 > /tmp/cova-verify-server.log 2>&1 &
SERVER_PID=$!
echo "[server] pid=$SERVER_PID"

# Wait for the server to respond (up to 60s)
READY=0
for i in $(seq 1 60); do
  if curl -s -o /dev/null -w '%{http_code}' http://localhost:3001 2>/dev/null | grep -qE '^(200|307|308|3..)$'; then
    READY=1
    break
  fi
  sleep 1
done
if [ "$READY" -ne 1 ]; then
  echo -e "${RED}[server] failed to start within 60s${NC}"
  exit 2
fi
echo -e "${GREEN}✓ server ready${NC}"
echo ""

# ── 4. Verifier scripts ──────────────────────────────────────────────────────
echo -e "${YELLOW}[4/6] verifier scripts (real API calls)${NC}"

echo "  → verify-depth.ts"
npx tsx scripts/verify-depth.ts
echo -e "  ${GREEN}✓ depth${NC}"

echo "  → verify-matching.ts"
npx tsx scripts/verify-matching.ts
echo -e "  ${GREEN}✓ matching (Serper + Lens)${NC}"

echo "  → verify-quiz-personalization.ts"
npx tsx scripts/verify-quiz-personalization.ts
echo -e "  ${GREEN}✓ quiz personalization${NC}"

echo "  → verify-swap.ts"
npx tsx scripts/verify-swap.ts
echo -e "  ${GREEN}✓ swap${NC}"

echo ""

# ── 5. Playwright API contracts ──────────────────────────────────────────────
echo -e "${YELLOW}[5/6] Playwright API contract tests${NC}"
# Reuse the running server (playwright config has reuseExistingServer=true)
npx playwright test --project=api-contracts --reporter=line
echo -e "${GREEN}✓ API contracts passed${NC}"
echo ""

# ── 6. Playwright E2E (full click-through with real render) ──────────────────
echo -e "${YELLOW}[6/6] Playwright E2E (real ~4 min render)${NC}"
npx playwright test --project=e2e --reporter=line
echo -e "${GREEN}✓ E2E passed${NC}"
echo ""

echo -e "${GREEN}=== ALL VERIFICATIONS PASSED ===${NC}"
echo "Product is verified. Ready for investor demo."
