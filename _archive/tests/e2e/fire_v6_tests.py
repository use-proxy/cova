"""
Fire 3 v6 test renders on Room A in parallel.
Downloads results to tests/e2e/renders/v6_test_*.jpg
"""
import json
import os
import sys
import time
import concurrent.futures

import modal
import requests

# Room A data
ROOM_ID = "cb2e7047-c7ae-4253-bf2b-cc42a6f3a727"

# Load room data
with open("/tmp/room_a_data.json") as f:
    room = json.load(f)

USER_ID = room["user_id"]
ORIGINAL_PHOTO_URL = room["original_photo_url"]
PROFESSIONALIZED_URL = room.get("professionalized_image_url") or ORIGINAL_PHOTO_URL
RENDER_CONTEXT = room.get("render_context") or {}

# 3 test configurations
TESTS = [
    {
        "name": "japandi",
        "style_prompt": "COVAJAPANDI serene Japanese-Scandinavian bedroom sanctuary",
        "loras_json": json.dumps([
            {"name": "japandi", "trigger": "COVAJAPANDI", "url": "", "scale": 0.8},
            {"name": "minimal", "trigger": "COVAMINIMALIST", "url": "", "scale": 0.3},
        ]),
        "seed": 10001,
    },
    {
        "name": "biophilic",
        "style_prompt": "COVABIOPHILIC lush nature-inspired bedroom with organic materials and living greenery",
        "loras_json": json.dumps([
            {"name": "biophilic", "trigger": "COVABIOPHILIC", "url": "", "scale": 0.8},
            {"name": "japandi", "trigger": "COVAJAPANDI", "url": "", "scale": 0.35},
        ]),
        "seed": 10002,
    },
    {
        "name": "scandi_coastal",
        "style_prompt": "COVASCANDINAV bright airy Scandinavian coastal bedroom with natural textures",
        "loras_json": json.dumps([
            {"name": "scandinavian", "trigger": "COVASCANDINAV", "url": "", "scale": 0.7},
            {"name": "coastal", "trigger": "COVACOASTAL", "url": "", "scale": 0.5},
        ]),
        "seed": 10003,
    },
]


def fire_render(test_config: dict) -> dict:
    """Fire a single render via Modal and return result."""
    name = test_config["name"]
    print(f"[{name}] Firing render...")
    start = time.time()

    fn = modal.Function.from_name("cova-generation", "generate_redesign_phase4b")

    result = fn.remote(
        room_id=ROOM_ID,
        user_id=USER_ID,
        original_photo_url=ORIGINAL_PHOTO_URL,
        professionalized_photo_url=PROFESSIONALIZED_URL,
        style_prompt=test_config["style_prompt"],
        render_context=RENDER_CONTEXT,
        wall_change_requested=False,
        floor_change_requested=False,
        seed=test_config["seed"],
        remove_count=10,
        loras_json=test_config["loras_json"],
        room_type="bedroom",
    )

    elapsed = time.time() - start
    final_url = result.get("final_url", "")
    ensemble = result.get("ensemble_score", 0)
    stage1_url = result.get("stage1_url", "")
    brief = result.get("styled_fill_prompt", "")[:200]

    print(f"[{name}] DONE in {elapsed:.0f}s — ensemble={ensemble:.2f}")
    print(f"[{name}] Final: {final_url[:100]}")
    print(f"[{name}] Stage1: {stage1_url[:100]}")
    print(f"[{name}] Brief: {brief}")

    return {
        "name": name,
        "final_url": final_url,
        "stage1_url": stage1_url,
        "ensemble_score": ensemble,
        "elapsed": elapsed,
        "seed": test_config["seed"],
        "brief": brief,
        "all_scores": result.get("all_scores", []),
    }


def download_render(url: str, path: str):
    """Download image from URL to local path."""
    if not url:
        print(f"  Skipping download — no URL for {path}")
        return
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(resp.content)
    size_kb = len(resp.content) / 1024
    print(f"  Downloaded {path} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    print("=" * 60)
    print("v6 Pipeline Test — 3 Renders on Room A")
    print("=" * 60)
    print(f"Room: {ROOM_ID}")
    print(f"Original: {ORIGINAL_PHOTO_URL[:80]}")
    print()

    # Fire all 3 in parallel
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(fire_render, t): t["name"] for t in TESTS}
        for future in concurrent.futures.as_completed(futures):
            name = futures[future]
            try:
                result = future.result()
                results.append(result)
            except Exception as e:
                print(f"[{name}] FAILED: {e}")
                import traceback
                traceback.print_exc()
                results.append({"name": name, "error": str(e)})

    print()
    print("=" * 60)
    print("RESULTS")
    print("=" * 60)

    # Download renders
    renders_dir = os.path.join(os.path.dirname(__file__), "renders")
    urls_file = os.path.join(os.path.dirname(__file__), "v6_test_urls.txt")

    with open(urls_file, "w") as uf:
        for r in sorted(results, key=lambda x: x.get("name", "")):
            name = r.get("name", "unknown")
            if "error" in r:
                print(f"  {name}: FAILED — {r['error']}")
                uf.write(f"{name}: FAILED — {r['error']}\n")
                continue

            final_url = r["final_url"]
            ensemble = r.get("ensemble_score", 0)
            elapsed = r.get("elapsed", 0)
            print(f"  {name}: ensemble={ensemble:.2f}, {elapsed:.0f}s")
            print(f"    URL: {final_url[:100]}")
            uf.write(f"{name}: {final_url}\n")
            uf.write(f"{name}_stage1: {r.get('stage1_url', '')}\n")

            # Download
            local_path = os.path.join(renders_dir, f"v6_test_{name}.jpg")
            try:
                download_render(final_url, local_path)
            except Exception as e:
                print(f"    Download failed: {e}")

    print()
    print(f"URLs saved to: {urls_file}")
    print("Done.")
