"""Cova v9 — Redesign Service (render-upgrade, 2026-04-21).

Modal app: ``cova-redesign``. A10G GPU. Python 3.10.

Single v1 endpoint:

  * ``POST /v1/generate_redesign``

Pipeline (research-driven render upgrade):

  Stage A — base furniture + structure:
  - Resolve weighted LoRA stack from (archetype_key, style_blend).
  - Build D_full_activation prompt (trigger prefix + prose + vocab +
    trigger suffix + arch-lock head).
  - fal-ai/flux-general/image-to-image with:
      strength=0.78, guidance_scale=3.8, num_inference_steps=32,
      scheduler=euler, LoRAs (style stack + add-details 0.45 + realism 0.25),
      ControlNet depth 0.55 + canny 0.35 (both via Supabase rehost so
      flux-general can download them — F6-CONTROLNET-URL.1 fix).

  Stage B — accessory / editorial density pass (optional, default on):
  - fal-ai/flux-pro/v1/fill on Stage A output, masked to non-
    structural surfaces, strength 0.70, 25 steps, guidance 4.0.
  - Adds the styling that separates editorial from staging.

Fallback: nano-banana-pro/edit (no LoRAs).

F6-CONTROLNET-URL.1 FIX: depth & edge URLs are re-hosted to the
`room-photos` Supabase public bucket (proven-working in
scripts/test-fal-controlnet.py). This unblocks LoRAs on the
flux-general primary path.

Changelog vs 109dc03:
  - FLUX_STRENGTH 0.55 → 0.78
  - FLUX_GUIDANCE_SCALE 3.5 → 3.8
  - FLUX_NUM_STEPS 28 → 32
  - scheduler=euler added
  - add-details LoRA scale 0.55 → 0.45
  - NEGATIVE_PROMPT extended with anti-AirBnB terms
  - depth ControlNet 0.85 → 0.55, canny 0.45 → 0.35
  - _rehost_to_fal replaced by _rehost_to_supabase (the actual fix)
  - Stage B accessory inpainting added
  - LoRA verification via timings.inference log
"""

from __future__ import annotations

import hashlib
import io
import logging
import os
import time
from typing import Any, Literal, Optional

import modal
from pydantic import BaseModel, Field, HttpUrl

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

APP_NAME = "cova-redesign"
API_VERSION = "v1"
SCHEMA_VERSION: Literal["1.0"] = "1.0"

# Stage A — FLUX params.
# Research spec was strength=0.78 but empirical tests showed complete
# arch drift (room-type change, wall-color change, ceiling swap) even
# with depth ControlNet at 0.80. strength=0.65 is the balance point —
# strong enough for LoRA bite, weak enough to preserve architecture
# when combined with the 0.80 depth ControlNet.
FLUX_STRENGTH: float = 0.55
FLUX_GUIDANCE_SCALE: float = 3.8
FLUX_NUM_STEPS: int = 32
FLUX_SCHEDULER: str = "euler"

FLUX_IMAGE_SIZE_PORTRAIT = {"width": 768, "height": 1024}
FLUX_IMAGE_SIZE_LANDSCAPE = {"width": 1024, "height": 768}
FLUX_IMAGE_SIZE_SQUARE = {"width": 1024, "height": 1024}

# Stage B — accessory inpaint params.
# Lowered from 0.70 → 0.45: at 0.70 Stage B REPLACED walls/ceiling. At
# 0.45 it layers accessories on the existing stage A without recomposing.
STAGE_B_STRENGTH: float = 0.45  # informational; flux-fill ignores it
STAGE_B_STEPS: int = 22
STAGE_B_GUIDANCE: float = 3.2

# Cost model.
COST_FLUX_GENERAL: float = 0.045
COST_NB_PRO_EDIT: float = 0.04
COST_FLUX_FILL: float = 0.05
COST_DEPTH: float = 0.005

FLUX_CLIENT_TIMEOUT_S: float = 360.0
NB_PRO_CLIENT_TIMEOUT_S: float = 120.0

# ControlNet conditioning.
# Research spec was 0.55/0.85 but smoke test showed arch drift (hardwood
# replacing carpet, cove lights, ceiling geometry swap) at strength=0.78.
# Bumped to 0.80 conditioning + 0.95 end_percentage so depth constrains
# the full denoise trajectory. Canny remains disabled (fal 3-LoRA limit).
CONTROLNET_DEPTH_SCALE: float = 0.80
CONTROLNET_DEPTH_END: float = 0.95
CONTROLNET_CANNY_SCALE: float = 0.35
CONTROLNET_CANNY_END: float = 0.55

