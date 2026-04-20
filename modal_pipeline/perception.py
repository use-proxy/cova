"""Cova v9 — Unified Perception Service (Phase 1).

Modal app: ``cova-perception``. A10G GPU. Python 3.10.

Provides three endpoints consumed by Phase 2 (empty-room), Phase 5
(redesign preservation), and Phase 8 (refinement tap-to-SAM):

  * ``POST /detect_preservation_spec`` — SAM 3 keep-class masks + MediaPipe
    face inside picture frames + PaddleOCR wall text → unified
    ``preservation_spec.json`` per research §9.1-6.4.

  * ``POST /encode_sam2_for_cache`` — SAM 2 image-encoder embedding bytes
    for client-side tap-to-SAM cache (<2MB/image, stored in Supabase
    ``sam_embeddings`` table, 30-day TTL).

  * ``POST /depth_anything_v2`` — pass-through wrapper around
    ``fal-ai/imageutils/depth`` returning a depth PNG URL.

Architectural notes (documented rationale — see
``docs/phase-1/modal-audit.md``):

  * SAM 3 and Depth-Anything-V2 are **not** self-hosted in Phase 1; both
    are called via fal. This matches the existing production pattern in
    ``cova-segmentation`` / ``cova-structural-extraction`` and avoids
    container cold-start cost on models that are already served.

  * The only on-GPU hot path is SAM 2 (hiera-large) for embedding
    extraction. PaddleOCR and MediaPipe are CPU-light; they are loaded
    in the same container for locality but do not drive the GPU choice.

  * API is versioned at ``/v1/<endpoint>``. The FastAPI apps at the
    bottom of this module mount the v1 router and are exposed via
    ``asgi_app``.

This module is a **scaffold** for Phase 1 Task 1.3 — endpoint stubs
return ``NotImplementedError`` with the final response schema. Model
loading, bench, and real inference are implemented in Group 2.
"""

from __future__ import annotations

import os
from typing import Literal

import modal
from pydantic import BaseModel, Field, HttpUrl

# ---------------------------------------------------------------------------
# Modal app + image
# ---------------------------------------------------------------------------

APP_NAME = "cova-perception"
API_VERSION = "v1"

# Keep classes that SAM 3 must surface for preservation. Source:
# research §9.1-6.1. Frozen list — changes require research-doc update.
KEEP_CLASS_PROMPTS: tuple[str, ...] = (
    "ceiling fan",
    "framed photograph",
    "picture frame",
    "mirror",
    "fireplace",
    "crown molding",
    "exposed brick",
    "exposed beam",
    "wainscoting",
    "arched doorway",
    "bay window",
    "built-in bookshelf",
    "wall letters",
    "wall text",
    "radiator",
)

# Thresholds from research §9.1-6.2 / 6.3.
FACE_CONFIDENCE_MIN: float = 0.3
OCR_MIN_CHARS: int = 4
OCR_MIN_CONFIDENCE: float = 0.5

# SAM 2 embedding cache size ceiling (research §10 acceptance).
SAM2_EMBEDDING_MAX_BYTES: int = 2 * 1024 * 1024


perception_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install(
        "libgl1-mesa-glx",
        "libglib2.0-0",
        "libsm6",
        "libxext6",
        "libxrender1",
    )
    .pip_install(
        # API
        "fastapi[standard]",
        "pydantic>=2.5",
        # HTTP + storage
        "requests",
        "supabase",
        "fal-client",
        "Pillow",
        "numpy",
        "opencv-python-headless",
        # SAM 2 encoder (hiera-large) — loaded on A10G
        "torch",
        "torchvision",
        "transformers>=4.40.0",
        "sam2>=1.0",
        # PaddleOCR (CPU)
        "paddlepaddle",
        "paddleocr",
        # MediaPipe face (CPU)
        "mediapipe",
    )
    .add_local_file("modal_pipeline/utils.py", "/root/utils.py")
)

app = modal.App(APP_NAME)


# ---------------------------------------------------------------------------
# Shared Pydantic schemas (API contract — v1)
# ---------------------------------------------------------------------------


