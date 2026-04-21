"""Render-upgrade validation bench.

Calls the production cova-empty-room + cova-redesign Modal services on
the 15 bench rooms + target room, evaluates with a Sonnet
designer-preference critic against the 4 Collov AI references, and
writes per-room PASS/FAIL + overall gate results.

Usage:
  python bench/scripts/run_render_upgrade_bench.py                      # all 16
  python bench/scripts/run_render_upgrade_bench.py --only target        # one
  python bench/scripts/run_render_upgrade_bench.py --only target,room-01
  python bench/scripts/run_render_upgrade_bench.py --no-judge           # skip critic
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Optional

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

EMPTY_ROOM_URL = os.environ.get(
    "COVA_EMPTY_ROOM_URL",
    "https://cova-interior--cova-empty-room-emptyroom-api.modal.run",
)
REDESIGN_URL = os.environ.get(
    "COVA_REDESIGN_URL",
    "https://cova-interior--cova-redesign-redesign-api.modal.run",
)

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get(
    "NEXT_PUBLIC_SUPABASE_URL"
)
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY"
)

ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY")

COLLOV_REFS = [
    ROOT / "benchmarks" / "competitors" / "collovai" / "collov_1.png",
    ROOT / "benchmarks" / "competitors" / "collovai" / "collov_2.png",
    ROOT / "benchmarks" / "competitors" / "collovai" / "collov_3.png",
    ROOT / "benchmarks" / "competitors" / "collovai" / "collov_4.png",
]

# (room_id, image_path, archetype, room_type)
BENCH_ROOMS: list[tuple[str, str, str, str]] = [
    ("target", "benchmarks/target_room.jpg", "COVAJAPANDI", "bedroom"),
    ("room-01", "bench/rooms/room-01_bedroom-cat-popcorn.webp", "COVAJAPANDI", "bedroom"),
    ("room-02", "bench/rooms/room-02_livingroom-piano-joydivision.webp", "COVAMIDCENTURY", "living room"),
    ("room-03", "bench/rooms/room-03_livingroom-leather-herringbone.webp", "COVACOASTAL", "living room"),
    ("room-04", "bench/rooms/room-04_attic-music-sloped.webp", "COVABOHEMIAN", "loft bedroom"),
    ("room-05", "bench/rooms/room-05_office-gallery-rug.webp", "COVAFARMHOUSE", "home office"),
    ("room-06", "bench/rooms/room-06_empty-bay-window.webp", "COVAMINIMAL", "living room"),
    ("room-07", "bench/rooms/room-07_bedroom-desk-carpet.webp", "COVAJAPANDI", "bedroom"),
    ("room-08", "bench/rooms/room-08_livingroom-papasan-floral.webp", "COVABOHEMIAN", "living room"),
    ("room-09", "bench/rooms/room-09_gaming-led-popcorn.webp", "COVAINDUSTRIAL", "bedroom"),
    ("room-10", "bench/rooms/room-10_tv-fireplace-dark.webp", "COVAARTDECO", "living room"),
    ("room-11", "bench/rooms/room-11_green-velvet-gallery.webp", "COVASCANDINAV", "living room"),
    ("room-12", "bench/rooms/room-12_bedroom-piano-led.webp", "COVAMIDCENTURY", "bedroom"),
    ("room-13", "bench/rooms/room-13_exposed-brick-arched.webp", "COVAINDUSTRIAL", "living room"),
    ("room-14", "bench/rooms/room-14_stacked-stone-empty.webp", "COVAARTDECO", "living room"),
    ("room-15", "bench/rooms/room-15_wood-paneling-twin-beds.webp", "COVAFARMHOUSE", "bedroom"),
]

OUT_DIR = ROOT / "benchmarks" / "render-upgrade-outputs"
CRITIQUE_DIR = ROOT / "docs" / "render-upgrade" / "critiques"
COST_LOG = ROOT / "docs" / "render-upgrade" / "cost-log.json"
COST_CAP = 60.0

HARD_KEYS = (
    "architectural_fidelity",
    "furniture_removal",
    "style_commitment",
    "editorial_density",
    "photorealism",
)


def ensure_supabase_client():
    from supabase import create_client
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise RuntimeError(
            "SUPABASE_URL + SUPABASE_SERVICE_KEY required (export from apps/web/.env.local)"
        )
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def upload_input_image(image_path: Path) -> str:
    """Put the local bench image in the Supabase public `room-photos` bucket."""
    sb = ensure_supabase_client()
    content = image_path.read_bytes()
    digest = hashlib.md5(content).hexdigest()[:12]
    suffix = image_path.suffix.lower()
    ct = (
        "image/webp" if suffix == ".webp"
        else "image/png" if suffix == ".png"
        else "image/jpeg"
    )
    path = f"render-upgrade/inputs/{digest}{suffix}"
    sb.storage.from_("room-photos").upload(
        path=path,
        file=content,
        file_options={"content-type": ct, "upsert": "true"},
    )
    return sb.storage.from_("room-photos").get_public_url(path)


def append_cost(service: str, amount: float, meta: dict | None = None) -> None:
    COST_LOG.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "service": service,
        "usd": round(float(amount), 4),
        "meta": meta or {},
    }
    existing: list[dict] = []
    if COST_LOG.exists():
        try:
            loaded = json.loads(COST_LOG.read_text())
            if isinstance(loaded, dict):
                existing = list(loaded.get("entries", []))
            elif isinstance(loaded, list):
                existing = loaded
        except Exception:
            existing = []
    existing.append(entry)
    total = round(sum(x.get("usd", 0.0) for x in existing), 4)
    COST_LOG.write_text(json.dumps({"entries": existing, "total_usd": total}, indent=2))
    if total > COST_CAP:
        raise RuntimeError(f"COST CAP HIT: ${total:.2f} > ${COST_CAP:.2f}")


def call_empty_room(image_url: str) -> dict:
    payload = {"image_url": image_url}
    r = httpx.post(
        f"{EMPTY_ROOM_URL}/v1/generate_empty_room",
        json=payload,
        timeout=300.0,
        follow_redirects=True,
    )
    if r.status_code != 200:
        raise RuntimeError(f"empty_room {r.status_code}: {r.text[:500]}")
    res = r.json()
    append_cost("empty-room", res.get("cost_usd", 0.0), {"latency_ms": res.get("latency_ms")})
    return res


def call_redesign(
    empty_room_url: str,
    archetype: str,
    room_type: str,
    seed: Optional[int] = None,
    enable_stage_b: bool = False,
) -> dict:
    payload: dict[str, Any] = {
        "empty_room_url": empty_room_url,
        "archetype_key": archetype,
        "room_type": room_type,
        "budget_max": 5000.0,
        "enable_controlnet": True,
        "enable_stage_b": enable_stage_b,
    }
    if seed is not None:
        payload["seed"] = seed
    r = httpx.post(
        f"{REDESIGN_URL}/v1/generate_redesign",
        json=payload,
        timeout=420.0,
        follow_redirects=True,
    )
    if r.status_code != 200:
        raise RuntimeError(f"redesign {r.status_code}: {r.text[:500]}")
    res = r.json()
    append_cost("redesign", res.get("cost_usd", 0.0), {
        "latency_ms": res.get("latency_ms"),
        "provider": res.get("provider"),
        "stage_b_used": res.get("stage_b_used"),
        "inference_time_s": res.get("lora_inference_time_s"),
    })
    return res


def evaluate_render_vs_collov(
    original_path: Path,
    cova_render_url: str,
    collov_refs: list[Path],
    archetype: str,
    room_type: str,
    iteration: int,
    is_target_room: bool,
) -> dict:
    import anthropic

    if not ANTHROPIC_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)

    # Anthropic's image limit is 5 MB base64-encoded; flux-general JPEGs
    # routinely exceed this. Resize to max 1536 wide + JPEG quality 85
    # before sending. SHA identity doesn't matter for the critic.
    def _prep_bytes(rb: bytes, mt: str, max_dim: int = 1536) -> tuple[str, str]:
        import io as _io
        from PIL import Image as _Image
        if len(rb) <= 4_500_000:
            return base64.b64encode(rb).decode(), mt
        img = _Image.open(_io.BytesIO(rb)).convert("RGB")
        w, h = img.size
        scale = min(1.0, max_dim / max(w, h))
        if scale < 1.0:
            img = img.resize((int(w * scale), int(h * scale)), _Image.LANCZOS)
        buf = _io.BytesIO()
        img.save(buf, format="JPEG", quality=85, optimize=True)
        return base64.b64encode(buf.getvalue()).decode(), "image/jpeg"

    def file_b64(p: Path) -> tuple[str, str]:
        ext = p.suffix.lower()
        mt = (
            "image/png" if ext == ".png"
            else "image/webp" if ext == ".webp"
            else "image/jpeg"
        )
        return _prep_bytes(p.read_bytes(), mt)

    def url_b64(url: str) -> tuple[str, str]:
        rb = httpx.get(url, timeout=60).content
        head = rb[:8]
        if head.startswith(b"\x89PNG"):
            mt = "image/png"
        elif head.startswith(b"RIFF") and b"WEBP" in rb[:20]:
            mt = "image/webp"
        else:
            mt = "image/jpeg"
        return _prep_bytes(rb, mt)

    orig_b64, orig_mt = file_b64(original_path)
    render_b64, render_mt = url_b64(cova_render_url)
    collov_b64s = [file_b64(p) for p in collov_refs]

    comparison_note = (
        "Collov renders above are of the SAME original room; compare Cova's "
        "render to them directly."
        if is_target_room
        else "Collov renders above are of a DIFFERENT room; they are shown as a "
        "QUALITY STANDARD (Collov-level preservation, photorealism, completeness). "
        "Ask 'does Cova preserve architecture/remove furniture/commit to style/"
        "match editorial density at Collov's level?' — NOT 'does Cova look like "
        "those images'."
    )

    prompt_text = (
        f"You are a professional interior designer with 15 years of experience "
        f"staging luxury residential properties. You are evaluating two AI "
        f"redesign tools for potential use in your practice.\n\n"
        f"TASK: Compare Cova AI's render against Collov AI's renders.\n"
        f"Original room: {room_type}\n"
        f"Target style: {archetype}\n"
        f"{comparison_note}\n\n"
        f"You will see:\n"
        f"1. The original room photo\n"
        f"2. Four Collov AI redesigns (quality standard)\n"
        f"3. One Cova AI redesign (being evaluated)\n\n"
        f"Evaluate Cova's render on EXACTLY FIVE criteria. Each must PASS "
        f"(or at least WARN) for you to recommend Cova.\n\n"
        f"CRITERION 1 — ARCHITECTURAL FIDELITY (hard gate)\n"
        f"Is the Cova render recognizably the SAME room as the original?\n"
        f"- Same general wall color and finish (recognizable)\n"
        f"- Same ceiling height and feel\n"
        f"- Same window position and approximate size\n"
        f"- Same camera viewpoint and angle\n"
        f"- No walls that don't exist in the original\n"
        f"Score: PASS / WARN / FAIL\n\n"
        f"CRITERION 2 — FURNITURE REMOVAL QUALITY (hard gate)\n"
        f"Is ALL original furniture completely gone from the base? No ghost "
        f"outlines, remnants, bedding traces, or phantom shadows.\n"
        f"Score: PASS / WARN / FAIL\n\n"
        f"CRITERION 3 — STYLE COMMITMENT (hard gate)\n"
        f"Is the target style ({archetype}) executed with conviction? "
        f"Generic 'nice neutral room' = FAIL. Unmistakably committed = PASS.\n"
        f"Score: PASS / WARN / FAIL\n\n"
        f"CRITERION 4 — EDITORIAL DECOR DENSITY (hard gate)\n"
        f"Styled surface vignettes, wall art, layered textiles (minimum 3), "
        f"plants, multiple light sources, 'lived-in' details.\n"
        f"Score: PASS (Architectural Digest level) / WARN / FAIL (empty staging)\n\n"
        f"CRITERION 5 — PHOTOREALISM (hard gate)\n"
        f"Coherent lighting, proper material textures, realistic shadows, "
        f"no plastic/CGI feel.\n"
        f"Score: PASS / WARN / FAIL\n\n"
        f"FINAL QUESTION: If a client asked you to redesign their room and "
        f"showed you both outputs, which would you show them?\n"
        f"- COVA_WINS: Cova's render is the one I'd show\n"
        f"- COLLOV_WINS: Collov's render is better despite its generic style\n"
        f"- TIE: Both acceptable at different levels\n\n"
        f"PASS = all 5 criteria PASS or WARN, and COVA_WINS or TIE.\n"
        f"FAIL = any criterion FAIL, or COLLOV_WINS.\n\n"
        f"Respond in JSON only (no prose, no markdown fences):\n"
        f"{{\n"
        f'  "architectural_fidelity": {{"score": "PASS|WARN|FAIL", "reason": "..."}},\n'
        f'  "furniture_removal": {{"score": "PASS|WARN|FAIL", "reason": "..."}},\n'
        f'  "style_commitment": {{"score": "PASS|WARN|FAIL", "reason": "..."}},\n'
        f'  "editorial_density": {{"score": "PASS|WARN|FAIL", "reason": "..."}},\n'
        f'  "photorealism": {{"score": "PASS|WARN|FAIL", "reason": "..."}},\n'
        f'  "designer_preference": "COVA_WINS|COLLOV_WINS|TIE",\n'
        f'  "designer_preference_reason": "one sentence",\n'
        f'  "overall_pass": true|false,\n'
        f'  "what_cova_does_better": ["..."],\n'
        f'  "what_collov_does_better": ["..."],\n'
        f'  "specific_fixes_if_failing": ["..."]\n'
        f"}}"
    )

    content: list[dict[str, Any]] = [
        {"type": "text", "text": prompt_text},
        {"type": "text", "text": "ORIGINAL ROOM:"},
        {
            "type": "image",
            "source": {"type": "base64", "media_type": orig_mt, "data": orig_b64},
        },
        {"type": "text", "text": "COLLOV AI REDESIGNS (4 variants — quality standard):"},
    ]
    for b64, mt in collov_b64s:
        content.append(
            {"type": "image", "source": {"type": "base64", "media_type": mt, "data": b64}}
        )
    content.extend([
        {"type": "text", "text": "COVA AI REDESIGN (evaluate this):"},
        {
            "type": "image",
            "source": {"type": "base64", "media_type": render_mt, "data": render_b64},
        },
    ])

    resp = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=2000,
        messages=[{"role": "user", "content": content}],
    )
    text = resp.content[0].text.strip()
    # Strip optional ```json fencing
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    critique = json.loads(text)
    critique["iteration"] = iteration
    critique["cova_render_url"] = cova_render_url
    append_cost(
        "judge",
        0.08,
        {"iteration": iteration, "cova_render_url": cova_render_url},
    )
    return critique


def run_room(
    room_id: str,
    image_path: Path,
    archetype: str,
    room_type: str,
    max_retries: int = 3,
    run_judge: bool = True,
) -> dict:
    print(f"\n=== {room_id}  archetype={archetype}  room={room_type} ===", flush=True)
    uploaded = upload_input_image(image_path)
    print(f"  uploaded input: {uploaded}", flush=True)

    t0 = time.perf_counter()
    empty = call_empty_room(uploaded)
    empty_url = empty["empty_room_url"]
    print(f"  empty_room: {empty_url}  inpainter={empty.get('inpainter_used')}  "
          f"cov_raw={empty.get('mask_coverage_raw_pct'):.1f}%  "
          f"ssim={empty.get('architectural_patch_ssim'):.3f}  "
          f"latency_ms={empty.get('latency_ms')}", flush=True)

    room_dir = OUT_DIR / room_id
    room_dir.mkdir(parents=True, exist_ok=True)
    # Save empty-room locally
    try:
        eb = httpx.get(empty_url, timeout=60).content
        (room_dir / "empty.jpg").write_bytes(eb)
    except Exception as exc:
        print(f"  warn: could not save empty-room copy ({exc})")

    base_seed = int(hashlib.md5(f"{room_id}{archetype}".encode()).hexdigest()[:7], 16)

    all_critiques: list[dict] = []
    final: dict = {}
    for attempt in range(1, max_retries + 1):
        seed = base_seed + (attempt - 1) * 1000
        red = call_redesign(empty_url, archetype, room_type, seed=seed, enable_stage_b=False)
        render_url = red["redesign_url"]
        inference_time = red.get("lora_inference_time_s")
        provider = red.get("provider")
        print(
            f"  [attempt {attempt}] redesign: provider={provider} "
            f"stage_b={red.get('stage_b_used')} inf_time={inference_time}s "
            f"url={render_url}",
            flush=True,
        )

        # Save render locally
        try:
            rb = httpx.get(render_url, timeout=120).content
            (room_dir / f"redesign_attempt{attempt}.jpg").write_bytes(rb)
        except Exception as exc:
            print(f"  warn: could not save render copy ({exc})")

        if not run_judge:
            final = {
                "status": "no_judge",
                "attempts": attempt,
                "render_url": render_url,
                "provider": provider,
                "inference_time_s": inference_time,
                "empty_room_url": empty_url,
            }
            return final

        try:
            crit = evaluate_render_vs_collov(
                image_path, render_url, COLLOV_REFS,
                archetype, room_type, attempt,
                is_target_room=(room_id == "target"),
            )
        except Exception as exc:
            print(f"  judge failed: {exc}")
            crit = {
                "error": f"judge_failed: {type(exc).__name__}: {exc}",
                "iteration": attempt,
                "cova_render_url": render_url,
                "overall_pass": False,
            }

        (CRITIQUE_DIR / room_id).mkdir(parents=True, exist_ok=True)
        (CRITIQUE_DIR / room_id / f"attempt_{attempt}.json").write_text(
            json.dumps(crit, indent=2)
        )
        all_critiques.append(crit)

        if crit.get("overall_pass"):
            print(f"  ✅ PASSED on attempt {attempt}", flush=True)
            final = {
                "status": "pass",
                "attempts": attempt,
                "critique": crit,
                "render_url": render_url,
                "provider": provider,
                "inference_time_s": inference_time,
                "empty_room_url": empty_url,
            }
            break
        fails = [
            k for k in HARD_KEYS
            if isinstance(crit.get(k), dict) and crit[k].get("score") == "FAIL"
        ]
        pref = crit.get("designer_preference")
        print(f"  ❌ attempt {attempt} FAIL  hard_fails={fails}  pref={pref}", flush=True)
    else:
        def score_of(c: dict) -> int:
            return sum(
                1
                for k in HARD_KEYS
                if isinstance(c.get(k), dict) and c[k].get("score") in ("PASS", "WARN")
            )
        best = max(all_critiques, key=score_of) if all_critiques else {}
        final = {
            "status": "fail",
            "attempts": max_retries,
            "critique": best,
            "all_critiques": all_critiques,
            "render_url": best.get("cova_render_url"),
            "empty_room_url": empty_url,
        }

    final["elapsed_s"] = round(time.perf_counter() - t0, 1)
    return final


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated room ids")
    ap.add_argument("--no-judge", action="store_true")
    ap.add_argument("--max-retries", type=int, default=3)
    args = ap.parse_args()

    filter_ids: Optional[set[str]] = None
    if args.only:
        filter_ids = {s.strip() for s in args.only.split(",") if s.strip()}

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    CRITIQUE_DIR.mkdir(parents=True, exist_ok=True)

    results: dict[str, dict] = {}
    for (rid, rel_path, arch, room_type) in BENCH_ROOMS:
        if filter_ids and rid not in filter_ids:
            continue
        img_path = ROOT / rel_path
        if not img_path.exists():
            print(f"SKIP {rid}: missing {img_path}")
            continue
        try:
            results[rid] = run_room(
                rid, img_path, arch, room_type,
                max_retries=args.max_retries,
                run_judge=not args.no_judge,
            )
        except Exception as exc:
            print(f"ROOM {rid} ERROR: {exc}")
            results[rid] = {"status": "error", "error": str(exc)}

        # Persist incrementally
        (ROOT / "docs" / "render-upgrade" / "bench-results.json").write_text(
            json.dumps(results, indent=2)
        )

    print(f"\n=== SUMMARY ({len(results)} rooms) ===")
    passes = sum(1 for r in results.values() if r.get("status") == "pass")
    fails = sum(1 for r in results.values() if r.get("status") == "fail")
    errors = sum(1 for r in results.values() if r.get("status") == "error")
    no_judge = sum(1 for r in results.values() if r.get("status") == "no_judge")
    print(f"  pass={passes} fail={fails} error={errors} no_judge={no_judge}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
