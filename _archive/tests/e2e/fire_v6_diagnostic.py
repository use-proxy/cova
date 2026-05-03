"""
Fire 1 diagnostic render — captures Stage 1 / Stage 2 raw / Final composite.
"""
import json
import os
import time

import modal
import requests

ROOM_ID = "cb2e7047-c7ae-4253-bf2b-cc42a6f3a727"

with open("/tmp/room_a_data.json") as f:
    room = json.load(f)

USER_ID = room["user_id"]
ORIGINAL_PHOTO_URL = room["original_photo_url"]
PROFESSIONALIZED_URL = room.get("professionalized_image_url") or ORIGINAL_PHOTO_URL
RENDER_CONTEXT = room.get("render_context") or {}

print("=" * 60)
print("v6 Diagnostic Render — Bohemian style")
print("=" * 60)
print(f"Room: {ROOM_ID}")
print()

fn = modal.Function.from_name("cova-generation", "generate_redesign_phase4b")

start = time.time()
result = fn.remote(
    room_id=ROOM_ID,
    user_id=USER_ID,
    original_photo_url=ORIGINAL_PHOTO_URL,
    professionalized_photo_url=PROFESSIONALIZED_URL,
    style_prompt="COVABOHEMIAN eclectic layered bohemian bedroom sanctuary",
    render_context=RENDER_CONTEXT,
    wall_change_requested=False,
    floor_change_requested=False,
    seed=20001,
    remove_count=10,
    loras_json=json.dumps([
        {"name": "bohemian", "trigger": "COVABOHEMIAN", "url": "", "scale": 0.85},
    ]),
    room_type="bedroom",
)
elapsed = time.time() - start

print(f"\nDone in {elapsed:.0f}s")
print(f"Ensemble score: {result.get('ensemble_score', 0):.2f}")
print()

# Extract the 3 diagnostic URLs
stage1_url = result.get("stage1_empty_room_url", "")
stage2_raw_url = result.get("stage2_raw_ai_output_url", "")
final_url = result.get("final_url", "")
mask_url = result.get("mask_url", "")
brief = result.get("styled_fill_prompt", "")

print("DIAGNOSTIC URLs:")
print(f"  Stage 1 (empty room):   {stage1_url}")
print(f"  Stage 2 (raw AI out):   {stage2_raw_url}")
print(f"  Final (composite):      {final_url}")
print(f"  Mask:                   {mask_url}")
print()
print(f"Design brief: {brief[:300]}")
print()

# Download all 3 + mask
renders_dir = os.path.join(os.path.dirname(__file__), "renders")
os.makedirs(renders_dir, exist_ok=True)

downloads = {
    "v6_diag_stage1_empty.png": stage1_url,
    "v6_diag_stage2_raw.jpg": stage2_raw_url,
    "v6_diag_final_composite.jpg": final_url,
    "v6_diag_mask.png": mask_url,
}

for filename, url in downloads.items():
    if not url:
        print(f"  SKIP {filename} — no URL")
        continue
    try:
        resp = requests.get(url, timeout=120)
        resp.raise_for_status()
        path = os.path.join(renders_dir, filename)
        with open(path, "wb") as f:
            f.write(resp.content)
        print(f"  Downloaded {filename} ({len(resp.content) / 1024:.0f} KB)")
    except Exception as e:
        print(f"  FAILED {filename}: {e}")

# Save URLs
urls_path = os.path.join(os.path.dirname(__file__), "v6_diagnostic_urls.txt")
with open(urls_path, "w") as f:
    f.write(f"stage1_empty_room: {stage1_url}\n")
    f.write(f"stage2_raw_ai_output: {stage2_raw_url}\n")
    f.write(f"final_composite: {final_url}\n")
    f.write(f"mask: {mask_url}\n")
    f.write(f"ensemble_score: {result.get('ensemble_score', 0):.2f}\n")
    f.write(f"design_brief: {brief}\n")

print(f"\nURLs saved to {urls_path}")
print("Done.")
