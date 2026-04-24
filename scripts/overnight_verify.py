"""Cova V3 autonomous verifier.

Budget-gated end-to-end verifier for the V3 redesign pipeline. Tests
Gemini empty-room + V3 redesign against 15 bench rooms with rotating
scenarios. Downloads every render, verifies with Claude Vision against
a strict 10-dim rubric.

Usage:
    pip install --break-system-packages fal-client anthropic pillow requests numpy python-dotenv
    python3 /tmp/cova_verify.py

Env (loaded from apps/web/.env.local):
    FAL_KEY, ANTHROPIC_API_KEY, COVA_REDESIGN_URL, COVA_EMPTY_ROOM_V3_URL,
    COVA_COMPOSITE_ART_URL

Stops when budget ≥ $35. Writes:
    docs/OVERNIGHT_VERIFICATION_REPORT_<ts>.md
    docs/OVERNIGHT_VERIFICATION_LOG.txt
    bench/overnight_verification/images/iter<N>_<room_type>_<scenario>.jpg
"""

from __future__ import annotations

import base64
import io
import json
import os
import random
import sys
import time
from pathlib import Path
from typing import Any, Optional

import requests

ROOT = Path("/Users/daksh/Desktop/cova")
IMAGES_DIR = ROOT / "bench" / "overnight_verification" / "images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

BUDGET_CAP_USD = 35.0

# ---------- env loader ----------


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
COVA_REDESIGN_URL = os.environ.get("COVA_REDESIGN_URL")
COVA_EMPTY_ROOM_V3_URL = os.environ.get("COVA_EMPTY_ROOM_V3_URL")

if not FAL_KEY:
    print("[fatal] FAL_KEY missing", file=sys.stderr)
    sys.exit(1)
if not ANTHROPIC_KEY:
    print("[fatal] ANTHROPIC_API_KEY missing", file=sys.stderr)
    sys.exit(1)

# ---------- room discovery ----------


def find_bench_rooms() -> list[Path]:
    candidates: list[Path] = []
    for patt in ("BENCH_room*.jpg", "ORIGINAL_room*.webp", "*.jpg", "*.webp", "*.png"):
        for root in [ROOT / "benchmarks", ROOT / "bench" / "rooms", ROOT]:
            if root.exists():
                for p in root.rglob(patt):
                    if "overnight_verification" in str(p):
                        continue
                    if p.stat().st_size > 50_000 and p.stat().st_size < 15_000_000:
                        candidates.append(p)
    # dedupe
    seen: set[str] = set()
    out: list[Path] = []
    for p in candidates:
        s = str(p.resolve())
        if s not in seen:
            seen.add(s)
            out.append(p)
        if len(out) >= 15:
            break
    return out


# ---------- Claude Vision helpers ----------


def vision_call(
    image_bytes: bytes,
    user_prompt: str,
    model: str = "claude-sonnet-4-5",
    max_tokens: int = 800,
) -> Optional[dict[str, Any]]:
    b64 = base64.b64encode(image_bytes).decode("ascii")
    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "max_tokens": max_tokens,
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
                        {"type": "text", "text": user_prompt},
                    ],
                }
            ],
        },
        timeout=60,
    )
    if resp.status_code != 200:
        return None
    data = resp.json()
    text = "".join(
        [c.get("text", "") for c in data.get("content", []) if c.get("type") == "text"]
    )
    return {"text": text, "raw": data}


def classify_room_type(image_bytes: bytes) -> str:
    r = vision_call(
        image_bytes,
        "What room type is this? Reply with exactly one of: bedroom, living_room, home_office, dining_room, bathroom",
        model="claude-haiku-4-5-20251001",
        max_tokens=20,
    )
    if not r:
        return "bedroom"
    t = r["text"].strip().lower()
    for canon in ["living_room", "home_office", "dining_room", "bathroom", "bedroom"]:
        if canon.replace("_", " ") in t or canon in t:
            return canon
    return "bedroom"


