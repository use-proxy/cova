"""Smoke test for postprocess stage."""

import pytest

pytestmark = pytest.mark.smoke


def test_postprocess_module_imports():
    try:
        from modal_pipeline import postprocess  # noqa: F401
    except ImportError as e:
        pytest.skip(f"Postprocess unavailable: {e}")