class PreservationRequest(BaseModel):
    """Input for /detect_preservation_spec and /encode_sam2_for_cache.

    ``image_url`` must be HTTPS and publicly fetchable (Supabase signed
    URL or fal media URL). ``image_hash`` is optional; if supplied, the
    service uses it as the ``sam_embeddings.image_hash`` cache key. If
    omitted, the service computes a SHA-256 of the image bytes itself.
    """

    image_url: HttpUrl
    image_hash: str | None = None
    user_id: str | None = Field(
        default=None,
        description=(
            "Supabase auth.users.id for RLS-scoped cache writes. Required "
            "for /encode_sam2_for_cache; ignored for /detect_preservation_spec."
        ),
    )


class BoundingBox(BaseModel):
    x: int
    y: int
    w: int
    h: int


class KeepClassDetection(BaseModel):
    """One SAM 3 detection for a keep-class prompt."""

    prompt: Literal[
        "ceiling fan",
        "framed photograph",
        "picture frame",
        "mirror",
        "fireplace",
        "crown molding",
        "exposed brick",
        "exposed beam",
        "wainscoting",
        "arched doorway",
        "bay window",
        "built-in bookshelf",
        "wall letters",
        "wall text",
        "radiator",
    ]
    mask_url: HttpUrl
    score: float
    bbox: BoundingBox


class FaceInFrameFlag(BaseModel):
    """MediaPipe face detection inside a picture-frame bbox — auto-keep
    flag per research §9.1-6.2."""

    frame_detection_index: int = Field(
        description="Index into preservation_spec.keep_class_detections"
    )
    face_confidence: float = Field(ge=0.0, le=1.0)
    face_bbox: BoundingBox


class WallTextFlag(BaseModel):
    """PaddleOCR wall-text result — auto-keep flag per research §9.1-6.3."""

    text: str
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: BoundingBox


class PreservationSpec(BaseModel):
    """Response payload of /detect_preservation_spec — faithful to the
    narrative at research §9.1-6.4. Shape is versioned via
    ``schema_version``; consumers must gate on it.
    """

    schema_version: Literal["1.0"] = "1.0"
    image_url: HttpUrl
    image_hash: str
    image_width: int
    image_height: int
    keep_class_detections: list[KeepClassDetection]
    face_in_frame_flags: list[FaceInFrameFlag]
    wall_text_flags: list[WallTextFlag]
    generated_at_iso: str
    latency_ms: int


class Sam2EmbeddingResponse(BaseModel):
    """Response payload of /encode_sam2_for_cache.

    ``embedding_bytes_b64`` is a base64-encoded blob of the SAM 2 image
    encoder output, size-capped at 2 MiB. The blob is *also* written to
    Supabase ``sam_embeddings`` keyed by ``image_hash``; clients can
    fetch by hash without re-encoding.
    """

    image_hash: str
    embedding_bytes_b64: str
    embedding_size_bytes: int
    supabase_row_id: str
    generated_at_iso: str
    latency_ms: int


class DepthRequest(BaseModel):
    image_url: HttpUrl


class DepthResponse(BaseModel):
    depth_url: HttpUrl
    provider: Literal["fal-ai/imageutils/depth"] = "fal-ai/imageutils/depth"
    latency_ms: int


class ErrorResponse(BaseModel):
    error: str
    detail: str | None = None


# ---------------------------------------------------------------------------
# Endpoint stubs (Group 2 implements bodies)
# ---------------------------------------------------------------------------