def strict_rubric(
    image_bytes: bytes,
    room_type: str,
    personalization: dict[str, Any],
) -> Optional[dict[str, Any]]:
    user = f"""Score this final render strictly (1-5, 5 best). Be a strict interior design professional.

Room type expected: {room_type}
Personalization requested: {json.dumps(personalization)[:400]}

Return ONLY JSON:
{{
  "scores": {{
    "room_type_correct": 1-5,
    "hero_furniture_quality": 1-5,
    "style_accuracy": 1-5,
    "decor_density": 1-5,
    "lighting_quality": 1-5,
    "personalization_features_visible": 1-5,
    "lived_in_quality": 1-5,
    "editorial_photography_quality": 1-5,
    "perspective_and_scale": 1-5,
    "art_accuracy": 1-5
  }},
  "features": {{
    "room_type_correct": true|false,
    "personalization_visible": true|false,
    "lighting_matches": true|false,
    "life_objects_present": true|false,
    "furniture_scale_realistic": true|false
  }},
  "critical_failures": ["..."],
  "specific_problems": ["..."]
}}
"""
    r = vision_call(image_bytes, user, model="claude-sonnet-4-5", max_tokens=900)
    if not r:
        return None
    text = r["text"]
    s = text.find("{")
    e = text.rfind("}")
    if s < 0 or e < 0:
        return None
    try:
        return json.loads(text[s : e + 1])
    except json.JSONDecodeError:
        return None


# ---------- fal upload ----------


def fal_upload(local_path: Path) -> Optional[str]:
    import fal_client  # type: ignore
    fal_client.api_key = FAL_KEY
    os.environ["FAL_KEY"] = FAL_KEY
    try:
        return fal_client.upload_file(str(local_path))
    except Exception as exc:
        print(f"[fal_upload] failed: {exc}", file=sys.stderr)
        return None


# ---------- Scenarios ----------


SCENARIOS: dict[str, list[dict[str, Any]]] = {
    "bedroom": [
        {
            "name": "japandi_art_plants_warm",
            "style_blend": {"COVAJAPANDI": 0.85, "COVASCANDINAV": 0.15},
            "personalization": {
                "art": {"layout": "single", "source": "describe", "images": [], "frame_style": "natural_wood"},
                "lighting": {"mood": "warm_cozy"},
                "identity_objects": [{"type": "plants", "quantity": "few"}],
            },
        },
        {
            "name": "artdeco_music_tech_moody",
            "style_blend": {"COVAARTDECO": 0.80, "COVAINDUSTRIAL": 0.20},
            "personalization": {
                "art": {"layout": "single", "source": "describe", "images": [], "frame_style": "black"},
                "smart_products": [{"type": "hue_strips", "room_context": "accent"}, {"type": "smart_speaker", "room_context": "ambient"}],
                "lighting": {"mood": "dramatic_moody"},
            },
        },
        {
            "name": "mcm_vinyl_sneakers",
            "style_blend": {"COVAMIDCENTURY": 0.90, "COVAINDUSTRIAL": 0.10},
            "personalization": {
                "identity_objects": [
                    {"type": "vinyl", "quantity": "many"},
                    {"type": "sneakers", "quantity": "few"},
                ],
            },
        },
    ],
    "living_room": [
        {
            "name": "japandi_triptych_tv_warm",
            "style_blend": {"COVAJAPANDI": 0.75, "COVASCANDINAV": 0.25},
            "personalization": {
                "art": {"layout": "triptych", "source": "describe", "images": [], "frame_style": "natural_wood"},
                "smart_products": [{"type": "tv", "size": "large", "room_context": "focal"}],
                "lighting": {"mood": "warm_cozy"},
            },
        },
        {
            "name": "biophilic_guitar_plants_bright",
            "style_blend": {"COVABIOPHILIC": 0.85, "COVAJAPANDI": 0.15},
            "personalization": {
                "identity_objects": [
                    {"type": "guitar", "quantity": "few"},
                    {"type": "plants", "quantity": "extensive"},
                ],
                "lighting": {"mood": "bright_natural"},
            },
        },
        {
            "name": "industrial_books_aeron",
            "style_blend": {"COVAINDUSTRIAL": 0.80, "COVAMIDCENTURY": 0.20},
            "personalization": {
                "specific_items": [
                    {"product_name": "Herman Miller Aeron Chair", "product_image_url": "", "product_url": ""},
                ],
                "identity_objects": [{"type": "books", "quantity": "many"}],
            },
        },
    ],
    "home_office": [
        {
            "name": "minimal_monitor_speaker_books",
            "style_blend": {"COVAMINIMAL": 0.85, "COVASCANDINAV": 0.15},
            "personalization": {
                "smart_products": [
                    {"type": "monitor", "size": "large", "room_context": "desk"},
                    {"type": "smart_speaker", "room_context": "ambient"},
                ],
                "identity_objects": [{"type": "books", "quantity": "many"}],
                "lighting": {"mood": "bright_natural"},
            },
        },
    ],
    "dining_room": [
        {
            "name": "farmhouse_warm",
            "style_blend": {"COVAFARMHOUSE": 0.80, "COVAJAPANDI": 0.20},
            "personalization": {
                "lighting": {"mood": "warm_cozy"},
                "identity_objects": [{"type": "plants", "quantity": "few"}],
            },
        },
    ],
    "bathroom": [
        {
            "name": "coastal_bright",
            "style_blend": {"COVACOASTAL": 0.85, "COVAMINIMAL": 0.15},
            "personalization": {
                "lighting": {"mood": "bright_natural"},
                "identity_objects": [{"type": "plants", "quantity": "few"}],
            },
        },
    ],
}


