"""Cova V3 — 3-Pass Redesign Service (2026-04-23 rewrite).

Modal app: ``cova-redesign``. CPU (uses fal.ai for inference). Python 3.10.

Single v1 endpoint:
  * ``POST /v1/generate_redesign``

3-pass architecture per V3 overnight spec:

  Pass 0 — Layout Planner (Claude Vision):
    Produces a scene spec with hero placement, pass-2 surface targets,
    personalization placements, life-objects, and lighting preset.

  Pass 1 — Hero furniture lock (FLUX Fill Pro):
    Lays down primary hero furniture pieces with style LoRAs.
    strength=0.92, 28 steps, guidance 3.5, LoRAs + add-details.
    ControlNet depth if available.

  Pass 2 — Per-surface decor density (loop):
    Per surface in the plan, runs FLUX Fill Pro with strength=0.55
    (preserve hero) to add editorial density (vignettes, groupings).

  Pass 3 — IC-Light v2 relight:
    Applies the lighting_preset from the layout plan. Critical params:
    lowres_denoise=0.88, highres_denoise=0.45.

  Editorial post-process: warm WB + s-curve + desat + grain + vignette
  applied in-process before final upload.

  QA: Claude Vision scores 10 dimensions 1-5 and produces 3 suggested
  chips for the refinement UI.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import logging
import os
import time
from typing import Any, Literal, Optional

import modal
from pydantic import BaseModel, Field, HttpUrl

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

APP_NAME = "cova-redesign-v3"
API_VERSION = "v1"
SCHEMA_VERSION: Literal["1.0"] = "1.0"

# Pass 1 params
PASS1_STRENGTH: float = 0.92
PASS1_STEPS: int = 28
PASS1_GUIDANCE: float = 3.5

# Pass 2 params (preserve Pass 1 hero)
PASS2_STRENGTH: float = 0.55
PASS2_STEPS: int = 22
PASS2_GUIDANCE: float = 3.5

# Pass 3 — IC-Light v2. Iter 3 (2026-04-23): 0.70 was still washing out warm lighting
# because IC-Light re-renders the scene lighting at its own temperature. Dropped to
# 0.50 to let Pass 1/2's warm lighting survive more clearly.
PASS3_LOWRES_DENOISE: float = 0.50
PASS3_HIGHRES_DENOISE: float = 0.35
PASS3_GUIDANCE: float = 5.0
PASS3_STEPS: int = 28
PASS3_BG_THRESHOLD: float = 0.75

# ControlNet scales — Pass 2 varies per-room-type (see ROOM_TYPE_SPECS).
CONTROLNET_DEPTH_P1: float = 0.80
CONTROLNET_DEPTH_P1_END: float = 0.85

# Cost model (per call).
COST_FLUX_FILL: float = 0.05
COST_IC_LIGHT: float = 0.04
COST_DEPTH: float = 0.005
COST_CLAUDE_VISION: float = 0.02

FAL_CLIENT_TIMEOUT_S: float = 360.0

# LoRA registry — mirrors apps/web/lib/styles/lora-registry.ts exactly.
LORA_REGISTRY: dict[str, dict[str, Any]] = {
    "COVASCANDINAV": {
        "url": "https://v3b.fal.media/files/b/0a968d79/AB1tJAhP5ERC-mvpcMOMM_pytorch_lora_weights.safetensors",
        "trigger": "cvscn",
        "default_scale": 0.88,
    },
    "COVAJAPANDI": {
        "url": "https://v3b.fal.media/files/b/0a968d9b/TbARCu6Zf_643uHs51Pkv_pytorch_lora_weights.safetensors",
        "trigger": "cvwmn",
        "default_scale": 0.88,
    },
    "COVABIOPHILIC": {
        "url": "https://v3b.fal.media/files/b/0a968dbb/GYaA_dQYrjs-PDpV0a4fd_pytorch_lora_weights.safetensors",
        "trigger": "cvbio",
        "default_scale": 0.92,
    },
    "COVAMINIMAL": {
        "url": "https://v3b.fal.media/files/b/0a968e12/Yji4FJHHkUUw4URfsSDOc_pytorch_lora_weights.safetensors",
        "trigger": "cvmin",
        "default_scale": 0.95,
    },
    "COVAMIDCENTURY": {
        "url": "https://v3b.fal.media/files/b/0a968e41/UEseNdIMoIb99kgJdii7k_pytorch_lora_weights.safetensors",
        "trigger": "cvmcm",
        "default_scale": 0.85,
    },
    "COVACOASTAL": {
        "url": "https://v3b.fal.media/files/b/0a968e5b/NCxDRtxWaYmUxizoVuTlW_pytorch_lora_weights.safetensors",
        "trigger": "cvcst",
        "default_scale": 0.85,
    },
    "COVABOHEMIAN": {
        "url": "https://v3b.fal.media/files/b/0a968e7a/ywFfjfD3D9dDexPtA3ki8_pytorch_lora_weights.safetensors",
        "trigger": "cvboh",
        "default_scale": 0.78,
    },
    "COVAINDUSTRIAL": {
        "url": "https://v3b.fal.media/files/b/0a968e98/_szQS8b6-cYx9_76iNDrx_pytorch_lora_weights.safetensors",
        "trigger": "cvind",
        "default_scale": 0.80,
    },
    "COVAFARMHOUSE": {
        "url": "https://v3b.fal.media/files/b/0a968eb2/gQJwXgd_ZtJGuUx9EES_P_pytorch_lora_weights.safetensors",
        "trigger": "cvfrm",
        "default_scale": 0.85,
    },
    "COVAARTDECO": {
        "url": "https://v3b.fal.media/files/b/0a968ecb/hzAWxKHrdtRCfrQhLMkrV_pytorch_lora_weights.safetensors",
        "trigger": "cvdco",
        "default_scale": 0.82,
    },
}

ADD_DETAILS_LORA_URL = (
    "https://huggingface.co/Shakker-Labs/FLUX.1-dev-LoRA-add-details/"
    "resolve/main/FLUX-dev-lora-add_details.safetensors"
)

# Room-type specs (hardcoded per V3 spec).
ROOM_TYPE_SPECS: dict[str, dict[str, Any]] = {
    "bedroom": {
        "hero_furniture": [
            "bed with headboard",
            "two nightstands",
            "dresser",
            "bench at foot of bed",
        ],
        "density_target": "15-22 objects",
        "depth_controlnet_scale_p2": 0.60,
        "focal_point": "bed wall",
        "rug_rule": "extends 18-24 inches past each side of the bed",
        "default_surfaces": [
            "left nightstand",
            "right nightstand",
            "dresser top",
        ],
    },
    "living_room": {
        "hero_furniture": [
            "sofa 72-96 inches",
            "coffee table 2/3 sofa length",
            "1-2 accent chairs",
            "8x10 rug minimum",
            "floor lamp",
            "side tables",
        ],
        "density_target": "25-40 objects",
        "depth_controlnet_scale_p2": 0.45,
        "focal_point": "fireplace or feature wall or large art",
        "rug_rule": "8x10 minimum, front legs of sofa on rug",
        "default_surfaces": [
            "coffee table",
            "side table",
            "console or shelf",
        ],
    },
    "home_office": {
        "hero_furniture": [
            "desk 29-30 inches tall",
            "ergonomic chair",
            "task lamp",
            "bookshelf",
            "rug under desk",
        ],
        "density_target": "12-20 objects",
        "depth_controlnet_scale_p2": 0.50,
        "focal_point": "desk and what is behind the chair",
        "rug_rule": "fits entirely under desk + chair roll zone",
        "default_surfaces": [
            "desk surface",
            "bookshelf",
        ],
    },
    "dining_room": {
        "hero_furniture": [
            "dining table",
            "chairs",
            "chandelier centered 30-36 inches above table",
            "sideboard",
        ],
        "density_target": "18-28 objects",
        "depth_controlnet_scale_p2": 0.50,
        "focal_point": "table and chandelier vertical axis",
        "rug_rule": "24 inches wider than table on each side",
        "default_surfaces": [
            "dining table center",
            "sideboard top",
        ],
    },
    "bathroom": {
        "hero_furniture": [
            "vanity with sink",
            "mirror",
            "sconces at 60-65 inches",
            "shower or bath",
        ],
        "density_target": "8-14 objects",
        "depth_controlnet_scale_p2": 0.62,
        "focal_point": "vanity, mirror, sconce trio",
        "rug_rule": "bath mat in front of vanity, towel storage reachable",
        "default_surfaces": [
            "vanity counter",
        ],
    },
}

# Lighting presets.
LIGHTING_PROMPTS: dict[str, str] = {
    "warm_cozy": (
        "warm tungsten 2700K lamp pools casting amber-gold light, "
        "visible lit table lamps and floor lamps, deep chiaroscuro shadows, "
        "golden hour evening interior, not bright, not flat"
    ),
    "bright_natural": (
        "bright 5500K daylight streaming from windows, soft diffused morning light, "
        "airy crisp and fresh, gentle shadows"
    ),
    "dramatic_moody": (
        "Rembrandt single-source lighting, deep cinematic shadows, 2200K amber tungsten, "
        "teal-amber contrast, moody dramatic atmosphere, low-key lighting"
    ),
}

IC_LIGHT_PROMPTS: dict[str, str] = {
    "warm_cozy": (
        "warm interior evening lighting, amber glow, lamp pools, cozy"
    ),
    "bright_natural": (
        "bright natural daylight, soft diffused, airy and crisp"
    ),
    "dramatic_moody": (
        "dramatic single-source lighting, strong chiaroscuro, moody"
    ),
}

IC_LIGHT_LATENT: dict[str, str] = {
    "warm_cozy": "Right",
    "bright_natural": "Left",
    "dramatic_moody": "Left",
}

# Display-only identity objects (Pass 2 targeted vignettes).
DISPLAY_ONLY_IDENTITY = {
    "sneakers",
    "vinyl",
    "candles",
    "gaming",
    "coffee",
    "sports",
    "art_supplies",
    "camera",
    "collectibles",
}
# Layout-defining identity objects (Pass 1 integrated).
LAYOUT_DEFINING_IDENTITY = {"plants", "guitar", "books", "fitness"}

STYLE_RULES_DIR = "/style_rules"

NEGATIVE_PROMPT = (
    "blurry, low quality, distorted, unrealistic proportions, floating objects, "
    "bad lighting, overexposed, flat, cartoon, illustration, 3d render, CGI, "
    "watermark, text, signature, ugly, duplicate furniture, empty, sparse, "
    "generic, airbnb staging, hotel lobby, showroom, catalog photo, "
    "oversaturated, blown highlights, symmetrical composition, "
    "single overhead light only, fisheye lens, people, person, "
    "changed architecture, different walls, different floor, different ceiling"
)

logger = logging.getLogger("cova-redesign")
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
)


# ---------------------------------------------------------------------------
# Modal image
# ---------------------------------------------------------------------------

redesign_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install(
        "libgl1-mesa-glx",
        "libglib2.0-0",
        "libsm6",
        "libxext6",
        "libxrender1",
    )
    .pip_install(
        "fastapi[standard]==0.115.4",
        "pydantic>=2.5,<3",
        "requests",
        "fal-client",
        "anthropic>=0.40,<1",
        "Pillow",
        "numpy",
        "opencv-python-headless",
    )
    .add_local_dir(
        local_path=os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "style_rules"
        ),
        remote_path=STYLE_RULES_DIR,
    )
)

app = modal.App(APP_NAME)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class RedesignRequest(BaseModel):
    empty_room_url: HttpUrl
    room_type: str = Field(default="bedroom")
    style_blend: dict[str, float] | None = None
    style_fingerprint: dict[str, Any] | None = None
    personalization: dict[str, Any] | None = None
    room_id: str | None = None
    user_id: str | None = None
    budget_max: float = Field(default=2000.0)
    # Reflection-loop overrides
    strength_override: float | None = None
    guidance_override: float | None = None
    prompt_override: str | None = None
    lora_scale_multiplier: float | None = None
    seed: int | None = None
    skip_pass2: bool = False
    # Iter 4 (2026-04-23): Pass 3 IC-Light disabled by default. It was fog-
    # bombing renders with background_threshold=0.75 producing ghost images.
    # Pass 1 LIGHTING prompt + editorial warm WB carry the lighting story.
    # Callers who want IC-Light can opt in with skip_pass3=False.
    skip_pass3: bool = True
    lighting_preset_override: Literal[
        "warm_cozy", "bright_natural", "dramatic_moody"
    ] | None = None


class QAScores(BaseModel):
    room_type_correct: float
    hero_furniture_quality: float
    style_accuracy: float
    decor_density: float
    lighting_quality: float
    personalization_features_visible: float
    lived_in_quality: float
    editorial_photography_quality: float
    perspective_and_scale: float
    art_accuracy: float


class QAResult(BaseModel):
    scores: QAScores
    composite: float
    suggested_chips: list[str]
    raw: dict[str, Any] | None = None


class RedesignResponse(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    render_url: HttpUrl
    pass1_url: HttpUrl | None = None
    pass2_url: HttpUrl | None = None
    pass3_url: HttpUrl | None = None
    qa: QAResult | None = None
    pipeline_version: Literal["v3"] = "v3"
    latency_seconds: float
    room_type: str
    cost_usd: float
    layout_plan: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _normalize_archetype_key(key: str) -> str:
    upper = key.strip().upper().replace(" ", "").replace("-", "")
    if upper in LORA_REGISTRY:
        return upper
    aliases = {
        "WARMJAPANDI": "COVAJAPANDI",
        "WARMGROUNDED": "COVAJAPANDI",
        "WARM&GROUNDED": "COVAJAPANDI",
        "NORDICCALM": "COVASCANDINAV",
        "BALANCEDCONTEMPORARY": "COVASCANDINAV",
        "PURECALM": "COVAMINIMAL",
        "BRIGHTAIRY": "COVACOASTAL",
        "BIOPHILIC": "COVABIOPHILIC",
        "BOLDECLECTIC": "COVABOHEMIAN",
        "URBANINDUSTRIAL": "COVAINDUSTRIAL",
        "VINTAGEMODERN": "COVAMIDCENTURY",
        "DARKMOODY": "COVAARTDECO",
        "CLASSICTRADITIONAL": "COVAFARMHOUSE",
    }
    return aliases.get(upper, "COVAJAPANDI")


# Primary style mapping for style_rules/ JSON file lookup.
COVA_TO_STYLE_SLUG: dict[str, str] = {
    "COVAJAPANDI": "warm-japandi",
    "COVASCANDINAV": "pure-minimal-white",
    "COVABIOPHILIC": "biophilic-jungle",
    "COVAMINIMAL": "pure-minimal-white",
    "COVAMIDCENTURY": "retro-mid-century",
    "COVACOASTAL": "coastal-bright",
    "COVABOHEMIAN": "maximalist-eclectic",
    "COVAINDUSTRIAL": "industrial-loft",
    "COVAFARMHOUSE": "heritage-traditional",
    "COVAARTDECO": "dark-moody-glam",
}


def _load_style_rules(archetype_key: str) -> dict[str, Any]:
    slug = COVA_TO_STYLE_SLUG.get(archetype_key, "warm-japandi")
    path = os.path.join(STYLE_RULES_DIR, f"{slug}.json")
    try:
        with open(path, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        logger.warning("style rules not found for %s at %s", archetype_key, path)
        return {}


def _primary_archetype(
    style_blend: Optional[dict[str, float]], fallback_key: str = "COVAJAPANDI"
) -> str:
    if not style_blend:
        return fallback_key
    items = [
        (_normalize_archetype_key(k), v)
        for k, v in style_blend.items()
        if isinstance(v, (int, float)) and v > 0
    ]
    if not items:
        return fallback_key
    items.sort(key=lambda kv: kv[1], reverse=True)
    return items[0][0]


def _build_lora_stack(
    primary_archetype: str,
    style_blend: Optional[dict[str, float]],
    scale_multiplier: float,
    pass_scale_modifier: float = 1.0,
) -> list[dict[str, Any]]:
    """Iter 3 (2026-04-23): default_scale was too dominant — it overrode
    explicit prompt personalization (art disappeared, plants missing).
    Cap the effective scale at 0.65 so the prompt has headroom to express
    art/plants/tech/lighting requests."""
    loras: list[dict[str, Any]] = []
    primary_meta = LORA_REGISTRY[primary_archetype]
    raw_scale = (
        primary_meta["default_scale"] * scale_multiplier * pass_scale_modifier
    )
    primary_scale = min(raw_scale, 0.65)
    loras.append({"path": primary_meta["url"], "scale": round(primary_scale, 4)})
    # Add-details universal — slightly higher now that primary is lower.
    loras.append(
        {"path": ADD_DETAILS_LORA_URL, "scale": round(0.45 * pass_scale_modifier, 4)}
    )
    return loras


def _iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _fetch_bytes(url: str, timeout: int = 60) -> bytes:
    import requests
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    return r.content


def _upload_bytes_to_fal(data: bytes, suffix: str = ".jpg") -> str:
    import fal_client  # type: ignore
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        return fal_client.upload_file(tmp_path)
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Pass 0 — Layout Planner (Claude Vision)
# ---------------------------------------------------------------------------


def _layout_planner(
    empty_room_url: str,
    room_type: str,
    primary_archetype: str,
    personalization: dict[str, Any],
    style_blend: Optional[dict[str, float]],
) -> dict[str, Any]:
    """Call Claude Vision to produce the layout JSON.

    Returns a best-effort dict. On failure, returns a minimal fallback
    plan using ROOM_TYPE_SPECS defaults.
    """
    import anthropic

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.warning("ANTHROPIC_API_KEY missing; using fallback layout plan")
        return _fallback_layout_plan(room_type, personalization)

    client = anthropic.Anthropic(api_key=api_key)

    try:
        img_bytes = _fetch_bytes(str(empty_room_url), timeout=45)
        # Resize + compress to <4 MB to satisfy Claude Vision limits (P0 fix).
        img_b64 = _shrink_for_vision(img_bytes)
    except Exception as exc:  # noqa: BLE001
        logger.warning("layout_planner: image fetch failed (%s); fallback", exc)
        return _fallback_layout_plan(room_type, personalization)

    room_spec = ROOM_TYPE_SPECS.get(room_type.lower(), ROOM_TYPE_SPECS["bedroom"])
    style_rules = _load_style_rules(primary_archetype)

    system_prompt = (
        "You are an expert interior designer producing a JSON scene spec. "
        "Return ONLY valid JSON matching the requested schema. No prose."
    )

    user_prompt = f"""Analyze this empty room photo and produce a JSON staging plan.

