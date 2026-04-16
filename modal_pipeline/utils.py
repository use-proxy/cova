"""
Cova Pipeline Utilities — shared across all pipeline files.

Define once, import everywhere. Never redefine inline.
"""


def normalize_decisions(raw_decisions) -> dict:
    """
    Converts any keep_remove_decisions format to canonical dict.
    Handles both array format (from DB) and dict format (from payload).
    Universal — works for any item name in any room type.

    Array format:  [{id, name, category, decision}, ...]
    Dict format:   {"desk_chair": "remove", "bed": "keep", ...}
    Returns:       {"desk_chair": "remove", "bed": "keep", ...}
    """
    if isinstance(raw_decisions, dict):
        # Already dict format — normalize keys
        return {normalize_label_key(k): v
                for k, v in raw_decisions.items()}

    elif isinstance(raw_decisions, list):
        # Array format from DB — convert to dict
        result = {}
        for item in raw_decisions:
            if isinstance(item, dict):
                # {id, name, category, decision} format
                label = item.get('name') or item.get('label', '')
                decision = item.get('decision', 'keep')
                if label:
                    result[normalize_label_key(label)] = decision
        return result

    return {}


def normalize_label_key(label: str) -> str:
    """
    Canonical key normalization for all mask/decision lookups.
    Used everywhere: mask union, prompt building, category lookup.

    'Desk Chair' -> 'desk_chair'
    'desk chair' -> 'desk_chair'
    'desk_chair' -> 'desk_chair'
    'Wall Art'   -> 'wall_art'
    """
    return label.lower().strip().replace(" ", "_").replace("-", "_")


# ---------------------------------------------------------------------------
# Category constants
# ---------------------------------------------------------------------------

# HARD_STRUCTURAL — never shown to user in keep/remove screen, never
# inpainted, always preserved. These are the bones of the room.
# Covers ALL room types: universal, kitchen, bathroom, office, structural.
HARD_STRUCTURAL = frozenset({
    # Universal
    "ceiling", "floor", "wall", "door", "window", "window_blinds",
    "window_curtains", "curtains", "built_in_shelving", "built_in_wardrobe",
    "radiator", "fireplace", "fireplace_mantel",
    # Kitchen-specific
    "kitchen_counter", "countertop", "kitchen_cabinets", "cabinet",
    "oven", "stove", "refrigerator", "fridge", "dishwasher", "sink",
    "backsplash", "kitchen_island",
    # Bathroom-specific
    "toilet", "bathtub", "shower", "shower_stall", "vanity",
    "bathroom_sink", "bathroom_cabinet", "mirror", "towel_bar",
    # Office-specific
    "built_in_desk", "built_in_bookshelf",
    # Structural fixtures
    "hvac_vent", "air_vent", "electrical_outlet", "light_switch",
    "baseboard", "crown_molding", "column", "beam", "pillar",
    "staircase", "railing",
})

# THIN_STRUCTURE_CATEGORIES — rendering quality concern only, NOT a
# preservation override. User decisions still take full precedence.
# These items get reduced dilation (8px instead of 17px) when building
# preserve exclusion masks to avoid destroying fan blades, garland
# strings, letter strokes, pendant arms, etc.
THIN_STRUCTURE_CATEGORIES = frozenset({
    "ceiling_fan", "ceiling_fixture", "chandelier", "pendant_light",
    "wall_letters", "wall_art", "wall_decor", "photo_garland",
    "string_lights", "wall_sconce", "picture_frame",
})

DEFAULT_DILATION_PX = 17
THIN_DILATION_PX = 8


def get_category_for_label(label: str, detected_items: list) -> str:
    """
    Look up the category for a label from the detected_items array
    returned by pre_detection_pipeline.py for THIS render.
    Falls back to inferring from the label itself if not found.
    """
    norm = normalize_label_key(label)
    for item in detected_items:
        item_label = normalize_label_key(item.get("label", ""))
        if item_label == norm:
            return normalize_label_key(item.get("category", ""))
    # Fallback: infer from label keywords — covers all room types
    # Kitchen structural
    if any(kw in norm for kw in ("kitchen_counter", "countertop")):
        return "countertop"
    if any(kw in norm for kw in ("kitchen_cabinet", "cabinet")):
        return "cabinet"
    if any(kw in norm for kw in ("oven", "stove", "range")):
        return "stove"
    if any(kw in norm for kw in ("refrigerator", "fridge")):
        return "refrigerator"
    if "dishwasher" in norm:
        return "dishwasher"
    if any(kw in norm for kw in ("kitchen_island",)):
        return "kitchen_island"
    if "backsplash" in norm:
        return "backsplash"
    # Bathroom structural
    if "toilet" in norm:
        return "toilet"
    if "bathtub" in norm:
        return "bathtub"
    if any(kw in norm for kw in ("shower_stall", "shower")):
        return "shower"
    if "vanity" in norm:
        return "vanity"
    if "towel_bar" in norm:
        return "towel_bar"
    # Fixtures
    if any(kw in norm for kw in ("hvac_vent", "air_vent", "vent")):
        return "hvac_vent"
    if any(kw in norm for kw in ("baseboard",)):
        return "baseboard"
    if any(kw in norm for kw in ("crown_molding",)):
        return "crown_molding"
    if any(kw in norm for kw in ("column", "pillar")):
        return "column"
    if "beam" in norm:
        return "beam"
    if any(kw in norm for kw in ("staircase", "railing")):
        return "staircase"
    # Thin structures
    if any(kw in norm for kw in ("ceiling_fan", "ceiling_light", "ceiling_fixture")):
        return "ceiling_fixture"
    if any(kw in norm for kw in ("wall_art", "poster", "painting", "print", "frame")):
        return "wall_art"
    if any(kw in norm for kw in ("wall_letter", "letter")):
        return "wall_letters"
    if any(kw in norm for kw in ("photo_garland", "string_light", "garland")):
        return "photo_garland"
    if any(kw in norm for kw in ("wall_decor", "wall_decal", "wall_mount")):
        return "wall_decor"
    if "chandelier" in norm:
        return "chandelier"
    if "pendant" in norm:
        return "pendant_light"
    if "wall_sconce" in norm or "sconce" in norm:
        return "wall_sconce"
    if "picture_frame" in norm:
        return "picture_frame"
    # Universal structural
    if "sink" in norm:
        return "sink"
    if "mirror" in norm:
        return "mirror"
    if "window" in norm:
        return "window"
    if "door" in norm:
        return "door"
    if "fireplace" in norm:
        return "fireplace"
    if "radiator" in norm:
        return "radiator"
    return ""