# ---------- pipeline callers ----------


def call_empty_room(image_url: str) -> Optional[dict[str, Any]]:
    if not COVA_EMPTY_ROOM_V3_URL:
        return None
    try:
        r = requests.post(
            COVA_EMPTY_ROOM_V3_URL,
            json={"image_url": image_url},
            timeout=180,
        )
        if r.status_code != 200:
            return {"error": f"{r.status_code}: {r.text[:200]}"}
        return r.json()
    except Exception as exc:
        return {"error": str(exc)}


def call_redesign(
    empty_room_url: str,
    room_type: str,
    style_blend: dict[str, float],
    personalization: dict[str, Any],
) -> Optional[dict[str, Any]]:
    if not COVA_REDESIGN_URL:
        return None
    url = f"{COVA_REDESIGN_URL.rstrip('/')}/v1/generate_redesign"
    payload = {
        "empty_room_url": empty_room_url,
        "room_type": room_type,
        "style_blend": style_blend,
        "personalization": personalization,
        "archetype_key": max(style_blend.items(), key=lambda kv: kv[1])[0],
    }
    try:
        r = requests.post(url, json=payload, timeout=600)
        if r.status_code != 200:
            return {"error": f"{r.status_code}: {r.text[:200]}"}
        return r.json()
    except Exception as exc:
        return {"error": str(exc)}


# ---------- report ----------


def download(url: str, path: Path) -> bool:
    try:
        r = requests.get(url, timeout=90)
        r.raise_for_status()
        path.write_bytes(r.content)
        return True
    except Exception as exc:
        print(f"[download] {url} -> {exc}", file=sys.stderr)
        return False


