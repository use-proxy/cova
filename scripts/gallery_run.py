"""Cova Pipeline Gallery Runner — 15-image showcase.

For each of the 15 bench rooms, runs the full V3 pipeline:
  1. Upload source image to fal
  2. Call cova-empty-room-v3 -> empty room URL
  3. Download empty room locally
  4. Validate with Claude Haiku Vision (EMPTY / NOT_EMPTY)
  5. Call cova-redesign-v3 with curated style blend + personalization
  6. Download redesign locally
  7. Append metadata to results.json

Run sequentially to avoid rate limits. Errors are caught per-image; the
script never aborts. Produces inputs for docs/gallery/index.html.

Usage:
    python3 scripts/gallery_run.py
"""

from __future__ import annotations

import base64
import json
import os
import shutil
import sys
import time
from pathlib import Path
from typing import Any, Optional

import requests
from PIL import Image  # type: ignore

ROOT = Path("/Users/daksh/Desktop/cova")
SOURCE_DIR = ROOT / "bench" / "rooms"
GALLERY_DIR = ROOT / "docs" / "gallery"
ORIGINAL_DIR = GALLERY_DIR / "original"
EMPTY_DIR = GALLERY_DIR / "empty"
REDESIGN_DIR = GALLERY_DIR / "redesign"
RESULTS_PATH = GALLERY_DIR / "results.json"

for d in (ORIGINAL_DIR, EMPTY_DIR, REDESIGN_DIR):
    d.mkdir(parents=True, exist_ok=True)


# ---------- env ----------

def load_env_local() -> None:
    env_path = ROOT / "apps" / "web" / ".env.local"
    if not env_path.exists():
        print(f"[fatal] {env_path} not found", file=sys.stderr)
        sys.exit(1)
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip())


load_env_local()

FAL_KEY = os.environ.get("FAL_KEY")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY")
COVA_EMPTY_ROOM_V3_URL = os.environ.get("COVA_EMPTY_ROOM_V3_URL")
COVA_REDESIGN_URL = os.environ.get("COVA_REDESIGN_URL")

missing = [k for k, v in {
    "FAL_KEY": FAL_KEY,
    "ANTHROPIC_API_KEY": ANTHROPIC_KEY,
    "COVA_EMPTY_ROOM_V3_URL": COVA_EMPTY_ROOM_V3_URL,
    "COVA_REDESIGN_URL": COVA_REDESIGN_URL,
}.items() if not v]
if missing:
    print(f"[fatal] missing env: {missing}", file=sys.stderr)
    sys.exit(1)


# ---------- scenarios (15 curated, all 10 LoRAs covered) ----------