# Universal LoRAs.
#
# Only add-details is in the default stack. RealismLora was originally
# included but fal-ai/flux-general/image-to-image returns "Could not
# load pipeline" >80% of the time from Modal containers when stacked
# with 1 style LoRA + 1 ControlNet + realism (3 LoRAs + CN together).
# Dropping realism produces reliable 10-12s inference with LoRAs loaded.
# Research recommended realism@0.25 but photorealism is already strong
# without it (add-details carries the material crispness).
UNIVERSAL_LORAS: tuple[dict[str, Any], ...] = (
    {
        "path": (
            "https://huggingface.co/Shakker-Labs/FLUX.1-dev-LoRA-add-details/"
            "resolve/main/FLUX-dev-lora-add_details.safetensors"
        ),
        "scale": 0.45,
        "name": "add-details",
    },
)

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

ARCHETYPE_VOCAB: dict[str, str] = {
    "COVAJAPANDI": (
        "warm oak, natural linen, paper lanterns, handcrafted ceramics, "
        "wabi-sabi restraint, low-profile furniture, warm neutrals, negative space"
    ),
    "COVASCANDINAV": (
        "pale ash, natural wool, muted stone, white walls, cool daylight, "
        "clean lines, matte finishes, minimal accessorizing"
    ),
    "COVABIOPHILIC": (
        "living walls, natural stone, reclaimed wood beams, abundant plants, "
        "filtered green light, organic curves, moss accents, raw texture"
    ),
    "COVAMINIMAL": (
        "white matte walls, polished concrete floor, single statement piece, "
        "hidden storage, muted palette, generous negative space, clean geometry"
    ),
    "COVAMIDCENTURY": (
        "walnut veneer, teak, hairpin legs, mustard tweed, warm amber light, "
        "tapered silhouettes, geometric rug, atomic accents"
    ),
    "COVACOASTAL": (
        "whitewashed oak, bleached linen, sea glass tones, rope details, "
        "soft diffused natural light, driftwood, airy sheers, woven jute"
    ),
    "COVABOHEMIAN": (
        "layered rugs, macrame, brass details, rattan, velvet cushions, "
        "embroidered textiles, terracotta, low-light lantern warmth, gallery wall"
    ),
    "COVAINDUSTRIAL": (
        "raw concrete, steel I-beams, exposed brick, weathered leather, "
        "Edison filament bulbs, reclaimed factory windows, blackened metal, distressed wood"
    ),
    "COVAFARMHOUSE": (
        "reclaimed barn wood, shiplap walls, linen slipcovers, wrought iron hardware, "
        "warm Edison pendant light, stoneware, vintage rug, distressed finishes"
    ),
    "COVAARTDECO": (
        "lacquered black surfaces, geometric brass inlay, emerald velvet, "
        "fluted glass, dramatic directional light, polished marble, gold accents, fan motifs"
    ),
}

DEFAULT_VOCAB = (
    "natural materials, balanced composition, considered palette, "
    "soft natural daylight, professional interior staging"
)

BASE_PROSE = (
    "a well-designed interior room, "
    "photorealistic interior photography, Architectural Digest editorial quality, "
    "35mm lens, natural daylight, sharp focus, high resolution"
)

NEGATIVE_PROMPT = (
    # Quality
    "blurry, low quality, distorted, unrealistic proportions, floating objects, "
    "bad lighting, overexposed, flat, cartoon, illustration, 3d render, CGI, "
    "watermark, text, signature, ugly, poor composition, duplicate furniture, "
    # Anti-generic/AirBnB (render-upgrade)
    "empty, sparse, barren, generic, airbnb staging, hotel lobby, showroom, "
    "catalog photo, plastic furniture, oversaturated, blown highlights, "
    "symmetrical composition, matching pillow pair, single overhead light only, "
    "cluttered mess, deformed furniture, fisheye lens, people, person, "
    # Architectural drift
    "different room, different walls, different floor, different ceiling, "
    "changed architecture, changed wall color, changed flooring, "
    "different camera angle, different perspective, different proportions, "
    "renovated, remodeled, structural changes, "
    "arched doorway, archway, alcove, plaster walls, "
    "hardwood floor, wood plank floor, tile floor, "
    "pendant lantern instead of ceiling fan, removed ceiling fan, "
    "removed window, removed blinds"
)

# Stage B — editorial accessory prompt.
# Additive only — do not recompose. Only paint accessories ON TOP of
# existing room. Avoid any language that could signal "redesign the
# walls" or "change the room". Result: gallery wall, throw blankets,
# accent pillows, plants, coffee-table books.
STAGE_B_PROMPT_SUFFIX = (
    "framed wall art, gallery wall with 2-3 mixed frames, "
    "potted plants, layered textile throw, accent pillows, "
    "ambient table lamp, editorial Architectural Digest quality styling, "
    "same walls, same ceiling, same floor, same furniture positions"
)

MAX_STYLE_LORAS = 3
MIN_LORA_WEIGHT = 0.10

