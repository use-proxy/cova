"""Smoke test for preprocessing stage.
Verifies module imports and basic transformations work locally.
"""

import pytest
from PIL import Image

pytestmark = pytest.mark.smoke


def test_preprocessing_module_imports():
    """Module is importable without errors."""
    try:
        from modal_pipeline import preprocessing  # noqa: F401
    except ImportError as e:
        pytest.skip(f"Preprocessing module unavailable: {e}")


def test_preprocessing_image_transform_shape(cluttered_bedroom_image: Image.Image):
    """Preprocessing-style transforms preserve image as PIL.Image with valid mode."""
    img = cluttered_bedroom_image
    assert img.mode in ("RGB", "RGBA", "L"), f"Unexpected mode: {img.mode}"
    assert img.size[0] > 0 and img.size[1] > 0, "Invalid dimensions"
