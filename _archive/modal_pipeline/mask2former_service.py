"""Cova V3 Phase A — Mask2Former architecture segmentation service.

Modal app: ``cova-mask2former-v3``. A10G. Python 3.11.

Single endpoint:

  * ``POST /v1/segment``  →  returns per-ADE20K-class binary masks
    encoded as RLE (run-length encoded) + packed bit-vectors, so the
    payload stays compact even for 1024×1024 working images.

Relevant ADE20K classes for architecture (Mask2Former-Swin-L):

  wall(0), floor(3), ceiling(5), windowpane(8), door(14),
  column(42), stairs(53), railing(95), fireplace(49),
  countertop(70), sink(47), bathtub(37), signboard(43)

Request contract::

    {
      "image_url": "https://...",
      "classes": ["wall", "floor", ...]   # optional filter; default: all 13
    }

Response contract::

    {
      "schema_version": "1.0",
      "image_width": int, "image_height": int,
      "masks_base64": {class_name: base64-encoded uint8 PNG (L mode)},
      "class_areas_pct": {class_name: float}
    }

Masks are returned as base64-encoded PNG (uint8, 0 or 255) so the caller
reads them with a single ``np.array(Image.open(BytesIO(base64.b64decode(m))))``.
"""

from __future__ import annotations

import base64
import io
import logging
import time
from typing import Literal

import modal
from pydantic import BaseModel, Field, HttpUrl


APP_NAME = "cova-mask2former-v3"
API_VERSION = "v1"

# ADE20K class IDs in Mask2Former-Swin-L-ADE-semantic
ADE20K_ARCHITECTURE_CLASSES: dict[str, int] = {
    "wall": 0,
    "floor": 3,
    "ceiling": 5,
    "windowpane": 8,
    "door": 14,
    "column": 42,
    "stairs": 53,
    "railing": 95,
    "fireplace": 49,
    "countertop": 70,
    "sink": 47,
    "bathtub": 37,
    "signboard": 43,
}


def _download_mask2former_weights() -> None:
    """Cache model weights inside the image so cold start skips the HF download."""
    from transformers import (  # type: ignore[import-not-found]
        Mask2FormerForUniversalSegmentation,
        Mask2FormerImageProcessor,
    )

    Mask2FormerImageProcessor.from_pretrained(
        "facebook/mask2former-swin-large-ade-semantic"
    )
    Mask2FormerForUniversalSegmentation.from_pretrained(
        "facebook/mask2former-swin-large-ade-semantic"
    )


mask2former_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1-mesa-glx", "libglib2.0-0")
    .pip_install(
        # NumPy must stay on the 1.x line: torch 2.1.2 ships with wheels
        # compiled against NumPy 1.x, and NumPy 2.x breaks the C ABI
        # (ImportError: _ARRAY_API not found at torch import time).
        "numpy<2",
        "scipy",
        "fastapi[standard]==0.115.4",
        "pydantic>=2.5,<3",
        "requests",
        "Pillow",
        "opencv-python-headless",
        "torch==2.1.2",
        "transformers==4.40.0",
    )
    .run_function(_download_mask2former_weights)
)

app = modal.App(APP_NAME)

logger = logging.getLogger("cova-mask2former-v3")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


class SegmentRequest(BaseModel):
    image_url: HttpUrl
    classes: list[str] | None = Field(
        default=None,
        description="Subset of ADE20K architecture classes to return. If None, returns all 13.",
    )


class SegmentResponse(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    image_width: int
    image_height: int
    masks_base64: dict[str, str] = Field(
        description="class name → base64-encoded PNG (uint8 L mode, 0/255)"
    )
    class_areas_pct: dict[str, float] = Field(
        description="class name → fraction of image area covered (0-100)"
    )
    latency_ms: int


MODEL_NAME = "facebook/mask2former-swin-large-ade-semantic"


@app.cls(
    image=mask2former_image,
    gpu="A10G",
    timeout=180,
    startup_timeout=300,
    min_containers=0,
    max_containers=4,
    scaledown_window=300,
    memory=16384,
)
class Mask2FormerService:
    @modal.enter()
    def load(self) -> None:
        import torch
        from transformers import (  # type: ignore[import-not-found]
            Mask2FormerForUniversalSegmentation,
            Mask2FormerImageProcessor,
        )

        logger.info("loading Mask2Former model: %s", MODEL_NAME)
        self.processor = Mask2FormerImageProcessor.from_pretrained(MODEL_NAME)
        self.model = (
            Mask2FormerForUniversalSegmentation.from_pretrained(MODEL_NAME)
            .to("cuda")
            .eval()
        )
        self.torch = torch
        logger.info("Mask2Former ready")

    def _segment(self, req: SegmentRequest) -> SegmentResponse:
        import numpy as np
        import requests
        from PIL import Image

        t0 = time.perf_counter()
        raw = requests.get(str(req.image_url), timeout=60).content
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        W, H = img.size

        inputs = self.processor(images=img, return_tensors="pt").to("cuda")
        with self.torch.no_grad():
            outputs = self.model(**inputs)

        seg = (
            self.processor.post_process_semantic_segmentation(
                outputs, target_sizes=[(H, W)]
            )[0]
            .cpu()
            .numpy()
        )

        wanted: dict[str, int]
        if req.classes:
            wanted = {
                k: v for k, v in ADE20K_ARCHITECTURE_CLASSES.items() if k in req.classes
            }
        else:
            wanted = dict(ADE20K_ARCHITECTURE_CLASSES)

        total = float(H * W)
        masks_b64: dict[str, str] = {}
        areas: dict[str, float] = {}
        for name, class_id in wanted.items():
            mask_bool = seg == class_id
            area_pct = float(mask_bool.sum()) / total * 100.0
            # Always include the key — empty masks communicate "no area"
            # cleanly and keep the response schema stable.
            mask_u8 = mask_bool.astype(np.uint8) * 255
            buf = io.BytesIO()
            Image.fromarray(mask_u8, mode="L").save(buf, format="PNG", optimize=True)
            masks_b64[name] = base64.b64encode(buf.getvalue()).decode("ascii")
            areas[name] = round(area_pct, 4)

        latency_ms = int((time.perf_counter() - t0) * 1000)
        logger.info(
            "segment done  size=%dx%d  classes=%d  latency_ms=%d",
            W, H, len(wanted), latency_ms,
        )
        return SegmentResponse(
            image_width=W,
            image_height=H,
            masks_base64=masks_b64,
            class_areas_pct=areas,
            latency_ms=latency_ms,
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
                "model": MODEL_NAME,
                "classes": list(ADE20K_ARCHITECTURE_CLASSES.keys()),
                "status": "ready",
            }

        @fapp.post(f"/{API_VERSION}/segment", response_model=SegmentResponse)
        def segment(req: SegmentRequest) -> SegmentResponse:
            try:
                return self._segment(req)
            except Exception as exc:  # noqa: BLE001
                logger.exception("segment failed")
                raise HTTPException(
                    status_code=500,
                    detail={"error": "internal_error", "message": str(exc)},
                )

        return fapp


if __name__ == "__main__":
    print(f"{APP_NAME} module loaded  endpoint=/{API_VERSION}/segment")
