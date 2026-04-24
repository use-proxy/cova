"""Cova V3 — Art Compositing Service (2026-04-23).

Modal app: ``cova-composite-art``. CPU-only. Python 3.10.

Single v1 endpoint:
  * ``POST /v1/composite_art``

Pipeline:
  1. SAM-3 wall detection (top 3 empty-wall regions).
  2. For each art piece (max 3):
     - Homography warp to target placement (65% of wall width).
     - Thin frame overlay.
     - Poisson blend (cv2.seamlessClone NORMAL_CLONE).
  3. Masked IC-Light (lowres 0.30, highres 0.20) to harmonize lighting.
"""

from __future__ import annotations

import base64
import io
import logging
import os
import time
from typing import Any, Literal, Optional

import modal
from pydantic import BaseModel, Field, HttpUrl

APP_NAME = "cova-composite-art"
API_VERSION = "v1"

IC_LIGHT_LOWRES = 0.30
IC_LIGHT_HIGHRES = 0.20
IC_LIGHT_GUIDANCE = 3.0
IC_LIGHT_STEPS = 15

FAL_CLIENT_TIMEOUT_S: float = 180.0

logger = logging.getLogger("cova-composite-art")
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
)


composite_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install(
        "libgl1-mesa-glx", "libglib2.0-0", "libsm6", "libxext6", "libxrender1",
    )
    .pip_install(
        "fastapi[standard]==0.115.4",
        "pydantic>=2.5,<3",
        "requests",
        "fal-client",
        "opencv-python-headless",
        "Pillow",
        "numpy",
        "scipy",
    )
)

app = modal.App(APP_NAME)


class ArtImage(BaseModel):
    url: HttpUrl
    layout_slot: str | None = None


class CompositeRequest(BaseModel):
    room_render_url: HttpUrl
    art_images: list[ArtImage] = Field(default_factory=list)
    layout: Literal["single", "pair", "triptych", "gallery", "salon"] = "single"
    room_type: str = "bedroom"
    lighting_preset: Literal["warm_cozy", "bright_natural", "dramatic_moody"] = "warm_cozy"


class CompositeResponse(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    render_url: HttpUrl
    art_composited: bool
    pieces_composited: int
    latency_seconds: float
    cost_usd: float


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fetch_bytes(url: str, timeout: int = 60) -> bytes:
    import requests
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    return r.content


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


def _detect_walls_sam3(room_url: str) -> list[dict[str, Any]]:
    """SAM-3 with text prompts; return top 3 wall regions by area."""
    import fal_client  # type: ignore
    prompts = ["empty wall", "white wall", "plain wall above furniture"]
    regions: list[dict[str, Any]] = []
    for prompt in prompts:
        try:
            r = fal_client.subscribe(
                "fal-ai/sam-3/image",
                arguments={"image_url": room_url, "text_prompts": [prompt]},
                with_logs=False,
                client_timeout=FAL_CLIENT_TIMEOUT_S,
            )
            masks = r.get("masks") or r.get("segmentations") or []
            for m in masks:
                if isinstance(m, dict):
                    regions.append(m)
        except Exception as exc:  # noqa: BLE001
            logger.warning("sam-3 prompt '%s' failed: %s", prompt, exc)
            continue

    def _area(m: dict[str, Any]) -> float:
        bbox = m.get("bbox") or m.get("box") or []
        if len(bbox) >= 4:
            return float((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]))
        a = m.get("area")
        return float(a) if isinstance(a, (int, float)) else 0.0

    regions.sort(key=_area, reverse=True)
    return regions[:3]


def _composite_art_piece(
    room_arr, art_arr, wall_bbox: tuple[int, int, int, int]
):
    import cv2  # type: ignore
    import numpy as np

    x0, y0, x1, y1 = wall_bbox
    wall_w = x1 - x0
    wall_h = y1 - y0

    art_w = int(wall_w * 0.65)
    art_h = int(art_w * 1.3)
    art_h = min(art_h, int(wall_h * 0.6))

    tx = x0 + (wall_w - art_w) // 2
    ty = y0 + int(wall_h * 0.10)

    ah, aw = art_arr.shape[:2]
    src_corners = np.float32([[0, 0], [aw, 0], [aw, ah], [0, ah]])
    dst_corners = np.float32(
        [[tx, ty], [tx + art_w, ty], [tx + art_w, ty + art_h], [tx, ty + art_h]]
    )
    H, _ = cv2.findHomography(src_corners, dst_corners)
    if H is None:
        return room_arr
    warped = cv2.warpPerspective(
        art_arr, H, (room_arr.shape[1], room_arr.shape[0])
    )

    # Thin frame (dark wood).
    frame_thickness = max(2, int(art_w * 0.015))
    cv2.rectangle(
        warped,
        (tx - frame_thickness, ty - frame_thickness),
        (tx + art_w + frame_thickness, ty + art_h + frame_thickness),
        (44, 32, 22),
        frame_thickness,
    )

    mask = np.zeros(room_arr.shape[:2], dtype=np.uint8)
    cv2.fillPoly(mask, [np.int32(dst_corners)], 255)

    # Poisson blend — seamlessClone requires center point.
    cx = tx + art_w // 2
    cy = ty + art_h // 2
    try:
        blended = cv2.seamlessClone(
            warped, room_arr, mask, (cx, cy), cv2.NORMAL_CLONE
        )
        return blended
    except cv2.error as exc:
        logger.warning("seamlessClone failed: %s; falling back to alpha blend", exc)
        m3 = (mask.astype(np.float32) / 255.0)[..., None]
        return (warped.astype(np.float32) * m3 + room_arr.astype(np.float32) * (1 - m3)).astype(
            room_arr.dtype
        )


