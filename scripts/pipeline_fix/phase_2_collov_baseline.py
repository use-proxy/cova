#!/usr/bin/env python3
"""Phase 2: Visual baseline analysis of Collov AI output quality."""

import anthropic
import base64
import io
import json
import os
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent

# Load keys from apps/web/.env.local if env not already set
def _load_env():
    env_path = ROOT / "apps/web/.env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        if k in ("ANTHROPIC_API_KEY", "FAL_KEY") and not os.getenv(k):
            os.environ[k] = v
_load_env()

client = anthropic.Anthropic()


def file_to_b64(path: Path, max_bytes: int = 4_500_000, max_dim: int = 1600):
    """Load image; if > max_bytes, downscale to JPEG ≤ max_dim on the long side."""
    with open(path, "rb") as f:
        data = f.read()
    if len(data) <= max_bytes and path.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
        ext = path.suffix.lower()
        media_type = (
            "image/png" if ext == ".png"
            else "image/jpeg" if ext in (".jpg", ".jpeg")
            else "image/webp"
        )
        return base64.b64encode(data).decode(), media_type

    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    if max(w, h) > max_dim:
        scale = max_dim / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    out = buf.getvalue()
    return base64.b64encode(out).decode(), "image/jpeg"


def main():
    target = ROOT / "benchmarks/target_room.jpg"
    orig_b64, orig_mt = file_to_b64(target)
    collov_imgs = []
    for i in range(1, 5):
        p = ROOT / f"benchmarks/competitors/collovai/collov_{i}.png"
        if p.exists():
            b64, mt = file_to_b64(p)
            collov_imgs.append((b64, mt, str(p)))
        else:
            print(f"missing {p}")

    print(f"loaded original ({len(orig_b64)} b64) + {len(collov_imgs)} collov images")

    content = [
        {
            "type": "text",
            "text": """You are an expert interior design critic. I am showing you an original room photo followed by 4 redesigns of that same room produced by Collov AI.

Analyze Collov's output in extreme detail. I need to understand exactly what quality standard I must match and exceed.

Answer these questions precisely:

1. STRUCTURAL PRESERVATION: List every structural element from the original room that appears in EACH Collov render. Be specific: ceiling fan (yes/no, position preserved?), wall color (exact color, preserved?), window (preserved?, blinds preserved?), "DAKSH" letters (preserved?), carpet color/texture (preserved?), camera angle (same perspective?), room dimensions feel (same or different?).

2. FURNITURE REMOVAL: In each Collov render, is ALL original furniture gone? List any furniture remnants if visible. How clean is the removal (any artifacts, shadows, seams)?

3. FURNITURE PLACEMENT: In each Collov render, describe the new furniture: what items, where placed, what style, what materials.

4. PHOTOREALISM: Rate each render 1-10. What makes them photorealistic or not?

5. STYLE QUALITY: Rate each render's style distinctiveness 1-10. Are they generic or distinctive?

6. WHAT MAKES COLLOV GOOD: In one paragraph, what does Collov do well that any competing tool must match?

7. WHAT MAKES COLLOV WEAK: In one paragraph, what are Collov's specific weaknesses that a competitor could beat?

Respond in JSON only, with no markdown fence:
{
  "structural_elements_preserved": {"ceiling_fan": "...", "wall_color": "...", "window_blinds": "...", "daksh_letters": "...", "carpet": "...", "camera_angle": "..."},
  "furniture_removal_quality": "...",
  "collov_strengths": "...",
  "collov_weaknesses": "...",
  "minimum_bar_to_match": "...",
  "bar_to_beat": "..."
}""",
        },
        {"type": "image", "source": {"type": "base64", "media_type": orig_mt, "data": orig_b64}},
        {"type": "text", "text": "Above: original room. Below: Collov AI redesigns 1-4:"},
    ]
    for b64, mt, _ in collov_imgs:
        content.append({"type": "image", "source": {"type": "base64", "media_type": mt, "data": b64}})

    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=3000,
        messages=[{"role": "user", "content": content}],
    )
    raw = response.content[0].text
    # Strip markdown fences if present
    raw_stripped = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw_stripped = re.sub(r"\s*```$", "", raw_stripped)
    try:
        analysis = json.loads(raw_stripped)
    except json.JSONDecodeError:
        # Last-ditch: find {...} blob
        m = re.search(r"\{.*\}", raw_stripped, re.DOTALL)
        if not m:
            print("ERROR: model did not return JSON. Raw:", raw[:500])
            sys.exit(1)
        analysis = json.loads(m.group(0))

    print(json.dumps(analysis, indent=2))

    out = ROOT / "docs/pipeline-fix/collov-baseline-analysis.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump(analysis, f, indent=2)

    print("\n=== MINIMUM BAR TO MATCH ===")
    print(analysis.get("minimum_bar_to_match", ""))
    print("\n=== BAR TO BEAT ===")
    print(analysis.get("bar_to_beat", ""))


if __name__ == "__main__":
    main()
