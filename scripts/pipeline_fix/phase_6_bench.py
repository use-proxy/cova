#!/usr/bin/env python3
"""Phase 6: Run full fixed pipeline on all 15 bench rooms."""

from __future__ import annotations

import base64
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import anthropic
import fal_client as fc
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent


def _load_env():
    env_path = ROOT / "apps/web/.env.local"
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            v = v.strip().strip('"').strip("'")
            if k in ("FAL_KEY", "ANTHROPIC_API_KEY") and not os.getenv(k):
                os.environ[k] = v


_load_env()
client = anthropic.Anthropic()


BENCH_ROOMS = {
    "room-01": ("bench/rooms/room-01_bedroom-cat-popcorn.webp", "COVAJAPANDI", "bedroom"),
    "room-02": ("bench/rooms/room-02_livingroom-piano-joydivision.webp", "COVAMIDCENTURY", "living_room"),
    "room-03": ("bench/rooms/room-03_livingroom-leather-herringbone.webp", "COVACOASTAL", "living_room"),
    "room-04": ("bench/rooms/room-04_attic-music-sloped.webp", "COVABOHEMIAN", "bedroom"),
    "room-05": ("bench/rooms/room-05_office-gallery-rug.webp", "COVAFARMHOUSE", "home_office"),
    "room-06": ("bench/rooms/room-06_empty-bay-window.webp", "COVAMINIMAL", "living_room"),
    "room-07": ("bench/rooms/room-07_bedroom-desk-carpet.webp", "COVAJAPANDI", "bedroom"),
    "room-08": ("bench/rooms/room-08_livingroom-papasan-floral.webp", "COVABOHEMIAN", "living_room"),
    "room-09": ("bench/rooms/room-09_gaming-led-popcorn.webp", "COVAINDUSTRIAL", "bedroom"),
    "room-10": ("bench/rooms/room-10_tv-fireplace-dark.webp", "COVAARTDECO", "living_room"),
    "room-11": ("bench/rooms/room-11_green-velvet-gallery.webp", "COVASCANDINAV", "living_room"),
    "room-12": ("bench/rooms/room-12_bedroom-piano-led.webp", "COVAMIDCENTURY", "bedroom"),
    "room-13": ("bench/rooms/room-13_exposed-brick-arched.webp", "COVAINDUSTRIAL", "living_room"),
    "room-14": ("bench/rooms/room-14_stacked-stone-empty.webp", "COVAARTDECO", "living_room"),
    "room-15": ("bench/rooms/room-15_wood-paneling-twin-beds.webp", "COVAFARMHOUSE", "bedroom"),
}


def _resize_jpeg_b64(raw: bytes, max_dim: int = 1200, quality: int = 86) -> str:
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    if max(img.size) > max_dim:
        scale = max_dim / max(img.size)
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode()