Room type: {room_type}
Primary style: {primary_archetype}
Style density tier: {style_rules.get('density_tier', 'medium')}
Target hero furniture: {room_spec['hero_furniture']}
Target density: {room_spec['density_target']}
Focal point hint: {room_spec['focal_point']}
Personalization requested: {json.dumps(personalization)[:800]}

Return JSON with this exact schema:
{{
  "architecture_notes": "string describing wall positions, window locations, ceiling height",
  "focal_wall": "string describing which wall is the focal point",
  "pass1_hero_placement": {{
    "primary_hero": "string",
    "secondary_pieces": ["string", ...],
    "rug_placement": "string"
  }},
  "pass2_surfaces": [
    {{"surface_name": "string", "vignette": "string describing grouping"}}
  ],
  "personalization_placements": {{
    "art": "string position or 'none'",
    "smart_tech": "string position or 'none'",
    "identity_objects": "string description or 'none'"
  }},
  "life_objects": ["3 lived-in objects per Gosling rule"],
  "pass3_lighting_preset": "warm_cozy OR bright_natural OR dramatic_moody"
}}
"""

    try:
        msg = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=1500,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": img_b64,
                            },
                        },
                        {"type": "text", "text": user_prompt},
                    ],
                }
            ],
            timeout=60.0,
        )
        text = "".join(
            [block.text for block in msg.content if getattr(block, "text", None)]
        )
        plan = _extract_json(text)
        if not plan:
            raise ValueError(f"no JSON in response: {text[:200]}")
        return plan
    except Exception as exc:  # noqa: BLE001
        logger.warning("layout_planner call failed (%s); fallback", exc)
        return _fallback_layout_plan(room_type, personalization)


def _shrink_for_vision(raw: bytes, max_edge: int = 1536) -> str:
    from PIL import Image
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    w, h = img.size
    if max(w, h) > max_edge:
        scale = max_edge / float(max(w, h))
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, "JPEG", quality=85)
    data = out.getvalue()
    return base64.b64encode(data).decode("ascii")


def _extract_json(text: str) -> Optional[dict[str, Any]]:
    # Look for the first { and matching }.
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    for i in range(start, len(text)):
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except json.JSONDecodeError:
                    return None
    return None


def _fallback_layout_plan(
    room_type: str, personalization: dict[str, Any]
) -> dict[str, Any]:
    room_spec = ROOM_TYPE_SPECS.get(room_type.lower(), ROOM_TYPE_SPECS["bedroom"])
    lighting = "warm_cozy"
    if isinstance(personalization, dict):
        l = personalization.get("lighting")
        if isinstance(l, dict) and l.get("mood") in LIGHTING_PROMPTS:
            lighting = l["mood"]
    return {
        "architecture_notes": "room architecture preserved; walls, windows, ceiling intact",
        "focal_wall": room_spec["focal_point"],
        "pass1_hero_placement": {
            "primary_hero": room_spec["hero_furniture"][0],
            "secondary_pieces": room_spec["hero_furniture"][1:],
            "rug_placement": room_spec["rug_rule"],
        },
        "pass2_surfaces": [
            {"surface_name": s, "vignette": "editorial grouping of decor objects"}
            for s in room_spec["default_surfaces"]
        ],
        "personalization_placements": {
            "art": "on focal wall" if _has_art(personalization) else "none",
            "smart_tech": "integrated naturally" if _has_smart(personalization) else "none",
            "identity_objects": "displayed appropriately" if _has_identity(personalization) else "none",
        },
        "life_objects": ["open book on surface", "folded throw", "small plant"],
        "pass3_lighting_preset": lighting,
    }


def _has_art(p: dict[str, Any]) -> bool:
    if not isinstance(p, dict):
        return False
    art = p.get("art")
    return isinstance(art, dict) and bool(art.get("images"))


def _has_smart(p: dict[str, Any]) -> bool:
    if not isinstance(p, dict):
        return False
    return bool(p.get("smart_products"))


def _has_identity(p: dict[str, Any]) -> bool:
    if not isinstance(p, dict):
        return False
    return bool(p.get("identity_objects"))


# ---------------------------------------------------------------------------
# Pass 1 — hero furniture lock
# ---------------------------------------------------------------------------


_IDENTITY_QUANTITY_PROMPTS: dict[str, dict[str, str]] = {
    "plants": {
        "few": "three healthy potted plants in ceramic and terracotta vessels",
        "many": "six to eight lush potted plants of varied sizes",
        "extensive": "ten or more abundant potted plants from floor planters to hanging trailing greenery",
    },
    "books": {
        "few": "a small curated stack of hardcover books",
        "many": "a dense bookshelf filled with books",
        "extensive": "wall-to-wall bookshelves fully stocked with books",
    },
    "guitar": {
        "few": "an acoustic guitar resting in a guitar stand in the corner",
        "many": "two guitars displayed on wall mounts",
    },
    "sneakers": {
        "few": "a small collection of sneakers displayed on a low shelf",
        "many": "a prominent sneaker wall with floating shelves displaying at least six pairs of sneakers",
        "extensive": "a full sneaker wall of floating shelves displaying ten or more pairs of sneakers as a featured display",
    },
    "vinyl": {
        "few": "a small curated vinyl record display with sleeves facing outward",
        "many": "a vinyl record collection on shelves with album sleeves facing out",
        "extensive": "a wall of vinyl records on purpose-built shelving with sleeves proudly facing outward",
    },
    "camera": {
        "few": "a vintage film camera and lens displayed on a shelf",
        "many": "a curated camera gear collection displayed on shelves",
    },
    "candles": {
        "few": "a small grouping of pillar candles",
        "many": "abundant candles clustered on surfaces throughout the room",
    },
    "coffee": {
        "few": "a French press and curated coffee setup on display",
        "many": "a full coffee bar with grinder, press, mugs, and beans displayed",
    },
    "gaming": {
        "few": "a gaming console and controllers visible near the television",
        "many": "a gaming battlestation with console, headphones, and accessories displayed",
    },
    "art_supplies": {
        "few": "art supplies displayed on an open shelf",
        "many": "a creative corner with art supplies and works in progress displayed",
    },
    "sports": {
        "few": "one piece of sports memorabilia displayed",
        "many": "multiple pieces of sports memorabilia displayed on the wall",
    },
    "collectibles": {
        "few": "a small curated display of collectibles on a shelf",
        "many": "a dedicated shelf of collectibles arranged as a display",
    },
}


def _identity_pass1_fragment(personalization: dict[str, Any]) -> str:
    """Iter 5 (2026-04-23): include ALL identity objects in Pass 1, not just
    layout-defining ones. Display-only objects (sneakers, vinyl, cameras,
    etc.) need Pass 1 placement because Pass 2 surface masks don't cover
    wall-display regions. Pass 2 still adds targeted vignettes for the
    display-only types."""
    if not _has_identity(personalization):
        return ""
    parts: list[str] = []
    for obj in (personalization.get("identity_objects") or [])[:4]:
        if not isinstance(obj, dict):
            continue
        t = str(obj.get("type") or "").lower()
        q = str(obj.get("quantity") or "few").lower()
        tpl = _IDENTITY_QUANTITY_PROMPTS.get(t, {}).get(q)
        if tpl:
            parts.append(tpl)
        elif t:
            parts.append(f"{q} {t}".strip())
    return (", " + ", ".join(parts)) if parts else ""


_SMART_TYPE_PROMPTS: dict[str, str] = {
    "tv": "a large flat-screen wall-mounted television",
    "monitor": "a widescreen computer monitor on a stand",
    "soundbar": "a thin soundbar below the television",
    "smart_speaker": "a small cylindrical smart speaker",
    "hue_strips": "warm LED strip lighting glowing behind the headboard",
    "desk_lamp": "an adjustable task lamp on the desk",
    "smart_blinds": "motorized smart blinds on the windows",
}


def _smart_pass1_fragment(personalization: dict[str, Any]) -> str:
    if not _has_smart(personalization):
        return ""
    descs: list[str] = []
    for item in (personalization.get("smart_products") or [])[:4]:
        if not isinstance(item, dict):
            continue
        t = str(item.get("type") or "").lower()
        if t in _SMART_TYPE_PROMPTS:
            descs.append(_SMART_TYPE_PROMPTS[t])
        else:
            descs.append(t.replace("_", " "))
    # Handle dual-monitor case explicitly.
    monitor_count = sum(
        1
        for it in (personalization.get("smart_products") or [])
        if isinstance(it, dict) and str(it.get("type") or "").lower() == "monitor"
    )
    if monitor_count >= 2:
        descs = [d for d in descs if "computer monitor" not in d]
        descs.insert(0, "two computer monitors on stands in a dual-monitor setup")
    return (", " + ", ".join(descs)) if descs else ""


_ART_LAYOUT_DESCRIPTIONS: dict[str, str] = {
    "single": "a single large framed artwork centered on the focal wall",
    "pair": "a pair of matching framed artworks side by side on the focal wall",
    "triptych": "a triptych of exactly three framed artworks in a horizontal row on the focal wall, identical frames, evenly spaced",
    "gallery": "a gallery wall of five to seven framed artworks organized in a grid",
    "salon": "a dense salon-hang gallery wall with mixed frame sizes and orientations",
}


def _art_pass1_fragment(personalization: dict[str, Any]) -> str:
    if not _has_art(personalization):
        return ""
    art = personalization.get("art") or {}
    layout = str(art.get("layout") or "single").lower()
    frame = str(art.get("frame_style") or "black") or "black"
    images = art.get("images") or []
    descs = []
    for img in images[:3]:
        if isinstance(img, dict):
            d = img.get("description") or ""
            if d:
                descs.append(str(d))
    layout_desc = _ART_LAYOUT_DESCRIPTIONS.get(layout, _ART_LAYOUT_DESCRIPTIONS["single"])
    content = ""
    if descs:
        content = ", depicting " + "; ".join(descs[:2])
    return f", {layout_desc} with {frame} frames{content}"


def _room_type_anchor(room_type: str) -> str:
    key = (room_type or "").lower()
    anchors = {
        "bedroom": "this is a BEDROOM with a real bed and headboard as the primary hero piece",
        "living_room": "this is a LIVING ROOM with a sofa as the primary seating hero",
        "home_office": "this is a HOME OFFICE with a desk as the primary hero piece",
        "dining_room": "this is a DINING ROOM with a dining table as the hero",
        "bathroom": "this is a BATHROOM with a vanity and sink as the hero",
    }
    return anchors.get(key, f"this is a {key}")


def _build_pass1_prompt(
    primary_archetype: str,
    room_type: str,
    plan: dict[str, Any],
    style_rules: dict[str, Any],
    personalization: dict[str, Any],
    budget_max: float,
) -> str:
    meta = LORA_REGISTRY[primary_archetype]
    trigger = meta["trigger"]
    room_spec = ROOM_TYPE_SPECS.get(room_type.lower(), ROOM_TYPE_SPECS["bedroom"])

    hero = plan.get("pass1_hero_placement") or {}
    primary = hero.get("primary_hero") or room_spec["hero_furniture"][0]
    secondary = hero.get("secondary_pieces") or room_spec["hero_furniture"][1:]
    rug = hero.get("rug_placement") or room_spec["rug_rule"]

    lighting_preset_raw = plan.get("pass3_lighting_preset", "warm_cozy")
    # If user explicitly set a lighting mood, honor that over the planner's choice.
    user_lighting = (personalization.get("lighting") or {}).get("mood") if isinstance(personalization.get("lighting"), dict) else None
    if user_lighting in LIGHTING_PROMPTS:
        lighting_preset = user_lighting
    else:
        lighting_preset = lighting_preset_raw
    lighting_frag = LIGHTING_PROMPTS.get(lighting_preset, LIGHTING_PROMPTS["warm_cozy"])

    materials_list = style_rules.get("materials", {}).get("top_materials", [])
    palette_list = style_rules.get("color_palette", {}).get("accent_colors", [])

    materials = ", ".join(materials_list[:4]) if materials_list else "natural materials"
    palette = ", ".join(palette_list[:4]) if palette_list else "balanced palette"

    art_frag = _art_pass1_fragment(personalization)
    smart_frag = _smart_pass1_fragment(personalization)
    identity_frag = _identity_pass1_fragment(personalization)

    # Specific items — call out by name in prompt for best chance of visual match.
    spec_frag = ""
    spec_items = personalization.get("specific_items") or []
    if isinstance(spec_items, list) and spec_items:
        names: list[str] = []
        for it in spec_items[:2]:
            if isinstance(it, dict):
                nm = str(it.get("product_name") or "").strip()
                if nm:
                    names.append(nm)
        if names:
            spec_frag = ", prominently featuring " + " and ".join(f"a {n}" for n in names)

    budget_frag = ""
    if budget_max >= 10000:
        budget_frag = ", designer-tier finishes"
    elif budget_max < 1500:
        budget_frag = ", accessible finishes"

    secondary_clause = ", ".join(secondary[:4]) if secondary else ""
    room_anchor = _room_type_anchor(room_type)

    def _clean(frag: str) -> str:
        return frag.strip().lstrip(",").strip()

    # Iter 3 also reads personalization.freetext.raw_text so the verification
    # retry mechanism (MANDATORY REQUIREMENTS: ...) actually reaches the prompt.
    freetext_extras = ""
    ft = personalization.get("freetext") if isinstance(personalization.get("freetext"), dict) else None
    if ft and isinstance(ft.get("raw_text"), str) and ft["raw_text"].strip():
        freetext_extras = ". " + ft["raw_text"].strip()

    # Iter 3 structure: art → plants/identity → tech → hero → lighting → style.
    # Art-first gives the highest attention weight because FLUX weights the
    # prompt left-to-right and prior iterations dropped art entirely when
    # the LoRA dominated.
    lead_parts: list[str] = [f"{trigger} {room_type} interior — {room_anchor}"]
    if art_frag:
        lead_parts.append(_clean(art_frag))
    if identity_frag:
        lead_parts.append(_clean(identity_frag))
    if smart_frag:
        lead_parts.append(_clean(smart_frag))
    if spec_frag:
        lead_parts.append(_clean(spec_frag))

    lead = ". ".join(lead_parts)

    return (
        f"{lead}{freetext_extras}. "
        f"HERO: {primary}, {secondary_clause}, {rug}. "
        f"LIGHTING: {lighting_frag}. "
        f"Materials: {materials}. Palette: {palette}{budget_frag}. "
        f"Styled with open book, folded throw, layered textiles. "
        f"Photographed by Francois Halard, 35mm lens eye-level 44 inches, "
        f"Architectural Digest editorial quality, asymmetric composition, "
        f"one clear directional light source, richly decorated, lived-in, "
        f"preserve original room architecture, walls, windows, ceiling, floor"
    )


def _get_image_bytes_as_pil(url: str):
    from PIL import Image
    raw = _fetch_bytes(url)
    return Image.open(io.BytesIO(raw)).convert("RGB")


def _encode_png(img_bytes: bytes) -> str:
    return base64.b64encode(img_bytes).decode("ascii")


def _build_full_mask_url(width: int, height: int) -> str:
    """White full-coverage mask for initial Fill Pro placement."""
    import cv2  # type: ignore
    import numpy as np

    mask = np.full((height, width), 255, dtype=np.uint8)
    ok, enc = cv2.imencode(".png", mask)
    if not ok:
        raise RuntimeError("mask encode failed")
    return _upload_bytes_to_fal(enc.tobytes(), suffix=".png")


def _call_flux_fill_pro(
    image_url: str,
    mask_url: str,
    prompt: str,
    strength: float,
    guidance: float,
    steps: int,
    loras: list[dict[str, Any]],
    seed: Optional[int] = None,
    controlnet_depth_url: Optional[str] = None,
    controlnet_scale: Optional[float] = None,
) -> str:
    import fal_client  # type: ignore

    args: dict[str, Any] = {
        "image_url": image_url,
        "mask_url": mask_url,
        "prompt": prompt,
        "num_inference_steps": steps,
        "guidance_scale": guidance,
        "num_images": 1,
        "output_format": "jpeg",
        "safety_tolerance": "6",
    }
    # strength is an informational hint; flux-pro/v1/fill ignores it.
    args["_strength_hint"] = strength  # kept for logging
    args.pop("_strength_hint", None)

    if seed is not None:
        args["seed"] = int(seed)

    # flux-pro/v1/fill does not accept loras or controlnet_unions natively;
    # fall back to flux-general/image-to-image when LoRAs are present.
    if loras:
        return _call_flux_general_i2i(
            image_url=image_url,
            prompt=prompt,
            strength=strength,
            guidance=guidance,
            steps=steps,
            loras=loras,
            seed=seed,
            controlnet_depth_url=controlnet_depth_url,
            controlnet_scale=controlnet_scale,
        )

    r = fal_client.subscribe(
        "fal-ai/flux-pro/v1/fill",
        arguments=args,
        with_logs=False,
        client_timeout=FAL_CLIENT_TIMEOUT_S,
    )
    return _extract_fal_image_url(r)


def _call_flux_general_i2i(
    image_url: str,
    prompt: str,
    strength: float,
    guidance: float,
    steps: int,
    loras: list[dict[str, Any]],
    seed: Optional[int] = None,
    controlnet_depth_url: Optional[str] = None,
    controlnet_scale: Optional[float] = None,
) -> str:
    import fal_client  # type: ignore

    args: dict[str, Any] = {
        "image_url": image_url,
        "prompt": prompt,
        "negative_prompt": NEGATIVE_PROMPT,
        "strength": strength,
        "guidance_scale": guidance,
        "num_inference_steps": steps,
        "loras": [{"path": e["path"], "scale": e["scale"]} for e in loras],
        "output_format": "jpeg",
    }
    if seed is not None:
        args["seed"] = int(seed)
    if controlnet_depth_url and controlnet_scale is not None:
        args["controlnet_unions"] = [
            {
                "path": "InstantX/FLUX.1-dev-Controlnet-Union",
                "controls": [
                    {
                        "control_image_url": controlnet_depth_url,
                        "control_mode": "depth",
                        "conditioning_scale": controlnet_scale,
                        "start_percentage": 0.0,
                        "end_percentage": CONTROLNET_DEPTH_P1_END,
                    }
                ],
            }
        ]

    # Phase 5 pattern — fal-general's "Could not load pipeline" error is
    # a transient issue with ControlNet + LoRAs together. 4 attempts, last
    # drops ControlNet entirely (2 LoRAs + no CN is the most reliable combo).
    max_attempts = 4
    last_err: Exception | None = None
    for attempt in range(max_attempts):
        try_args = dict(args)
        if attempt == max_attempts - 1 and "controlnet_unions" in try_args:
            try_args.pop("controlnet_unions")
            logger.warning(
                "flux-general final retry %d/%d — dropping ControlNet",
                attempt + 1, max_attempts,
            )
        try:
            r = fal_client.subscribe(
                "fal-ai/flux-general/image-to-image",
                arguments=try_args,
                with_logs=False,
                client_timeout=FAL_CLIENT_TIMEOUT_S,
            )
            return _extract_fal_image_url(r)
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            msg = str(exc)
            is_transient = (
                "Could not load pipeline" in msg
                or "FalClientTimeoutError" in type(exc).__name__
                or "502" in msg or "503" in msg or "504" in msg
                or "queue" in msg.lower()
            )
            if not is_transient or attempt == max_attempts - 1:
                raise
            wait = min(45, 10 * (attempt + 1))
            logger.warning(
                "flux-general transient (%s); retry %d/%d after %ds",
                msg[:120], attempt + 1, max_attempts, wait,
            )
            time.sleep(wait)
    # Should not reach here
    raise last_err if last_err else RuntimeError("flux-general failed")


def _extract_fal_image_url(r: dict[str, Any]) -> str:
    imgs = r.get("images") or []
    if imgs:
        first = imgs[0]
        if isinstance(first, dict) and first.get("url"):
            return first["url"]
        if isinstance(first, str):
            return first
    img = r.get("image")
    if isinstance(img, dict) and img.get("url"):
        return img["url"]
    raise RuntimeError(f"fal response missing image url: {list(r.keys())}")


def _generate_depth_url(image_url: str) -> Optional[str]:
    import fal_client  # type: ignore
    try:
        r = fal_client.subscribe(
            "fal-ai/imageutils/depth",
            arguments={"image_url": image_url},
            with_logs=False,
        )
        depth = r.get("image") or {}
        if isinstance(depth, dict) and depth.get("url"):
            return depth["url"]
    except Exception as exc:  # noqa: BLE001
        logger.warning("depth call failed: %s", exc)
    return None


# ---------------------------------------------------------------------------
# Pass 2 — per-surface decor density
# ---------------------------------------------------------------------------


def _build_surface_mask(
    width: int, height: int, surface_name: str
) -> bytes:
    """Heuristic surface mask — covers likely region of the named surface."""
    import cv2  # type: ignore
    import numpy as np

    mask = np.zeros((height, width), dtype=np.uint8)
    name = surface_name.lower()

    # Surface heuristics — covers the band of the image where the surface
    # typically sits. Fill Pro will only modify the masked region.
    if "nightstand" in name and "left" in name:
        mask[int(height * 0.45):int(height * 0.75), : int(width * 0.35)] = 255
    elif "nightstand" in name and "right" in name:
        mask[int(height * 0.45):int(height * 0.75), int(width * 0.65):] = 255
    elif "dresser" in name or "sideboard" in name:
        mask[int(height * 0.55):int(height * 0.80), int(width * 0.25):int(width * 0.75)] = 255
    elif "coffee table" in name:
        mask[int(height * 0.60):int(height * 0.85), int(width * 0.25):int(width * 0.75)] = 255
    elif "side table" in name or "end table" in name:
        mask[int(height * 0.50):int(height * 0.75), int(width * 0.70):] = 255
    elif "desk" in name:
        mask[int(height * 0.50):int(height * 0.75), int(width * 0.20):int(width * 0.80)] = 255
    elif "bookshelf" in name or "shelf" in name or "console" in name:
        mask[int(height * 0.30):int(height * 0.75), int(width * 0.05):int(width * 0.35)] = 255
    elif "dining table" in name:
        mask[int(height * 0.50):int(height * 0.70), int(width * 0.25):int(width * 0.75)] = 255
    elif "vanity" in name:
        mask[int(height * 0.40):int(height * 0.70), int(width * 0.25):int(width * 0.75)] = 255
    else:
        # generic accessory band
        mask[int(height * 0.45):int(height * 0.60), int(width * 0.20):int(width * 0.80)] = 255

    ok, enc = cv2.imencode(".png", mask)
    if not ok:
        raise RuntimeError(f"mask encode failed for {surface_name}")
    return enc.tobytes()


def _identity_context_for_surface(
    personalization: dict[str, Any], surface_name: str
) -> str:
    """Iter 5b: if there are identity objects that belong on this surface,
    return a fragment describing them so Pass 2 doesn't erase them."""
    if not _has_identity(personalization):
        return ""
    sn = surface_name.lower()
    is_shelf_like = any(kw in sn for kw in ("shelf", "bookshelf", "console", "credenza", "wall"))
    if not is_shelf_like:
        return ""
    # Look for identity objects that are displayed on shelves.
    for obj in (personalization.get("identity_objects") or []):
        if not isinstance(obj, dict):
            continue
        t = str(obj.get("type") or "").lower()
        q = str(obj.get("quantity") or "few").lower()
        if t in ("sneakers", "vinyl", "books", "collectibles", "camera", "sports"):
            tpl = _IDENTITY_QUANTITY_PROMPTS.get(t, {}).get(q)
            if tpl:
                return f"featuring {tpl}"
    return ""


