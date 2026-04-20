"""Shared fixtures for Phase 0 pytest smoke tests."""

from pathlib import Path

import pytest
from PIL import Image

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def cluttered_bedroom_path() -> Path:
    """Path to a small cluttered bedroom test image."""
    return FIXTURES_DIR / "images" / "cluttered_bedroom.jpg"


@pytest.fixture
def cluttered_bedroom_image(cluttered_bedroom_path) -> Image.Image:
    """PIL Image of the cluttered bedroom fixture."""
    return Image.open(cluttered_bedroom_path)


@pytest.fixture
def goldens_dir() -> Path:
    """Path to the goldens directory."""
    return FIXTURES_DIR / "goldens"