def _masked_ic_light_harmonize(
    composited_url: str, preset: str
) -> str:
    import fal_client  # type: ignore
    preset_prompts = {
        "warm_cozy": "warm interior evening lighting, amber glow",
        "bright_natural": "bright natural daylight, soft diffused",
        "dramatic_moody": "dramatic single-source lighting, strong chiaroscuro",
    }
    prompt = preset_prompts.get(preset, preset_prompts["warm_cozy"])
    try:
        r = fal_client.subscribe(
            "fal-ai/iclight-v2",
            arguments={
                "image_url": composited_url,
                "prompt": prompt,
                "initial_latent": "Left",
                "lowres_denoise": IC_LIGHT_LOWRES,
                "highres_denoise": IC_LIGHT_HIGHRES,
                "guidance_scale": IC_LIGHT_GUIDANCE,
                "num_inference_steps": IC_LIGHT_STEPS,
                "num_images": 1,
                "output_format": "jpeg",
            },
            with_logs=False,
            client_timeout=FAL_CLIENT_TIMEOUT_S,
        )
        imgs = r.get("images") or []
        if imgs:
            first = imgs[0]
            if isinstance(first, dict) and first.get("url"):
                return first["url"]
            if isinstance(first, str):
                return first
    except Exception as exc:  # noqa: BLE001
        logger.warning("IC-Light harmonize failed: %s", exc)
    return composited_url


@app.cls(
    image=composite_image,
    cpu=2.0,
    memory=2048,
    timeout=300,
    startup_timeout=60,
    min_containers=0,
    max_containers=4,
    secrets=[modal.Secret.from_name("fal-secrets")],
)
class CompositeArt:
    @modal.enter()
    def load(self) -> None:
        logger.info("cova-composite-art ready")

    def _composite(self, req: CompositeRequest) -> CompositeResponse:
        import cv2  # type: ignore
        import numpy as np

        t0 = time.perf_counter()
        cost = 0.0

        if not req.art_images:
            return CompositeResponse(
                render_url=req.room_render_url,  # type: ignore[arg-type]
                art_composited=False,
                pieces_composited=0,
                latency_seconds=round(time.perf_counter() - t0, 2),
                cost_usd=0.0,
            )

        walls = _detect_walls_sam3(str(req.room_render_url))
        cost += 0.01  # SAM-3 cost estimate
        if not walls:
            logger.info("no wall regions detected — returning room unchanged")
            return CompositeResponse(
                render_url=req.room_render_url,  # type: ignore[arg-type]
                art_composited=False,
                pieces_composited=0,
                latency_seconds=round(time.perf_counter() - t0, 2),
                cost_usd=round(cost, 4),
            )

        room_bytes = _fetch_bytes(str(req.room_render_url))
        room_arr = cv2.imdecode(
            np.frombuffer(room_bytes, dtype=np.uint8), cv2.IMREAD_COLOR
        )
        if room_arr is None:
            raise RuntimeError("failed to decode room image")

        pieces_composited = 0
        for i, art in enumerate(req.art_images[:3]):
            if i >= len(walls):
                break
            wall = walls[i]
            bbox = wall.get("bbox") or wall.get("box") or []
            if len(bbox) < 4:
                continue
            x0, y0, x1, y1 = (int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3]))
            try:
                art_bytes = _fetch_bytes(str(art.url))
                art_arr = cv2.imdecode(
                    np.frombuffer(art_bytes, dtype=np.uint8), cv2.IMREAD_COLOR
                )
                if art_arr is None:
                    logger.warning("art #%d decode failed", i)
                    continue
                room_arr = _composite_art_piece(room_arr, art_arr, (x0, y0, x1, y1))
                pieces_composited += 1
            except Exception as exc:  # noqa: BLE001
                logger.warning("composite piece #%d failed: %s", i, exc)
                continue

        # Re-upload composited image.
        ok, enc = cv2.imencode(".jpg", room_arr, [cv2.IMWRITE_JPEG_QUALITY, 92])
        if not ok:
            raise RuntimeError("composited image encode failed")
        composited_url = _upload_bytes_to_fal(enc.tobytes(), suffix=".jpg")

        # Lighting harmonize.
        final_url = _masked_ic_light_harmonize(composited_url, req.lighting_preset)
        if final_url != composited_url:
            cost += 0.04

        return CompositeResponse(
            render_url=final_url,  # type: ignore[arg-type]
            art_composited=pieces_composited > 0,
            pieces_composited=pieces_composited,
            latency_seconds=round(time.perf_counter() - t0, 2),
            cost_usd=round(cost, 4),
        )

    @modal.asgi_app()
    def api(self):
        from fastapi import FastAPI, HTTPException

        fapp = FastAPI(title=APP_NAME, version="1.0.0")

        @fapp.get("/healthz")
        def healthz() -> dict:
            return {"app": APP_NAME, "status": "ready", "api_version": API_VERSION}

        @fapp.post(f"/{API_VERSION}/composite_art", response_model=CompositeResponse)
        def composite(req: CompositeRequest) -> CompositeResponse:
            try:
                return self._composite(req)
            except Exception as exc:
                raise HTTPException(
                    status_code=500,
                    detail={"error": "composite_failure", "message": str(exc)},
                )

        return fapp


if __name__ == "__main__":
    print(f"{APP_NAME} loaded  endpoint=/{API_VERSION}/composite_art")
