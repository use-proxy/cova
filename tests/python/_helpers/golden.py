"""Golden image comparison helper for Phase 0 pytest smoke tests."""

import io
import os
from pathlib import Path
from typing import Union

import cv2
import numpy as np
from PIL import Image


def compare_golden(
    output: Union[bytes, Image.Image, np.ndarray],
    golden_path: Path,
    threshold_ssim: float = 0.95,
) -> bool:
    """
    Compare output image to golden file via SSIM.

    Returns True if SSIM >= threshold.
    Raises AssertionError on mismatch with diff path written to _diffs/.

    If golden doesn't exist:
      - With WRITE_GOLDEN=1 env var: writes new golden, returns True
      - Otherwise: raises FileNotFoundError
    """
    if not golden_path.exists():
        if os.environ.get("WRITE_GOLDEN") == "1":
            golden_path.parent.mkdir(parents=True, exist_ok=True)
            _write_image(output, golden_path)
            return True
        raise FileNotFoundError(
            f"Golden not found: {golden_path}. "
            f"Run with WRITE_GOLDEN=1 to create."
        )

    golden = cv2.imread(str(golden_path), cv2.IMREAD_GRAYSCALE)
    output_np = _to_grayscale_array(output)

    if golden.shape != output_np.shape:
        output_np = cv2.resize(output_np, (golden.shape[1], golden.shape[0]))

    from skimage.metrics import structural_similarity as ssim
    score, _ = ssim(golden, output_np, full=True)

    if score < threshold_ssim:
        diff_dir = golden_path.parent.parent / "_diffs"
        diff_dir.mkdir(parents=True, exist_ok=True)
        diff_path = diff_dir / f"{golden_path.stem}_diff.png"
        _write_image(output, diff_path)
        raise AssertionError(
            f"Golden mismatch: SSIM={score:.4f} < {threshold_ssim}. "
            f"Diff written to {diff_path}. Run WRITE_GOLDEN=1 if change is intentional."
        )

    return True


def _to_grayscale_array(img) -> np.ndarray:
    if isinstance(img, bytes):
        return np.array(Image.open(io.BytesIO(img)).convert("L"))
    if isinstance(img, Image.Image):
        return np.array(img.convert("L"))
    if isinstance(img, np.ndarray):
        if img.ndim == 3:
            return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        return img
    raise TypeError(f"Unsupported image type: {type(img)}")


def _write_image(img, path: Path) -> None:
    if isinstance(img, bytes):
        path.write_bytes(img)
    elif isinstance(img, Image.Image):
        img.save(path)
    elif isinstance(img, np.ndarray):
        cv2.imwrite(str(path), img)
    else:
        raise TypeError(f"Cannot write image type: {type(img)}")