def main() -> None:
    ts = time.strftime("%Y%m%d_%H%M%S")
    report_path = ROOT / "docs" / f"OVERNIGHT_VERIFICATION_REPORT_{ts}.md"
    log_path = ROOT / "docs" / "OVERNIGHT_VERIFICATION_LOG.txt"

    rooms = find_bench_rooms()
    if not rooms:
        print("[fatal] no bench rooms found", file=sys.stderr)
        sys.exit(1)
    print(f"found {len(rooms)} bench rooms", flush=True)

    # Classify all rooms up front.
    classifications: list[tuple[Path, str]] = []
    for p in rooms:
        raw = p.read_bytes()
        rt = classify_room_type(raw)
        classifications.append((p, rt))
        print(f"  {p.name}: {rt}", flush=True)

    spent = 0.0
    iteration = 0
    results: list[dict[str, Any]] = []

    report_lines: list[str] = [
        f"# Overnight V3 Verification — {ts}",
        "",
        f"- Found {len(rooms)} bench rooms",
        f"- Budget cap: ${BUDGET_CAP_USD}",
        "",
    ]
    report_path.write_text("\n".join(report_lines))

    with log_path.open("a") as log:
        log.write(f"--- Run {ts} ---\n")
        log.write(f"rooms={len(rooms)} cap=${BUDGET_CAP_USD}\n")

        for room_path, room_type in classifications:
            if spent >= BUDGET_CAP_USD:
                log.write(f"BUDGET HIT at iter={iteration} spent=${spent:.4f}\n")
                break
            scenarios = SCENARIOS.get(room_type, SCENARIOS["bedroom"])
            scenario = scenarios[iteration % len(scenarios)]
            iteration += 1

            log.write(
                f"\niter={iteration} room={room_path.name} room_type={room_type} "
                f"scenario={scenario['name']}\n"
            )
            print(
                f"[{iteration}] {room_path.name} {room_type}/{scenario['name']} spent=${spent:.2f}",
                flush=True,
            )

            try:
                source_url = fal_upload(room_path)
                if not source_url:
                    log.write("  skip: fal_upload failed\n")
                    continue

                empty = call_empty_room(source_url)
                if not empty or "error" in (empty or {}):
                    log.write(f"  empty_room error: {empty}\n")
                    continue
                empty_url = (
                    empty.get("empty_room_url")
                    or empty.get("url")
                    or empty.get("output_url")
                )
                if not empty_url:
                    log.write(f"  empty_room missing url keys={list(empty.keys())}\n")
                    continue
                spent += 0.20  # approx empty-room cost

                redesign = call_redesign(
                    empty_url,
                    room_type,
                    scenario["style_blend"],
                    scenario["personalization"],
                )
                if not redesign or "error" in (redesign or {}):
                    log.write(f"  redesign error: {redesign}\n")
                    continue
                render_url = (
                    redesign.get("render_url")
                    or redesign.get("redesign_url")
                )
                if not render_url:
                    log.write(f"  redesign missing url keys={list(redesign.keys())}\n")
                    continue
                cost = float(redesign.get("cost_usd", 0.40))
                spent += cost

                # Download
                out_path = IMAGES_DIR / f"iter{iteration:03d}_{room_type}_{scenario['name']}.jpg"
                if not download(render_url, out_path):
                    log.write("  download failed\n")
                    continue

                raw = out_path.read_bytes()
                rubric = strict_rubric(raw, room_type, scenario["personalization"])
                spent += 0.02
                scores = (rubric or {}).get("scores") or {}
                features = (rubric or {}).get("features") or {}
                composite = (
                    sum(scores.values()) / max(len(scores), 1) if scores else 0
                )
                entry = {
                    "iteration": iteration,
                    "room_path": str(room_path),
                    "room_type": room_type,
                    "scenario": scenario["name"],
                    "style_blend": scenario["style_blend"],
                    "personalization": scenario["personalization"],
                    "render_url": render_url,
                    "image_path": str(out_path),
                    "scores": scores,
                    "features": features,
                    "critical_failures": (rubric or {}).get("critical_failures", []),
                    "specific_problems": (rubric or {}).get("specific_problems", []),
                    "composite": round(composite, 3),
                    "cost_usd": round(cost, 4),
                }
                results.append(entry)
                log.write(
                    f"  DONE composite={composite:.2f} features={features} cost=${cost:.4f} spent=${spent:.4f}\n"
                )

                # Append to report.
                with report_path.open("a") as rep:
                    rep.write(
                        f"\n## Iteration {iteration} — {room_type}/{scenario['name']}\n"
                    )
                    rep.write(f"- Composite: **{composite:.2f}/5**\n")
                    rep.write(f"- Image: {out_path}\n")
                    rep.write(f"- Scores: `{json.dumps(scores)}`\n")
                    rep.write(f"- Features: `{json.dumps(features)}`\n")
                    if entry["critical_failures"]:
                        rep.write(f"- Critical: {entry['critical_failures']}\n")

            except Exception as exc:
                log.write(f"  exception: {exc}\n")
                continue

    # Final summary.
    passed = [r for r in results if r["composite"] >= 3.5]
    room_correct = [
        r for r in results if r.get("features", {}).get("room_type_correct") is True
    ]
    with report_path.open("a") as rep:
        rep.write("\n---\n\n## Summary\n")
        rep.write(f"- Iterations: {len(results)}\n")
        rep.write(f"- Pass rate (composite ≥ 3.5): {len(passed)}/{len(results)}\n")
        rep.write(f"- Room type correct: {len(room_correct)}/{len(results)}\n")
        if results:
            avg = sum(r["composite"] for r in results) / len(results)
            rep.write(f"- Avg composite: {avg:.2f}\n")
        rep.write(f"- Total spend: ${spent:.2f}\n")
    print(f"report: {report_path}")
    print(f"log: {log_path}")


if __name__ == "__main__":
    main()
