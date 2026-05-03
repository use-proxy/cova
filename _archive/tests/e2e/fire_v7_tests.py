"""
Fire 6 v7 test renders: 3 on Room A + 3 on Room B.
v7: No composite, semantic-only mask, Claude design briefs.
"""
import json
import os
import time
import concurrent.futures

import modal
import requests

# Load room data
with open("/tmp/room_a_data.json") as f:
    room_a = json.load(f)
with open("/tmp/room_b_data.json") as f:
    room_b = json.load(f)

TESTS = [
    # Room A — Japandi, Biophilic, Bohemian
    {
        "name": "A_japandi",
        "room": room_a,
        "style_prompt": "COVAJAPANDI serene Japanese-Scandinavian bedroom",
        "loras_json": json.dumps([
            {"name": "japandi", "trigger": "COVAJAPANDI", "url": "", "scale": 0.85},
        ]),
        "seed": 30001,
    },
    {
        "name": "A_biophilic",
        "room": room_a,
        "style_prompt": "COVABIOPHILIC lush nature-inspired bedroom",
        "loras_json": json.dumps([
            {"name": "biophilic", "trigger": "COVABIOPHILIC", "url": "", "scale": 0.85},
        ]),
        "seed": 30002,
    },
    {
        "name": "A_bohemian",
        "room": room_a,
        "style_prompt": "COVABOHEMIAN eclectic layered bohemian bedroom",
        "loras_json": json.dumps([
            {"name": "bohemian", "trigger": "COVABOHEMIAN", "url": "", "scale": 0.85},
        ]),
        "seed": 30003,
    },
    # Room B — Scandinavian, MidCentury, Coastal
    {
        "name": "B_scandinavian",
        "room": room_b,
        "style_prompt": "COVASCANDINAV bright airy Scandinavian bedroom",
        "loras_json": json.dumps([
            {"name": "scandinavian", "trigger": "COVASCANDINAV", "url": "", "scale": 0.85},
        ]),
        "seed": 30004,
    },
    {
        "name": "B_midcentury",
        "room": room_b,
        "style_prompt": "COVAMIDCENTURY confident sculptural mid-century bedroom",
        "loras_json": json.dumps([
            {"name": "midcentury", "trigger": "COVAMIDCENTURY", "url": "", "scale": 0.85},
        ]),
        "seed": 30005,
    },
    {
        "name": "B_coastal",
        "room": room_b,
        "style_prompt": "COVACOASTAL breezy sun-bleached coastal bedroom",
        "loras_json": json.dumps([
            {"name": "coastal", "trigger": "COVACOASTAL", "url": "", "scale": 0.85},
        ]),
        "seed": 30006,
    },
]


def fire_render(test_config: dict) -> dict:
    name = test_config["name"]
    room = test_config["room"]
    print(f"[{name}] Firing render...")
    start = time.time()

    fn = modal.Function.from_name("cova-generation", "generate_redesign_phase4b")

    result = fn.remote(
        room_id=room["id"],
        user_id=room["user_id"],
        original_photo_url=room["original_photo_url"],
        professionalized_photo_url=room.get("professionalized_image_url") or room["original_photo_url"],
        style_prompt=test_config["style_prompt"],
        render_context=room.get("render_context") or {},
        wall_change_requested=False,
        floor_change_requested=False,
        seed=test_config["seed"],
        remove_count=10,
        loras_json=test_config["loras_json"],
        room_type=room.get("room_type", "bedroom"),
    )

    elapsed = time.time() - start
    final_url = result.get("final_url", "")
    ensemble = result.get("ensemble_score", 0)
    brief = result.get("styled_fill_prompt", "")[:200]

    print(f"[{name}] DONE in {elapsed:.0f}s — ensemble={ensemble:.2f}")
    print(f"[{name}] Final: {final_url[:100]}")
    print(f"[{name}] Brief: {brief[:120]}")

    return {
        "name": name,
        "final_url": final_url,
        "stage1_url": result.get("stage1_empty_room_url", ""),
        "stage2_raw_url": result.get("stage2_raw_ai_output_url", ""),
        "ensemble_score": ensemble,
        "elapsed": elapsed,
        "brief": brief,
        "composite_applied": result.get("composite_applied", "unknown"),
    }


if __name__ == "__main__":
    print("=" * 60)
    print("v7 Pipeline Test — 6 Renders (3 Room A + 3 Room B)")
    print("No composite. Semantic-only mask. Claude design briefs.")
    print("=" * 60)
    print(f"Room A: {room_a['id']}")
    print(f"Room B: {room_b['id']}")
    print()

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
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

    renders_dir = os.path.join(os.path.dirname(__file__), "renders")
    os.makedirs(renders_dir, exist_ok=True)
    urls_file = os.path.join(os.path.dirname(__file__), "v7_test_urls.txt")

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
            composite = r.get("composite_applied", "?")
            print(f"  {name}: ensemble={ensemble:.2f}, {elapsed:.0f}s, composite={composite}")
            uf.write(f"{name}: {final_url}\n")
            uf.write(f"{name}_stage1: {r.get('stage1_url', '')}\n")
            uf.write(f"{name}_stage2_raw: {r.get('stage2_raw_url', '')}\n")

            local_path = os.path.join(renders_dir, f"v7_{name}.jpg")
            try:
                resp = requests.get(final_url, timeout=120)
                resp.raise_for_status()
                with open(local_path, "wb") as f:
                    f.write(resp.content)
                print(f"    Downloaded {local_path} ({len(resp.content) / 1024:.0f} KB)")
            except Exception as e:
                print(f"    Download failed: {e}")

    print(f"\nURLs saved to {urls_file}")
    print("Done.")