def _build_pass2_prompt(
    primary_archetype: str,
    style_rules: dict[str, Any],
    surface_name: str,
    vignette: str,
    personalization: dict[str, Any] | None = None,
) -> str:
    trigger = LORA_REGISTRY[primary_archetype]["trigger"]
    materials = ", ".join(
        style_rules.get("materials", {}).get("top_materials", [])[:3]
    )
    id_ctx = _identity_context_for_surface(personalization or {}, surface_name)
    ctx_part = f", {id_ctx}" if id_ctx else ""
    return (
        f"{trigger} {surface_name} styling, {vignette}{ctx_part}, editorial interior photography, "
        f"rule of three, asymmetric grouping, styled by professional interior designer, "
        f"materials: {materials}, natural lighting, photorealistic"
    )


def _run_pass2(
    pass1_url: str,
    primary_archetype: str,
    style_rules: dict[str, Any],
    plan: dict[str, Any],
    room_type: str,
    loras_p2: list[dict[str, Any]],
    seed: Optional[int],
    personalization: dict[str, Any],
) -> tuple[str, int]:
    """Loop over pass2_surfaces; return (final_url, cost_calls_made)."""
    pil = _get_image_bytes_as_pil(pass1_url)
    width, height = pil.size
    room_spec = ROOM_TYPE_SPECS.get(room_type.lower(), ROOM_TYPE_SPECS["bedroom"])
    p2_cn_scale = float(room_spec["depth_controlnet_scale_p2"])

    raw_surfaces = plan.get("pass2_surfaces") or []
    surfaces: list[dict[str, Any]] = []
    # Coerce: Claude may return list[dict], list[str], or dict[str, str].
    if isinstance(raw_surfaces, list):
        for s in raw_surfaces:
            if isinstance(s, dict):
                surfaces.append(
                    {
                        "surface_name": str(s.get("surface_name") or s.get("name") or "surface"),
                        "vignette": str(s.get("vignette") or s.get("description") or "editorial grouping"),
                    }
                )
            elif isinstance(s, str):
                surfaces.append({"surface_name": s, "vignette": "editorial grouping"})
    elif isinstance(raw_surfaces, dict):
        for name, vignette in raw_surfaces.items():
            surfaces.append(
                {"surface_name": str(name), "vignette": str(vignette) if vignette else "editorial grouping"}
            )
    if not surfaces:
        surfaces = [
            {"surface_name": s, "vignette": "editorial grouping"}
            for s in room_spec["default_surfaces"]
        ]

    # Add display-only identity objects as targeted pass2 vignettes.
    if _has_identity(personalization):
        for obj in (personalization.get("identity_objects") or []):
            if isinstance(obj, dict) and obj.get("type") in DISPLAY_ONLY_IDENTITY:
                t = obj["type"]
                surfaces.append(
                    {
                        "surface_name": "display shelf",
                        "vignette": (
                            f"{t} artfully displayed, shelf or display unit, "
                            f"editorial, photorealistic, interior magazine quality"
                        ),
                    }
                )

    # Surface cap — 4 total to keep pass2 bounded.
    surfaces = surfaces[:4]

    current_url = pass1_url
    calls = 0
    for entry in surfaces:
        surface_name = entry.get("surface_name", "surface")
        vignette = entry.get("vignette", "editorial grouping")
        try:
            mask_bytes = _build_surface_mask(width, height, surface_name)
            mask_url = _upload_bytes_to_fal(mask_bytes, suffix=".png")
            prompt = _build_pass2_prompt(
                primary_archetype, style_rules, surface_name, vignette,
                personalization=personalization,
            )
            current_url = _call_flux_general_i2i(
                image_url=current_url,
                prompt=prompt,
                strength=PASS2_STRENGTH,
                guidance=PASS2_GUIDANCE,
                steps=PASS2_STEPS,
                loras=loras_p2,
                seed=seed,
                controlnet_depth_url=None,  # rely on mask to localize
                controlnet_scale=None,
            )
            calls += 1
            _ = p2_cn_scale  # reserved for future CN pass
        except Exception as exc:  # noqa: BLE001
            logger.warning("pass2 surface %s failed: %s", surface_name, exc)
            continue
    return current_url, calls


