#!/usr/bin/env python3
"""Phase 5: Test redesign and compare to Collov."""

from __future__ import annotations

import base64
import io
import json
import os
import re
import sys
import urllib.error
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


def _b64_resized(raw: bytes, max_dim: int = 1400, quality: int = 88) -> str:
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    if max(img.size) > max_dim:
        scale = max_dim / max(img.size)
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode()


def main():
    iter_num = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    print(f"=== REDESIGN ITERATION {iter_num} ===")

    empty_url = (ROOT / "docs/pipeline-fix/passing-empty-room-url.txt").read_text().strip()
    print(f"Using empty-room URL: {empty_url}")

    # Fetch depth map (cova-perception) once and reuse across iterations.
    depth_cache = ROOT / "docs/pipeline-fix/depth-url.txt"
    depth_url = None
    if depth_cache.exists() and depth_cache.read_text().strip():
        depth_url = depth_cache.read_text().strip()
        print(f"Reusing cached depth URL: {depth_url}")
    elif os.getenv("USE_DEPTH", "1") == "1":
        print("Fetching depth map from cova-perception...")
        dreq = urllib.request.Request(
            "https://cova-interior--cova-perception-perception-api.modal.run/v1/depth_anything_v2",
            data=json.dumps({"image_url": empty_url}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(dreq, timeout=120) as r:
                d = json.loads(r.read())
            depth_url = d["depth_url"]
            depth_cache.write_text(depth_url)
            print(f"Got depth URL: {depth_url}")
        except Exception as e:
            print(f"Depth fetch failed (proceeding without): {e}")

    body = {
        "empty_room_url": empty_url,
        "archetype_key": os.getenv("REDESIGN_ARCHETYPE", "COVAJAPANDI"),
        "room_type": "bedroom",
        "budget_max": 3000,
    }
    if depth_url:
        body["depth_url"] = depth_url
    edge_cache = ROOT / "docs/pipeline-fix/edge-url.txt"
    if edge_cache.exists() and os.getenv("USE_EDGE", "0") == "1":
        body["edge_url"] = edge_cache.read_text().strip()
        print(f"Using edge URL: {body['edge_url']}")
    # Allow ad-hoc reflection-loop overrides via env vars.
    for key in ("strength_override", "guidance_override", "lora_scale_multiplier"):
        v = os.getenv(key.upper())
        if v:
            body[key] = float(v)
            print(f"  override {key}={v}")
    if os.getenv("PROMPT_OVERRIDE"):
        body["prompt_override"] = os.getenv("PROMPT_OVERRIDE")
    body["seed"] = int(os.getenv("REDESIGN_SEED", "42"))

    req_data = json.dumps(body).encode()
    req = urllib.request.Request(
        "https://cova-interior--cova-redesign-redesign-api.modal.run/v1/generate_redesign",
        data=req_data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            result = json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode()}")
        sys.exit(1)
    except Exception as e:
        print(f"SERVICE ERROR: {e}")
        raise

    render_url = result["redesign_url"]
    print(f"Redesign URL: {render_url}")
    print(f"Provider: {result.get('provider')}, fallback: {result.get('provider_fallback_reason')}")
    print(f"Strength: {result.get('strength')}, guidance: {result.get('guidance_scale')}, steps: {result.get('num_inference_steps')}")
    loras = result.get("loras_used") or []
    for l in loras:
        print(f"  LoRA: {l.get('name')} scale={l.get('scale')} trigger={l.get('trigger')}")

    with urllib.request.urlopen(render_url) as r:
        render_bytes = r.read()
    out_dir = ROOT / "benchmarks/pipeline-fix-outputs/redesign"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"iteration_{iter_num}.jpg"
    with open(out_path, "wb") as f:
        f.write(render_bytes)
    print(f"Saved to {out_path}")

    # Load comparison images.
    orig_b64 = _b64_resized((ROOT / "benchmarks/target_room.jpg").read_bytes())
    render_b64 = _b64_resized(render_bytes)
    collov_b64s = []
    for i in range(1, 5):
        p = ROOT / f"benchmarks/competitors/collovai/collov_{i}.png"
        if p.exists():
            collov_b64s.append(_b64_resized(p.read_bytes()))

    # Load Collov baseline analysis for the prompt.
    collov_baseline = json.loads(
        (ROOT / "docs/pipeline-fix/collov-baseline-analysis.json").read_text()
    )
    minimum_bar = collov_baseline.get("minimum_bar_to_match", "")
    bar_to_beat = collov_baseline.get("bar_to_beat", "")

    critique_text = f"""You are a very harsh interior design critic comparing two AI redesign tools.

COLLOV AI ANALYSIS (established standard):
- Minimum bar to match: {minimum_bar}
- Bar to beat: {bar_to_beat}

I will show you:
1. The original room
2. Four Collov AI redesigns (the standard to beat)
3. The Cova AI redesign (what we produced)

EVALUATE THE COVA RENDER on these axes. Be extremely harsh. If something is wrong, say exactly what is wrong.

STRUCTURAL FIDELITY (0-10):
Does the Cova render show the SAME room as the original? Check each element:
- Wall color (preserved?)
- Ceiling (same ceiling fan? same position?)
- Window and blinds (preserved? same position?)
- "DAKSH" letters on wall (preserved?)
- Carpet color/texture (same? note Collov layers a rug on top — that's OK)
- Camera angle/perspective (same viewpoint?)
- Room proportions
Score 10 = identical to Collov's structural preservation. Score 0 = completely different room.

FURNITURE QUALITY (0-10):
Is the new furniture well-chosen and placed?
- Does it fit the room proportions?
- Is it the right scale?
- Is placement natural?
- Is it AT LEAST as good as Collov's selections?

STYLE FIDELITY (0-10):
Does it look like the requested style ({body['archetype_key']})?
- Distinctive material/palette/object choices?
- Better than Collov's generic neutral rooms?

PHOTOREALISM (0-10):
Does it look like a real photo? Lighting consistent with original window light? Proper shadows?

OVERALL BEATS COLLOV:
true if structural_fidelity >= 8 AND style_fidelity >= 8 AND photorealism >= 7

DIAGNOSE every failure. Be specific.

Respond in JSON only, no markdown fence:
{{
  "structural_fidelity": int,
  "furniture_quality": int,
  "style_fidelity": int,
  "photorealism": int,
  "overall_beats_collov": bool,
  "structural_failures": [list],
  "style_failures": [list],
  "what_cova_does_better_than_collov": [list],
  "what_collov_does_better_than_cova": [list],
  "root_cause": "paragraph",
  "specific_fixes": [prioritized list of exact code/parameter changes]
}}"""

    content = [
        {"type": "text", "text": critique_text},
        {"type": "text", "text": "ORIGINAL ROOM:"},
        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": orig_b64}},
        {"type": "text", "text": "COLLOV AI REDESIGNS (standard to match/beat):"},
    ]
    for cb in collov_b64s:
        content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": cb}})
    content.extend([
        {"type": "text", "text": "COVA AI REDESIGN (evaluate this):"},
        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": render_b64}},
    ])

    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=2500,
        messages=[{"role": "user", "content": content}],
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

    out_critique = ROOT / f"docs/pipeline-fix/critiques/redesign-iteration-{iter_num}.json"
    out_critique.parent.mkdir(parents=True, exist_ok=True)
    with open(out_critique, "w") as f:
        json.dump(
            {
                "iteration": iter_num,
                "render_url": render_url,
                "loras_used": loras,
                "service_response": result,
                "critique": critique,
            },
            f,
            indent=2,
        )

    if critique.get("overall_beats_collov"):
        print(f"\n✅ REDESIGN BEATS COLLOV on iteration {iter_num}")
        with open(ROOT / "docs/pipeline-fix/passing-redesign-url.txt", "w") as f:
            f.write(render_url)
        sys.exit(0)
    else:
        print(f"\n❌ REDESIGN FAILED on iteration {iter_num}")
        print(f"Structural failures: {critique.get('structural_failures', [])}")
        print(f"Style failures: {critique.get('style_failures', [])}")
        print(f"Specific fixes: {critique.get('specific_fixes', [])}")
        sys.exit(2)


if __name__ == "__main__":
    main()