SCENARIO_MAP: list[dict[str, Any]] = [
    {
        "id": "S01", "room_type": "bedroom",
        "style_blend": {"COVAJAPANDI": 0.85, "COVASCANDINAV": 0.15},
        "personalization": "Single large Japanese ink wash painting in black frame · 2 fiddle leaf figs flanking bed · warm paper lantern pendant · linen bedding in oatmeal",
        "flux_prompt_suffix": "Japanese ink wash art panel on wall, teak platform bed, linen bedding, rattan pendant lamp, monstera plant, warm amber lighting",
    },
    {
        "id": "S02", "room_type": "living_room",
        "style_blend": {"COVABIOPHILIC": 0.90, "COVAJAPANDI": 0.10},
        "personalization": "Entire wall of trailing pothos and monstera · hanging macrame planter · wicker sofa with sage cushions · bamboo coffee table · bright natural daylight",
        "flux_prompt_suffix": "living wall of tropical plants, wicker furniture, sage green cushions, bamboo coffee table, natural light flooding room, biophilic oasis",
    },
    {
        "id": "S03", "room_type": "bedroom",
        "style_blend": {"COVAMINIMAL": 0.95, "COVASCANDINAV": 0.05},
        "personalization": "Zero art on walls · platform bed with single white duvet · one sculptural table lamp · nothing on floor except one sheepskin rug · complete silence aesthetic",
        "flux_prompt_suffix": "pure white walls, floating platform bed, single sculptural ceramic lamp, sheepskin rug, absolute minimalism, no clutter, zen stillness",
    },
    {
        "id": "S04", "room_type": "living_room",
        "style_blend": {"COVAINDUSTRIAL": 0.80, "COVAMIDCENTURY": 0.20},
        "personalization": "Herman Miller Aeron chair at standing desk · full wall vinyl record shelf facing out · Edison pendant cluster · exposed brick accent · many books on open shelving",
        "flux_prompt_suffix": "Herman Miller ergonomic chair, vinyl record wall display, Edison bulb pendants, open metal shelving with books, industrial loft aesthetic",
    },
    {
        "id": "S05", "room_type": "bedroom",
        "style_blend": {"COVAARTDECO": 0.80, "COVAINDUSTRIAL": 0.20},
        "personalization": "Single oversized music poster in black frame (concert art) · Hue LED strip behind headboard in deep blue · velvet headboard in forest green · smart speaker on nightstand · dramatic moody atmosphere",
        "flux_prompt_suffix": "large music concert poster black frame, LED strip behind headboard blue glow, forest green velvet headboard, smart speaker, dramatic dark moody bedroom",
    },
    {
        "id": "S06", "room_type": "living_room",
        "style_blend": {"COVACOASTAL": 0.85, "COVABIOPHILIC": 0.15},
        "personalization": "Triptych of vintage surf photography in white frames · rattan daybed with white cushions · hanging pampas grass arrangement · linen curtains floor to ceiling · bright coastal light",
        "flux_prompt_suffix": "triptych surf photography white frames, rattan daybed white cushions, pampas grass dried arrangement, linen curtains, coastal bright airy room",
    },
    {
        "id": "S07", "room_type": "bedroom",
        "style_blend": {"COVABOHEMIAN": 0.78, "COVABIOPHILIC": 0.22},
        "personalization": "Macrame wall hanging above bed · 6 mismatched gallery wall frames · Turkish kilim rug layered over jute · 3 hanging planters at different heights · fairy lights in corner",
        "flux_prompt_suffix": "large macrame wall hanging, gallery wall of mismatched frames, Turkish kilim rug, hanging planters cascading, fairy lights warm glow, eclectic bohemian bedroom",
    },
    {
        "id": "S08", "room_type": "home_office",
        "style_blend": {"COVAMIDCENTURY": 0.85, "COVAJAPANDI": 0.15},
        "personalization": "Eames-style lounge chair in corner · walnut credenza along wall · architectural desk lamp · framed blueprints as art · record player on credenza · warm tungsten lighting",
        "flux_prompt_suffix": "Eames lounge chair, walnut credenza, architectural task lamp, framed blueprint art, record player on credenza, mid-century modern home office",
    },
    {
        "id": "S09", "room_type": "living_room",
        "style_blend": {"COVAFARMHOUSE": 0.85, "COVACOASTAL": 0.15},
        "personalization": "Shiplap accent wall behind sofa · oversized wreath above fireplace · linen slipcovered sofa · woven basket collection · farmhouse dining table visible · warm candlelight",
        "flux_prompt_suffix": "shiplap wood accent wall, linen slipcover sofa, woven baskets, farmhouse wooden dining table, wreath, warm candlelight, traditional cozy farmhouse",
    },
    {
        "id": "S10", "room_type": "bedroom",
        "style_blend": {"COVAARTDECO": 0.85, "COVAMIDCENTURY": 0.15},
        "personalization": "Dramatic geometric wallpaper on headboard wall · gold arc floor lamp · emerald velvet bed frame · mirrored side tables · art deco sconces · jewel tone throw",
        "flux_prompt_suffix": "geometric art deco wallpaper, gold arc floor lamp, emerald velvet bed frame, mirrored nightstands, brass sconces, jewel tones, glamorous dark bedroom",
    },
    {
        "id": "S11", "room_type": "living_room",
        "style_blend": {"COVASCANDINAV": 0.88, "COVAMINIMAL": 0.12},
        "personalization": "Single abstract canvas in muted terracotta · low-profile sofa in light grey · blonde wood coffee table · single arc floor lamp · one large fiddle leaf · calm Nordic palette",
        "flux_prompt_suffix": "single abstract terracotta canvas, light grey low sofa, blonde wood coffee table, arc floor lamp, fiddle leaf fig, Scandinavian calm palette, hygge atmosphere",
    },
    {
        "id": "S12", "room_type": "home_office",
        "style_blend": {"COVAINDUSTRIAL": 0.80, "COVABOHEMIAN": 0.20},
        "personalization": "Pegboard tool wall with plants growing through it · reclaimed wood desk · vintage map as wall art · exposed pipe shelving · potted succulents across windowsill · Edison desk lamp",
        "flux_prompt_suffix": "pegboard wall with small plants, reclaimed wood desk, vintage world map art, exposed pipe shelving, succulents on windowsill, Edison desk lamp, industrial creative studio",
    },
    {
        "id": "S13", "room_type": "bedroom",
        "style_blend": {"COVACOASTAL": 0.85, "COVAFARMHOUSE": 0.15},
        "personalization": "Surfboard leaning against wall · rope-wrapped mirror · white and navy stripe bedding · weathered driftwood art above bed · rattan pendant light · sandy textured rug",
        "flux_prompt_suffix": "surfboard leaning on wall, rope mirror, navy stripe bedding, driftwood wall art, rattan pendant, sandy textured rug, bright coastal bedroom",
    },
    {
        "id": "S14", "room_type": "living_room",
        "style_blend": {"COVAJAPANDI": 0.70, "COVABIOPHILIC": 0.30},
        "personalization": "Acoustic guitar on wall-mount display · Japanese shoji screen room divider · 8 plants of varied heights · bonsai tree on coffee table · warm low ambient lighting · no TV",
        "flux_prompt_suffix": "acoustic guitar wall mount display, shoji screen divider, many plants varied heights, bonsai on coffee table, warm low ambient light, no television, Japandi living room",
    },
    {
        "id": "S15", "room_type": "bedroom",
        "style_blend": {"COVABOHEMIAN": 0.78, "COVAMIDCENTURY": 0.22},
        "personalization": "Sneaker wall display — 12 pairs on floating shelves · vinyl record collection along opposite wall · neon sign above bed · projector instead of TV · custom sneaker art portrait · warm gaming ambiance",
        "flux_prompt_suffix": "sneaker wall display floating shelves 12 pairs, vinyl record wall collection, neon sign headboard glow, projector mount, custom portrait art, warm gaming bedroom aesthetic",
    },
]