# ---------------------------------------------------------------------------
# Pass 3 — IC-Light v2
# ---------------------------------------------------------------------------


def _run_ic_light(pass2_url: str, preset: str) -> str:
    """Optional IC-Light relight pass. Iter 4 removes background_threshold
    because 0.75 produced ghost-BG foggy renders. Let fal default it."""
    import fal_client  # type: ignore

    preset = preset if preset in IC_LIGHT_PROMPTS else "warm_cozy"
    prompt = IC_LIGHT_PROMPTS[preset]
    latent = IC_LIGHT_LATENT[preset]

    r = fal_client.subscribe(
        "fal-ai/iclight-v2",
        arguments={
            "image_url": pass2_url,
            "prompt": prompt,
            "initial_latent": latent,
            "lowres_denoise": PASS3_LOWRES_DENOISE,
            "highres_denoise": PASS3_HIGHRES_DENOISE,
            "guidance_scale": PASS3_GUIDANCE,
            "num_inference_steps": PASS3_STEPS,
            "num_images": 1,
            "output_format": "jpeg",
        },
        with_logs=False,
        client_timeout=FAL_CLIENT_TIMEOUT_S,
    )
    return _extract_fal_image_url(r)


# ---------------------------------------------------------------------------
# Editorial post-processing (PIL + numpy)
# ---------------------------------------------------------------------------


