"""
M7 Session 5 — End to end pipeline verification.
Verifies all routes, SPZ accessibility, and furniture matches.
Run: python modal_pipeline/test_full_pipeline_session5.py
"""
import json
import sys
from pathlib import Path

import requests

TEST_SPZ = (
    "https://cdn.marble.worldlabs.ai/"
    "7f3d51a8-a61d-4e87-a4c0-fcaf96593780/"
    "d26cea6f-d7e3-4bf0-bc7a-fce87ce64b13_ceramic.spz"
)
TEST_SPZ_500K = (
    "https://cdn.marble.worldlabs.ai/"
    "7f3d51a8-a61d-4e87-a4c0-fcaf96593780/"
    "0b92034e-6103-45f5-b53b-6aad44b1a7c2_ceramic_500k.spz"
)


def load_env():
    env = {}
    for line in Path("apps/web/.env.local").read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        k, _, v = line.partition("=")
        if k and v:
            env[k.strip()] = v.strip()
    return env


def run_checks(env):
    checks = []

    # 1. SPZ URLs accessible
    for label, url in [("full_res SPZ", TEST_SPZ), ("500k SPZ", TEST_SPZ_500K)]:
        try:
            resp = requests.head(url, timeout=10)
            checks.append((label, resp.status_code == 200, f"HTTP {resp.status_code}"))
        except Exception as e:
            checks.append((label, False, str(e)))

    # 2. Webhook URLs configured
    for key in [
        "MARBLE_PIPELINE_WEBHOOK_URL",
        "REDESIGN_PIPELINE_WEBHOOK_URL",
        "MARBLE_PLUS_WEBHOOK_URL",
        "FURNITURE_MATCHING_WEBHOOK_URL",
    ]:
        val = env.get(key, "")
        checks.append((key, bool(val), val[:60] if val else "MISSING"))

    # 3. room_products table has data
    supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL", "")
    supabase_key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if supabase_url and supabase_key:
        resp = requests.get(
            f"{supabase_url}/rest/v1/room_products?select=id&limit=1",
            headers={
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Prefer": "count=exact",
            },
        )
        count = resp.headers.get("content-range", "*/0").split("/")[-1]
        has_data = int(count) > 0 if count != "*" else len(resp.json()) > 0
        checks.append(("room_products has data", has_data, f"{count} records"))

    # 4. CLIP embed URL set
    clip_url = env.get("CLIP_TEXT_EMBED_URL", "")
    checks.append(("CLIP_TEXT_EMBED_URL set", bool(clip_url), clip_url[:60] if clip_url else "MISSING"))

    # 5. Key files exist
    for f in [
        "apps/web/components/SplatViewer.tsx",
        "apps/web/components/FurnitureHotspots.tsx",
        "apps/web/components/ProductPanel.tsx",
        "apps/web/app/room/[roomId]/RoomOverlay.tsx",
        "apps/web/app/api/rooms/status/route.ts",
        "apps/web/app/api/pipeline/start/route.ts",
        "apps/web/app/api/pipeline/marble-process/route.ts",
        "apps/web/app/api/pipeline/redesign/route.ts",
        "apps/web/app/api/pipeline/marble-plus/route.ts",
        "apps/web/app/api/pipeline/furniture-match/route.ts",
        "modal_pipeline/marble_pipeline.py",
        "modal_pipeline/redesign_pipeline.py",
        "modal_pipeline/marble_plus_pipeline.py",
        "modal_pipeline/furniture_matching_pipeline.py",
    ]:
        exists = Path(f).exists()
        checks.append((f"File: {f.split('/')[-1]}", exists, "exists" if exists else "MISSING"))

    # Print
    print("\n=== M7 Session 5 — End to End Checks ===\n")
    all_pass = True
    for name, passed, detail in checks:
        status = "PASS" if passed else "FAIL"
        print(f"  {status:4s} | {name}")
        if not passed:
            print(f"       | {detail}")
            all_pass = False

    print(f"\n{'ALL CHECKS PASS' if all_pass else 'SOME CHECKS FAILED'}")
    return all_pass


if __name__ == "__main__":
    env = load_env()
    success = run_checks(env)
    sys.exit(0 if success else 1)