# ---------- helpers ----------

def find_source_images() -> list[Path]:
    """Return 15 source webps sorted alphabetically."""
    images = sorted(SOURCE_DIR.glob("*.webp"))
    return images[:15]


def convert_to_jpg(src: Path, dst: Path, max_edge: int = 1536, quality: int = 88) -> None:
    """Copy src as JPEG, resize if longest edge > max_edge."""
    img = Image.open(src)
    if img.mode != "RGB":
        img = img.convert("RGB")
    w, h = img.size
    m = max(w, h)
    if m > max_edge:
        scale = max_edge / m
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    img.save(dst, "JPEG", quality=quality, optimize=True)


def fal_upload(path: Path) -> Optional[str]:
    try:
        import fal_client  # type: ignore
    except ImportError:
        print("[fatal] fal_client not installed. Run: pip install --break-system-packages fal-client", file=sys.stderr)
        sys.exit(1)
    os.environ["FAL_KEY"] = FAL_KEY  # type: ignore[arg-type]
    try:
        return fal_client.upload_file(str(path))
    except Exception as exc:
        print(f"[fal_upload] {path.name}: {exc}", file=sys.stderr)
        return None


def download(url: str, path: Path, timeout: int = 120) -> bool:
    try:
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        path.write_bytes(r.content)
        # re-save as JPG to ensure browser compatibility
        try:
            img = Image.open(path)
            if img.mode != "RGB":
                img = img.convert("RGB")
            img.save(path, "JPEG", quality=90, optimize=True)
        except Exception:
            pass
        return True
    except Exception as exc:
        print(f"[download] {url} -> {exc}", file=sys.stderr)
        return False


def call_empty_room(image_url: str) -> dict[str, Any]:
    """Returns {"ok": bool, "url": str|None, "raw": dict, "error": str|None}."""
    try:
        r = requests.post(
            COVA_EMPTY_ROOM_V3_URL,  # type: ignore[arg-type]
            json={"image_url": image_url},
            timeout=300,
        )
        if r.status_code != 200:
            return {"ok": False, "url": None, "raw": None, "error": f"HTTP {r.status_code}: {r.text[:300]}"}
        data = r.json()
        output = data.get("output")
        nested = output.get("url") if isinstance(output, dict) else None
        url = (
            data.get("empty_room_url")
            or data.get("url")
            or data.get("output_url")
            or nested
        )
        if not url:
            return {"ok": False, "url": None, "raw": data, "error": f"no url in response; keys={list(data.keys())}"}
        return {"ok": True, "url": url, "raw": data, "error": None}
    except Exception as exc:
        return {"ok": False, "url": None, "raw": None, "error": str(exc)}


