"""
Cova — Spatial Templates for Fill Pro

Room-type-aware spatial placement directives that tell Fill Pro WHERE
to place furniture, not just WHAT furniture. This prevents Fill Pro from
generating random layouts (sofas in bedrooms, beds off-center, etc).

Templates use {placeholders} for style-specific material words.
The caller fills them from the style blend's trigger/material vocabulary.

NOT hardcoding specific furniture — these are compositional directives
that apply to any style within that room type.
"""


SPATIAL_TEMPLATES: dict[str, str] = {
    "bedroom": (
        "Centered against the main wall: a queen-sized {hero_bed} as the primary focal point. "
        "Immediately to the right of the bed: a {nightstand} with a {lamp}. "
        "Above the headboard, centered: {wall_art} spanning two-thirds of the bed width. "
        "Under the bed extending outward: a {rug}. "
        "Soft ambient lighting from the bedside lamp and natural window light. "
        "Symmetrical composition, bed dominates the frame."
    ),
    "living_room": (
        "Centered facing the viewer: a {hero_sofa} as the primary focal point. "
        "In front of the sofa: a {coffee_table}. "
        "Flanking the sofa: {side_table} with a {lamp}. "
        "Behind the sofa on the wall: {wall_art}. "
        "Under the seating area: a large {rug}. "
        "Natural light from windows, warm ambient from lamps."
    ),
    "dining_room": (
        "Centered in the room: a {hero_table} with {chairs} around it. "
        "Above the table: a {pendant_light}. "
        "On the nearest wall: a {sideboard} with decorative objects. "
        "Under the table: a {rug} extending beyond the chairs. "
        "Warm overhead lighting and natural sidelight."
    ),
    "kitchen": (
        "Central island or counter: {hero_island} as the primary work surface. "
        "Above the island: {pendant_lights}. "
        "On counters: curated accessories — {accessories}. "
        "Open shelving or cabinets with styled items. "
        "Bright even lighting, clean surfaces."
    ),
    "office": (
        "Against the main wall: a {hero_desk} as the primary piece. "
        "At the desk: a {chair}. "
        "Above the desk: {shelving} or {wall_art}. "
        "Beside the desk: a {bookcase} or {storage}. "
        "Task lighting from a {desk_lamp} plus ambient light."
    ),
    "bathroom": (
        "Against the main wall: a {vanity} with {mirror} above. "
        "Beside the vanity: {storage} for towels. "
        "On the counter: curated accessories — {accessories}. "
        "Soft warm lighting from sconces flanking the mirror."
    ),
}

# Fallback for unknown room types
SPATIAL_TEMPLATES["room"] = SPATIAL_TEMPLATES["bedroom"]


ANCHOR_FURNITURE: dict[str, str] = {
    "bedroom": "queen-sized bed",
    "living_room": "sofa and coffee table",
    "dining_room": "dining table and chairs",
    "kitchen": "kitchen island or counter",
    "office": "desk and office chair",
    "bathroom": "vanity and mirror",
    "room": "bed",
}


EXCLUSION_PHRASES: dict[str, str] = {
    "bedroom": (
        "Queen bed visible and centered as the dominant piece. "
        "NOT a couch, NOT a daybed, NOT a futon, NOT lounge furniture. "
        "Single primary bed as focal point."
    ),
    "living_room": (
        "Sofa visible and centered as the dominant piece. "
        "NOT a bed, NOT a dining table. "
        "Single primary sofa as focal point."
    ),
    "dining_room": (
        "Dining table visible and centered as the dominant piece. "
        "NOT a bed, NOT a sofa. "
        "Table with chairs as focal point."
    ),
    "kitchen": "Kitchen counter or island as the dominant piece.",
    "office": "Desk as the dominant piece. NOT a bed, NOT a sofa.",
    "bathroom": "Vanity as the dominant piece.",
}

EXCLUSION_PHRASES["room"] = EXCLUSION_PHRASES["bedroom"]


COMPOSITION_DIRECTIVE = (
    "Professional editorial interior photography. "
    "Centered symmetric composition, rule of thirds, "
    "eye-level camera angle, balanced negative space, "
    "warm ambient lighting, sharp focus, 8k quality."
)


def get_spatial_template(room_type: str) -> str:
    """Get the spatial template for a room type, with generic placeholders."""
    rt = room_type.lower().replace(" ", "_") if room_type else "bedroom"
    return SPATIAL_TEMPLATES.get(rt, SPATIAL_TEMPLATES["bedroom"])


def get_anchor_furniture(room_type: str) -> str:
    """Get the anchor furniture description for Stage 1 prompt."""
    rt = room_type.lower().replace(" ", "_") if room_type else "bedroom"
    return ANCHOR_FURNITURE.get(rt, ANCHOR_FURNITURE["bedroom"])


def get_exclusion_phrases(room_type: str) -> str:
    """Get negative-guidance phrases for a room type."""
    rt = room_type.lower().replace(" ", "_") if room_type else "bedroom"
    return EXCLUSION_PHRASES.get(rt, EXCLUSION_PHRASES["bedroom"])


def fill_spatial_placeholders(template: str, style_materials: dict[str, str] | None = None) -> str:
    """
    Fill {placeholders} in spatial template with style-specific or generic materials.
    Any unfilled placeholders get generic defaults.
    """
    defaults = {
        "hero_bed": "platform bed with upholstered headboard",
        "nightstand": "bedside table",
        "lamp": "table lamp",
        "wall_art": "framed artwork",
        "rug": "area rug",
        "hero_sofa": "sofa",
        "coffee_table": "coffee table",
        "side_table": "side table",
        "hero_table": "dining table",
        "chairs": "dining chairs",
        "pendant_light": "pendant light",
        "sideboard": "sideboard",
        "hero_island": "kitchen island",
        "pendant_lights": "pendant lights",
        "accessories": "styled accessories",
        "hero_desk": "desk",
        "chair": "ergonomic chair",
        "shelving": "floating shelves",
        "bookcase": "bookcase",
        "storage": "storage unit",
        "desk_lamp": "desk lamp",
        "vanity": "vanity",
        "mirror": "mirror",
    }

    if style_materials:
        defaults.update(style_materials)

    result = template
    for key, value in defaults.items():
        result = result.replace(f"{{{key}}}", value)

    return result