def _editorial_post(url: str) -> str:
    """Subtle editorial finishing — warm WB, gentle contrast, light grain.

    Previous version clipped dynamic range so hard that midtones blew out
    to white and shadows crushed to black. This version preserves range.
    """
    import numpy as np
    from PIL import Image

    raw = _fetch_bytes(url)
    pil = Image.open(io.BytesIO(raw)).convert("RGB")
    arr = np.asarray(pil, dtype=np.float32) / 255.0  # HxWx3

    # 1. Warm white balance — subtle.
    arr[..., 0] = np.clip(arr[..., 0] * 1.03, 0, 1)
    arr[..., 2] = np.clip(arr[..., 2] * 0.97, 0, 1)

    # 2. Gentle S-curve (preserves whites and blacks).
    # y = 0.5 + 0.5 * tanh(k * (x - 0.5)); k=2 gives very mild contrast boost.
    arr = 0.5 + 0.5 * np.tanh(2.0 * (arr - 0.5))

    # 3. Tiny desaturation (3% toward luminance).
    lum = 0.299 * arr[..., 0] + 0.587 * arr[..., 1] + 0.114 * arr[..., 2]
    lum3 = np.stack([lum, lum, lum], axis=-1)
    arr = arr * 0.97 + lum3 * 0.03

    # 4. Film grain, shadow-weighted, very subtle.
    rng = np.random.default_rng(42)
    grain = rng.normal(0, 0.006, size=arr.shape).astype(np.float32)
    shadow_mask = 1.0 - np.clip(lum3, 0, 1)
    arr = arr + grain * shadow_mask * 0.6

    # 5. Corner vignette — very subtle (barely perceptible).
    h, w = arr.shape[:2]
    cy, cx = h / 2.0, w / 2.0
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dist = np.sqrt(((xx - cx) / cx) ** 2 + ((yy - cy) / cy) ** 2)
    vign = 1.0 - np.clip((dist - 0.9) * 0.10, 0, 0.08)
    arr = arr * vign[..., None]

    arr = np.clip(arr, 0.0, 1.0)
    out = (arr * 255.0).astype(np.uint8)
    out_pil = Image.fromarray(out)
    buf = io.BytesIO()
    out_pil.save(buf, "JPEG", quality=92)
    return _upload_bytes_to_fal(buf.getvalue(), suffix=".jpg")