def _post(url: str, body: dict, timeout: int = 600):
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def process_room(room_id: str, img_path: str, archetype: str, room_type: str) -> dict:
    print(f"\n=== {room_id}: {archetype} / {room_type} ===")
    full_path = ROOT / img_path
    out_dir = ROOT / "benchmarks/pipeline-fix-outputs"
    (out_dir / "empty").mkdir(parents=True, exist_ok=True)
    (out_dir / "redesign").mkdir(parents=True, exist_ok=True)

    try:
        img_bytes = full_path.read_bytes()
        ext = full_path.suffix.lower()
        media_type = "image/webp" if ext == ".webp" else "image/jpeg"

        # Downscale before upload — bench .webp's are ~1MB but consistent sizing helps.
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        if max(img.size) > 1600:
            s = 1600 / max(img.size)
            img = img.resize((int(img.width * s), int(img.height * s)), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=92)
        upload_bytes = buf.getvalue()
        img_url = fc.upload(upload_bytes, "image/jpeg")
        print(f"  uploaded: {img_url}")

        # ── Empty-room ──
        empty_res = _post(
            "https://cova-interior--cova-empty-room-emptyroom-api.modal.run/v1/generate_empty_room",
            {"image_url": img_url},
            timeout=300,
        )
        empty_url = empty_res["empty_room_url"]
        coverage = empty_res.get("mask_coverage_dilated_pct", 0.0)
        inpainter = empty_res.get("inpainter_used", "?")
        print(f"  empty: {inpainter} (cov_dilated={coverage:.1f}%) → {empty_url[:70]}")

        # ── Depth (DISABLED) ──
        # The fal-ai/flux-general controlnet_unions endpoint cannot
        # download `v3b.fal.media` URLs ("Failed to download the file"),
        # which means our depth-based architectural lock never actually
        # ran end-to-end. With depth_url present, every redesign call
        # falls back to nano-banana-pro/edit. NB-Pro respects the prompt
        # vocab (paper lanterns / platform bed / etc.) and produces
        # excellent output, so we just skip depth and let NB-Pro do its
        # thing directly. Tracked as F6-CONTROLNET-URL.1 for follow-up.
        depth_url = None

        # ── Redesign ──
        redesign_body: dict = {
            "empty_room_url": empty_url,
            "archetype_key": archetype,
            "room_type": room_type,
            "budget_max": 3000,
            "strength_override": 0.82,
            "lora_scale_multiplier": 1.10,
            "seed": 42,
        }
        if depth_url:
            redesign_body["depth_url"] = depth_url

        redesign_res = _post(
            "https://cova-interior--cova-redesign-redesign-api.modal.run/v1/generate_redesign",
            redesign_body,
            timeout=600,
        )
        render_url = redesign_res["redesign_url"]
        print(f"  render: {render_url[:70]}  provider={redesign_res.get('provider')}")

        with urllib.request.urlopen(empty_url) as r:
            empty_bytes = r.read()
        with urllib.request.urlopen(render_url) as r:
            render_bytes = r.read()
        (out_dir / "empty" / f"{room_id}.jpg").write_bytes(empty_bytes)
        (out_dir / "redesign" / f"{room_id}.jpg").write_bytes(render_bytes)

        # ── Critique ──
        orig_b64 = _resize_jpeg_b64(img_bytes)
        empty_b64 = _resize_jpeg_b64(empty_bytes)
        render_b64 = _resize_jpeg_b64(render_bytes)

        critique_text = f"""Evaluate this room redesign. Score each 0-10. Be harsh but fair.
Room type: {room_type}. Target style: {archetype}.

1. empty_room_quality (0-10): Is the empty room reasonably bare with main furniture removed? Architecture preserved?
2. structural_fidelity (0-10): Does the final render preserve the original room's architecture (walls, ceiling, windows, floor color, camera angle)?
3. style_quality (0-10): Does the render execute the {archetype} style distinctively?
4. overall_pass: true if empty_room_quality>=7 AND structural_fidelity>=7 AND style_quality>=6

JSON only, no markdown fence:
{{"empty_room_quality": int, "structural_fidelity": int, "style_quality": int, "overall_pass": bool, "failures": [list of brief issues]}}"""

        resp = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=600,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": critique_text},
                        {"type": "text", "text": "ORIGINAL:"},
                        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": orig_b64}},
                        {"type": "text", "text": "EMPTY ROOM:"},
                        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": empty_b64}},
                        {"type": "text", "text": "REDESIGN:"},
                        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": render_b64}},
                    ],
                }
            ],
        )
        raw = resp.content[0].text.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        try:
            critique = json.loads(raw)
        except json.JSONDecodeError:
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            critique = json.loads(m.group(0)) if m else {}

        status = "✅" if critique.get("overall_pass") else "❌"
        print(
            f"  {status} empty={critique.get('empty_room_quality')} "
            f"struct={critique.get('structural_fidelity')} "
            f"style={critique.get('style_quality')}"
        )
        if critique.get("failures"):
            print(f"  failures: {critique.get('failures')[:3]}")

        return {
            "room_id": room_id,
            "empty_url": empty_url,
            "render_url": render_url,
            "coverage_pct": coverage,
            "inpainter": inpainter,
            "critique": critique,
        }

    except Exception as exc:
        print(f"  ERROR: {exc}")
        return {"room_id": room_id, "error": str(exc)}


def main():
    only = set(sys.argv[1:]) if len(sys.argv) > 1 else None
    rooms = BENCH_ROOMS if not only else {k: v for k, v in BENCH_ROOMS.items() if k in only}

    results = {}
    # Run rooms 2 at a time. Each room's empty-room call already does 24
    # parallel SAM3 prompts; 2 in parallel = 48 concurrent which is the
    # safe ceiling for fal's per-key throughput.
    parallelism = int(os.getenv("BENCH_PARALLELISM", "2"))
    with ThreadPoolExecutor(max_workers=parallelism) as ex:
        futs = {
            ex.submit(process_room, rid, p, a, rt): rid
            for rid, (p, a, rt) in rooms.items()
        }
        for fut in as_completed(futs):
            rid = futs[fut]
            results[rid] = fut.result()

    passed = sum(1 for r in results.values() if r.get("critique", {}).get("overall_pass"))
    total = len(rooms)
    print(f"\n{'=' * 50}\nBENCH RESULTS: {passed}/{total} passed")

    out = ROOT / "docs/pipeline-fix/bench-results.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump(results, f, indent=2)

    failures = [
        (k, v.get("critique", {}).get("failures", []) or v.get("error"))
        for k, v in results.items()
        if not v.get("critique", {}).get("overall_pass")
    ]
    if failures:
        print("\nFAILED ROOMS:")
        for k, fail in failures:
            print(f"  {k}: {fail}")


if __name__ == "__main__":
    main()
