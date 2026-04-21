#!/usr/bin/env python3
"""Phase 4B: Test empty-room service and visually critique output.

Usage: python3 phase_4b_test_empty_room.py <iteration_num>
"""

from __future__ import annotations

import base64
import io
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

import anthropic
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent


def _load_env():
    env_path = ROOT / "apps/web/.env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if "=" not in line or line.startswith("#"):
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        if k in ("ANTHROPIC_API_KEY", "FAL_KEY") and not os.getenv(k):
            os.environ[k] = v


_load_env()
client = anthropic.Anthropic()


def _resize_jpeg_b64(raw: bytes, max_dim: int = 1400, quality: int = 88) -> tuple[str, str]:
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    if max(img.size) > max_dim:
        scale = max_dim / max(img.size)
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode(), "image/jpeg"


def main():
    iter_num = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    print(f"=== ITERATION {iter_num} ===")

    diag_path = ROOT / "docs/pipeline-fix/sam3-diagnostic.json"
    diag = json.loads(diag_path.read_text())
    img_url = diag["img_url"]
    print(f"Using uploaded URL: {img_url}")

    # Call empty-room service.
    body = {"image_url": img_url}
    forced = os.getenv("FORCE_INPAINTER")
    if forced:
        body["force_inpainter"] = forced
        print(f"FORCING inpainter={forced}")
    req_data = json.dumps(body).encode()
    req = urllib.request.Request(
        "https://cova-interior--cova-empty-room-emptyroom-api.modal.run/v1/generate_empty_room",
        data=req_data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            result = json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"HTTP {e.code}: {body}")
        sys.exit(1)
    except Exception as e:
        print(f"SERVICE ERROR: {e}")
        raise

    empty_url = result["empty_room_url"]
    print(f"Empty room URL: {empty_url}")
    print(f"Coverage raw / dilated: {result.get('mask_coverage_raw_pct', 0):.2f}% / {result.get('mask_coverage_dilated_pct', 0):.2f}%")
    print(f"Inpainter: {result.get('inpainter_used')}")
    print(f"Architectural patch SSIM: {result.get('architectural_patch_ssim', 0):.3f}")
    failures = result.get("partial_failures", [])
    if failures:
        print(f"Partial failures ({len(failures)}): {failures[:5]}")

    # Download empty room.
    with urllib.request.urlopen(empty_url) as r:
        empty_bytes = r.read()
    out_dir = ROOT / "benchmarks/pipeline-fix-outputs/empty"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"iteration_{iter_num}.jpg"
    with open(out_path, "wb") as f:
        f.write(empty_bytes)
    print(f"Saved to: {out_path}")

    # Compare visually.
    orig_bytes = (ROOT / "benchmarks/target_room.jpg").read_bytes()
    orig_b64, _ = _resize_jpeg_b64(orig_bytes)
    empty_b64, _ = _resize_jpeg_b64(empty_bytes)

    critique_prompt = """You are a very critical quality control reviewer for an AI room redesign product.

I am showing you two images:
1. The ORIGINAL room photo (furnished)
2. The AI-generated EMPTY ROOM (what our pipeline produced)

The empty room should be COMPLETELY bare. Every single piece of furniture must be gone. The room must look exactly like the original but with zero furniture — same camera angle, same wall color, same ceiling, same windows, same quality. It should NOT be blurry. It should NOT have any artifacts.

Evaluate the empty room output with extreme harshness. Look for:

FURNITURE REMNANTS (fail if any exist):
- Is the bed/bed frame completely gone?
- Is the dresser/drawer unit completely gone?
- Is the office chair completely gone?
- Are clothes on the floor gone?
- Is the backpack gone?
- Are any boxes or storage items gone?
- Are string lights and hanging photos gone?
- Are there any ghost outlines or shadows of removed items?

QUALITY ISSUES (fail if present):
- Is the image blurry or lower quality than the original?
- Are there seams or visible patches where items were removed?
- Are there strange artifacts or distortions?
- Has the wall color changed?
- Has the ceiling fan been distorted or removed?
- Has the window/blinds been distorted?
- Has the "DAKSH" wall letters been distorted or removed?
- Has the camera angle/perspective changed?
- Is the floor different from the original?

SCORING:
- furniture_removal: 0-10 (10 = completely empty, 0 = nothing removed)
- architectural_preservation: 0-10 (10 = pixel-perfect preservation, 0 = completely different room)
- image_quality: 0-10 (10 = same sharpness as original, 0 = blurry/artifacts)
- overall_pass: true only if furniture_removal >= 8 AND architectural_preservation >= 9 AND image_quality >= 8

LIST every specific problem you see. Be exhaustive. I need to know exactly what to fix.

Respond in JSON only, no markdown fence:
{
  "furniture_removal": 0-10,
  "architectural_preservation": 0-10,
  "image_quality": 0-10,
  "overall_pass": true/false,
  "remaining_furniture": ["list every furniture item still visible"],
  "quality_issues": ["list every quality problem"],
  "architectural_damage": ["list every preserved element that was damaged"],
  "diagnosis": "one paragraph explaining the root cause of failures",
  "specific_fixes_needed": ["prioritized list of exact fixes to make"]
}"""

    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=2000,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": critique_prompt},
                    {"type": "text", "text": "Image 1 - ORIGINAL ROOM (furnished):"},
                    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": orig_b64}},
                    {"type": "text", "text": "Image 2 - AI EMPTY ROOM OUTPUT (what the pipeline produced):"},
                    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": empty_b64}},
                ],
            }
        ],
    )
    raw = response.content[0].text.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    try:
        critique = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        critique = json.loads(m.group(0))

    print("\n=== CRITIQUE ===")
    print(json.dumps(critique, indent=2))

    out_critique = ROOT / f"docs/pipeline-fix/critiques/empty-room-iteration-{iter_num}.json"
    out_critique.parent.mkdir(parents=True, exist_ok=True)
    with open(out_critique, "w") as f:
        json.dump(
            {
                "iteration": iter_num,
                "empty_url": empty_url,
                "service_response": result,
                "critique": critique,
            },
            f,
            indent=2,
        )

    if critique.get("overall_pass"):
        print(f"\n✅ EMPTY ROOM PASSED on iteration {iter_num}")
        with open(ROOT / "docs/pipeline-fix/passing-empty-room-url.txt", "w") as f:
            f.write(empty_url)
        sys.exit(0)
    else:
        print(f"\n❌ EMPTY ROOM FAILED on iteration {iter_num}")
        print(f"Remaining furniture: {critique.get('remaining_furniture', [])}")
        print(f"Quality issues: {critique.get('quality_issues', [])}")
        print(f"Fixes needed: {critique.get('specific_fixes_needed', [])}")
        sys.exit(2)


if __name__ == "__main__":
    main()
