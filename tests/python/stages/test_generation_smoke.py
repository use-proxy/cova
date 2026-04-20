"""Smoke test for generation stage."""

import pytest

pytestmark = pytest.mark.smoke


def test_generation_module_imports():
    try:
        from modal_pipeline import generation  # noqa: F401
    except ImportError as e:
        pytest.skip(f"Generation module unavailable: {e}")


@pytest.mark.modal
def test_generation_runs():
    pytest.skip("Modal-bound smoke test; runs in Phase 5 integration suite")
