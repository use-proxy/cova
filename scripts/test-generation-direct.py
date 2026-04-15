"""
Direct test of generate_redesign Modal function.
Calls the deployed function with test room data to validate all 8 points.

Run: python3 scripts/test-generation-direct.py
"""
import os
import sys

os.environ.setdefault("MODAL_TOKEN_ID", "ak-tAvpWfG8VSvdOxRpb66RMa")
os.environ.setdefault("MODAL_TOKEN_SECRET", "as-KmRETgWdFCepukknHSgje0")

import modal

ROOM_ID = "7ddfb921-21e8-4db4-9f29-ffba526fd981"

# Known public URLs from the test room
PROFESSIONALIZED_URL = "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/test/room_converted.jpeg"
DEPTH_URL = "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/depth_maps/7ddfb921-21e8-4db4-9f29-ffba526fd981_depth.jpg"
EDGE_URL = "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/edge_maps/7ddfb921-21e8-4db4-9f29-ffba526fd981_edges.png"
FLUX_PROMPT = "A warm Japandi living room, cvwmn. Walnut low-profile sofa with linen slipcover, ivory bouclé accent chairs flanking an oil-finished white oak coffee table, slim walnut shelving unit holding 3 ceramic vessels (varying heights), wabi-sabi glazed ceramic table lamp. 60% warm ivory and linen, 30% walnut and white oak tones, 10% muted sage green accents. Bright indirect light from north-facing floor-to-ceiling windows, supplemented by warm 2800K Edison bulb pendants. Layered depth: foreground bamboo textile rug anchors seating, mid-ground sofa + shelving define boundary, background open shelves + window wall extend space. Tight grain walnut contrasts cool linen weave throughout."
NEGATIVE_PROMPT = "window view, exterior, outdoors, people, text, watermark, cartoon, anime"
UNSPLASH_REFS = [
    "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=400",
    "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=400",
]

print(f"[test] Calling generate_redesign for room {ROOM_ID}")
print(f"[test] Depth: {DEPTH_URL[:80]}...")
print(f"[test] Edge:  {EDGE_URL[:80]}...")
print(f"[test] Unsplash refs: {len(UNSPLASH_REFS)}")

generate_redesign = modal.Function.from_name("cova-generation", "generate_redesign")

result = generate_redesign.remote(
    professionalized_image_url=PROFESSIONALIZED_URL,
    depth_map_url=DEPTH_URL,
    edge_map_url=EDGE_URL,
    flux_prompt=FLUX_PROMPT,
    negative_prompt=NEGATIVE_PROMPT,
    lora_url="fal-ai/flux-2-lora-gallery/apartment-staging",  # fallback (not http → skipped)
    lora_scale=0.65,
    unsplash_reference_urls=UNSPLASH_REFS,
    room_id=ROOM_ID,
    seed=148540,
)

print(f"\n[test] RESULT:")
print(f"  output_url:  {result.get('output_url', 'MISSING')[:100]}")
print(f"  seed_used:   {result.get('seed_used', 'MISSING')}")
print(f"  room_id:     {result.get('room_id', 'MISSING')}")

# Validation checks
checks = {
    "output_url present": bool(result.get("output_url")),
    "seed_used present": bool(result.get("seed_used")),
    "room_id correct": result.get("room_id") == ROOM_ID,
}

print(f"\n[test] VALIDATION:")
for k, v in checks.items():
    status = "PASS ✓" if v else "FAIL ✗"
    print(f"  {k}: {status}")

all_pass = all(checks.values())
print(f"\n[test] {'ALL CHECKS PASSED ✓' if all_pass else 'SOME CHECKS FAILED ✗'}")
sys.exit(0 if all_pass else 1)
