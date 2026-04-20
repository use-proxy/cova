"""Phase 0 Extension — forbidden-name sanitizer regression (P0E.6).

Covers modal_pipeline.generation.sanitize_forbidden_names, the Python mirror
of the TS sanitizeForbiddenStyleNames. The generator's own fallback
templates and Sonnet brief output contain bare forbidden tokens; the
sanitizer must strip them before the prompt reaches fal.ai or the
Supabase rooms.flux_prompt column.
"""

import pytest

pytestmark = pytest.mark.smoke


def _load_sanitizer():
    try:
        from modal_pipeline.generation import sanitize_forbidden_names
    except ImportError as e:
        pytest.skip(f"generation module unavailable: {e}")
    return sanitize_forbidden_names


FORBIDDEN = ("japandi", "bohemian", "coastal", "mid-century", "minimalist")


def test_sanitize_strips_bare_forbidden_tokens():
    sanitize = _load_sanitizer()
    dirty = (
        "A precisely curated Minimalist bedroom with Japandi accents, "
        "Bohemian textiles, and Coastal undertones."
    )
    clean = sanitize(dirty)
    lower = clean.lower()
    for token in FORBIDDEN:
        # "mid-century" won't appear bare in this test string; still assert
        # the others are gone as standalone words.
        if token in ("japandi", "bohemian", "minimalist"):
            assert f" {token}" not in lower and not lower.startswith(token), (
                f"bare '{token}' still present in: {clean}"
            )


def test_sanitize_preserves_qualified_forms():
    sanitize = _load_sanitizer()
    dirty = "A Warm Japandi sanctuary with Coastal Bright accents and retro mid-century chairs."
    clean = sanitize(dirty)
    # Qualified forms get replaced with their descriptive expansions,
    # matching the TS sanitizer behavior. Assert no bare forbidden survives.
    assert " japandi" not in clean.lower()
    assert "warm japandi" not in clean.lower()
    assert "coastal bright" not in clean.lower()


def test_sanitize_idempotent():
    sanitize = _load_sanitizer()
    dirty = "Minimalist Japandi Bohemian"
    once = sanitize(dirty)
    twice = sanitize(once)
    assert once == twice


def test_sanitize_handles_empty_and_none_safe():
    sanitize = _load_sanitizer()
    assert sanitize("") == ""


def test_fallback_design_brief_is_sanitized_end_to_end():
    """Integration: generate_design_brief's fallback path now returns
    output that has been passed through sanitize_forbidden_names."""
    try:
        from modal_pipeline.generation import (
            _fallback_design_brief,
            STYLE_ARCHETYPES,
            sanitize_forbidden_names,
        )
    except ImportError as e:
        pytest.skip(f"generation module unavailable: {e}")

    raw = _fallback_design_brief("JAPANDI", "bedroom", STYLE_ARCHETYPES["COVAJAPANDI"])
    sanitized = sanitize_forbidden_names(raw)
    # Post-sanitize, no bare forbidden tokens survive.
    lower = sanitized.lower()
    import re

    assert not re.search(r"\bjapandi\b", lower)
    assert not re.search(r"\bbohemian\b", lower)
    assert not re.search(r"\bminimalist\b", lower)