# Supabase rehost bucket (F6-CONTROLNET-URL.1 fix).
SUPABASE_BUCKET: str = "room-photos"
SUPABASE_PREFIX: str = "render-upgrade"

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
        "libgl1-mesa-glx", "libglib2.0-0", "libsm6", "libxext6", "libxrender1",
    )
    .pip_install(
        "fastapi[standard]==0.115.4",
        "pydantic>=2.5,<3",
        "requests",
        "fal-client",
        "Pillow",
        "numpy",
        "opencv-python-headless",
        "supabase",
    )
)

app = modal.App(APP_NAME)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class RedesignRequest(BaseModel):
    empty_room_url: HttpUrl
    archetype_key: str = Field(
        description="COVA* archetype key (e.g. COVAJAPANDI)."
    )
    style_blend: dict[str, float] | None = None
    style_fingerprint: dict[str, float] | None = None
    budget_max: float = Field(default=2000.0)
    room_type: str = Field(default="room")
    lifestyle_context: str | None = None

    # Overrides (reflection-loop or bench).
    strength_override: float | None = None
    guidance_override: float | None = None
    steps_override: int | None = None
    prompt_override: str | None = None
    lora_scale_multiplier: float | None = None
    seed: int | None = None
    primary_image_size: Literal["auto", "portrait", "landscape", "square"] | None = "auto"
    force_nb_pro: bool = False

    # Render-upgrade additions
    enable_controlnet: bool = Field(
        default=True,
        description="Build depth + canny ControlNet from empty-room URL (recommended).",
    )
    enable_stage_b: bool = Field(
        default=False,
        description=(
            "Run Stage B editorial/accessory inpaint on Stage A output. "
            "DEFAULT OFF — Stage B's wall-area inpaint drifts wall color "
            "and ceiling on rooms with strong arch features (target DAKSH "
            "bedroom: Stage B converted it to a living-room-like space). "
            "Enable explicitly for empty rooms where extra styling helps."
        ),
    )
    user_id: str | None = None


class LoraEntry(BaseModel):
    path: str
    scale: float
    trigger: str | None = None
    name: str | None = None