def call_redesign(
    empty_room_url: str,
    room_type: str,
    style_blend: dict[str, float],
    personalization_text: str,
    flux_prompt_suffix: str,
) -> dict[str, Any]:
    url = f"{COVA_REDESIGN_URL.rstrip('/')}/v1/generate_redesign"  # type: ignore[union-attr]
    freetext = f"{personalization_text} | Key visual elements: {flux_prompt_suffix}"
    archetype_key = max(style_blend.items(), key=lambda kv: kv[1])[0]
    payload = {
        "empty_room_url": empty_room_url,
        "room_type": room_type,
        "style_blend": style_blend,
        "archetype_key": archetype_key,
        "personalization": {
            "freetext": freetext,
        },
    }
    try:
        r = requests.post(url, json=payload, timeout=900)
        if r.status_code != 200:
            return {"ok": False, "url": None, "raw": None, "error": f"HTTP {r.status_code}: {r.text[:400]}"}
        data = r.json()
        render_url = (
            data.get("render_url")
            or data.get("redesign_url")
            or data.get("url")
            or data.get("output_url")
            or data.get("final_url")
        )
        if not render_url:
            return {"ok": False, "url": None, "raw": data, "error": f"no url; keys={list(data.keys())}"}
        return {"ok": True, "url": render_url, "raw": data, "error": None}
    except Exception as exc:
        return {"ok": False, "url": None, "raw": None, "error": str(exc)}


def validate_empty_room(jpg_path: Path) -> dict[str, Any]:
    """Ask Claude Haiku Vision if the empty room is actually empty."""
    try:
        data = jpg_path.read_bytes()
        b64 = base64.b64encode(data).decode("ascii")
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_KEY,  # type: ignore[arg-type]
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 40,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": b64,
                                },
                            },
                            {
                                "type": "text",
                                "text": (
                                    "Is this room empty of furniture and personal items? "
                                    "Ignore built-in architectural features (walls, floor, ceiling, "
                                    "windows, doors, built-in shelving, fireplace, radiators). "
                                    "Answer with exactly one word: EMPTY or NOT_EMPTY"
                                ),
                            },
                        ],
                    }
                ],
            },
            timeout=60,
        )
        if r.status_code != 200:
            return {"verdict": "UNKNOWN", "reason": f"HTTP {r.status_code}: {r.text[:200]}"}
        body = r.json()
        text = "".join(
            c.get("text", "") for c in body.get("content", []) if c.get("type") == "text"
        ).strip().upper()
        if "NOT_EMPTY" in text or "NOT EMPTY" in text:
            return {"verdict": "NOT_EMPTY", "reason": text[:200]}
        if "EMPTY" in text:
            return {"verdict": "EMPTY", "reason": text[:200]}
        return {"verdict": "UNKNOWN", "reason": text[:200]}
    except Exception as exc:
        return {"verdict": "UNKNOWN", "reason": str(exc)}


# ---------- main ----------

