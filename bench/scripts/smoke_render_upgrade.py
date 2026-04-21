"""Single-room smoke test — confirm LoRA unblock + passthrough blend.

Runs target room through new empty_room + redesign services, prints
LoRA inference time, and saves both outputs locally for visual review.

Purpose: catch pipeline breakage before paying for the 15-room bench.
"""
from __future__ import annotations

import hashlib
import os
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

EMPTY_ROOM_URL = "https://cova-interior--cova-empty-room-emptyroom-api.modal.run"
REDESIGN_URL = "https://cova-interior--cova-redesign-redesign-api.modal.run"

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get(
    "NEXT_PUBLIC_SUPABASE_URL"
)
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY"
)


def upload(image_path: Path) -> str:
    from supabase import create_client
    assert SUPABASE_URL and SUPABASE_SERVICE_KEY
    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    content = image_path.read_bytes()
    digest = hashlib.md5(content).hexdigest()[:12]
    path = f"render-upgrade/inputs/{digest}{image_path.suffix.lower()}"
    sb.storage.from_("room-photos").upload(
        path=path,
        file=content,
        file_options={"content-type": "image/jpeg", "upsert": "true"},
    )
    return sb.storage.from_("room-photos").get_public_url(path)


def main() -> int:
    target = ROOT / "benchmarks" / "target_room.jpg"
    if not target.exists():
        print(f"missing {target}")
        return 2

    uploaded = upload(target)
    print(f"[smoke] input uploaded: {uploaded}")

    t0 = time.perf_counter()
    r = httpx.post(
        f"{EMPTY_ROOM_URL}/v1/generate_empty_room",
        json={"image_url": uploaded},
        timeout=300.0,
        follow_redirects=True,
    )
    if r.status_code != 200:
        print(f"empty_room FAIL {r.status_code}: {r.text[:500]}")
        return 3
    empty = r.json()
    empty_url = empty["empty_room_url"]
    print(
        f"[smoke] empty_room OK in {time.perf_counter() - t0:.1f}s  "
        f"inpainter={empty.get('inpainter_used')}  "
        f"cov_raw={empty.get('mask_coverage_raw_pct'):.1f}%  "
        f"cov_dilated={empty.get('mask_coverage_dilated_pct'):.1f}%  "
        f"ssim={empty.get('architectural_patch_ssim'):.3f}  "
        f"depth_edges={empty.get('depth_edges_used')}  "
        f"arch_prot={empty.get('arch_protection_used')}"
    )
    print(f"[smoke] empty_room URL: {empty_url}")

    out = ROOT / "benchmarks" / "render-upgrade-outputs" / "smoke"
    out.mkdir(parents=True, exist_ok=True)
    (out / "empty.jpg").write_bytes(httpx.get(empty_url, timeout=60).content)

    t1 = time.perf_counter()
    r = httpx.post(
        f"{REDESIGN_URL}/v1/generate_redesign",
        json={
            "empty_room_url": empty_url,
            "archetype_key": "COVAJAPANDI",
            "room_type": "bedroom",
            "budget_max": 5000.0,
            "enable_controlnet": True,
            "enable_stage_b": True,
            "seed": 42,
        },
        timeout=420.0,
        follow_redirects=True,
    )
    if r.status_code != 200:
        print(f"redesign FAIL {r.status_code}: {r.text[:500]}")
        return 4
    red = r.json()
    print(
        f"[smoke] redesign OK in {time.perf_counter() - t1:.1f}s  "
        f"provider={red.get('provider')}  "
        f"stage_b={red.get('stage_b_used')}  "
        f"strength={red.get('strength')}  steps={red.get('num_inference_steps')}  "
        f"lora_inf_time={red.get('lora_inference_time_s')}s  "
        f"fallback_reason={red.get('provider_fallback_reason')}"
    )
    print(f"[smoke] loras_used: {[l.get('name') for l in red.get('loras_used', [])]}")
    print(f"[smoke] redesign URL: {red['redesign_url']}")
    if red.get("stage_a_url"):
        print(f"[smoke] stage_a URL:  {red['stage_a_url']}")

    (out / "stage_a.jpg").write_bytes(
        httpx.get(red.get("stage_a_url") or red["redesign_url"], timeout=120).content
    )
    (out / "redesign.jpg").write_bytes(
        httpx.get(red["redesign_url"], timeout=120).content
    )

    # Gate checks
    if red.get("provider") != "flux-general":
        print("[smoke] WARN: provider is not flux-general — LoRAs did NOT run")
        return 5

    inf_time = red.get("lora_inference_time_s")
    if inf_time is not None and inf_time < 7.0:
        print(f"[smoke] WARN: inference_time={inf_time}s suggests LoRAs did not load")
        return 6

    print("[smoke] ALL GATES PASS — flux-general ran, LoRAs loaded")
    return 0


if __name__ == "__main__":
    sys.exit(main())