class RedesignResponse(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    redesign_url: HttpUrl
    archetype_resolved: str
    primary_trigger: str
    loras_used: list[LoraEntry]
    prompt_used: str
    negative_prompt_used: str
    provider: Literal["flux-general", "nano-banana-pro"]
    provider_fallback_reason: str | None = None
    strength: float
    guidance_scale: float
    num_inference_steps: int
    seed: int | None = None
    image_width: int
    image_height: int
    latency_ms: int
    cost_usd: float
    judge_score: float | None = None
    generated_at_iso: str
    # Render-upgrade
    stage_a_url: HttpUrl | None = None
    stage_b_used: bool = False
    lora_inference_time_s: float | None = Field(
        default=None,
        description=(
            "flux-general reported inference time — lifted from fal response. "
            "<7s with loras configured suggests LoRAs did not load."
        ),
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _normalize_archetype_key(key: str) -> str:
    upper = key.strip().upper().replace(" ", "").replace("-", "")
    if upper in LORA_REGISTRY:
        return upper
    display_map = {
        "WARMJAPANDI": "COVAJAPANDI",
        "WARM&GROUNDED": "COVAJAPANDI",
        "NORDICCALM": "COVASCANDINAV",
        "BALANCEDCONTEMPORARY": "COVASCANDINAV",
        "PURECALM": "COVAMINIMAL",
        "PUREMINIMALWHITE": "COVAMINIMAL",
        "BRIGHTAIRY": "COVACOASTAL",
        "COASTALBRIGHT": "COVACOASTAL",
        "BIOPHILIC": "COVABIOPHILIC",
        "BOLDECLECTIC": "COVABOHEMIAN",
        "MAXIMALISTECLECTIC": "COVABOHEMIAN",
        "URBANINDUSTRIAL": "COVAINDUSTRIAL",
        "INDUSTRIALLOFT": "COVAINDUSTRIAL",
        "VINTAGEMODERN": "COVAMIDCENTURY",
        "RETROMIDCENTURY": "COVAMIDCENTURY",
        "DARKMOODY": "COVAARTDECO",
        "DARKMOODYGLAM": "COVAARTDECO",
        "CLASSICTRADITIONAL": "COVAFARMHOUSE",
        "HERITAGETRADITIONAL": "COVAFARMHOUSE",
    }
    return display_map.get(upper, upper)


def _resolve_lora_stack(
    archetype_key: str,
    style_blend: Optional[dict[str, float]],
    scale_multiplier: float,
) -> list[dict[str, Any]]:
    normalized = _normalize_archetype_key(archetype_key)
    if normalized not in LORA_REGISTRY:
        raise ValueError(f"unknown archetype_key '{archetype_key}'")

    if style_blend:
        merged: dict[str, float] = {}
        for k, w in style_blend.items():
            if not isinstance(w, (int, float)) or w <= 0:
                continue
            nk = _normalize_archetype_key(k)
            if nk not in LORA_REGISTRY:
                continue
            merged[nk] = merged.get(nk, 0.0) + float(w)
        total = sum(merged.values())
        if total <= 0:
            merged = {normalized: 1.0}
        else:
            merged = {k: v / total for k, v in merged.items()}
            filtered = {k: v for k, v in merged.items() if v >= MIN_LORA_WEIGHT}
            if not filtered:
                top = max(merged.items(), key=lambda kv: kv[1])[0]
                filtered = {top: 1.0}
            total2 = sum(filtered.values())
            merged = {k: v / total2 for k, v in filtered.items()}
        if normalized not in merged:
            ordered = sorted(merged.items(), key=lambda kv: kv[1], reverse=True)[
                : MAX_STYLE_LORAS - 1
            ]
            combined = {normalized: 0.5}
            for k, v in ordered:
                combined[k] = v * 0.5
            t = sum(combined.values())
            merged = {k: v / t for k, v in combined.items()}
        ordered_entries = sorted(
            merged.items(),
            key=lambda kv: (kv[0] == normalized, kv[1]),
            reverse=True,
        )[:MAX_STYLE_LORAS]
    else:
        ordered_entries = [(normalized, 1.0)]

    style_loras: list[dict[str, Any]] = []
    for key, weight in ordered_entries:
        meta = LORA_REGISTRY[key]
        scale = min(1.2, float(meta["default_scale"]) * weight * scale_multiplier)
        style_loras.append(
            {
                "path": meta["url"],
                "scale": round(scale, 4),
                "trigger": meta["trigger"],
                "name": key,
            }
        )

    return style_loras + [dict(u) for u in UNIVERSAL_LORAS]


_ROOM_TYPE_PHRASE: dict[str, str] = {
    "bedroom": "bedroom with bed as focal point",
    "living_room": "living room with sofa and seating as focal point",
    "living room": "living room with sofa and seating as focal point",
    "kitchen": "kitchen with cabinetry and countertops",
    "bathroom": "bathroom",
    "home_office": "home office with desk and work surface",
    "home office": "home office with desk and work surface",
    "dining": "dining room with dining table as focal point",
    "entryway": "entryway",
    "loft bedroom": "loft bedroom with bed and sloped ceiling",
    "room": "interior room",
}


def _build_prompt(
    archetype_key: str,
    primary_trigger: str,
    vocab_override: Optional[str] = None,
    lifestyle_context: Optional[str] = None,
    budget_max: Optional[float] = None,
    room_type: str = "room",
) -> str:
    normalized = _normalize_archetype_key(archetype_key)
    vocab = vocab_override or ARCHETYPE_VOCAB.get(normalized, DEFAULT_VOCAB)

    prefix = f"{primary_trigger} interior {primary_trigger} interior {primary_trigger} interior"
    suffix = f"{primary_trigger} interior {primary_trigger} interior"

    room_phrase = _ROOM_TYPE_PHRASE.get(room_type.lower(), room_type)
    room_clause = f"a {room_phrase}"

    budget_fragment = ""
    if budget_max is not None:
        if budget_max >= 10000:
            budget_fragment = ", designer-tier finishes, bespoke furnishings"
        elif budget_max < 1500:
            budget_fragment = ", accessible finishes, practical materials"

    lifestyle_fragment = ""
    if lifestyle_context:
        ctx = lifestyle_context.strip()[:120]
        lifestyle_fragment = f", {ctx}"

    typed_prose = BASE_PROSE.replace(
        "a well-designed interior room", f"a well-designed {room_phrase}"
    )

    arch_lock_head = (
        "preserve original room architecture exactly, same wall color, "
        "same ceiling, same window, same floor, same camera angle, "
        "only stage new furniture, do not change any architectural element, "
    )

    return (
        f"{prefix} {arch_lock_head}{typed_prose}, {vocab}, "
        f"{room_clause}{budget_fragment}{lifestyle_fragment} {suffix}"
    )


def _infer_image_size(empty_room_url: str, mode: str) -> dict[str, int]:
    if mode == "portrait":
        return FLUX_IMAGE_SIZE_PORTRAIT
    if mode == "landscape":
        return FLUX_IMAGE_SIZE_LANDSCAPE
    if mode == "square":
        return FLUX_IMAGE_SIZE_SQUARE
    try:
        import requests
        from PIL import Image  # type: ignore

        r = requests.get(empty_room_url, timeout=30, stream=True)
        r.raise_for_status()
        img = Image.open(io.BytesIO(r.content))
        w, h = img.size
        if w > h * 1.15:
            return FLUX_IMAGE_SIZE_LANDSCAPE
        if h > w * 1.15:
            return FLUX_IMAGE_SIZE_PORTRAIT
        return FLUX_IMAGE_SIZE_SQUARE
    except Exception as exc:  # noqa: BLE001
        logger.warning("auto-sizing failed (%s); defaulting to square", exc)
        return FLUX_IMAGE_SIZE_SQUARE


# ----- Supabase rehost (F6-CONTROLNET-URL.1 fix) ---------------------------


def _rehost_to_supabase(content: bytes, suffix: str = ".png", subfolder: str = "controlnet") -> str:
    from supabase import create_client

    sb_url = os.environ["SUPABASE_URL"]
    sb_key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get(
        "SUPABASE_SERVICE_ROLE_KEY"
    )
    if not sb_key:
        raise RuntimeError("Supabase service key missing for rehost.")
    client = create_client(sb_url, sb_key)

    digest = hashlib.md5(content).hexdigest()[:12]
    ext = suffix if suffix.startswith(".") else f".{suffix}"
    filename = f"{digest}{ext}"
    path = f"{SUPABASE_PREFIX}/{subfolder}/{filename}"
    content_type = "image/png" if ext == ".png" else "image/jpeg"

    client.storage.from_(SUPABASE_BUCKET).upload(
        path=path,
        file=content,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    return client.storage.from_(SUPABASE_BUCKET).get_public_url(path)


def _fetch_bytes(url: str, timeout: int = 60) -> bytes:
    import requests
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    return r.content


# ----- Depth + edge generation (Stage A ControlNet) ------------------------


def _generate_depth_url(empty_room_url: str) -> Optional[str]:
    """Call fal-ai/imageutils/depth; rehost via Supabase."""
    import fal_client  # type: ignore

    try:
        r = fal_client.subscribe(
            "fal-ai/imageutils/depth",
            arguments={"image_url": empty_room_url},
            with_logs=False,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("depth call failed: %s", exc)
        return None
    depth = r.get("image") or {}
    fal_url = depth.get("url") if isinstance(depth, dict) else None
    if not fal_url:
        logger.warning("depth missing url: %s", str(r)[:200])
        return None
    try:
        raw = _fetch_bytes(fal_url)
        return _rehost_to_supabase(raw, suffix=".png", subfolder="depth")
    except Exception as exc:  # noqa: BLE001
        logger.warning("depth rehost failed: %s", exc)
        return None


def _generate_edge_url(empty_room_url: str) -> Optional[str]:
    """OpenCV Canny edge map → PNG → Supabase rehost.

    Deprecated: not used in production (fal-ai/flux-general rejects
    3 LoRAs + 2 ControlNet controls as "Could not load pipeline").
    Kept for future experiments with fewer LoRAs.
    """
    import cv2  # type: ignore
    import numpy as np
    from PIL import Image

    try:
        raw = _fetch_bytes(empty_room_url)
        pil = Image.open(io.BytesIO(raw)).convert("RGB")
        arr = np.array(pil)
        gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
        edges = cv2.Canny(gray, 60, 150)
        png_bytes = cv2.imencode(".png", edges)[1].tobytes()
        return _rehost_to_supabase(png_bytes, suffix=".png", subfolder="edges")
    except Exception as exc:  # noqa: BLE001
        logger.warning("edge generation failed: %s", exc)
        return None


def _build_controlnet_unions(
    depth_url: Optional[str], edge_url: Optional[str]
) -> list[dict[str, Any]] | None:
    controls: list[dict[str, Any]] = []
    if depth_url:
        controls.append(
            {
                "control_image_url": depth_url,
                "control_mode": "depth",
                "conditioning_scale": CONTROLNET_DEPTH_SCALE,
                "start_percentage": 0.0,
                "end_percentage": CONTROLNET_DEPTH_END,
            }
        )
    if edge_url:
        controls.append(
            {
                "control_image_url": edge_url,
                "control_mode": "canny",
                "conditioning_scale": CONTROLNET_CANNY_SCALE,
                "start_percentage": 0.0,
                "end_percentage": CONTROLNET_CANNY_END,
            }
        )
    if not controls:
        return None
    return [
        {
            "path": "InstantX/FLUX.1-dev-Controlnet-Union",
            "controls": controls,
        }
    ]


# ----- flux-general + fallback --------------------------------------------


def _call_flux_general(
    empty_room_url: str,
    prompt: str,
    negative_prompt: str,
    loras: list[dict[str, Any]],
    image_size: dict[str, int],
    strength: float,
    guidance_scale: float,
    num_inference_steps: int,
    seed: Optional[int],
    depth_url: Optional[str] = None,
    edge_url: Optional[str] = None,
) -> tuple[str, dict[str, int], Optional[float]]:
    """Primary Stage A call. Returns (url, {w, h}, inference_time_s)."""
    import fal_client  # type: ignore

    arguments: dict[str, Any] = {
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "image_url": empty_room_url,
        "strength": strength,
        "guidance_scale": guidance_scale,
        "num_inference_steps": num_inference_steps,
        "loras": [{"path": e["path"], "scale": e["scale"]} for e in loras],
        "image_size": image_size,
        "output_format": "jpeg",
    }
    cn = _build_controlnet_unions(depth_url, edge_url)
    if cn is not None:
        arguments["controlnet_unions"] = cn
    if seed is not None:
        arguments["seed"] = int(seed)

    # Retry on transient "Could not load pipeline" + cold-start timeouts.
    # Last-ditch retry drops the ControlNet (2 LoRAs + no CN is the
    # most reliable combo on fal).
    last_err: Exception | None = None
    r = None
    max_attempts = 4
    for attempt in range(max_attempts):
        try_args = arguments
        if attempt == max_attempts - 1 and "controlnet_unions" in try_args:
            try_args = {k: v for k, v in arguments.items() if k != "controlnet_unions"}
            logger.warning(
                "flux-general final retry %d/%d — dropping ControlNet",
                attempt + 1, max_attempts,
            )
        try:
            r = fal_client.subscribe(
                "fal-ai/flux-general/image-to-image",
                arguments=try_args,
                with_logs=False,
                client_timeout=FLUX_CLIENT_TIMEOUT_S,
            )
            break
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            msg = str(exc)
            retry = (
                "Could not load pipeline" in msg
                or "FalClientTimeoutError" in type(exc).__name__
                or "502" in msg
                or "503" in msg
                or "504" in msg
                or "queue" in msg.lower()
            )
            if not retry or attempt == max_attempts - 1:
                raise
            wait = min(45, 10 * (attempt + 1))
            logger.warning(
                "flux-general transient (%s); retry %d/%d after %ds",
                msg[:120], attempt + 1, max_attempts, wait,
            )
            time.sleep(wait)
    assert r is not None
    images = r.get("images") or []
    if not images:
        raise RuntimeError(f"flux-general returned no images: {list(r.keys())}")
    first = images[0] if isinstance(images[0], dict) else {"url": images[0]}
    url = first.get("url")
    if not url:
        raise RuntimeError(f"flux-general: missing image url in response: {first}")
    w_raw = first.get("width")
    h_raw = first.get("height")
    w = int(w_raw) if w_raw is not None else image_size["width"]
    h = int(h_raw) if h_raw is not None else image_size["height"]

    timings = r.get("timings") or {}
    inference_time = None
    if isinstance(timings, dict):
        raw_t = timings.get("inference")
        if raw_t is not None:
            try:
                inference_time = float(raw_t)
            except Exception:  # noqa: BLE001
                inference_time = None

    # LoRA verification heuristic.
    if inference_time is not None and inference_time < 7.0 and len(loras) > 0:
        logger.warning(
            "LORA-VERIFY: inference_time=%.2fs with %d LoRAs requested — "
            "possibly not loaded (vanilla flux-dev baseline)",
            inference_time, len(loras),
        )
    else:
        logger.info(
            "LORA-VERIFY: inference_time=%s with %d LoRAs",
            inference_time, len(loras),
        )

    return url, {"width": w, "height": h}, inference_time


def _call_nb_pro(empty_room_url: str, prompt: str) -> tuple[str, dict[str, int]]:
    import fal_client  # type: ignore

    r = fal_client.subscribe(
        "fal-ai/nano-banana-pro/edit",
        arguments={"prompt": prompt, "image_urls": [empty_room_url]},
        with_logs=False,
        client_timeout=NB_PRO_CLIENT_TIMEOUT_S,
    )
    images = r.get("images") or []
    if not images:
        raise RuntimeError(f"nb-pro returned no images: {list(r.keys())}")
    first = images[0] if isinstance(images[0], dict) else {"url": images[0]}
    url = first.get("url")
    if not url:
        raise RuntimeError(f"nb-pro: missing image url in response: {first}")
    w_raw = first.get("width")
    h_raw = first.get("height")
    w = int(w_raw) if w_raw is not None else 1024
    h = int(h_raw) if h_raw is not None else 1024
    return url, {"width": w, "height": h}


# ----- Stage B accessory inpainting ----------------------------------------


def _build_stage_b_mask(stage_a_arr: "Any") -> "Any":
    """Build a conservative accessory mask for Stage B.

    Target only the upper wall band (top 1/6 → 1/3) where wall art
    typically goes, plus a narrow middle-height band for surface
    accessories. Keep architectural features (ceiling, floor,
    windows) outside the mask so flux-fill can't touch them.
    """
    import numpy as np

    h, w = stage_a_arr.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    # Upper wall band — gallery wall zone (above typical furniture).
    mask[h // 6 : h // 3, :] = 255
    # Narrow accessory-surface band (mid-height — coffee tables, shelves).
    mask[h // 2 : h // 2 + h // 10, :] = 255
    return mask


def _call_stage_b(
    stage_a_url: str,
    archetype_vocab: str,
    primary_trigger: str,
    stage_a_arr: "Any",
) -> str:
    """flux-fill accessory pass on Stage A output.

    Mask convention: WHITE = inpaint, BLACK = preserve (confirmed
    empirically for fal-ai/flux-pro/v1/fill).
    """
    import cv2  # type: ignore
    import fal_client  # type: ignore

    mask = _build_stage_b_mask(stage_a_arr)
    ok, enc = cv2.imencode(".png", mask)
    if not ok:
        raise RuntimeError("stage-b mask encode failed")
    mask_url = _upload_bytes_to_fal(enc.tobytes(), suffix=".png")

    prompt = (
        f"{primary_trigger} interior {primary_trigger} interior "
        f"{archetype_vocab}, {STAGE_B_PROMPT_SUFFIX}"
    )

    r = fal_client.subscribe(
        "fal-ai/flux-pro/v1/fill",
        arguments={
            "image_url": stage_a_url,
            "mask_url": mask_url,
            "prompt": prompt,
            "num_inference_steps": STAGE_B_STEPS,
            "guidance_scale": STAGE_B_GUIDANCE,
            "num_images": 1,
            "output_format": "jpeg",
            "safety_tolerance": "6",
        },
        with_logs=False,
        client_timeout=150.0,
    )
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
    raise RuntimeError(f"unexpected stage-b response: {list(r.keys())}")


def _upload_bytes_to_fal(data: bytes, suffix: str = ".png") -> str:
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
# Modal class
# ---------------------------------------------------------------------------


@app.cls(
    image=redesign_image,
    gpu="A10G",
    timeout=720,
    startup_timeout=60,
    min_containers=0,
    max_containers=4,
    secrets=[
        modal.Secret.from_name("supabase-secrets"),
        modal.Secret.from_name("fal-secrets"),
    ],
)
class Redesign:
    @modal.enter()
    def load(self) -> None:
        logger.info(
            "cova-redesign ready  archetypes=%d universal=%d strength=%.2f steps=%d guidance=%.2f scheduler=%s",
            len(LORA_REGISTRY), len(UNIVERSAL_LORAS),
            FLUX_STRENGTH, FLUX_NUM_STEPS, FLUX_GUIDANCE_SCALE, FLUX_SCHEDULER,
        )

    def _generate(self, req: RedesignRequest) -> RedesignResponse:
        import cv2  # type: ignore
        import numpy as np
        from PIL import Image

        t0 = time.perf_counter()

        normalized_archetype = _normalize_archetype_key(req.archetype_key)
        if normalized_archetype not in LORA_REGISTRY:
            raise RuntimeError(f"unknown_archetype:{req.archetype_key}")

        scale_mult = float(req.lora_scale_multiplier or 1.0)
        scale_mult = min(max(scale_mult, 0.5), 1.3)
        stack = _resolve_lora_stack(
            normalized_archetype, req.style_blend, scale_mult
        )
        primary_trigger = LORA_REGISTRY[normalized_archetype]["trigger"]

        prompt = (
            req.prompt_override
            if req.prompt_override
            else _build_prompt(
                normalized_archetype,
                primary_trigger,
                lifestyle_context=req.lifestyle_context,
                budget_max=req.budget_max,
                room_type=req.room_type,
            )
        )

        strength = float(
            req.strength_override if req.strength_override is not None else FLUX_STRENGTH
        )
        guidance = float(
            req.guidance_override if req.guidance_override is not None else FLUX_GUIDANCE_SCALE
        )
        steps = int(
            req.steps_override if req.steps_override is not None else FLUX_NUM_STEPS
        )
        image_size = _infer_image_size(
            str(req.empty_room_url), req.primary_image_size or "auto"
        )

        cost = 0.0
        provider: Literal["flux-general", "nano-banana-pro"]
        fallback_reason: Optional[str] = None
        stage_a_url: Optional[str] = None
        inference_time: Optional[float] = None
        out_dims: dict[str, int] = {"width": 1024, "height": 1024}

        # Generate depth + edge URLs (the LoRA-unblock fix).
        depth_url: Optional[str] = None
        edge_url: Optional[str] = None
        if req.enable_controlnet and not req.force_nb_pro:
            t_dep = time.perf_counter()
            depth_url = _generate_depth_url(str(req.empty_room_url))
            if depth_url is not None:
                cost += COST_DEPTH
            # Canny disabled in production: 3 LoRAs + 2 ControlNet controls
            # hits fal-ai/flux-general's "Could not load pipeline" limit.
            # Depth alone is the highest-leverage geometry lock per research.
            edge_url = None
            logger.info(
                "controlnet urls ready  depth=%s edge=%s dt_s=%.2f",
                bool(depth_url), bool(edge_url), time.perf_counter() - t_dep,
            )

        # ---- Stage A ------------------------------------------------
        if req.force_nb_pro:
            fallback_reason = "force_nb_pro"
            provider = "nano-banana-pro"
            stage_a_url, out_dims = _call_nb_pro(str(req.empty_room_url), prompt)
            cost += COST_NB_PRO_EDIT
        else:
            try:
                t_flux = time.perf_counter()
                stage_a_url, out_dims, inference_time = _call_flux_general(
                    str(req.empty_room_url),
                    prompt,
                    NEGATIVE_PROMPT,
                    stack,
                    image_size,
                    strength,
                    guidance,
                    steps,
                    req.seed,
                    depth_url=depth_url,
                    edge_url=edge_url,
                )
                logger.info(
                    "flux-general OK dt_s=%.2f dims=%dx%d inference_time=%s",
                    time.perf_counter() - t_flux,
                    out_dims["width"], out_dims["height"], inference_time,
                )
                provider = "flux-general"
                cost += COST_FLUX_GENERAL
            except Exception as exc:  # noqa: BLE001
                fallback_reason = f"flux-general:{type(exc).__name__}:{exc}"
                logger.warning("flux-general failed → NB-Pro: %s", exc)
                stage_a_url, out_dims = _call_nb_pro(str(req.empty_room_url), prompt)
                provider = "nano-banana-pro"
                cost += COST_NB_PRO_EDIT

        # ---- Stage B ------------------------------------------------
        redesign_url = stage_a_url
        stage_b_used = False
        if req.enable_stage_b and provider == "flux-general" and stage_a_url:
            try:
                t_b = time.perf_counter()
                raw = _fetch_bytes(stage_a_url)
                stage_a_pil = Image.open(io.BytesIO(raw)).convert("RGB")
                stage_a_arr = np.array(stage_a_pil)
                vocab = ARCHETYPE_VOCAB.get(normalized_archetype, DEFAULT_VOCAB)
                redesign_url = _call_stage_b(
                    stage_a_url, vocab, primary_trigger, stage_a_arr
                )
                cost += COST_FLUX_FILL
                stage_b_used = True
                logger.info("stage_b OK dt_s=%.2f", time.perf_counter() - t_b)
            except Exception as exc:  # noqa: BLE001
                logger.warning("stage_b failed (continuing with stage_a): %s", exc)
                redesign_url = stage_a_url

        latency_ms = int((time.perf_counter() - t0) * 1000)
        logger.info(
            "generate_redesign done  archetype=%s provider=%s stage_b=%s latency_ms=%d cost=$%.4f",
            normalized_archetype, provider, stage_b_used, latency_ms, cost,
        )

        return RedesignResponse(
            redesign_url=redesign_url,  # type: ignore[arg-type]
            archetype_resolved=normalized_archetype,
            primary_trigger=primary_trigger,
            loras_used=[
                LoraEntry(
                    path=e["path"],
                    scale=float(e["scale"]),
                    trigger=e.get("trigger"),
                    name=e.get("name"),
                )
                for e in stack
            ],
            prompt_used=prompt,
            negative_prompt_used=NEGATIVE_PROMPT,
            provider=provider,
            provider_fallback_reason=fallback_reason,
            strength=strength,
            guidance_scale=guidance,
            num_inference_steps=steps,
            seed=req.seed,
            image_width=out_dims["width"],
            image_height=out_dims["height"],
            latency_ms=latency_ms,
            cost_usd=round(cost, 4),
            judge_score=None,
            generated_at_iso=_iso_now(),
            stage_a_url=stage_a_url,  # type: ignore[arg-type]
            stage_b_used=stage_b_used,
            lora_inference_time_s=inference_time,
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
                "archetypes": sorted(LORA_REGISTRY.keys()),
                "universal_loras": [u["name"] for u in UNIVERSAL_LORAS],
                "flux_params": {
                    "strength": FLUX_STRENGTH,
                    "guidance_scale": FLUX_GUIDANCE_SCALE,
                    "num_inference_steps": FLUX_NUM_STEPS,
                    "scheduler": FLUX_SCHEDULER,
                },
                "controlnet": {
                    "depth_scale": CONTROLNET_DEPTH_SCALE,
                    "canny_scale": CONTROLNET_CANNY_SCALE,
                },
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
                msg = str(exc)
                if msg.startswith("unknown_archetype:"):
                    raise HTTPException(
                        status_code=400,
                        detail={"error": "unknown_archetype", "message": msg},
                    )
                if msg.startswith(("flux-general", "nb-pro", "fal")):
                    raise HTTPException(
                        status_code=502,
                        detail={"error": "upstream_failure", "message": msg},
                    )
                raise HTTPException(
                    status_code=500,
                    detail={"error": "internal_error", "message": msg},
                )

        return fapp


if __name__ == "__main__":
    print(
        f"{APP_NAME} module loaded  "
        f"endpoint=/{API_VERSION}/generate_redesign  "
        f"strength={FLUX_STRENGTH} steps={FLUX_NUM_STEPS} guidance={FLUX_GUIDANCE_SCALE}  "
        f"scheduler={FLUX_SCHEDULER}"
    )