def main() -> None:
    sources = find_source_images()
    if not sources:
        print("[fatal] no source images found in bench/rooms/", file=sys.stderr)
        sys.exit(1)

    print(f"found {len(sources)} source images; running {min(len(sources), len(SCENARIO_MAP))} scenarios")
    results: list[dict[str, Any]] = []
    started = time.time()

    for idx, src_path in enumerate(sources):
        if idx >= len(SCENARIO_MAP):
            break
        scenario = SCENARIO_MAP[idx]
        img_id = f"IMG_{idx + 1:02d}"
        short_id = scenario["id"]
        elapsed = time.time() - started
        print(f"\n[{img_id} / {short_id}] {src_path.name} ({scenario['room_type']}) · elapsed {elapsed:.0f}s", flush=True)

        entry: dict[str, Any] = {
            "id": img_id,
            "scenario_id": short_id,
            "source_path": str(src_path),
            "source_name": src_path.name,
            "room_type": scenario["room_type"],
            "style_blend": scenario["style_blend"],
            "personalization": scenario["personalization"],
            "flux_prompt_suffix": scenario["flux_prompt_suffix"],
            "original_rel": f"original/{img_id}.jpg",
            "empty_rel": None,
            "redesign_rel": None,
            "fal_upload_url": None,
            "empty_room_url": None,
            "redesign_url": None,
            "empty_validation": None,
            "errors": [],
            "timings_sec": {},
        }

        # --- copy source to gallery/original ---
        try:
            dst_orig = ORIGINAL_DIR / f"{img_id}.jpg"
            convert_to_jpg(src_path, dst_orig)
        except Exception as exc:
            entry["errors"].append(f"copy_source: {exc}")
            results.append(entry)
            _persist(results)
            continue

        # --- upload to fal ---
        t0 = time.time()
        fal_url = fal_upload(dst_orig)
        entry["timings_sec"]["fal_upload"] = round(time.time() - t0, 2)
        if not fal_url:
            entry["errors"].append("fal_upload returned None")
            results.append(entry)
            _persist(results)
            continue
        entry["fal_upload_url"] = fal_url
        print(f"  fal: {fal_url[:80]}...", flush=True)

        # --- empty room ---
        t0 = time.time()
        empty_res = call_empty_room(fal_url)
        entry["timings_sec"]["empty_room"] = round(time.time() - t0, 2)
        if not empty_res["ok"]:
            entry["errors"].append(f"empty_room: {empty_res['error']}")
            print(f"  ERROR empty_room: {empty_res['error']}", flush=True)
            results.append(entry)
            _persist(results)
            continue
        empty_room_url = empty_res["url"]
        entry["empty_room_url"] = empty_room_url
        print(f"  empty: {empty_room_url[:80]}...", flush=True)

        # --- download empty room ---
        empty_path = EMPTY_DIR / f"{img_id}.jpg"
        if not download(empty_room_url, empty_path):
            entry["errors"].append("empty_room download failed")
            results.append(entry)
            _persist(results)
            continue
        entry["empty_rel"] = f"empty/{img_id}.jpg"

        # --- validate empty room ---
        t0 = time.time()
        validation = validate_empty_room(empty_path)
        entry["timings_sec"]["empty_validation"] = round(time.time() - t0, 2)
        entry["empty_validation"] = validation
        print(f"  validation: {validation['verdict']}", flush=True)

        # --- redesign (run even if NOT_EMPTY, per spec) ---
        t0 = time.time()
        redesign_res = call_redesign(
            empty_room_url,
            scenario["room_type"],
            scenario["style_blend"],
            scenario["personalization"],
            scenario["flux_prompt_suffix"],
        )
        entry["timings_sec"]["redesign"] = round(time.time() - t0, 2)
        if not redesign_res["ok"]:
            entry["errors"].append(f"redesign: {redesign_res['error']}")
            print(f"  ERROR redesign: {redesign_res['error']}", flush=True)
            results.append(entry)
            _persist(results)
            continue
        render_url = redesign_res["url"]
        entry["redesign_url"] = render_url
        print(f"  redesign: {render_url[:80]}...", flush=True)

        # --- download redesign ---
        redesign_path = REDESIGN_DIR / f"{img_id}.jpg"
        if not download(render_url, redesign_path):
            entry["errors"].append("redesign download failed")
            results.append(entry)
            _persist(results)
            continue
        entry["redesign_rel"] = f"redesign/{img_id}.jpg"

        results.append(entry)
        _persist(results)
        print(f"  DONE — empty {entry['timings_sec'].get('empty_room', '?')}s · redesign {entry['timings_sec'].get('redesign', '?')}s", flush=True)

    total_elapsed = time.time() - started
    print(f"\n=== all 15 done in {total_elapsed:.0f}s ===")
    print(f"results: {RESULTS_PATH}")


def _persist(results: list[dict[str, Any]]) -> None:
    payload = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "count": len(results),
        "completed": sum(1 for r in results if r.get("redesign_rel")),
        "empty_verified": sum(
            1 for r in results if (r.get("empty_validation") or {}).get("verdict") == "EMPTY"
        ),
        "errors": sum(1 for r in results if r.get("errors")),
        "results": results,
    }
    RESULTS_PATH.write_text(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