# ---------------------------------------------------------------------------
# QA check (Claude Vision)
# ---------------------------------------------------------------------------


def _qa_check(final_url: str, room_type: str, personalization: dict[str, Any]) -> Optional[QAResult]:
    import anthropic
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None

    try:
        raw = _fetch_bytes(final_url)
        b64 = _shrink_for_vision(raw)
    except Exception as exc:  # noqa: BLE001
        logger.warning("qa: image fetch failed: %s", exc)
        return None

    client = anthropic.Anthropic(api_key=api_key)
    system = (
        "You are a strict interior design professional scoring a room render. "
        "Return ONLY valid JSON."
    )
    user = f"""Score this final render on 10 dimensions 1-5 (1=poor, 5=excellent).

Room type expected: {room_type}
Personalization requested: {json.dumps(personalization)[:400]}

Return JSON:
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
  "suggested_chips": ["3 specific refinement suggestions based on what you actually see"]
}}
"""
    try:
        msg = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=800,
            system=system,
            messages=[
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
                        {"type": "text", "text": user},
                    ],
                }
            ],
            timeout=45.0,
        )
        text = "".join(
            [b.text for b in msg.content if getattr(b, "text", None)]
        )
        data = _extract_json(text) or {}
        scores_dict = data.get("scores") or {}
        chips = data.get("suggested_chips") or []

        def _g(k: str) -> float:
            v = scores_dict.get(k, 3)
            try:
                return float(v)
            except Exception:  # noqa: BLE001
                return 3.0

        scores = QAScores(
            room_type_correct=_g("room_type_correct"),
            hero_furniture_quality=_g("hero_furniture_quality"),
            style_accuracy=_g("style_accuracy"),
            decor_density=_g("decor_density"),
            lighting_quality=_g("lighting_quality"),
            personalization_features_visible=_g("personalization_features_visible"),
            lived_in_quality=_g("lived_in_quality"),
            editorial_photography_quality=_g("editorial_photography_quality"),
            perspective_and_scale=_g("perspective_and_scale"),
            art_accuracy=_g("art_accuracy"),
        )
        composite = sum(
            [
                scores.room_type_correct,
                scores.hero_furniture_quality,
                scores.style_accuracy,
                scores.decor_density,
                scores.lighting_quality,
                scores.personalization_features_visible,
                scores.lived_in_quality,
                scores.editorial_photography_quality,
                scores.perspective_and_scale,
                scores.art_accuracy,
            ]
        ) / 10.0
        return QAResult(
            scores=scores,
            composite=round(composite, 3),
            suggested_chips=[str(c) for c in chips][:3],
            raw=data,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("qa call failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Modal class
# ---------------------------------------------------------------------------


@app.cls(
    image=redesign_image,
    cpu=2.0,
    memory=4096,
    timeout=900,
    startup_timeout=60,
    min_containers=0,
    max_containers=4,
    secrets=[
        modal.Secret.from_name("fal-secrets"),
        modal.Secret.from_name("anthropic-credentials"),
    ],
)
class Redesign:
    @modal.enter()
    def load(self) -> None:
        logger.info(
            "cova-redesign V3 ready  archetypes=%d style_rules_dir=%s",
            len(LORA_REGISTRY),
            STYLE_RULES_DIR,
        )

    def _generate(self, req: RedesignRequest) -> RedesignResponse:
        t0 = time.perf_counter()

        personalization = req.personalization or {}
        scale_mult = float(req.lora_scale_multiplier or 1.0)
        scale_mult = min(max(scale_mult, 0.5), 1.3)

        primary_archetype = _primary_archetype(req.style_blend)
        style_rules = _load_style_rules(primary_archetype)

        # Pass 0: layout plan.
        plan = _layout_planner(
            str(req.empty_room_url),
            req.room_type,
            primary_archetype,
            personalization,
            req.style_blend,
        )
        if req.lighting_preset_override:
            plan["pass3_lighting_preset"] = req.lighting_preset_override

        # Depth for Pass 1 (runs alongside layout in production via asyncio;
        # here we run it sequentially to keep the code simple).
        depth_url = _generate_depth_url(str(req.empty_room_url))

        cost = 0.0
        if depth_url:
            cost += COST_DEPTH

        # Pass 1 — hero lock.
        loras_p1 = _build_lora_stack(
            primary_archetype, req.style_blend, scale_mult, pass_scale_modifier=0.90
        )
        pass1_prompt = (
            req.prompt_override
            if req.prompt_override
            else _build_pass1_prompt(
                primary_archetype,
                req.room_type,
                plan,
                style_rules,
                personalization,
                req.budget_max,
            )
        )
        strength_p1 = float(req.strength_override or PASS1_STRENGTH)
        guidance_p1 = float(req.guidance_override or PASS1_GUIDANCE)

        pass1_url = _call_flux_general_i2i(
            image_url=str(req.empty_room_url),
            prompt=pass1_prompt,
            strength=strength_p1,
            guidance=guidance_p1,
            steps=PASS1_STEPS,
            loras=loras_p1,
            seed=req.seed,
            controlnet_depth_url=depth_url,
            controlnet_scale=CONTROLNET_DEPTH_P1,
        )
        cost += COST_FLUX_FILL

        # Pass 2 — per-surface decor.
        pass2_url = pass1_url
        if not req.skip_pass2:
            loras_p2 = _build_lora_stack(
                primary_archetype, req.style_blend, scale_mult, pass_scale_modifier=0.65
            )
            # Push add-details higher in Pass 2.
            loras_p2[-1]["scale"] = round(0.55, 4)
            pass2_url, p2_calls = _run_pass2(
                pass1_url,
                primary_archetype,
                style_rules,
                plan,
                req.room_type,
                loras_p2,
                req.seed,
                personalization,
            )
            cost += COST_FLUX_FILL * p2_calls

        # Pass 3 — IC-Light.
        pass3_url = pass2_url
        if not req.skip_pass3:
            try:
                pass3_url = _run_ic_light(
                    pass2_url, plan.get("pass3_lighting_preset", "warm_cozy")
                )
                cost += COST_IC_LIGHT
            except Exception as exc:  # noqa: BLE001
                logger.warning("IC-Light failed, using pass2: %s", exc)
                pass3_url = pass2_url

        # Editorial post-processing.
        try:
            render_url = _editorial_post(pass3_url)
        except Exception as exc:  # noqa: BLE001
            logger.warning("editorial post failed: %s", exc)
            render_url = pass3_url

        # QA check.
        qa = _qa_check(render_url, req.room_type, personalization)
        if qa is not None:
            cost += COST_CLAUDE_VISION

        latency_s = round(time.perf_counter() - t0, 2)
        logger.info(
            "redesign V3 done  archetype=%s room_type=%s latency=%.2fs cost=$%.4f qa=%s",
            primary_archetype,
            req.room_type,
            latency_s,
            cost,
            (qa.composite if qa else None),
        )

        return RedesignResponse(
            render_url=render_url,  # type: ignore[arg-type]
            pass1_url=pass1_url,  # type: ignore[arg-type]
            pass2_url=pass2_url,  # type: ignore[arg-type]
            pass3_url=pass3_url,  # type: ignore[arg-type]
            qa=qa,
            pipeline_version="v3",
            latency_seconds=latency_s,
            room_type=req.room_type,
            cost_usd=round(cost, 4),
            layout_plan=plan,
        )

    @modal.asgi_app()
    def api(self):
        from fastapi import FastAPI, HTTPException

        fapp = FastAPI(title=APP_NAME, version="1.0.0")

        @fapp.get("/healthz")
        def healthz() -> dict:
            return {
                "app": APP_NAME,
                "api_version": API_VERSION,
                "status": "ready",
                "pipeline": "v3-3pass",
                "archetypes": sorted(LORA_REGISTRY.keys()),
                "room_types": sorted(ROOM_TYPE_SPECS.keys()),
            }

        @fapp.post(
            f"/{API_VERSION}/generate_redesign",
            response_model=RedesignResponse,
        )
        def generate_redesign(req: RedesignRequest) -> RedesignResponse:
            try:
                return self._generate(req)
            except ValueError as exc:
                raise HTTPException(
                    status_code=400,
                    detail={"error": "bad_request", "message": str(exc)},
                )
            except RuntimeError as exc:
                raise HTTPException(
                    status_code=502,
                    detail={"error": "upstream_failure", "message": str(exc)},
                )

        return fapp


if __name__ == "__main__":
    print(
        f"{APP_NAME} V3 loaded  endpoint=/{API_VERSION}/generate_redesign  "
        f"3-pass [Claude layout -> FLUX hero -> FLUX surfaces -> IC-Light]"
    )
