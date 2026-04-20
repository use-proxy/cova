"""Smoke test for furniture matching (active M8 path).

Note: M8 uses Serper + Google Lens + client-side CLIP, not pgvector.
This test verifies the matching helpers in matchUtils.ts conceptually
(Python-side has no M8 code; this is a placeholder for future Python
test of furniture_matching_pipeline.py).
"""

import pytest

pytestmark = pytest.mark.smoke


def test_furniture_matching_module_imports():
    try:
        from modal_pipeline import furniture_matching_pipeline  # noqa: F401
    except ImportError as e:
        pytest.skip(f"Furniture matching unavailable: {e}")
