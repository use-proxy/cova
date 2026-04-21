"""Cova v9 — Redesign Service (Phase 5).

Modal app: ``cova-redesign``. A10G GPU (billing consistency with the rest
of the stack — all heavy compute is delegated to fal.ai).

Single v1 endpoint:

  * ``POST /v1/generate_redesign`` — Resolve weighted LoRA stack from
    (archetype_key, optional style_blend) → build D_full_activation
    prompt with cv* trigger repetitions + archetype vocabulary →
    ``fal-ai/flux-general`` image-to-image on the empty-room render →
    return redesign URL. On any flux-general failure falls back to
    ``fal-ai/nano-banana-pro/edit`` (no LoRA parameter, accepted
    quality reduction).

Ships alongside ``cova-empty-room``: the caller invokes empty-room
first, then passes the empty-room URL into this service.

Frozen upstream contracts (Phase 5):
  * LoRA registry — 10 archetypes × trained weights on v3b.fal.media,
    mirrored from ``apps/web/lib/styles/lora-registry.ts``.
  * FLUX params (research §9.2): strength=0.82, guidance=3.5,
    steps=28, LoRA stack capped at 5 entries (3 style + 2 universal).
  * D_full_activation prompt template (experiments/lora_quality_eval):
    3× trigger prefix, base quality prose, archetype vocabulary,
    2× trigger suffix.

See ``docs/phase-5/CLOSEOUT.md`` for the bench-gated behavior.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Literal, Optional

import modal
from pydantic import BaseModel, Field, HttpUrl

# ---------------------------------------------------------------------------
# Constants (frozen for Phase 5)
# ---------------------------------------------------------------------------

APP_NAME = "cova-redesign"
API_VERSION = "v1"
SCHEMA_VERSION: Literal["1.0"] = "1.0"

# FLUX params — research §9.2.
FLUX_STRENGTH: float = 0.82
FLUX_GUIDANCE_SCALE: float = 3.5
FLUX_NUM_STEPS: int = 28
FLUX_IMAGE_SIZE_PORTRAIT = {"width": 768, "height": 1024}
FLUX_IMAGE_SIZE_LANDSCAPE = {"width": 1024, "height": 768}
FLUX_IMAGE_SIZE_SQUARE = {"width": 1024, "height": 1024}

# Cost model (fal.ai pricing observed in smoke test — experiments/fal_endpoint_smoke_test/report.md).
COST_FLUX_GENERAL: float = 0.045
COST_NB_PRO_EDIT: float = 0.04

# Timeouts tuned for flux-general cold-start tolerance (report.md notes
# cold calls exceed 120s; warm ~13s). We use fal's subscribe (queue + poll)
# with a generous ceiling. Service-level timeout is larger so we never 504
# mid-call.
FLUX_CLIENT_TIMEOUT_S: float = 180.0
NB_PRO_CLIENT_TIMEOUT_S: float = 90.0

# Universal LoRAs layered on top of style LoRAs (same pattern as the
# Phase 4 LoRA training spot-tests: add-details for crisp material
# detail + RealismLora to counteract FLUX's slight over-smoothing).
UNIVERSAL_LORAS: tuple[dict[str, Any], ...] = (
    {
        "path": (
            "https://huggingface.co/Shakker-Labs/FLUX.1-dev-LoRA-add-details/"
            "resolve/main/FLUX-dev-lora-add_details.safetensors"
        ),
        "scale": 0.55,
        "name": "add-details",
    },
    {
        "path": (
            "https://huggingface.co/XLabs-AI/flux-RealismLora/"
            "resolve/main/lora.safetensors"
        ),
        "scale": 0.25,
        "name": "realism",
    },
)

# Trained LoRA registry — mirrored from apps/web/lib/styles/lora-registry.ts
# (auto-generated 2026-04-17). Each entry: url, trigger, default_scale.
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

# Archetype vocabulary strings — the "designer fingerprint" that, per the
# LoRA quality eval, lifts D_full_activation style_match scores into the 9/10
# range. Material-first, 4-6 concrete nouns, no forbidden style names.
# Values below are a superset of ``STYLE_DNA_BLOCKS`` in
# ``apps/web/lib/ai/design-director.ts`` (materials lifted; sentence-style
# punctuation dropped because FLUX weighs comma-separated tokens stronger
# than full sentences at this prompt length).
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

# Fallback vocabulary if caller passes an unknown archetype key.
DEFAULT_VOCAB = (
    "natural materials, balanced composition, considered palette, "
    "soft natural daylight, professional interior staging"
)

# Default base prose — identical to the D_full_activation baseline used in
# experiments/lora_quality_eval/results.json. Held constant so scored variants
# remain comparable when the service is called under eval conditions.
BASE_PROSE = (
    "a well-designed interior room, "
    "photorealistic interior photography, Architectural Digest editorial quality, "
    "35mm lens, natural daylight, sharp focus, high resolution"
)

NEGATIVE_PROMPT = (
    "blurry, low quality, distorted, unrealistic proportions, floating objects, "
    "bad lighting, overexposed, flat, cartoon, illustration, 3d render, CGI, "
    "watermark, text, signature, ugly, poor composition, duplicate furniture"
)

# Max LoRA entries per flux-general call = 3 style + 2 universal.
MAX_STYLE_LORAS = 3
MIN_LORA_WEIGHT = 0.10

logger = logging.getLogger("cova-redesign")
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
)


# ---------------------------------------------------------------------------
# Modal image
# ---------------------------------------------------------------------------

redesign_image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "fastapi[standard]==0.115.4",
        "pydantic>=2.5,<3",
        "requests",
        "fal-client",
        "Pillow",
    )
)

app = modal.App(APP_NAME)


# ---------------------------------------------------------------------------
# Pydantic schemas (v1 — frozen)
# ---------------------------------------------------------------------------


class RedesignRequest(BaseModel):
    empty_room_url: HttpUrl
    archetype_key: str = Field(
        description=(
            "COVA* archetype key (e.g. COVAJAPANDI). Drives trigger + "
            "vocabulary. Required even when style_blend is provided — "
            "it picks the vocabulary."
        )
    )
    style_blend: dict[str, float] | None = Field(
        default=None,
        description=(
            "Optional weighted archetype distribution (COVA* keys → weights "
            "summing to 1.0). When present the LoRA stack is blended; "
            "archetype_key still drives the prompt vocabulary (primary intent)."
        ),
    )
    # Accept v3 fingerprint (12 dims) or the 6D handoff form; we don't
    # currently branch on its contents, but it is logged for calibration
    # and carried through to the Sonnet judge's context.
    style_fingerprint: dict[str, float] | None = Field(
        default=None,
        description="Fingerprint dims 0..1 (v3: 12 dims, legacy: 6 dims).",
    )
    budget_max: float = Field(
        default=2000.0, description="Upper budget bound (USD) for shoppability."
    )
    room_type: str = Field(default="room", description="e.g. bedroom, living_room.")
    lifestyle_context: str | None = Field(
        default=None, description="Optional free-text signal from step-7d."
    )
    # Optional overrides — primarily consumed by the Phase 5 reflection loop.
    strength_override: float | None = None
    guidance_override: float | None = None
    steps_override: int | None = None
    prompt_override: str | None = Field(
        default=None,
        description=(
            "Override the full prompt string. Used only by the reflection "
            "loop; production callers should leave null so the service "
            "composes the D_full_activation template."
        ),
    )
    lora_scale_multiplier: float | None = Field(
        default=None,
        description="Reflection-loop bump applied to style LoRA scales (capped at 1.2).",
    )
    seed: int | None = Field(
        default=None, description="Random seed; omitted → fal picks one."
    )
    primary_image_size: Literal["auto", "portrait", "landscape", "square"] | None = (
        Field(
            default="auto",
            description="Output aspect. 'auto' inspects empty-room image dims.",
        )
    )
    force_nb_pro: bool = Field(
        default=False,
        description="Diagnostic override. Skips flux-general; goes straight to NB-Pro.",
    )
    user_id: str | None = Field(
        default=None, description="Supabase auth.users.id for attribution."
    )


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
    # Populated by the caller (bench harness, not the service) after the
    # vision-judge pass. Included in the schema so the harness can write
    # it back idempotently without violating the contract.
    judge_score: float | None = None
    generated_at_iso: str


# ---------------------------------------------------------------------------
# Helpers (top-level so Modal can pickle them)
# ---------------------------------------------------------------------------


def _iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _normalize_archetype_key(key: str) -> str:
    """Accepts COVAJAPANDI / covajapandi / 'Warm Japandi' forms."""
    upper = key.strip().upper().replace(" ", "").replace("-", "")
    if upper in LORA_REGISTRY:
        return upper
    # Display-name fallback (keep the mapping tiny — not a full sync of the
    # TS DISPLAY_TO_COVA table; only the bench-harness values need to work).
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
    """Build the fal-ai/flux-general LoRA list.

    Ordered: style LoRAs (weighted by blend, primary first) → universal
    LoRAs (fixed). Style scales are `default_scale * weight * multiplier`,
    capped at 1.2 to guard against reflection-loop runaway.
    """
    normalized = _normalize_archetype_key(archetype_key)
    if normalized not in LORA_REGISTRY:
        raise ValueError(
            f"unknown archetype_key '{archetype_key}' — not in LORA_REGISTRY"
        )

    # Resolve weights: blend if present (normalized), else {primary: 1.0}.
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
            # Normalize + drop sub-threshold + re-normalize + top-3.
            merged = {k: v / total for k, v in merged.items()}
            filtered = {k: v for k, v in merged.items() if v >= MIN_LORA_WEIGHT}
            if not filtered:
                top = max(merged.items(), key=lambda kv: kv[1])[0]
                filtered = {top: 1.0}
            total2 = sum(filtered.values())
            merged = {k: v / total2 for k, v in filtered.items()}
        # Ensure the requested primary archetype is in the stack and
        # ordered first (prompt trigger must match).
        if normalized not in merged:
            # Cap blend at 2 secondaries, inject primary at 0.5, renormalize.
            ordered = sorted(merged.items(), key=lambda kv: kv[1], reverse=True)[
                : MAX_STYLE_LORAS - 1
            ]
            combined = {normalized: 0.5}
            for k, v in ordered:
                combined[k] = v * 0.5
            t = sum(combined.values())
            merged = {k: v / t for k, v in combined.items()}
        # Top-3 with primary guaranteed.
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

    # Universal layer (add-details, realism) — fixed order.
    stack = style_loras + [dict(u) for u in UNIVERSAL_LORAS]
    return stack


_ROOM_TYPE_PHRASE: dict[str, str] = {
    "bedroom": "bedroom with bed as focal point",
    "living_room": "living room with sofa and seating as focal point",
    "kitchen": "kitchen with cabinetry and countertops",
    "bathroom": "bathroom",
    "home_office": "home office with desk and work surface",
    "dining": "dining room with dining table as focal point",
    "entryway": "entryway",
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
    """D_full_activation template: 3× trigger prefix + prose + vocab + 2× trigger suffix.

    Template validated in experiments/lora_quality_eval/results.json where
    D_full_activation hit 8.75/10 overall for Japandi and 9.0/10 for
    Industrial. Repeating the trigger as `{trigger} interior` is the form
    FLUX weighs most — dropping `interior` collapses style fidelity.

    Room-type injection (Phase 5 iter2 service fix): without this, FLUX
    at strength 0.7-0.82 hallucinates the "wrong" room type from an
    empty-room shell (piano living rooms morphing to bedrooms, attics
    going flat-ceiling, etc.). Explicit room_type in the prose fixes this
    on rooms 02/03/09/11/12 per the base-run failure analysis.
    """
    normalized = _normalize_archetype_key(archetype_key)
    vocab = (
        vocab_override
        if vocab_override is not None
        else ARCHETYPE_VOCAB.get(normalized, DEFAULT_VOCAB)
    )

    prefix = f"{primary_trigger} interior {primary_trigger} interior {primary_trigger} interior"
    suffix = f"{primary_trigger} interior {primary_trigger} interior"

    room_phrase = _ROOM_TYPE_PHRASE.get(room_type.lower(), room_type)
    room_clause = f"a {room_phrase}"

    # Light budget nudge — only fires at the extremes so mid-range briefs
    # don't tilt toward "luxury" or "affordable" language and confuse FLUX.
    budget_fragment = ""
    if budget_max is not None:
        if budget_max >= 10000:
            budget_fragment = ", designer-tier finishes, bespoke furnishings"
        elif budget_max < 1500:
            budget_fragment = ", accessible finishes, practical materials"

    lifestyle_fragment = ""
    if lifestyle_context:
        ctx = lifestyle_context.strip()
        if len(ctx) > 120:
            ctx = ctx[:120]
        lifestyle_fragment = f", {ctx}"

    # Swap `a well-designed interior room` (in BASE_PROSE) for a room-typed
    # variant so the initial prompt tokens lock the room type.
    typed_prose = BASE_PROSE.replace("a well-designed interior room", f"a well-designed {room_phrase}")

    return (
        f"{prefix} {typed_prose}, {vocab}, preserve original room architecture, "
        f"{room_clause}{budget_fragment}{lifestyle_fragment} {suffix}"
    )


def _infer_image_size(
    empty_room_url: str, mode: str
) -> dict[str, int]:
    """Pick fal image_size to match input aspect when mode='auto'.

    Explicit modes override inspection. Inspection failures fall back to
    square so the service never 500s on a bad HEAD.
    """
    if mode == "portrait":
        return FLUX_IMAGE_SIZE_PORTRAIT
    if mode == "landscape":
        return FLUX_IMAGE_SIZE_LANDSCAPE
    if mode == "square":
        return FLUX_IMAGE_SIZE_SQUARE
    # auto
    try:
        import io
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
) -> tuple[str, dict[str, int]]:
    """fal-ai/flux-general image-to-image. Returns (url, (w, h))."""
    import fal_client  # type: ignore

    # fal-ai/flux-general/image-to-image rejects output_format "webp"
    # (enum is literal 'jpeg' | 'png') and has no output_quality field —
    # keep to jpeg for smaller payloads. image_size must be a {width, height}
    # dict OR a preset string; we use dict so aspect honors the empty-room.
    arguments: dict[str, Any] = {
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "image_url": empty_room_url,
        "strength": strength,
        "guidance_scale": guidance_scale,
        "num_inference_steps": num_inference_steps,
        "loras": [
            {"path": e["path"], "scale": e["scale"]} for e in loras
        ],
        "image_size": image_size,
        "output_format": "jpeg",
    }
    if seed is not None:
        arguments["seed"] = int(seed)

    r = fal_client.subscribe(
        "fal-ai/flux-general/image-to-image",
        arguments=arguments,
        with_logs=False,
        client_timeout=FLUX_CLIENT_TIMEOUT_S,
    )
    images = r.get("images") or []
    if not images:
        raise RuntimeError(f"flux-general returned no images: keys={list(r.keys())}")
    first = images[0] if isinstance(images[0], dict) else {"url": images[0]}
    url = first.get("url")
    if not url:
        raise RuntimeError(f"flux-general: missing image url in response: {first}")
    w_raw = first.get("width")
    h_raw = first.get("height")
    w = int(w_raw) if w_raw is not None else image_size["width"]
    h = int(h_raw) if h_raw is not None else image_size["height"]
    return url, {"width": w, "height": h}


def _call_nb_pro(
    empty_room_url: str,
    prompt: str,
) -> tuple[str, dict[str, int]]:
    """fal-ai/nano-banana-pro/edit fallback. No LoRA parameter accepted.

    NB-Pro expects `image_urls` (array) per the smoke-test gotcha.
    """
    import fal_client  # type: ignore

    r = fal_client.subscribe(
        "fal-ai/nano-banana-pro/edit",
        arguments={"prompt": prompt, "image_urls": [empty_room_url]},
        with_logs=False,
        client_timeout=NB_PRO_CLIENT_TIMEOUT_S,
    )
    images = r.get("images") or []
    if not images:
        raise RuntimeError(f"nb-pro returned no images: keys={list(r.keys())}")
    first = images[0] if isinstance(images[0], dict) else {"url": images[0]}
    url = first.get("url")
    if not url:
        raise RuntimeError(f"nb-pro: missing image url in response: {first}")
    # NB-Pro sometimes returns width/height as explicit None rather than
    # omitting them — `.get(..., default)` won't substitute in that case.
    w_raw = first.get("width")
    h_raw = first.get("height")
    w = int(w_raw) if w_raw is not None else 1024
    h = int(h_raw) if h_raw is not None else 1024
    return url, {"width": w, "height": h}


# ---------------------------------------------------------------------------
# Modal class
# ---------------------------------------------------------------------------


@app.cls(
    image=redesign_image,
    gpu="A10G",
    timeout=300,
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
            "cova-redesign container ready  archetypes=%d universal_loras=%d",
            len(LORA_REGISTRY),
            len(UNIVERSAL_LORAS),
        )

    def _generate(self, req: RedesignRequest) -> RedesignResponse:
        t0 = time.perf_counter()

        # ---------------- Resolve archetype + LoRA stack ----------------
        normalized_archetype = _normalize_archetype_key(req.archetype_key)
        if normalized_archetype not in LORA_REGISTRY:
            raise RuntimeError(
                f"unknown_archetype:{req.archetype_key}"
            )

        scale_mult = float(req.lora_scale_multiplier or 1.0)
        scale_mult = min(max(scale_mult, 0.5), 1.3)  # clamp for safety
        stack = _resolve_lora_stack(
            normalized_archetype, req.style_blend, scale_mult
        )

        primary_trigger = LORA_REGISTRY[normalized_archetype]["trigger"]

        # ---------------- Prompt ----------------------------------------
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

        # ---------------- FLUX params -----------------------------------
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
        redesign_url: str
        out_dims: dict[str, int]

        # ---------------- Primary path — flux-general -------------------
        if req.force_nb_pro:
            fallback_reason = "force_nb_pro"
            provider = "nano-banana-pro"
            redesign_url, out_dims = _call_nb_pro(str(req.empty_room_url), prompt)
            cost += COST_NB_PRO_EDIT
        else:
            try:
                t_flux0 = time.perf_counter()
                redesign_url, out_dims = _call_flux_general(
                    str(req.empty_room_url),
                    prompt,
                    NEGATIVE_PROMPT,
                    stack,
                    image_size,
                    strength,
                    guidance,
                    steps,
                    req.seed,
                )
                logger.info(
                    "TIMING flux_general dt_s=%.3f dims=%dx%d",
                    time.perf_counter() - t_flux0, out_dims["width"], out_dims["height"],
                )
                provider = "flux-general"
                cost += COST_FLUX_GENERAL
            except Exception as exc:  # noqa: BLE001
                fallback_reason = f"flux-general:{type(exc).__name__}:{exc}"
                logger.warning("flux-general failed — falling back to NB-Pro: %s", exc)
                t_nb0 = time.perf_counter()
                redesign_url, out_dims = _call_nb_pro(
                    str(req.empty_room_url), prompt
                )
                logger.info("TIMING nb_pro dt_s=%.3f", time.perf_counter() - t_nb0)
                provider = "nano-banana-pro"
                cost += COST_NB_PRO_EDIT

        latency_ms = int((time.perf_counter() - t0) * 1000)
        logger.info(
            "generate_redesign done  archetype=%s provider=%s latency_ms=%d cost=$%.4f",
            normalized_archetype, provider, latency_ms, cost,
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
        )

    # ------------------------------------------------------------------
    # ASGI
    # ------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Local sanity check
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    print(
        f"{APP_NAME} module loaded  "
        f"endpoint=/{API_VERSION}/generate_redesign  "
        f"archetypes={len(LORA_REGISTRY)}  "
        f"universal_loras={len(UNIVERSAL_LORAS)}"
    )
