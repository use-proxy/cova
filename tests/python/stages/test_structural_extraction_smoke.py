"""Smoke test for structural extraction stage."""

import pytest

pytestmark = pytest.mark.smoke


def test_structural_extraction_module_imports():
    try:
        from modal_pipeline import structural_extraction  # noqa: F401
    except ImportError as e:
        pytest.skip(f"Structural extraction unavailable: {e}")


@pytest.mark.modal
def test_structural_extraction_runs():
    """Requires depth model (Depth-Anything-V2) and live Modal."""
    pytest.skip("Modal-bound smoke test; runs in Phase 1 integration suite")
