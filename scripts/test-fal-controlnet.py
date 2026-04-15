"""
Direct fal.ai ControlNet isolation test.
Tests ONE ControlNet at 28 steps to determine if the issue is:
  (a) Any ControlNet at 28 steps, OR
  (b) Two ControlNets simultaneously

Usage: python scripts/test-fal-controlnet.py

Requires: pip install fal-client requests
FAL_KEY must be set in environment (or hardcoded below for quick test).
"""
import os
import sys
import json

# Set FAL_KEY directly for quick test
os.environ.setdefault("FAL_KEY", "68b9b85d-169b-429a-bada-ed0680f67c9d:fcb193385f6d2e5f90e161705dd8ee89")

try:
    import fal_client
except ImportError:
    print("Installing fal-client...")
    os.system("pip install fal-client -q")
    import fal_client

# Test assets — public Supabase URLs from the test room
PROFESSIONALIZED_URL = "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/test/room_converted.jpeg"
DEPTH_URL = "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/depth_maps/7ddfb921-21e8-4db4-9f29-ffba526fd981_depth.jpg"
EDGE_URL = "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/edge_maps/7ddfb921-21e8-4db4-9f29-ffba526fd981_edges.png"
FLUX_PROMPT = "A warm Japandi living room with walnut furniture, linen sofa, and soft ambient lighting. cvwmn style."
UNSPLASH_URL = "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=400"

ENDPOINT = "fal-ai/flux-general/image-to-image"

BASE_ARGS = {
    "prompt": FLUX_PROMPT,
    "image_url": PROFESSIONALIZED_URL,
    "strength": 0.85,
    "num_inference_steps": 28,
    "guidance_scale": 3.5,
    "scheduler": "euler",
    "image_size": {"width": 1024, "height": 1024},
    "output_format": "png",
    "num_images": 1,
    "seed": 42,
    "enable_safety_checker": False,
}

def run_test(name: str, extra_args: dict):
    print(f"\n{'='*60}")
    print(f"TEST: {name}")
    print(f"{'='*60}")
    args = {**BASE_ARGS, **extra_args}
    print(f"Args keys: {list(args.keys())}")
    if "controlnet_unions" in args:
        for i, cn in enumerate(args["controlnet_unions"]):
            print(f"  ControlNet {i}: mode={cn['controls'][0]['control_mode']}, scale={cn['controls'][0]['conditioning_scale']}")
    try:
        result = fal_client.subscribe(ENDPOINT, arguments=args, with_logs=False)
        images = result.get("images") or []
        if images:
            print(f"SUCCESS: {images[0]['url'][:80]}...")
            return True
        else:
            print(f"FAIL: No images in result: {str(result)[:200]}")
            return False
    except Exception as e:
        err = str(e)
        print(f"FAIL: {err[:300]}")
        return False


if __name__ == "__main__":
    print("fal.ai ControlNet isolation tests — 28 steps")
    print(f"Endpoint: {ENDPOINT}")

    results = {}

    # Test 1: ONE depth ControlNet, 28 steps, no ip_adapter
    results["1_depth_only_28steps"] = run_test(
        "ONE depth ControlNet, 28 steps, no ip_adapter",
        {
            "controlnet_unions": [
                {
                    "path": "InstantX/FLUX.1-dev-Controlnet-Union",
                    "controls": [
                        {
                            "control_image_url": DEPTH_URL,
                            "control_mode": "depth",
                            "conditioning_scale": 0.60,
                            "start_percentage": 0.0,
                            "end_percentage": 0.65,
                        }
                    ],
                }
            ]
        }
    )

    # Test 2: ONE edge ControlNet, 28 steps, no ip_adapter
    results["2_edge_only_28steps"] = run_test(
        "ONE edge ControlNet (canny), 28 steps, no ip_adapter",
        {
            "controlnet_unions": [
                {
                    "path": "InstantX/FLUX.1-dev-Controlnet-Union",
                    "controls": [
                        {
                            "control_image_url": EDGE_URL,
                            "control_mode": "canny",
                            "conditioning_scale": 0.40,
                            "start_percentage": 0.0,
                            "end_percentage": 0.50,
                        }
                    ],
                }
            ]
        }
    )

    # Test 3: TWO ControlNets in a SINGLE controlnet_unions entry (both controls in one entry)
    results["3_both_in_one_entry"] = run_test(
        "BOTH ControlNets in a SINGLE controlnet_unions entry, 28 steps",
        {
            "controlnet_unions": [
                {
                    "path": "InstantX/FLUX.1-dev-Controlnet-Union",
                    "controls": [
                        {
                            "control_image_url": DEPTH_URL,
                            "control_mode": "depth",
                            "conditioning_scale": 0.60,
                            "start_percentage": 0.0,
                            "end_percentage": 0.65,
                        },
                        {
                            "control_image_url": EDGE_URL,
                            "control_mode": "canny",
                            "conditioning_scale": 0.40,
                            "start_percentage": 0.0,
                            "end_percentage": 0.50,
                        }
                    ],
                }
            ]
        }
    )

    # Test 4: ONE depth ControlNet + ip_adapter, 28 steps
    results["4_depth_plus_ip_adapter"] = run_test(
        "ONE depth ControlNet + ip_adapter, 28 steps",
        {
            "controlnet_unions": [
                {
                    "path": "InstantX/FLUX.1-dev-Controlnet-Union",
                    "controls": [
                        {
                            "control_image_url": DEPTH_URL,
                            "control_mode": "depth",
                            "conditioning_scale": 0.60,
                            "start_percentage": 0.0,
                            "end_percentage": 0.65,
                        }
                    ],
                }
            ],
            "ip_adapter_image_url": UNSPLASH_URL,
            "ip_adapter_scale": 0.50,
        }
    )

    # Test 5: BOTH in single entry + ip_adapter, 28 steps
    results["5_both_in_one_plus_ip"] = run_test(
        "BOTH ControlNets in single entry + ip_adapter, 28 steps",
        {
            "controlnet_unions": [
                {
                    "path": "InstantX/FLUX.1-dev-Controlnet-Union",
                    "controls": [
                        {
                            "control_image_url": DEPTH_URL,
                            "control_mode": "depth",
                            "conditioning_scale": 0.60,
                            "start_percentage": 0.0,
                            "end_percentage": 0.65,
                        },
                        {
                            "control_image_url": EDGE_URL,
                            "control_mode": "canny",
                            "conditioning_scale": 0.40,
                            "start_percentage": 0.0,
                            "end_percentage": 0.50,
                        }
                    ],
                }
            ],
            "ip_adapter_image_url": UNSPLASH_URL,
            "ip_adapter_scale": 0.50,
        }
    )

    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    for k, v in results.items():
        status = "SUCCESS ✓" if v else "FAIL ✗"
        print(f"  {k}: {status}")
