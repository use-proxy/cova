"""Cova V3 empty-room pipeline — Gemini 3 (nano-banana-pro/edit) conditional.

Production Modal app: ``cova-empty-room-v3``.

Architecture (validated on 15-room bench, 13.5/15 → 15/15 after retry):
  1. Occlusion assessment    — Claude Sonnet 4.5, binary router
  2. Conditional pre-pass    — if needs_anti_hallucination: Claude describes
                               adjacent-surface context per removable item
  3. Gemini edit             — fal-ai/nano-banana-pro/edit with either the
                               standard v1 prompt or the anti-hal prompt
                               (per-item PAINT HERE context + CRITICAL RULE)
  4. Strict emptiness audit  — Claude Sonnet 4.5, returns residual list + 0-10 score
  5. Conditional retry       — if residuals non-empty: Gemini with "image
                               still contains [items]" prompt, re-audit
  6. Final verdict + response

Deprecated sibling — ``modal_pipeline/empty_room_v3.py`` is the *Phase A*
SAM3+LaMa scaffold the team killed on 2026-04-21 after the bake-off picked
Gemini as the primary engine. It is kept only because the bench harness in
``scripts/`` still imports helpers from it. New code should not import from
there; this file (``empty_room_gemini.py``) is the production V3 engine.

Entry function: ``generate_empty_room_v3(image_url, seed=None, skip_cache=False)``
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import random
import time
from dataclasses import dataclass
from typing import Any, Optional

import modal

logger = logging.getLogger("cova-empty-room-v3")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


# ---------------------------------------------------------------------------
# Modal app
# ---------------------------------------------------------------------------

APP_NAME = "cova-empty-room-v3"
app = modal.App(APP_NAME)

IMAGE = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "fal-client>=0.5.0",
        "anthropic>=0.40.0",
        "requests>=2.31.0",
        "pydantic>=2.0",
        "fastapi>=0.110",
    )
)

SECRETS = [
    modal.Secret.from_name("fal-secrets"),
    modal.Secret.from_name("anthropic-credentials"),
]


# ---------------------------------------------------------------------------
# Cost constants (measured per-call from bench; conservative)
# ---------------------------------------------------------------------------

COST_OCCLUSION_USD = 0.02
COST_PREPASS_USD = 0.03
COST_GEMINI_USD = 0.25
COST_AUDIT_USD = 0.05


# ---------------------------------------------------------------------------
# Prompts (match bench scripts exactly; do not drift)
# ---------------------------------------------------------------------------

STATIC_V1_PROMPT = (
    "Remove all furniture, bedding, rugs, clothing, electronics, personal items, "
    "decor, plants, lamps, posters, and clutter from this room. Keep the exact "
    "same walls, wall color, ceiling, ceiling fixtures, floor, floor material, "
    "windows, window treatments, doors, built-ins, architectural features, wall "
    "text, and camera angle. The result should be a completely empty barren room "
    "with only the architecture visible."
)

OCCLUSION_PROMPT = """Analyze this room photo. Determine whether removing the furniture and clutter would require the image editor to paint in significant wall, floor, or ceiling regions that are currently covered. This is true when items are mounted on walls, when furniture is pushed flush against walls blocking them, when curtains or drapes cover wall sections, or when large freestanding items occlude architectural regions.

This is false when items are freestanding in the middle of the room with walls fully visible behind them, when items are small and don't block significant architecture, or when there's nothing significant behind the items being removed.

Return STRICT JSON only:
{
  "needs_anti_hallucination": true/false,
  "reason": "one-line explanation",
  "items_causing_occlusion": ["list of specific items if true, empty array if false"]
}"""

PREPASS_PROMPT = """You are describing a room photo to help an image editor remove furniture and clutter without hallucinating new features. For each removable item in this image, describe what is immediately adjacent to it (the wall surface, color, texture) so the editor knows exactly what to paint when the item is removed. Keep descriptions concrete.

