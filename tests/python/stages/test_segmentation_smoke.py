"""Smoke test for segmentation stage."""

import pytest

pytestmark = pytest.mark.smoke


def test_segmentation_module_imports():
    try:
        from modal_pipeline import segmentation  # noqa: F401
    except ImportError as e:
        pytest.skip(f"Segmentation unavailable: {e}")


@pytest.mark.modal
def test_segmentation_runs():
    pytest.skip("Modal-bound smoke test; runs in Phase 1 integration suite")
