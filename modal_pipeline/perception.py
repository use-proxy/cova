"""Cova v9 — Unified Perception Service (Phase 1).

Modal app: ``cova-perception``. A10G GPU. Python 3.10.

Three v1 endpoints consumed by Phase 2 (empty-room), Phase 5 (redesign
preservation), and Phase 8 (refinement tap-to-SAM):

  * ``POST /v1/detect_preservation_spec`` — SAM 3 (fal) keep-class masks
    + MediaPipe face-in-frame flags + PaddleOCR wall-text flags →
    unified ``preservation_spec.json``.

  * ``POST /v1/encode_sam2_for_cache`` — SAM 2 image-encoder embedding
    bytes (fp16 packed, ≤2 MiB) written to Supabase ``sam_embeddings``.

  * ``POST /v1/depth_anything_v2`` — pass-through wrapper around
    ``fal-ai/imageutils/depth``.

See ``docs/phase-1/modal-audit.md`` for the architectural rationale.
Contract was frozen in Phase 1 Group 1 (commit aa27c52).
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Literal

import modal
from pydantic import BaseModel, Field, HttpUrl

# ---------------------------------------------------------------------------
# Constants (frozen in Group 1 — do not drift)
# ---------------------------------------------------------------------------

APP_NAME = "cova-perception"
API_VERSION = "v1"

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

# Classes whose masks are candidate hosts for MediaPipe face detection
# (research §9.1-6.2 — faces-in-frames auto-keep).
FACE_FRAME_CLASSES = frozenset({"framed photograph", "picture frame", "mirror"})

FACE_CONFIDENCE_MIN: float = 0.3
OCR_MIN_CHARS: int = 4
OCR_MIN_CONFIDENCE: float = 0.5

SAM2_EMBEDDING_MAX_BYTES: int = 2 * 1024 * 1024

# SAM 2 weights pulled from HF at image build time — see `run_function`
# below. Using a pinned snapshot avoids cold-start downloads.
SAM2_HF_REPO = "facebook/sam2-hiera-large"

# ---------------------------------------------------------------------------
# Modal image
# ---------------------------------------------------------------------------

perception_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install(
        "libgl1-mesa-glx",
        "libglib2.0-0",
        "libsm6",
        "libxext6",
        "libxrender1",
        "wget",
        "git",
    )
    .pip_install(
        # API
        "fastapi[standard]==0.115.4",
        "pydantic>=2.5,<3",
        # HTTP + storage
        "requests",
        "supabase",
        "fal-client",
        "Pillow",
        "numpy",
        "opencv-python-headless",
        # ML frameworks (torch with CUDA auto-detected by Modal on GPU)
        "torch==2.5.1",
        "torchvision==0.20.1",
        # SAM 2 via PyPI (transformers < 4.50 lacks SAM2 support).
        # sam2==1.1.0 is Meta's official release on PyPI (Oct 2024).
        "sam2==1.1.0",
        "hydra-core",
        "iopath",
        "transformers==4.49.0",
        "huggingface_hub>=0.26",
        "safetensors",
        "accelerate",
        # PaddleOCR (CPU is fine; OCR is cheap)
        "paddlepaddle==2.6.2",
        "paddleocr==2.8.1",
        # MediaPipe face (CPU)
        "mediapipe==0.10.18",
    )
    # Pre-download SAM 2 hiera-large weights (.pt) into the image so
    # cold starts don't pay network latency.
    .run_commands(
        "python -c 'from huggingface_hub import hf_hub_download; "
        f"hf_hub_download(repo_id=\"{SAM2_HF_REPO}\", "
        "filename=\"sam2_hiera_large.pt\")'"
    )
    # Pre-fetch PaddleOCR English model tarballs directly. Running
    # PaddleOCR init at build time segfaults on a CPU-only builder
    # (free(): invalid pointer); fetching the tarballs + extracting
    # lets the runtime loader find them without a network round-trip.
    .run_commands(
        "mkdir -p /root/.paddleocr/whl/det/en/en_PP-OCRv3_det_infer "
        "/root/.paddleocr/whl/rec/en/en_PP-OCRv4_rec_infer "
        "/root/.paddleocr/whl/cls/ch_ppocr_mobile_v2.0_cls_infer",
        "wget -q -O /tmp/det.tar https://paddleocr.bj.bcebos.com/PP-OCRv3/english/en_PP-OCRv3_det_infer.tar && "
        "tar -xf /tmp/det.tar -C /root/.paddleocr/whl/det/en/en_PP-OCRv3_det_infer --strip-components=1 && "
        "rm /tmp/det.tar",
        "wget -q -O /tmp/rec.tar https://paddleocr.bj.bcebos.com/PP-OCRv4/english/en_PP-OCRv4_rec_infer.tar && "
        "tar -xf /tmp/rec.tar -C /root/.paddleocr/whl/rec/en/en_PP-OCRv4_rec_infer --strip-components=1 && "
        "rm /tmp/rec.tar",
        "wget -q -O /tmp/cls.tar https://paddleocr.bj.bcebos.com/dygraph_v2.0/ch/ch_ppocr_mobile_v2.0_cls_infer.tar && "
        "tar -xf /tmp/cls.tar -C /root/.paddleocr/whl/cls/ch_ppocr_mobile_v2.0_cls_infer --strip-components=1 && "
        "rm /tmp/cls.tar",
    )
    .add_local_file("modal_pipeline/utils.py", "/root/utils.py")
)

app = modal.App(APP_NAME)

logger = logging.getLogger("cova-perception")


# ---------------------------------------------------------------------------
# Pydantic schemas (contract — v1, schema_version="1.0")
# ---------------------------------------------------------------------------


class PreservationRequest(BaseModel):
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
    frame_detection_index: int
    face_confidence: float = Field(ge=0.0, le=1.0)
    face_bbox: BoundingBox


class WallTextFlag(BaseModel):
    text: str
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: BoundingBox


class PreservationSpec(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    image_url: HttpUrl
    image_hash: str
    image_width: int
    image_height: int
    keep_class_detections: list[KeepClassDetection]
    face_in_frame_flags: list[FaceInFrameFlag]
    wall_text_flags: list[WallTextFlag]
    partial_failures: list[str] = Field(
        default_factory=list,
        description=(
            "Prompts/steps that errored but did not fail the whole request. "
            "Empty when all 15 SAM 3 prompts + OCR + face passes succeeded."
        ),
    )
    generated_at_iso: str
    latency_ms: int


class Sam2EmbeddingResponse(BaseModel):
    image_hash: str
    embedding_bytes_b64: str
    embedding_size_bytes: int
    embedding_shape: list[int]
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
# Helper utilities (top-level so they are picklable by Modal)
# ---------------------------------------------------------------------------


def _fetch_image_bytes(url: str, timeout: int = 30) -> bytes:
    import requests
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    return r.content


def _sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _bbox_from_mask_png(mask_bytes: bytes) -> BoundingBox | None:
    """Compute tight bbox of a binary mask PNG."""
    import numpy as np
    from PIL import Image

    m = np.array(Image.open(io.BytesIO(mask_bytes)).convert("L"))
    ys, xs = (m > 127).nonzero()
    if xs.size == 0 or ys.size == 0:
        return None
    x0, y0 = int(xs.min()), int(ys.min())
    x1, y1 = int(xs.max()), int(ys.max())
    return BoundingBox(x=x0, y=y0, w=x1 - x0 + 1, h=y1 - y0 + 1)


def _extract_bbox_from_fal_boxes(
    boxes: list, idx: int
) -> BoundingBox | None:
    """Try to extract a BoundingBox from fal SAM3's ``boxes`` field.

    fal returns either ``[x1,y1,x2,y2]`` arrays or ``{x,y,width,height}``
    dicts depending on model version. Returns ``None`` if we can't make
    sense of entry ``idx``.
    """
    if idx >= len(boxes):
        return None
    b = boxes[idx]
    if isinstance(b, dict):
        if "width" in b and "height" in b:
            try:
                return BoundingBox(
                    x=int(b.get("x", 0)),
                    y=int(b.get("y", 0)),
                    w=max(1, int(b["width"])),
                    h=max(1, int(b["height"])),
                )
            except (TypeError, ValueError):
                return None
        if "x1" in b and "y1" in b and "x2" in b and "y2" in b:
            try:
                x1, y1, x2, y2 = int(b["x1"]), int(b["y1"]), int(b["x2"]), int(b["y2"])
                return BoundingBox(
                    x=x1, y=y1, w=max(1, x2 - x1), h=max(1, y2 - y1)
                )
            except (TypeError, ValueError):
                return None
    if isinstance(b, (list, tuple)) and len(b) >= 4:
        try:
            x1, y1, x2, y2 = int(b[0]), int(b[1]), int(b[2]), int(b[3])
            return BoundingBox(x=x1, y=y1, w=max(1, x2 - x1), h=max(1, y2 - y1))
        except (TypeError, ValueError):
            return None
    return None


def _bbox_intersects_center(outer: BoundingBox, inner_cx: int, inner_cy: int) -> bool:
    return (
        outer.x <= inner_cx <= outer.x + outer.w
        and outer.y <= inner_cy <= outer.y + outer.h
    )


# ---------------------------------------------------------------------------
# SAM 3 fal wrapper (parallel dispatch for /detect_preservation_spec)
# ---------------------------------------------------------------------------


def _call_sam3_single(image_url: str, prompt: str, retries: int = 2) -> dict:
    """One prompt against fal-ai/sam-3/image. Returns a dict or error.

    Retries up to ``retries`` times with exponential backoff on transient
    failures. A permanent failure returns ``{"error": "..."}``.
    """
    import fal_client  # type: ignore

    last_err: Exception | None = None
    for attempt in range(retries + 1):
        try:
            r = fal_client.subscribe(
                "fal-ai/sam-3/image",
                arguments={
                    "image_url": image_url,
                    "prompt": prompt,
                    "return_multiple_masks": True,
                    "max_masks": 3,
                    "include_scores": True,
                    "apply_mask": False,
                    "output_format": "png",
                },
                with_logs=False,
            )
            return {"prompt": prompt, "result": r, "error": None}
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if attempt < retries:
                time.sleep(0.5 * (2 ** attempt))
    return {
        "prompt": prompt,
        "result": None,
        "error": f"{type(last_err).__name__}: {last_err}",
    }


# ---------------------------------------------------------------------------
# Modal class — loads SAM 2, PaddleOCR, MediaPipe once per container.
# ---------------------------------------------------------------------------


@app.cls(
    image=perception_image,
    gpu="A10G",
    timeout=120,
    # Cold start includes SAM2 weight load (~900MB) + PaddleOCR on-demand
    # model downloads (~15MB, first call only). 300s gives headroom.
    # See research §9.2 Perception row — 30s target is warm-ready; the
    # one-time first-container download is unavoidable on Modal.
    startup_timeout=600,
    min_containers=0,
    max_containers=4,
    secrets=[
        modal.Secret.from_name("supabase-secrets"),
        modal.Secret.from_name("fal-secrets"),
    ],
)
class Perception:
    @modal.enter()
    def load(self) -> None:
        """Container startup — load SAM 2, OCR, MediaPipe once."""
        import torch
        from huggingface_hub import hf_hub_download
        from sam2.build_sam import build_sam2  # type: ignore
        from sam2.sam2_image_predictor import SAM2ImagePredictor  # type: ignore

        t0 = time.perf_counter()
        logger.info("loading SAM 2 hiera-large from %s", SAM2_HF_REPO)
        self._torch = torch
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        # sam2 ships a hiera_l config; checkpoint is .pt from HF repo.
        ckpt_path = hf_hub_download(repo_id=SAM2_HF_REPO, filename="sam2_hiera_large.pt")
        model = build_sam2(
            "configs/sam2/sam2_hiera_l.yaml",
            ckpt_path,
            device=self._device,
        )
        self._sam2_predictor = SAM2ImagePredictor(model)
        logger.info("SAM 2 loaded in %.1fs on %s", time.perf_counter() - t0, self._device)

        # PaddleOCR English — CPU is fine for the wall-text pass.
        t1 = time.perf_counter()
        from paddleocr import PaddleOCR  # type: ignore
        self._ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
        logger.info("PaddleOCR loaded in %.1fs", time.perf_counter() - t1)

        # MediaPipe face detection — short-range model (<2m) is fine for
        # framed photos on a wall; long-range also available if needed.
        t2 = time.perf_counter()
        import mediapipe as mp  # type: ignore
        self._mp_face = mp.solutions.face_detection.FaceDetection(
            model_selection=0,  # short-range, suitable for wall-mounted photos
            min_detection_confidence=FACE_CONFIDENCE_MIN,
        )
        logger.info("MediaPipe face loaded in %.1fs", time.perf_counter() - t2)

        # Pre-bake a Supabase client factory so per-call work is cheap.
        from supabase import create_client  # type: ignore
        self._supabase_url = os.environ["SUPABASE_URL"]
        self._supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        self._sb = create_client(self._supabase_url, self._supabase_key)

        logger.info("perception container ready (total %.1fs)", time.perf_counter() - t0)

    # --------------------------------------------------------------
    # Core compute primitives (called by the ASGI endpoints below)
    # --------------------------------------------------------------

    def _run_mediapipe_face(self, rgb_pixels) -> list[dict]:
        """Return list of {confidence, bbox} for detected faces (px-absolute)."""
        h, w = rgb_pixels.shape[:2]
        res = self._mp_face.process(rgb_pixels)
        faces: list[dict] = []
        if not res.detections:
            return faces
        for det in res.detections:
            rb = det.location_data.relative_bounding_box
            x = max(0, int(rb.xmin * w))
            y = max(0, int(rb.ymin * h))
            bw = max(1, int(rb.width * w))
            bh = max(1, int(rb.height * h))
            conf = float(det.score[0]) if det.score else 0.0
            faces.append({"confidence": conf, "bbox": BoundingBox(x=x, y=y, w=bw, h=bh)})
        return faces

    def _run_paddleocr(self, img_path: str, img_w: int, img_h: int) -> list[WallTextFlag]:
        """Return OCR results above threshold as WallTextFlag list."""
        results = self._ocr.ocr(img_path, cls=True)
        flags: list[WallTextFlag] = []
        if not results:
            return flags
        # PaddleOCR returns list-of-list-per-image; we passed one image.
        page = results[0] if isinstance(results, list) and results and isinstance(results[0], list) else results
        if not page:
            return flags
        for line in page:
            if not line or len(line) < 2:
                continue
            quad, textconf = line[0], line[1]
            if not textconf or len(textconf) < 2:
                continue
            text, conf = textconf[0], float(textconf[1])
            if len(text) < OCR_MIN_CHARS or conf < OCR_MIN_CONFIDENCE:
                continue
            xs = [p[0] for p in quad]
            ys = [p[1] for p in quad]
            x0, y0 = max(0, int(min(xs))), max(0, int(min(ys)))
            x1, y1 = min(img_w, int(max(xs))), min(img_h, int(max(ys)))
            flags.append(
                WallTextFlag(
                    text=text,
                    confidence=conf,
                    bbox=BoundingBox(x=x0, y=y0, w=max(1, x1 - x0), h=max(1, y1 - y0)),
                )
            )
        return flags

    def _run_sam3_parallel(
        self, image_url: str
    ) -> tuple[list[KeepClassDetection], list[str]]:
        """Run all 15 SAM 3 prompts concurrently. Returns
        (detections, failure-prompt-list).

        Bboxes come from the fal SAM3 response's ``boxes`` field when
        available — no per-mask PNG fetch. Falls back to mask-PNG bbox
        parsing only if ``boxes`` is missing (old endpoint shapes).
        """
        import requests

        pending_png_fallback: list[tuple[str, str, float]] = []  # (prompt, url, score)
        detections: list[KeepClassDetection] = []
        failures: list[str] = []

        with ThreadPoolExecutor(max_workers=15) as pool:
            futs = {
                pool.submit(_call_sam3_single, image_url, p): p
                for p in KEEP_CLASS_PROMPTS
            }
            for fut in as_completed(futs):
                out = fut.result()
                prompt = out["prompt"]
                if out["error"]:
                    failures.append(f"sam3:{prompt}:{out['error']}")
                    continue
                r = out["result"] or {}
                masks = r.get("masks") or []
                scores = r.get("scores") or []
                metadata = r.get("metadata") or []
                boxes = r.get("boxes") or []  # native fal bboxes
                for idx, m in enumerate(masks):
                    if not isinstance(m, dict):
                        continue
                    url = m.get("url")
                    if not url:
                        continue
                    score = 0.5
                    if idx < len(scores) and scores[idx] is not None:
                        score = float(scores[idx])
                    elif idx < len(metadata) and isinstance(metadata[idx], dict):
                        score = float(metadata[idx].get("score", 0.5))

                    bbox = _extract_bbox_from_fal_boxes(boxes, idx)
                    if bbox is not None:
                        detections.append(
                            KeepClassDetection(
                                prompt=prompt,  # type: ignore[arg-type]
                                mask_url=url,
                                score=score,
                                bbox=bbox,
                            )
                        )
                    else:
                        # fallback: parse mask PNG in parallel below
                        pending_png_fallback.append((prompt, url, score))

        # If any detections are missing bboxes, fetch the PNGs in parallel
        # (max ~15 at once) rather than the previous serial loop.
        if pending_png_fallback:
            def _fetch_and_bbox(item):
                prompt, url, score = item
                try:
                    mb = requests.get(url, timeout=15).content
                    return prompt, url, score, _bbox_from_mask_png(mb)
                except Exception:  # noqa: BLE001
                    return prompt, url, score, None

            with ThreadPoolExecutor(max_workers=8) as pool:
                for prompt, url, score, bbox in pool.map(
                    _fetch_and_bbox, pending_png_fallback
                ):
                    if bbox is None:
                        continue
                    detections.append(
                        KeepClassDetection(
                            prompt=prompt,  # type: ignore[arg-type]
                            mask_url=url,
                            score=score,
                            bbox=bbox,
                        )
                    )
        return detections, failures

    def _encode_sam2(self, image_url: str) -> tuple[bytes, tuple[int, ...], str]:
        """Run SAM 2 image encoder. Returns (fp16 bytes, shape, image_hash).

        We cache only the low-resolution ``image_embed`` feature (shape
        [1, 256, 64, 64], ~1 MiB fp16). High-res feats are ~6 MiB
        combined and blow the 2 MiB cache cap; the Phase 8 client-side
        decoder operates on the low-res embedding with acceptable mask
        quality per the research doc's 2 MiB budget.
        """
        import numpy as np
        from PIL import Image

        raw = _fetch_image_bytes(image_url)
        image_hash = _sha256_hex(raw)
        pil = Image.open(io.BytesIO(raw)).convert("RGB")
        img_np = np.array(pil)
        with self._torch.inference_mode():
            self._sam2_predictor.set_image(img_np)
            # _features is dict with "image_embed" + "high_res_feats".
            feats = self._sam2_predictor._features
            emb = feats["image_embed"]  # torch.Tensor [1, 256, 64, 64]

        emb_fp16 = emb.to(self._torch.float16).detach().cpu().contiguous()
        arr = emb_fp16.numpy()
        data_bytes = arr.tobytes()
        return data_bytes, tuple(arr.shape), image_hash

    # --------------------------------------------------------------
    # ASGI app — all three v1 endpoints live here
    # --------------------------------------------------------------

    @modal.asgi_app()
    def api(self):
        from fastapi import FastAPI, HTTPException

        fapp = FastAPI(title="cova-perception", version="1.0.0")

        @fapp.get("/healthz")
        def healthz() -> dict:
            return {
                "app": APP_NAME,
                "api_version": API_VERSION,
                "device": self._device,
                "status": "ready",
            }

        @fapp.post(
            f"/{API_VERSION}/detect_preservation_spec",
            response_model=PreservationSpec,
        )
        def detect_preservation_spec(req: PreservationRequest) -> PreservationSpec:
            import cv2  # type: ignore
            import numpy as np
            from PIL import Image

            t0 = time.perf_counter()
            failures: list[str] = []

            # 1. Fetch image once — feed OCR + MediaPipe + hashing.
            try:
                raw = _fetch_image_bytes(str(req.image_url))
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(status_code=400, detail=f"image fetch failed: {exc}")
            image_hash = req.image_hash or _sha256_hex(raw)
            pil = Image.open(io.BytesIO(raw)).convert("RGB")
            rgb = np.array(pil)
            h, w = rgb.shape[:2]

            # OCR needs a path; write to /tmp.
            tmp = f"/tmp/{image_hash}.jpg"
            pil.save(tmp, format="JPEG", quality=92)

            # 2. Parallel dispatch: SAM 3 (15 prompts) + OCR + face detect.
            with ThreadPoolExecutor(max_workers=3) as top_pool:
                fut_sam3 = top_pool.submit(self._run_sam3_parallel, str(req.image_url))
                fut_face = top_pool.submit(self._run_mediapipe_face, rgb)
                fut_ocr = top_pool.submit(self._run_paddleocr, tmp, w, h)

                try:
                    detections, sam_fails = fut_sam3.result()
                    failures.extend(sam_fails)
                except Exception as exc:  # noqa: BLE001
                    detections, sam_fails = [], []
                    failures.append(f"sam3:batch:{type(exc).__name__}:{exc}")

                try:
                    faces = fut_face.result()
                except Exception as exc:  # noqa: BLE001
                    faces = []
                    failures.append(f"mediapipe:{type(exc).__name__}:{exc}")

                try:
                    wall_text_flags = fut_ocr.result()
                except Exception as exc:  # noqa: BLE001
                    wall_text_flags = []
                    failures.append(f"paddleocr:{type(exc).__name__}:{exc}")

            # 3. Fusion: face-in-frame cross-check.
            face_in_frame_flags: list[FaceInFrameFlag] = []
            for idx, det in enumerate(detections):
                if det.prompt not in FACE_FRAME_CLASSES:
                    continue
                for face in faces:
                    fb: BoundingBox = face["bbox"]
                    cx = fb.x + fb.w // 2
                    cy = fb.y + fb.h // 2
                    if _bbox_intersects_center(det.bbox, cx, cy):
                        face_in_frame_flags.append(
                            FaceInFrameFlag(
                                frame_detection_index=idx,
                                face_confidence=float(face["confidence"]),
                                face_bbox=fb,
                            )
                        )

            # 4. Assemble.
            latency_ms = int((time.perf_counter() - t0) * 1000)
            spec = PreservationSpec(
                image_url=req.image_url,
                image_hash=image_hash,
                image_width=w,
                image_height=h,
                keep_class_detections=detections,
                face_in_frame_flags=face_in_frame_flags,
                wall_text_flags=wall_text_flags,
                partial_failures=failures,
                generated_at_iso=_iso_now(),
                latency_ms=latency_ms,
            )
            try:
                os.remove(tmp)
            except OSError:
                pass
            return spec

        @fapp.post(
            f"/{API_VERSION}/encode_sam2_for_cache",
            response_model=Sam2EmbeddingResponse,
        )
        def encode_sam2_for_cache(req: PreservationRequest) -> Sam2EmbeddingResponse:
            if not req.user_id:
                raise HTTPException(
                    status_code=400,
                    detail="user_id is required for /encode_sam2_for_cache",
                )
            t0 = time.perf_counter()
            try:
                data_bytes, shape, image_hash = self._encode_sam2(str(req.image_url))
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(
                    status_code=500,
                    detail=f"SAM 2 encoding failed: {type(exc).__name__}: {exc}",
                )

            if req.image_hash and req.image_hash != image_hash:
                # Client hinted a hash; warn but keep ours (authoritative).
                logger.warning(
                    "client hash mismatch: client=%s server=%s",
                    req.image_hash, image_hash,
                )

            size_bytes = len(data_bytes)
            if size_bytes > SAM2_EMBEDDING_MAX_BYTES:
                raise HTTPException(
                    status_code=507,
                    detail=(
                        f"SAM 2 embedding exceeds 2 MiB cap: "
                        f"{size_bytes} > {SAM2_EMBEDDING_MAX_BYTES}. "
                        "Investigate model-output shape or re-quantize."
                    ),
                )

            # 4. Upsert into sam_embeddings via service-role Supabase.
            payload = {
                "user_id": req.user_id,
                "image_hash": image_hash,
                # postgres-rest encodes bytes as hex-prefixed '\\x...'
                "embedding": "\\x" + data_bytes.hex(),
            }
            up = (
                self._sb.table("sam_embeddings")
                .upsert(payload, on_conflict="user_id,image_hash")
                .execute()
            )
            rows = up.data or []
            if not rows:
                raise HTTPException(
                    status_code=500,
                    detail="supabase upsert returned no row",
                )
            row_id = rows[0]["id"]

            latency_ms = int((time.perf_counter() - t0) * 1000)
            return Sam2EmbeddingResponse(
                image_hash=image_hash,
                embedding_bytes_b64=base64.b64encode(data_bytes).decode("ascii"),
                embedding_size_bytes=size_bytes,
                embedding_shape=list(shape),
                supabase_row_id=row_id,
                generated_at_iso=_iso_now(),
                latency_ms=latency_ms,
            )

        @fapp.post(
            f"/{API_VERSION}/depth_anything_v2",
            response_model=DepthResponse,
        )
        def depth_anything_v2(req: DepthRequest) -> DepthResponse:
            import fal_client  # type: ignore

            t0 = time.perf_counter()
            try:
                r = fal_client.subscribe(
                    "fal-ai/imageutils/depth",
                    arguments={"image_url": str(req.image_url)},
                    with_logs=False,
                )
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(
                    status_code=502,
                    detail=f"fal depth call failed: {type(exc).__name__}: {exc}",
                )
            depth = r.get("image") or {}
            url = depth.get("url")
            if not url:
                raise HTTPException(
                    status_code=502,
                    detail=f"fal depth missing url: {json.dumps(r)[:500]}",
                )
            return DepthResponse(
                depth_url=url,
                latency_ms=int((time.perf_counter() - t0) * 1000),
            )

        return fapp


# ---------------------------------------------------------------------------
# Local sanity check
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    print(
        f"{APP_NAME} module loaded  "
        f"endpoints=/{API_VERSION}/"
        "{detect_preservation_spec,encode_sam2_for_cache,depth_anything_v2}  "
        f"keep_classes={len(KEEP_CLASS_PROMPTS)}  "
        f"sam2_cap={SAM2_EMBEDDING_MAX_BYTES}"
    )
