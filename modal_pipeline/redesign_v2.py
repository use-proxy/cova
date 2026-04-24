"""Cova Render v2 — Redesign Service (2026-04-21).

Modal app: ``cova-redesign-v2`` (STAGING, NOT production).
A10G GPU. Python 3.10. Single v1 endpoint: POST /v1/generate_redesign.

v2 = two-pass pipeline driven by anchor-derived style rulebooks.

Pass 1 (hero furniture only):
  - flux-general i2i with Depth (0.55) + Canny (0.40) ControlNet stack.
  - 3-LoRA budget: primary style + add-details + reserved 3rd slot (for
    style blend or empty).
  - strength 0.72, guidance 3.8, 32 steps.
  - Prompt: hero_furniture clause from the style's pass1_fragment.
  - Negative: explicit "no wall art, no styled surfaces, no pillows,
    no plants" — walls/surfaces intentionally bare for Pass 2.

Pass 2 (axis-aware decor):
  Routed by the style's density_axis field (Phase 0D calibration):
    - object     (4 styles): standard decor inpaint
    - plant      (Biophilic): 2A object-sparse + 2B plant-dedicated
    - material   (Japandi, Industrial): fewer heavier objects
    - lighting   (Dark Moody Glam): multi-source warm illumination
    - ornamentation (Heritage Traditional): crown molding, carved details
  Strength by density_tier: high 0.72 / medium 0.62 / low 0.55.

Fallback: nano-banana-pro/edit (no LoRAs, no two-pass) on flux-general failure.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import time
from typing import Any, Literal, Optional

import modal
from pydantic import BaseModel, Field, HttpUrl

APP_NAME = "cova-redesign-v2"
API_VERSION = "v1"
SCHEMA_VERSION: Literal["2.0"] = "2.0"


# ---------------------------------------------------------------------------
# Inlined anchor-derived style rules (Phase 0 calibration output).
# Source: /tmp/style-rules/*.json + density_axis derived in Phase 0D.
# ---------------------------------------------------------------------------

STYLE_RULES: dict[str, dict[str, Any]] = {
    "warm-japandi": {
        "display": "Warm Japandi",
        "archetype_key": "COVAJAPANDI",
        "density_tier": "low",
        "density_axis": "material",
        "pass1_fragment": "low-profile light oak platform bed, linen sofa with wooden legs, flat-panel light wood cabinetry, freestanding oval tub, solid oak pedestal table, floating oak desk",
        "pass2_fragment": "1-2 ceramic vases with branches per room, 2-4 objects per surface including wooden bowls and stoneware vessels, 2-4 linen pillows, single jute or wool area rug, paper globe pendant light, 1-2 floor plants in terracotta or rattan",
        "materials": "light oak, linen, ceramic, stone, paper lantern",
        "colors": "beige, cream, soft taupe, warm gray, warm neutral walls",
        "lighting": "warm directional natural light, paper globe pendant, 2-3 sources",
        "wall_coverage_pct": "3-8",
        "wall_piece_count": "0-1",
        "surface_objects": "2-4",
        "plants": "1-2 in stoneware or terracotta",
        "negatives": "dense gallery walls, saturated colors, ornate carved furniture, chrome, heavy drapery, dark wood, industrial metal",
    },
    "maximalist-eclectic": {
        "display": "Maximalist Eclectic",
        "archetype_key": "COVABOHEMIAN",
        "density_tier": "high",
        "density_axis": "object",
        "pass1_fragment": "tufted velvet sofa with brass legs, carved wood furniture, ornate crystal chandelier, layered Persian rugs, patterned tile backsplash",
        "pass2_fragment": "8-20 framed artworks in salon hang arrangement covering 40-70% of wall, 5-10 plants in terracotta and brass vessels on floor corners and shelves, 5-12 objects per surface including stacked books and ceramic bowls and brass candlesticks, 3-5 patterned pillows, layered rugs",
        "materials": "velvet, brass, wood, patterned tile, Persian rug, copper",
        "colors": "emerald green, deep teal, magenta, coral, mustard yellow, navy blue, saturated accents",
        "lighting": "crystal chandelier, warm table lamps, brass sconces, 3-5 sources",
        "wall_coverage_pct": "40-70",
        "wall_piece_count": "8-20",
        "surface_objects": "5-12",
        "plants": "5-10 in terracotta and brass",
        "negatives": "minimalist sparse walls, monochromatic, single small artwork, bare surfaces, all-white, industrial concrete, sleek modernism, empty shelving, plain rugs",
    },
    "biophilic-jungle": {
        "display": "Biophilic Jungle",
        "archetype_key": "COVABIOPHILIC",
        "density_tier": "high",
        "density_axis": "plant",
        "pass1_fragment": "rattan and reclaimed wood furniture, terracotta and natural fiber accents, white upholstery, farmhouse sink, woven pendant lighting",
        "pass2_fragment": "12-20 plants in terracotta and woven vessels on floor clusters and shelves, living green wall covering 60-90% of one wall with cascading vines, 3-5 textured pillows in cream and green tones, jute area rug, 2-4 ceramic and wooden objects per surface",
        "pass2b_plant_fragment": "extensive plant life, 12-20 distinct plants: mature fiddle leaf fig and olive tree in terracotta floor corners, trailing pothos and philodendron in ceramic hangers from ceiling, wall-mounted vertical planters and moss panels, small ferns and air plants on shelves, herb collection on window sills, cascading vines",
        "materials": "rattan, wood, terracotta, natural fiber, concrete, living plants",
        "colors": "deep green, moss green, terracotta, natural tan, cream, saturated organic",
        "lighting": "warm natural light, rattan pendant, 2-3 sources",
        "wall_coverage_pct": "60-90",
        "wall_piece_count": "0-1",
        "surface_objects": "2-4",
        "plants": "12-20 in terracotta, woven, and ceramic vessels",
        "negatives": "bare walls without greenery, chrome, synthetic materials, minimal plant count, sleek modernism, gallery walls with framed art, cool lighting, glass and steel, formal symmetry",
    },
    "heritage-traditional": {
        "display": "Heritage Traditional",
        "archetype_key": "COVAFARMHOUSE",
        "density_tier": "high",
        "density_axis": "ornamentation",
        "pass1_fragment": "carved mahogany four-poster bed, tufted leather chesterfield, ornate marble fireplace, raised-panel cabinetry, clawfoot tub, crystal chandelier, dark wood paneling, brass hardware",
        "pass2_fragment": "3-6 objects per surface including stacked leather-bound books, fresh floral arrangements in ceramic urns, brass candlesticks, 4-6 pillows per seat, single Persian or Oriental rug, 1-3 plants in white ceramic or brass vessels, large gilded-frame landscape painting above mantel",
        "ornamentation_fragment": "dense crown molding, raised-panel wainscoting, carved decorative elements, ornate brass hardware, layered trim and baseboards, classical pilasters, heavy drapery with tassels and tiebacks, gilded frames, polished mahogany detailing",
        "materials": "dark mahogany, marble, brass, leather, silk, polished nickel",
        "colors": "deep green, burgundy, navy blue, cream, gold, warm neutral walls",
        "lighting": "crystal chandelier, wall sconces with pleated shades, brass floor lamp, 4-6 warm sources",
        "wall_coverage_pct": "5-12",
        "wall_piece_count": "1-2",
        "surface_objects": "3-6",
        "plants": "1-3 in white ceramic or brass urns",
        "negatives": "minimalist furniture, open shelving, concrete, bright white walls without molding, modern abstract art, acrylic, geometric patterns, floating vanities, handleless cabinetry, Edison bulbs, raw light oak",
    },
    "dark-moody-glam": {
        "display": "Dark Moody Glam",
        "archetype_key": "COVAARTDECO",
        "density_tier": "medium",
        "density_axis": "lighting",
        "pass1_fragment": "tufted velvet upholstery with brass and gold accents, black marble surfaces, panel molding walls in charcoal and navy",
        "pass2_fragment": "3-5 objects per surface including brass vessels and candles, 4-6 velvet pillows, 1-2 plants in black ceramic pots, single statement mirror or framed art, warm pendant and sconce lighting",
        "lighting_fragment": "multiple practical warm-temp light sources (2200-2700K), glass pendant chandelier with brass frame, ornate table lamps with dark shades, picture lights over art, candles in brass candlesticks, LED accent strips hidden in coffers, wall sconces flanking mirrors, warm pools of light dramatizing the room",
        "materials": "velvet, brass, marble, leather, glass, gold",
        "colors": "charcoal, navy, emerald green, burgundy, gold accents, saturated dark",
        "lighting": "chandelier, table lamps, sconces, pendants, candles, 3-5 warm sources (NOT single overhead)",
        "wall_coverage_pct": "5-12",
        "wall_piece_count": "1-2",
        "surface_objects": "3-5",
        "plants": "1-2 in black ceramic or brass",
        "negatives": "light wood, white or cream walls, minimalist sparse styling, natural fiber baskets, rustic textures, bright primary colors, casual cotton, chrome, Scandinavian simplicity",
    },
    "industrial-loft": {
        "display": "Industrial Loft",
        "archetype_key": "COVAINDUSTRIAL",
        "density_tier": "medium",
        "density_axis": "material",
        "pass1_fragment": "exposed brick walls, polished concrete floors, black metal frame furniture, reclaimed wood surfaces, Edison bulb pendant clusters, large factory windows",
        "pass2_fragment": "2-3 floor plants in concrete or terracotta vessels, 3-5 pillows per seating in charcoal and leather tones, 3-6 ceramic vessels and books per surface, single area rug, 4-8 warm Edison bulb light sources, open metal shelving with curated objects",
        "materials": "exposed brick, concrete, reclaimed wood, black metal, weathered leather, polished concrete flooring",
        "colors": "charcoal gray, warm brick red, cognac leather, natural wood, matte black",
        "lighting": "Edison bulb cluster, track lighting, factory-window natural light, 4-8 sources",
        "wall_coverage_pct": "3-8",
        "wall_piece_count": "0-1",
        "surface_objects": "3-6",
        "plants": "2-3 in concrete or terracotta",
        "negatives": "ornate molding, wallpaper, bright saturated colors, traditional drapes, polished chrome, tufted headboards, gallery walls, floral patterns, light oak, decorative ceiling fixtures",
    },
    "coastal-bright": {
        "display": "Coastal Bright",
        "archetype_key": "COVACOASTAL",
        "density_tier": "low",
        "density_axis": "object",
        "pass1_fragment": "light oak platform bed, white linen slipcovered sofa, round pedestal dining table, rattan chairs with white cushions, white shaker desk, natural wood and white ceramic",
        "pass2_fragment": "2-4 plants in white ceramic or rattan baskets, 4-6 white linen pillows per seating, 2-4 objects per surface including ceramic vessels and small potted plants, single large neutral art piece or bare walls, sheer white curtains, jute area rug",
        "materials": "light wood, white linen, rattan, white ceramic, natural jute",
        "colors": "soft blue, warm natural wood, white, pale sage green, sandy beige",
        "lighting": "rattan pendant, natural light, table lamp, 3-5 warm sources",
        "wall_coverage_pct": "3-8",
        "wall_piece_count": "0-1",
        "surface_objects": "2-4",
        "plants": "2-4 in white ceramic or rattan",
        "negatives": "dark wood, heavy drapery, ornate carved furniture, saturated jewel tones, dense gallery walls, industrial metal, dark moody lighting, maximalist styling, bold geometric, black accents",
    },
    "pure-minimal-white": {
        "display": "Pure Minimal White",
        "archetype_key": "COVAMINIMAL",
        "density_tier": "low",
        "density_axis": "object",
        "pass1_fragment": "floating white platform bed, white upholstered sofa with chrome legs, white marble waterfall island, white pedestal dining table, floating white lacquer desk, sculptural white molded chair",
        "pass2_fragment": "1-2 white ceramic vases with single orchid or bare branches, 1-3 objects per surface including glass vessels and fresh fruit, 2-3 pale gray pillows, single light gray area rug, 1-2 floor plants in white ceramic pots",
        "materials": "white marble, white lacquer, glass, polished concrete, white ceramic",
        "colors": "white, light gray, pale yellow, soft green, cool neutral walls",
        "lighting": "recessed overhead, single pendant, cool natural light, 2-3 sources",
        "wall_coverage_pct": "2-5",
        "wall_piece_count": "0-1",
        "surface_objects": "1-3",
        "plants": "1-2 in white ceramic",
        "negatives": "warm wood, saturated colors, dense gallery walls, patterned textiles, ornate details, brass, layered rugs, clutter, dark walls, heavy drapery, patterned pillows, warm lighting, rustic, vintage",
    },
    "retro-mid-century": {
        "display": "Retro Mid-Century",
        "archetype_key": "COVAMIDCENTURY",
        "density_tier": "medium",
        "density_axis": "object",
        "pass1_fragment": "tapered walnut legs, curved-arm olive sofa, tulip pedestal table, molded plastic shell chairs, low credenza with brass pulls, sunburst mirror accent",
        "pass2_fragment": "2-3 plants in terracotta and brass planters, 4-6 mustard and olive pillows, 3-5 ceramic objects per surface including vases and bowls, single saturated geometric rug, sputnik or starburst pendant lighting",
        "materials": "walnut veneer, teak, brass, ceramic tile, molded plastic",
        "colors": "mustard yellow, burnt orange, olive green, teal, rust red, warm neutral walls",
        "lighting": "sputnik chandelier, starburst pendant, table lamps with tapered bases, 2-4 warm sources",
        "wall_coverage_pct": "5-12",
        "wall_piece_count": "1-2",
        "surface_objects": "3-5",
        "plants": "2-3 in terracotta and brass",
        "negatives": "cool gray walls, minimalist sparse decor, industrial exposed brick, farmhouse shiplap, all-white, contemporary glass, rustic distressed wood, bohemian macrame, traditional molding",
    },
}

# Archetype-key → slug reverse map for dispatch.
ARCHETYPE_TO_SLUG: dict[str, str] = {
    v["archetype_key"]: k for k, v in STYLE_RULES.items()
}

# LoRA registry (mirrored from redesign.py v1 — same 10 trained archetypes).
LORA_REGISTRY: dict[str, dict[str, Any]] = {
    "COVASCANDINAV": {
        "url": "https://v3b.fal.media/files/b/0a968d79/AB1tJAhP5ERC-mvpcMOMM_pytorch_lora_weights.safetensors",
        "trigger": "cvscn", "default_scale": 0.88,
    },
    "COVAJAPANDI": {
        "url": "https://v3b.fal.media/files/b/0a968d9b/TbARCu6Zf_643uHs51Pkv_pytorch_lora_weights.safetensors",
        "trigger": "cvwmn", "default_scale": 0.88,
    },
    "COVABIOPHILIC": {
        "url": "https://v3b.fal.media/files/b/0a968dbb/GYaA_dQYrjs-PDpV0a4fd_pytorch_lora_weights.safetensors",
        "trigger": "cvbio", "default_scale": 0.92,
    },
    "COVAMINIMAL": {
        "url": "https://v3b.fal.media/files/b/0a968e12/Yji4FJHHkUUw4URfsSDOc_pytorch_lora_weights.safetensors",
        "trigger": "cvmin", "default_scale": 0.95,
    },
    "COVAMIDCENTURY": {
        "url": "https://v3b.fal.media/files/b/0a968e41/UEseNdIMoIb99kgJdii7k_pytorch_lora_weights.safetensors",
        "trigger": "cvmcm", "default_scale": 0.85,
    },
    "COVACOASTAL": {
        "url": "https://v3b.fal.media/files/b/0a968e5b/NCxDRtxWaYmUxizoVuTlW_pytorch_lora_weights.safetensors",
        "trigger": "cvcst", "default_scale": 0.85,
    },
    "COVABOHEMIAN": {
        "url": "https://v3b.fal.media/files/b/0a968e7a/ywFfjfD3D9dDexPtA3ki8_pytorch_lora_weights.safetensors",
        "trigger": "cvboh", "default_scale": 0.78,
    },
    "COVAINDUSTRIAL": {
        "url": "https://v3b.fal.media/files/b/0a968e98/_szQS8b6-cYx9_76iNDrx_pytorch_lora_weights.safetensors",
        "trigger": "cvind", "default_scale": 0.80,
    },
    "COVAFARMHOUSE": {
        "url": "https://v3b.fal.media/files/b/0a968eb2/gQJwXgd_ZtJGuUx9EES_P_pytorch_lora_weights.safetensors",
        "trigger": "cvfrm", "default_scale": 0.85,
    },
    "COVAARTDECO": {
        "url": "https://v3b.fal.media/files/b/0a968ecb/hzAWxKHrdtRCfrQhLMkrV_pytorch_lora_weights.safetensors",
        "trigger": "cvdco", "default_scale": 0.82,
    },
}

UNIVERSAL_LORAS: tuple[dict[str, Any], ...] = (
    {
        "path": (
            "https://huggingface.co/Shakker-Labs/FLUX.1-dev-LoRA-add-details/"
            "resolve/main/FLUX-dev-lora-add_details.safetensors"
        ),
        "scale": 0.35,  # spec Phase 2B
        "name": "add-details",
    },
)


# ---------------------------------------------------------------------------
# Pipeline params (spec Phase 2C / 3E)
# ---------------------------------------------------------------------------

PASS1_STRENGTH: float = 0.72
PASS1_GUIDANCE: float = 3.8
PASS1_STEPS: int = 32
PASS1_SCHEDULER: str = "euler"

PASS2_PARAMS_BY_TIER: dict[str, dict[str, Any]] = {
    "high": {"strength": 0.72, "guidance_scale": 4.0, "num_inference_steps": 28},
    "medium": {"strength": 0.62, "guidance_scale": 4.0, "num_inference_steps": 28},
    "low": {"strength": 0.55, "guidance_scale": 4.0, "num_inference_steps": 28},
}

# ControlNet (spec Phase 2B — re-added Canny).
CONTROLNET_DEPTH_SCALE: float = 0.55
CONTROLNET_DEPTH_END: float = 0.85
CONTROLNET_CANNY_SCALE: float = 0.40
CONTROLNET_CANNY_END: float = 0.55

MAX_STYLE_LORAS_WITH_CN = 2  # 2 style + 1 add-details = 3 LoRAs max w/ 2 CN
MIN_LORA_WEIGHT = 0.10

# Image sizes.
FLUX_IMAGE_SIZE_PORTRAIT = {"width": 768, "height": 1024}
FLUX_IMAGE_SIZE_LANDSCAPE = {"width": 1024, "height": 768}
FLUX_IMAGE_SIZE_SQUARE = {"width": 1024, "height": 1024}

# Cost model.
COST_FLUX_GENERAL: float = 0.045
COST_FLUX_FILL: float = 0.05
COST_NB_PRO_EDIT: float = 0.04
COST_DEPTH: float = 0.005

FLUX_CLIENT_TIMEOUT_S: float = 360.0
NB_PRO_CLIENT_TIMEOUT_S: float = 120.0

SUPABASE_BUCKET: str = "room-photos"
SUPABASE_PREFIX: str = "render-upgrade-v2"

logger = logging.getLogger("cova-redesign-v2")
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
)


redesign_v2_image = (
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
# Schemas
# ---------------------------------------------------------------------------


class RedesignV2Request(BaseModel):
    empty_room_url: HttpUrl
    archetype_key: str
    style_blend: dict[str, float] | None = None
    budget_max: float = Field(default=2000.0)
    room_type: str = Field(default="room")
    lifestyle_context: str | None = None

    strength_override: float | None = None
    guidance_override: float | None = None
    steps_override: int | None = None
    lora_scale_multiplier: float | None = None
    seed: int | None = None
    primary_image_size: Literal["auto", "portrait", "landscape", "square"] | None = "auto"

    # v2 switches
    force_nb_pro: bool = False
    enable_pass2: bool = Field(default=True, description="Run axis-aware Pass 2 decor.")
    enable_controlnet: bool = Field(default=True)


class LoraEntry(BaseModel):
    path: str
    scale: float
    trigger: str | None = None
    name: str | None = None


class RedesignV2Response(BaseModel):
    schema_version: Literal["2.0"] = "2.0"
    redesign_url: HttpUrl
    archetype_resolved: str
    style_slug: str
    density_tier: str
    density_axis: str
    primary_trigger: str
    loras_used: list[LoraEntry]
    pass1_prompt: str
    pass2_prompt: str | None
    pass2b_prompt: str | None
    negative_prompt_used: str
    provider: Literal["flux-general-twopass", "flux-general-stage-a-only", "nano-banana-pro"]
    provider_fallback_reason: str | None = None
    pass1_strength: float
    pass2_strength: float | None
    seed: int | None = None
    image_width: int
    image_height: int
    latency_ms: int
    cost_usd: float
    generated_at_iso: str
    pass1_url: HttpUrl | None = None
    pass2a_url: HttpUrl | None = None   # plant-axis only
    pass2_url: HttpUrl | None = None
    lora_inference_time_s_pass1: float | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _fetch_bytes(url: str, timeout: int = 60) -> bytes:
    import requests
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    return r.content


def _normalize_archetype_key(key: str) -> str:
    upper = key.strip().upper().replace(" ", "").replace("-", "").replace("_", "")
    if upper in LORA_REGISTRY:
        return upper
    display_map = {
        "WARMJAPANDI": "COVAJAPANDI",
        "NORDICCALM": "COVASCANDINAV",
        "PURECALM": "COVAMINIMAL",
        "PUREMINIMALWHITE": "COVAMINIMAL",
        "BRIGHTAIRY": "COVACOASTAL",
        "COASTALBRIGHT": "COVACOASTAL",
        "BIOPHILIC": "COVABIOPHILIC",
        "BIOPHILICJUNGLE": "COVABIOPHILIC",
        "MAXIMALISTECLECTIC": "COVABOHEMIAN",
        "URBANINDUSTRIAL": "COVAINDUSTRIAL",
        "INDUSTRIALLOFT": "COVAINDUSTRIAL",
        "RETROMIDCENTURY": "COVAMIDCENTURY",
        "DARKMOODYGLAM": "COVAARTDECO",
        "HERITAGETRADITIONAL": "COVAFARMHOUSE",
    }
    return display_map.get(upper, upper)


def _resolve_lora_stack(
    archetype_key: str,
    style_blend: Optional[dict[str, float]],
    scale_multiplier: float,
    include_universal: bool = True,
    max_style: int = MAX_STYLE_LORAS_WITH_CN,
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
            merged = {k: v for k, v in merged.items() if v >= MIN_LORA_WEIGHT}
            if not merged:
                merged = {normalized: 1.0}
            total2 = sum(merged.values())
            merged = {k: v / total2 for k, v in merged.items()}
        if normalized not in merged:
            ordered = sorted(merged.items(), key=lambda kv: kv[1], reverse=True)[
                : max_style - 1
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
        )[:max_style]
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

    if include_universal:
        return style_loras + [dict(u) for u in UNIVERSAL_LORAS]
    return style_loras


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------


_ROOM_TYPE_PHRASE: dict[str, str] = {
    "bedroom": "bedroom with bed as focal point",
    "living_room": "living room with sofa and seating as focal point",
    "living room": "living room with sofa and seating as focal point",
    "kitchen": "kitchen with cabinetry and countertops",
    "bathroom": "bathroom",
    "home_office": "home office with desk and work surface",
    "home office": "home office with desk and work surface",
    "dining": "dining room with dining table as focal point",
    "dining_room": "dining room with dining table as focal point",
    "entryway": "entryway",
    "room": "interior room",
}

NEGATIVE_BASE = (
    "blurry, low quality, distorted, unrealistic proportions, floating objects, "
    "bad lighting, overexposed, flat, cartoon, 3d render, CGI, watermark, text, "
    "signature, ugly, duplicate furniture, people, person, fisheye lens, "
    "empty generic sparse airbnb staging, hotel lobby, showroom, catalog photo, "
    "different room, different walls, different floor, different ceiling, "
    "changed architecture, changed wall color, changed flooring, "
    "different camera angle, different perspective, renovated, remodeled, "
    "removed window, removed blinds, removed ceiling fan, removed fireplace, "
    "oversized furniture filling entire frame, "
    "furniture fills most of frame"
)

PASS1_NEGATIVE_EXTRA = (
    ", wall art, framed pictures, posters, gallery wall, "
    "styled shelves, decor objects on surfaces, throw pillows, blankets, "
    "plants, vases, candles, table lamps on surfaces"
)


def _build_pass1_prompt(
    style: dict[str, Any],
    primary_trigger: str,
    room_type: str,
    lifestyle_context: Optional[str],
    budget_max: Optional[float],
) -> str:
    room_phrase = _ROOM_TYPE_PHRASE.get(room_type.lower(), room_type)

    budget_fragment = ""
    if budget_max is not None:
        if budget_max >= 10000:
            budget_fragment = ", designer-tier finishes"
        elif budget_max < 1500:
            budget_fragment = ", accessible finishes"

    lifestyle_fragment = ""
    if lifestyle_context:
        ctx = lifestyle_context.strip()[:120]
        lifestyle_fragment = f", {ctx}"

    prefix = f"{primary_trigger} interior {primary_trigger} interior {primary_trigger} interior"
    suffix = f"{primary_trigger} interior {primary_trigger} interior"

    return (
        f"{prefix} editorial interior photograph of a {room_phrase}, "
        f"Architectural Digest feature. "
        f"ROOM STRUCTURE (preserve exactly): same camera angle, same perspective, "
        f"same wide-angle framing, full ceiling visible, original window positions, "
        f"original door positions, original architectural features, preserve original "
        f"room architecture exactly, same wall color, same ceiling, same floor, "
        f"only stage new furniture proportional to room size. "
        f"HERO FURNITURE ONLY: {style['pass1_fragment']}. "
        f"MATERIAL PALETTE: {style['materials']}. "
        f"COLOR PALETTE: {style['colors']}. "
        f"LIGHTING: {style['lighting']}, no overhead fluorescent, warm directional "
        f"natural light from existing windows. "
        f"COMPOSITION: hero furniture occupies roughly 35-50% of frame not more, "
        f"walls intentionally bare for later decoration, surfaces intentionally unstyled "
        f"for later decoration, no wall art, no styled shelves, no throw pillows, "
        f"no plants, no lamps on surfaces. "
        f"Shot at 35mm at eye level, f/4, warm neutral grading, subtle film "
        f"grain{budget_fragment}{lifestyle_fragment}. {suffix}"
    )


def _build_pass2_prompt(
    style: dict[str, Any],
    primary_trigger: str,
    room_type: str,
    axis: str,
    plant_subpass: bool = False,
) -> str:
    """Build axis-aware Pass 2 decor prompt."""
    if axis == "plant" and plant_subpass:
        fragment = style.get("pass2b_plant_fragment", style["pass2_fragment"])
        axis_clause = (
            f"biophilic plant-dedicated styling pass, "
            f"extensive plant life throughout the room. "
            f"PLANT DENSITY: {fragment}. "
            f"VESSEL VOCABULARY: terracotta, ceramic, rattan basket, woven basket, "
            f"concrete, stoneware, brass planters. "
            f"Fill floor corners with large sculptural plants, hang trailing plants "
            f"from ceiling, wall-mounted vertical planters, small plants on surfaces."
        )
    elif axis == "plant" and not plant_subpass:
        axis_clause = (
            f"editorial decor pass for biophilic room, sparse non-plant decor only. "
            f"{style['pass2_fragment']}. "
            f"Leave extensive plant space — plants come in a separate pass. "
            f"No gallery walls, no styled shelves of ceramics competing with plants, "
            f"no additional furniture beyond existing, minimal textile layering."
        )
    elif axis == "material":
        axis_clause = (
            f"material-forward styling pass — density from material richness and texture, "
            f"not object count. {style['pass2_fragment']}. "
            f"Fewer, heavier, more materially interesting objects. "
            f"Each piece of decor must earn its placement through material quality. "
            f"Emphasize {style['materials']}."
        )
    elif axis == "lighting":
        lighting_fragment = style.get("lighting_fragment", style["pass2_fragment"])
        axis_clause = (
            f"lighting-forward moody styling pass — density from light source count, "
            f"not object count. LIGHTING: {lighting_fragment}. "
            f"Plus complementary decor: {style['pass2_fragment']}. "
            f"Each light source warm (2200-2700K), creating dramatic warm pools of light."
        )
    elif axis == "ornamentation":
        orn_fragment = style.get("ornamentation_fragment", "")
        axis_clause = (
            f"ornament-dense traditional styling pass, emphasize architectural and "
            f"decorative ornament density. ORNAMENTATION: {orn_fragment}. "
            f"Plus complementary decor: {style['pass2_fragment']}. "
            f"Classical decorative elements, layered trim, heavy drapery."
        )
    else:  # object (default)
        axis_clause = (
            f"editorial decor styling pass, add decor to staged room WITHOUT changing "
            f"furniture, walls, windows, or floors. {style['pass2_fragment']}. "
            f"DENSITY TARGET: {style['wall_piece_count']} wall pieces, "
            f"{style['surface_objects']} objects per surface, {style['plants']}."
        )

    prefix = f"{primary_trigger} interior {primary_trigger} interior"

    return (
        f"{prefix} {axis_clause} "
        f"EXPLICIT NEGATIVES: no new sofas, no new beds, no new chairs, no new tables, "
        f"no new desks, no changing existing furniture, no moving furniture, "
        f"no changing wall color, no changing floor material, {style['negatives']}. "
        f"Shot at 35mm at eye level, f/4, warm neutral grading, photorealistic."
    )


# ---------------------------------------------------------------------------
# ControlNet helpers (reuse same approach as v1)
# ---------------------------------------------------------------------------


def _rehost_to_supabase(content: bytes, suffix: str = ".png", subfolder: str = "cn") -> str:
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


def _generate_depth_url(empty_room_url: str) -> Optional[str]:
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
        return None
    try:
        raw = _fetch_bytes(fal_url)
        return _rehost_to_supabase(raw, suffix=".png", subfolder="depth")
    except Exception as exc:  # noqa: BLE001
        logger.warning("depth rehost failed: %s", exc)
        return None


def _generate_canny_url(empty_room_url: str) -> Optional[str]:
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
        return _rehost_to_supabase(png_bytes, suffix=".png", subfolder="canny")
    except Exception as exc:  # noqa: BLE001
        logger.warning("canny generation failed: %s", exc)
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


def _infer_image_size(empty_room_url: str, mode: str) -> dict[str, int]:
    if mode == "portrait":
        return FLUX_IMAGE_SIZE_PORTRAIT
    if mode == "landscape":
        return FLUX_IMAGE_SIZE_LANDSCAPE
    if mode == "square":
        return FLUX_IMAGE_SIZE_SQUARE
    try:
        from PIL import Image

        raw = _fetch_bytes(empty_room_url)
        img = Image.open(io.BytesIO(raw))
        w, h = img.size
        if w > h * 1.15:
            return FLUX_IMAGE_SIZE_LANDSCAPE
        if h > w * 1.15:
            return FLUX_IMAGE_SIZE_PORTRAIT
        return FLUX_IMAGE_SIZE_SQUARE
    except Exception as exc:  # noqa: BLE001
        logger.warning("auto-sizing failed (%s); defaulting to square", exc)
        return FLUX_IMAGE_SIZE_SQUARE


# ---------------------------------------------------------------------------
# Fal calls
# ---------------------------------------------------------------------------


def _call_flux_general(
    image_url: str,
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
    scheduler: str = "euler",
) -> tuple[str, dict[str, int], Optional[float]]:
    import fal_client  # type: ignore

    arguments: dict[str, Any] = {
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "image_url": image_url,
        "strength": strength,
        "guidance_scale": guidance_scale,
        "num_inference_steps": num_inference_steps,
        "scheduler": scheduler,
        "loras": [{"path": e["path"], "scale": e["scale"]} for e in loras],
        "image_size": image_size,
        "output_format": "jpeg",
    }
    cn = _build_controlnet_unions(depth_url, edge_url)
    if cn is not None:
        arguments["controlnet_unions"] = cn
    if seed is not None:
        arguments["seed"] = int(seed)

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
        # Also drop Canny (keep Depth) on attempt 2 if we have both
        elif (
            attempt == max_attempts - 2
            and "controlnet_unions" in try_args
            and len(try_args["controlnet_unions"][0]["controls"]) > 1
        ):
            try_args = {**arguments}
            try_args["controlnet_unions"] = [
                {
                    **arguments["controlnet_unions"][0],
                    "controls": [
                        c for c in arguments["controlnet_unions"][0]["controls"]
                        if c["control_mode"] == "depth"
                    ],
                }
            ]
            logger.warning(
                "flux-general retry %d/%d — dropping Canny, keeping Depth only",
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
        raise RuntimeError(f"flux-general: missing image url: {first}")
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
        raise RuntimeError(f"nb-pro: missing image url: {first}")
    w_raw = first.get("width")
    h_raw = first.get("height")
    w = int(w_raw) if w_raw is not None else 1024
    h = int(h_raw) if h_raw is not None else 1024
    return url, {"width": w, "height": h}


# ---------------------------------------------------------------------------
# Modal class
# ---------------------------------------------------------------------------


@app.cls(
    image=redesign_v2_image,
    gpu="A10G",
    timeout=900,
    startup_timeout=60,
    min_containers=0,
    max_containers=4,
    secrets=[
        modal.Secret.from_name("supabase-secrets"),
        modal.Secret.from_name("fal-secrets"),
    ],
)
class RedesignV2:
    @modal.enter()
    def load(self) -> None:
        logger.info(
            "cova-redesign-v2 ready  archetypes=%d pass1_strength=%.2f pass2_tiers=%s",
            len(LORA_REGISTRY), PASS1_STRENGTH,
            {k: v["strength"] for k, v in PASS2_PARAMS_BY_TIER.items()},
        )

    def _generate(self, req: RedesignV2Request) -> RedesignV2Response:
        t0 = time.perf_counter()

        normalized = _normalize_archetype_key(req.archetype_key)
        if normalized not in LORA_REGISTRY:
            raise RuntimeError(f"unknown_archetype:{req.archetype_key}")

        slug = ARCHETYPE_TO_SLUG.get(normalized)
        if slug is None:
            raise RuntimeError(
                f"archetype {normalized} has no STYLE_RULES entry — v2 aborts"
            )
        style = STYLE_RULES[slug]
        primary_trigger = LORA_REGISTRY[normalized]["trigger"]
        density_tier = style["density_tier"]
        density_axis = style["density_axis"]

        scale_mult = float(req.lora_scale_multiplier or 1.0)
        scale_mult = min(max(scale_mult, 0.5), 1.3)
        stack = _resolve_lora_stack(
            normalized, req.style_blend, scale_mult,
            include_universal=True, max_style=MAX_STYLE_LORAS_WITH_CN,
        )

        pass1_prompt = _build_pass1_prompt(
            style, primary_trigger, req.room_type,
            req.lifestyle_context, req.budget_max,
        )
        pass1_negative = NEGATIVE_BASE + PASS1_NEGATIVE_EXTRA

        image_size = _infer_image_size(
            str(req.empty_room_url), req.primary_image_size or "auto"
        )

        strength = float(
            req.strength_override if req.strength_override is not None else PASS1_STRENGTH
        )
        guidance = float(
            req.guidance_override if req.guidance_override is not None else PASS1_GUIDANCE
        )
        steps = int(
            req.steps_override if req.steps_override is not None else PASS1_STEPS
        )

        cost = 0.0
        provider: Literal["flux-general-twopass", "flux-general-stage-a-only", "nano-banana-pro"]
        fallback_reason: Optional[str] = None
        pass1_url: Optional[str] = None
        pass2a_url: Optional[str] = None
        pass2_url: Optional[str] = None
        inference_time_pass1: Optional[float] = None
        out_dims: dict[str, int] = {"width": 1024, "height": 1024}

        # ---- ControlNet URLs --------------------------------------------
        depth_url: Optional[str] = None
        canny_url: Optional[str] = None
        if req.enable_controlnet and not req.force_nb_pro:
            depth_url = _generate_depth_url(str(req.empty_room_url))
            if depth_url is not None:
                cost += COST_DEPTH
            canny_url = _generate_canny_url(str(req.empty_room_url))
            # canny generated locally — no fal cost
            logger.info(
                "cn urls: depth=%s canny=%s", bool(depth_url), bool(canny_url),
            )

        # ---- Pass 1 (hero furniture) ------------------------------------
        if req.force_nb_pro:
            fallback_reason = "force_nb_pro"
            provider = "nano-banana-pro"
            pass1_url, out_dims = _call_nb_pro(str(req.empty_room_url), pass1_prompt)
            cost += COST_NB_PRO_EDIT
            pass2_url = pass1_url  # NB-Pro doesn't do Pass 2
            pass2_prompt_used: Optional[str] = None
            pass2b_prompt_used: Optional[str] = None
        else:
            try:
                t1 = time.perf_counter()
                pass1_url, out_dims, inference_time_pass1 = _call_flux_general(
                    str(req.empty_room_url),
                    pass1_prompt,
                    pass1_negative,
                    stack,
                    image_size,
                    strength,
                    guidance,
                    steps,
                    req.seed,
                    depth_url=depth_url,
                    edge_url=canny_url,
                    scheduler=PASS1_SCHEDULER,
                )
                cost += COST_FLUX_GENERAL
                logger.info(
                    "pass1 OK dt=%.1fs inference_time=%s", time.perf_counter() - t1, inference_time_pass1,
                )
                provider = "flux-general-stage-a-only"  # may upgrade if pass2 succeeds
            except Exception as exc:  # noqa: BLE001
                fallback_reason = f"flux-general-pass1:{type(exc).__name__}:{exc}"
                logger.warning("pass1 failed → NB-Pro: %s", exc)
                pass1_url, out_dims = _call_nb_pro(str(req.empty_room_url), pass1_prompt)
                cost += COST_NB_PRO_EDIT
                provider = "nano-banana-pro"
                pass2_url = pass1_url
                pass2_prompt_used = None
                pass2b_prompt_used = None

            # ---- Pass 2 (axis-aware decor) --------------------------------
            pass2_prompt_used = None
            pass2b_prompt_used = None
            pass2_params = PASS2_PARAMS_BY_TIER[density_tier]
            pass2_strength = pass2_params["strength"]

            if provider == "flux-general-stage-a-only" and req.enable_pass2:
                try:
                    if density_axis == "plant":
                        # 2A: sparse non-plant decor
                        t2a = time.perf_counter()
                        p2a_prompt = _build_pass2_prompt(
                            style, primary_trigger, req.room_type,
                            "plant", plant_subpass=False,
                        )
                        pass2a_url, _dims_a, _ = _call_flux_general(
                            pass1_url,
                            p2a_prompt,
                            NEGATIVE_BASE,
                            stack,
                            image_size,
                            pass2_params["strength"] - 0.05,  # extra-restrained 2A
                            pass2_params["guidance_scale"],
                            pass2_params["num_inference_steps"],
                            req.seed,
                            depth_url=depth_url,
                            edge_url=canny_url,
                        )
                        cost += COST_FLUX_GENERAL
                        logger.info("pass2a (plant sparse) OK dt=%.1fs", time.perf_counter() - t2a)

                        # 2B: plant-dedicated
                        t2b = time.perf_counter()
                        p2b_prompt = _build_pass2_prompt(
                            style, primary_trigger, req.room_type,
                            "plant", plant_subpass=True,
                        )
                        pass2_url, _dims_b, _ = _call_flux_general(
                            pass2a_url,
                            p2b_prompt,
                            NEGATIVE_BASE,
                            stack,
                            image_size,
                            pass2_params["strength"],
                            pass2_params["guidance_scale"],
                            pass2_params["num_inference_steps"],
                            req.seed,
                            depth_url=depth_url,
                            edge_url=canny_url,
                        )
                        cost += COST_FLUX_GENERAL
                        logger.info("pass2b (plant dense) OK dt=%.1fs", time.perf_counter() - t2b)
                        pass2_prompt_used = p2a_prompt
                        pass2b_prompt_used = p2b_prompt
                    else:
                        # Single Pass 2 for object / material / lighting / ornamentation
                        t2 = time.perf_counter()
                        p2_prompt = _build_pass2_prompt(
                            style, primary_trigger, req.room_type,
                            density_axis, plant_subpass=False,
                        )
                        pass2_url, _dims_p2, _ = _call_flux_general(
                            pass1_url,
                            p2_prompt,
                            NEGATIVE_BASE,
                            stack,
                            image_size,
                            pass2_params["strength"],
                            pass2_params["guidance_scale"],
                            pass2_params["num_inference_steps"],
                            req.seed,
                            depth_url=depth_url,
                            edge_url=canny_url,
                        )
                        cost += COST_FLUX_GENERAL
                        logger.info(
                            "pass2 (%s, tier=%s) OK dt=%.1fs",
                            density_axis, density_tier, time.perf_counter() - t2,
                        )
                        pass2_prompt_used = p2_prompt

                    provider = "flux-general-twopass"
                except Exception as exc:  # noqa: BLE001
                    logger.warning("pass2 failed, returning pass1: %s", exc)
                    pass2_url = pass1_url
            else:
                pass2_url = pass1_url

        redesign_url = pass2_url or pass1_url
        latency_ms = int((time.perf_counter() - t0) * 1000)
        logger.info(
            "v2 done archetype=%s slug=%s axis=%s tier=%s provider=%s latency=%dms cost=$%.4f",
            normalized, slug, density_axis, density_tier, provider, latency_ms, cost,
        )

        return RedesignV2Response(
            redesign_url=redesign_url,  # type: ignore[arg-type]
            archetype_resolved=normalized,
            style_slug=slug,
            density_tier=density_tier,
            density_axis=density_axis,
            primary_trigger=primary_trigger,
            loras_used=[
                LoraEntry(
                    path=e["path"], scale=float(e["scale"]),
                    trigger=e.get("trigger"), name=e.get("name"),
                )
                for e in stack
            ],
            pass1_prompt=pass1_prompt,
            pass2_prompt=pass2_prompt_used,
            pass2b_prompt=pass2b_prompt_used,
            negative_prompt_used=pass1_negative,
            provider=provider,
            provider_fallback_reason=fallback_reason,
            pass1_strength=strength,
            pass2_strength=(
                PASS2_PARAMS_BY_TIER[density_tier]["strength"]
                if provider == "flux-general-twopass" else None
            ),
            seed=req.seed,
            image_width=out_dims["width"],
            image_height=out_dims["height"],
            latency_ms=latency_ms,
            cost_usd=round(cost, 4),
            generated_at_iso=_iso_now(),
            pass1_url=pass1_url,  # type: ignore[arg-type]
            pass2a_url=pass2a_url,  # type: ignore[arg-type]
            pass2_url=pass2_url,  # type: ignore[arg-type]
            lora_inference_time_s_pass1=inference_time_pass1,
        )

    @modal.asgi_app()
    def api(self):
        from fastapi import FastAPI, HTTPException

        fapp = FastAPI(title=APP_NAME, version="2.0.0")

        @fapp.get("/healthz")
        def healthz() -> dict:
            return {
                "app": APP_NAME,
                "api_version": API_VERSION,
                "status": "ready",
                "archetypes": sorted(LORA_REGISTRY.keys()),
                "style_slugs": sorted(STYLE_RULES.keys()),
                "density_axes": sorted(
                    {s["density_axis"] for s in STYLE_RULES.values()}
                ),
                "pass1_strength": PASS1_STRENGTH,
                "pass2_params_by_tier": PASS2_PARAMS_BY_TIER,
                "controlnet": {
                    "depth_scale": CONTROLNET_DEPTH_SCALE,
                    "canny_scale": CONTROLNET_CANNY_SCALE,
                },
            }

        @fapp.post(
            f"/{API_VERSION}/generate_redesign",
            response_model=RedesignV2Response,
        )
        def generate_redesign(req: RedesignV2Request) -> RedesignV2Response:
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
                if msg.startswith(("flux-general", "nb-pro", "fal", "pass")):
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
        f"{APP_NAME} module loaded  endpoint=/{API_VERSION}/generate_redesign  "
        f"styles={len(STYLE_RULES)}  pass1_strength={PASS1_STRENGTH}  "
        f"axes={sorted({s['density_axis'] for s in STYLE_RULES.values()})}"
    )