@app.function(
    image=perception_image,
    gpu="A10G",
    timeout=60,
    max_containers=4,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("fal-credentials"),
    ],
)
@modal.asgi_app()
def perception_api():
    """ASGI app exposing v1 perception endpoints.

    Structured as FastAPI so OpenAPI is auto-generated; the TS client
    (Task 1.7) will point at ``/v1/<endpoint>``. Stubs return 501 until
    Group 2 lands the implementation.
    """

    from fastapi import FastAPI, HTTPException

    fapp = FastAPI(title="cova-perception", version="1.0.0")

    @fapp.get("/healthz")
    def healthz() -> dict:
        return {
            "app": APP_NAME,
            "api_version": API_VERSION,
            "status": "scaffold",
        }

    @fapp.post(
        f"/{API_VERSION}/detect_preservation_spec",
        response_model=PreservationSpec,
        responses={501: {"model": ErrorResponse}},
    )
    def detect_preservation_spec(req: PreservationRequest) -> PreservationSpec:
        # Group 2 implementation:
        #   1. Fetch image bytes (SHA-256 hash if req.image_hash not set).
        #   2. Parallel dispatch:
        #        a. 15 fal SAM 3 calls over KEEP_CLASS_PROMPTS.
        #        b. MediaPipe face pass over whole image (faces found are
        #           later cross-filtered against frame bboxes).
        #        c. PaddleOCR pass over whole image.
        #   3. Fuse: for each picture-frame / framed-photograph mask,
        #      test if any MediaPipe face (conf>=FACE_CONFIDENCE_MIN)
        #      falls inside the mask bbox → emit FaceInFrameFlag.
        #   4. OCR: retain results where len(text)>=OCR_MIN_CHARS and
        #      conf>=OCR_MIN_CONFIDENCE → emit WallTextFlag.
        #   5. Return PreservationSpec with schema_version="1.0".
        raise HTTPException(
            status_code=501,
            detail=(
                "Scaffold only — Group 2 implements model inference. "
                "Contract is frozen at schema_version=1.0."
            ),
        )

    @fapp.post(
        f"/{API_VERSION}/encode_sam2_for_cache",
        response_model=Sam2EmbeddingResponse,
        responses={501: {"model": ErrorResponse}},
    )
    def encode_sam2_for_cache(req: PreservationRequest) -> Sam2EmbeddingResponse:
        # Group 2 implementation:
        #   1. Load SAM 2 hiera-large model at container start (not per call).
        #   2. Fetch + decode image; compute image_hash if not given.
        #   3. Run SAM2 image_encoder forward → embedding tensor.
        #   4. Quantize/pack to bytes; assert size < SAM2_EMBEDDING_MAX_BYTES.
        #   5. Upsert into Supabase ``sam_embeddings`` with RLS user_id.
        #   6. Return base64 bytes + row id for client caching.
        if not req.user_id:
            raise HTTPException(
                status_code=400,
                detail="user_id is required for /encode_sam2_for_cache",
            )
        raise HTTPException(
            status_code=501,
            detail=(
                "Scaffold only — Group 2 loads SAM 2 weights and wires "
                "Supabase upsert. Schema is frozen."
            ),
        )

    @fapp.post(
        f"/{API_VERSION}/depth_anything_v2",
        response_model=DepthResponse,
        responses={501: {"model": ErrorResponse}},
    )
    def depth_anything_v2(req: DepthRequest) -> DepthResponse:
        # Group 2 implementation:
        #   1. Call fal-ai/imageutils/depth with req.image_url.
        #   2. Return the fal-returned depth URL + measured latency.
        # Pass-through only — research §4.2 names
        # depth-anything/Depth-Anything-V2-Metric-Indoor-Large-hf as the
        # model; fal's imageutils/depth is the generic DA-V2 variant.
        # See docs/phase-1/modal-audit.md §2.2 for the deviation note.
        raise HTTPException(
            status_code=501,
            detail="Scaffold only — Group 2 wires the fal pass-through.",
        )

    return fapp


# ---------------------------------------------------------------------------
# Local sanity check: ``python modal_pipeline/perception.py`` prints a
# one-line summary so humans can smoke-test the module imports cleanly
# without `modal run`.
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    print(
        f"{APP_NAME} scaffold  "
        f"endpoints=/{API_VERSION}/"
        "{detect_preservation_spec,encode_sam2_for_cache,depth_anything_v2}  "
        f"keep_classes={len(KEEP_CLASS_PROMPTS)}  "
        f"face_min={FACE_CONFIDENCE_MIN}  "
        f"ocr_min_chars={OCR_MIN_CHARS}  "
        f"ocr_min_conf={OCR_MIN_CONFIDENCE}  "
        f"sam2_embedding_cap_bytes={SAM2_EMBEDDING_MAX_BYTES}"
    )