Return STRICT JSON only:
{
  "removal_context": [
    {
      "item": "specific description of a removable item",
      "adjacent_context": "concrete description of the wall / floor / ceiling surface that borders the item — its color, material, and any architectural features that ARE present or ARE NOT present in that area"
    }
  ]
}"""

ANTI_HALLUCINATION_CLAUSE = (
    "CRITICAL RULE FOR WHAT TO PAINT BEHIND REMOVED ITEMS: When you remove an item, "
    "extend the existing wall, floor, or ceiling material that is adjacent to it. "
    "Match the existing paint color, texture, and material exactly. "
    "DO NOT add any new architectural features. DO NOT add doors where there were no doors. "
    "DO NOT add windows where there were no windows. DO NOT add fireplaces, shelves, "
    "alcoves, niches, or any other permanent feature that wasn't clearly visible in the "
    "input image. If a curtain covered part of a wall, extend that wall exactly — do not "
    "invent what might have been behind the curtain. If furniture was against a wall, "
    "extend that same wall behind where the furniture was — do not add any feature on that wall."
)

STRICT_AUDIT_PROMPT = """You are a strict emptiness auditor. List every single visible item in this image that is NOT part of the building structure.

Building structure means: walls, floor, ceiling, permanent windows with architectural treatments like shutters or honeycomb blinds, doors, door frames, crown molding, baseboards, wainscoting, wall-integrated LED strips, permanent ceiling fixtures (fans, chandeliers, pendant lights, recessed lights), exposed beams, genuinely built-in cabinetry integrated flush into walls, radiators, vents, electrical outlets, light switches, wall text or architectural signage.

Everything else must be listed — freestanding furniture, wall-mounted shelves regardless of how they look, TVs even if mounted, freestanding electric fireplaces, area rugs, curtains, drapes, plants, lamps, art, photos, clothing, personal items, any decor.

