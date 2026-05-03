"""
Fire 6 v8 test renders: 3 on Room A + 3 on Room B.
v8: Input cleaning + Vision-aware Design Director + anti-hallucination.
"""
import json
import os
import time
import concurrent.futures

import modal
import requests

with open("/tmp/room_a_data.json") as f:
    room_a = json.load(f)
with open("/tmp/room_b_data.json") as f:
    room_b = json.load(f)

TESTS = [
    {"name": "A_japandi", "room": room_a, "style": "COVAJAPANDI", "seed": 60001},
    {"name": "A_biophilic", "room": room_a, "style": "COVABIOPHILIC", "seed": 60002},
    {"name": "A_bohemian", "room": room_a, "style": "COVABOHEMIAN", "seed": 60003},
    {"name": "B_scandinavian", "room": room_b, "style": "COVASCANDINAV", "seed": 60004},
    {"name": "B_midcentury", "room": room_b, "style": "COVAMIDCENTURY", "seed": 60005},
    {"name": "B_coastal", "room": room_b, "style": "COVACOASTAL", "seed": 60006},
]


def fire_render(t: dict) -> dict:
    name = t["name"]
    room = t["room"]
    style = t["style"]
    print(f"[{name}] Firing render...")
    start = time.time()

    fn = modal.Function.from_name("cova-generation", "generate_redesign_phase4b")
    result = fn.remote(
        room_id=room["id"],
        user_id=room["user_id"],
        original_photo_url=room["original_photo_url"],
        professionalized_photo_url=room.get("professionalized_image_url") or room["original_photo_url"],
        style_prompt=f"{style} styled bedroom",
        render_context=room.get("render_context") or {},
        wall_change_requested=False,
        floor_change_requested=False,
        seed=t["seed"],
        remove_count=10,
        loras_json=json.dumps([{"name": style, "trigger": style, "url": "", "scale": 0.85}]),
        room_type=room.get("room_type", "bedroom"),
    )

    elapsed = time.time() - start
    print(f"[{name}] DONE in {elapsed:.0f}s — ensemble={result.get('ensemble_score', 0):.2f}")
    return {
        "name": name,
        "final_url": result.get("final_url", ""),
        "cleaned_input_url": result.get("cleaned_input_url", ""),
        "stage1_url": result.get("stage1_empty_room_url", ""),
        "stage2_raw_url": result.get("stage2_raw_ai_output_url", ""),
        "mask_url": result.get("mask_url", ""),
        "ensemble_score": result.get("ensemble_score", 0),
        "elapsed": elapsed,
        "brief": result.get("styled_fill_prompt", "")[:250],
    }


if __name__ == "__main__":
    print("=" * 60)
    print("v8 Pipeline — Input Cleaning + Vision Director")
    print("=" * 60)

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        futures = {executor.submit(fire_render, t): t["name"] for t in TESTS}
        for future in concurrent.futures.as_completed(futures):
            name = futures[future]
            try:
                results.append(future.result())
            except Exception as e:
                print(f"[{name}] FAILED: {e}")
                import traceback; traceback.print_exc()
                results.append({"name": name, "error": str(e)})

    print("\n" + "=" * 60)
    print("RESULTS")
    print("=" * 60)

    renders_dir = "tests/e2e/renders"
    os.makedirs(renders_dir, exist_ok=True)

    for r in sorted(results, key=lambda x: x.get("name", "")):
        name = r.get("name", "?")
        if "error" in r:
            print(f"  {name}: FAILED — {r['error']}")
            continue

        print(f"  {name}: ensemble={r.get('ensemble_score', 0):.2f}, {r.get('elapsed', 0):.0f}s")
        # Download final
        for suffix, url in [("final.jpg", r["final_url"]), ("cleaned.jpg", r.get("cleaned_input_url"))]:
            if not url:
                continue
            try:
                resp = requests.get(url, timeout=120)
                resp.raise_for_status()
                path = os.path.join(renders_dir, f"v8_{name}_{suffix}")
                with open(path, "wb") as f:
                    f.write(resp.content)
                print(f"    {suffix}: {len(resp.content) / 1024:.0f} KB")
            except Exception as e:
                print(f"    {suffix}: download failed — {e}")

    # Save URLs
    urls_path = "tests/e2e/v8_test_urls.txt"
    with open(urls_path, "w") as f:
        for r in sorted(results, key=lambda x: x.get("name", "")):
            if "error" in r:
                continue
            name = r["name"]
            f.write(f"{name}_final: {r['final_url']}\n")
            f.write(f"{name}_cleaned: {r.get('cleaned_input_url', '')}\n")
            f.write(f"{name}_stage1: {r.get('stage1_url', '')}\n")
            f.write(f"{name}_stage2: {r.get('stage2_raw_url', '')}\n")
            f.write(f"{name}_brief: {r.get('brief', '')[:200]}\n\n")

    print(f"\nURLs saved to {urls_path}")
    print("Done.")