Return STRICT JSON only:
{
  "residual_items": ["specific descriptions of each non-structural item"],
  "score": <integer 0-10 where 10 means residual_items is empty>
}"""


def build_anti_hal_main_prompt(removal_context: list[dict]) -> str:
    lines = []
    for entry in removal_context or []:
        item = str(entry.get("item", "")).strip()
        adj = str(entry.get("adjacent_context", "")).strip()
        if item and adj:
            lines.append(f"  - ITEM: {item}\n    PAINT HERE: {adj}")
    context_block = "\n".join(lines) if lines else "  (no specific items flagged by pre-pass)"
    return (
        f"{STATIC_V1_PROMPT}\n\n"
        f"WHAT TO PAINT WHERE ITEMS WERE — for each removable item, this is the exact "
        f"surface that should appear in the output:\n{context_block}\n\n"
        f"{ANTI_HALLUCINATION_CLAUSE}"
    )


def build_retry_prompt(residuals: list[str], include_anti_hal: bool) -> str:
    items = ", ".join(str(x).strip() for x in residuals if str(x).strip())
    base = (
        f"The image still contains: {items}. "
        "Remove each of these specifically while keeping walls, floor, ceiling, "
        "windows, doors, and all other architectural features exactly the same."
    )
    if include_anti_hal:
        base = base + " " + ANTI_HALLUCINATION_CLAUSE
    return base


# ---------------------------------------------------------------------------
# Helpers — fetch image, upload, call Claude, call Gemini
# ---------------------------------------------------------------------------

def _fetch_image_bytes(url: str, timeout_s: int = 60) -> bytes:
    import requests

    r = requests.get(url, timeout=timeout_s)
    r.raise_for_status()
    return r.content


def _upload_png_to_fal(data: bytes) -> str:
    """Re-upload to fal to get a URL fal's tools accept (input may be Supabase
    storage, not fal CDN). Also needed for retry iteration."""
    import fal_client  # type: ignore
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp.write(data)
        path = tmp.name
    try:
        return fal_client.upload_file(path)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


def _sniff_media_type(data: bytes) -> str:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"GIF8"):
        return "image/gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/png"


def _claude_json(prompt: str, image_bytes: bytes, max_tokens: int = 1024) -> dict:
    import anthropic  # type: ignore

    client = anthropic.Anthropic()
    b64 = base64.b64encode(image_bytes).decode("ascii")
    media_type = _sniff_media_type(image_bytes)
    resp = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=max_tokens,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": media_type, "data": b64},
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    )
    t = resp.content[0].text.strip() if resp.content else ""
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t
        if t.endswith("```"):
            t = t[:-3]
        if t.startswith("json\n"):
            t = t[5:]
    s, e = t.find("{"), t.rfind("}")
    if s < 0 or e <= s:
        raise RuntimeError(f"claude JSON parse failed: {t[:200]}")
    return json.loads(t[s:e + 1])


def _call_gemini_edit(image_url: str, prompt: str, seed: Optional[int] = None) -> str:
    import fal_client  # type: ignore

    args: dict[str, Any] = {"prompt": prompt, "image_urls": [image_url]}
    if seed is not None:
        args["seed"] = int(seed)

    last_err: Exception | None = None
    for attempt in range(3):
        try:
            r = fal_client.subscribe(
                "fal-ai/nano-banana-pro/edit",
                arguments=args,
                with_logs=False,
                client_timeout=240.0,
            )
            images = r.get("images") or []
            if not images:
                raise RuntimeError(f"nb-pro no images: {list(r.keys())}")
            first = images[0] if isinstance(images[0], dict) else {"url": images[0]}
            url = first.get("url")
            if not url:
                raise RuntimeError(f"nb-pro no url: {first}")
            return url
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if attempt < 2:
                time.sleep(1.5 * (2 ** attempt))
    raise RuntimeError(f"nano-banana-pro/edit: {type(last_err).__name__}: {last_err}")


# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------

@dataclass
class EmptyRoomV3Response:
    empty_room_url: str
    quality_warning: bool
    residual_items: list[str]
    pipeline_path: str  # "standard" | "anti_hallucination"
    cost_usd: float
    cache_hit: bool = False
    occlusion_reason: str = ""
    retry_used: bool = False
    score_before_retry: Optional[int] = None
    score_final: int = 0

    def to_dict(self) -> dict:
        return {
            "empty_room_url": self.empty_room_url,
            "quality_warning": self.quality_warning,
            "residual_items": self.residual_items,
            "pipeline_path": self.pipeline_path,
            "cost_usd": round(self.cost_usd, 4),
            "cache_hit": self.cache_hit,
            "occlusion_reason": self.occlusion_reason,
            "retry_used": self.retry_used,
            "score_before_retry": self.score_before_retry,
            "score_final": self.score_final,
        }


# ---------------------------------------------------------------------------
# Core pipeline (runs inside the Modal container)
# ---------------------------------------------------------------------------

QUALITY_WARNING_THRESHOLD = 7  # score < 7 sets quality_warning=true


def _generate_empty_room_impl(
    image_url: str,
    seed: Optional[int] = None,
    skip_cache: bool = False,  # noqa: ARG001 — cache lives in web app, not in Modal
) -> EmptyRoomV3Response:
    t0 = time.perf_counter()
    cost_usd = 0.0

    logger.info("v3 start: image_url=%s seed=%s skip_cache=%s", image_url[:80], seed, skip_cache)

    # Fetch input bytes once (needed for all Claude calls)
    input_bytes = _fetch_image_bytes(image_url)

    # Ensure fal has a copy it can feed to nb-pro
    fal_input_url = _upload_png_to_fal(input_bytes)

    # Step 1 — occlusion assessment
    occlusion = _claude_json(OCCLUSION_PROMPT, input_bytes, max_tokens=768)
    cost_usd += COST_OCCLUSION_USD
    needs_antihal = bool(occlusion.get("needs_anti_hallucination", True))
    path = "anti_hallucination" if needs_antihal else "standard"
    logger.info("occlusion: path=%s reason=%s", path, occlusion.get("reason", "")[:80])

    # Step 2 — conditional pre-pass
    if needs_antihal:
        prepass = _claude_json(PREPASS_PROMPT, input_bytes, max_tokens=2500)
        cost_usd += COST_PREPASS_USD
        main_prompt = build_anti_hal_main_prompt(prepass.get("removal_context", []))
    else:
        main_prompt = STATIC_V1_PROMPT

    # Step 3 — Gemini edit
    if seed is None:
        seed = random.randint(1, 2**31 - 1)
    v1_url = _call_gemini_edit(fal_input_url, main_prompt, seed=seed)
    cost_usd += COST_GEMINI_USD
    v1_bytes = _fetch_image_bytes(v1_url)

    # Step 4 — strict audit
    audit = _claude_json(STRICT_AUDIT_PROMPT, v1_bytes, max_tokens=1024)
    cost_usd += COST_AUDIT_USD
    residuals = audit.get("residual_items") or []
    score_v1 = int(audit.get("score", 0)) if isinstance(audit.get("score"), (int, float)) else 0
    logger.info("v1 audit: score=%d residuals=%d", score_v1, len(residuals))

    final_url = v1_url
    final_residuals = residuals
    final_score = score_v1
    retry_used = False
    score_before_retry: Optional[int] = None

    # Step 5 — conditional retry
    if residuals:
        retry_used = True
        score_before_retry = score_v1
        retry_prompt = build_retry_prompt(residuals, include_anti_hal=needs_antihal)
        v1_fal = _upload_png_to_fal(v1_bytes)
        retry_seed = random.randint(1, 2**31 - 1)
        retry_url = _call_gemini_edit(v1_fal, retry_prompt, seed=retry_seed)
        cost_usd += COST_GEMINI_USD
        retry_bytes = _fetch_image_bytes(retry_url)
        retry_audit = _claude_json(STRICT_AUDIT_PROMPT, retry_bytes, max_tokens=1024)
        cost_usd += COST_AUDIT_USD
        final_residuals = retry_audit.get("residual_items") or []
        final_score = (
            int(retry_audit.get("score", 0))
            if isinstance(retry_audit.get("score"), (int, float))
            else 0
        )
        final_url = retry_url
        logger.info("retry audit: score=%d residuals=%d", final_score, len(final_residuals))

    quality_warning = (final_score < QUALITY_WARNING_THRESHOLD) or bool(final_residuals)
    elapsed = time.perf_counter() - t0
    logger.info(
        "v3 done: path=%s score=%d warning=%s cost=$%.3f elapsed=%.1fs",
        path, final_score, quality_warning, cost_usd, elapsed,
    )

    return EmptyRoomV3Response(
        empty_room_url=final_url,
        quality_warning=quality_warning,
        residual_items=final_residuals,
        pipeline_path=path,
        cost_usd=cost_usd,
        cache_hit=False,
        occlusion_reason=str(occlusion.get("reason", "")),
        retry_used=retry_used,
        score_before_retry=score_before_retry,
        score_final=final_score,
    )


# ---------------------------------------------------------------------------
# Modal web endpoint
# ---------------------------------------------------------------------------

@app.function(
    image=IMAGE,
    secrets=SECRETS,
    timeout=600,
    max_containers=8,
)
@modal.fastapi_endpoint(method="POST", docs=False)
def generate_empty_room_v3(request: dict) -> dict:
    """POST /generate_empty_room_v3
    {
      "image_url": "https://...",         // required
      "seed": 12345,                      // optional (random if omitted)
      "skip_cache": false                 // optional (handled by web layer)
    }
    """
    _required_env_vars = ["FAL_KEY", "ANTHROPIC_API_KEY"]
    for _var in _required_env_vars:
        if not os.environ.get(_var):
            logging.error(f"STARTUP CHECK FAILED: {_var} not found in environment")
            logging.error(
                f"Available env vars with 'KEY' or 'API': "
                f"{[k for k in os.environ if 'KEY' in k or 'API' in k]}"
            )
        else:
            logging.info(f"STARTUP CHECK OK: {_var} present")

    image_url = request.get("image_url")
    if not image_url:
        return {"error": "image_url is required"}
    try:
        seed = request.get("seed")
        seed = int(seed) if seed is not None else None
    except (TypeError, ValueError):
        return {"error": "seed must be an integer"}
    skip_cache = bool(request.get("skip_cache", False))

    try:
        result = _generate_empty_room_impl(image_url, seed=seed, skip_cache=skip_cache)
        return result.to_dict()
    except Exception as exc:  # noqa: BLE001
        logger.exception("pipeline failed")
        return {"error": f"{type(exc).__name__}: {exc}"}


# ---------------------------------------------------------------------------
# Local entry (for manual testing)
# ---------------------------------------------------------------------------

@app.local_entrypoint()
def main(image_url: str, seed: int = 0) -> None:
    import json as _json

    seed_arg = seed if seed else None
    res = generate_empty_room_v3.remote({"image_url": image_url, "seed": seed_arg})
    print(_json.dumps(res, indent=2))
