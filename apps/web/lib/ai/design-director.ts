/**
 * Design Director — Session 4
 *
 * Two Claude Sonnet calls that convert a room photo + style fingerprint +
 * user preferences into a structured staging brief and FLUX script.
 *
 * Call 1: room image + fingerprint + context → staging JSON (design_brief)
 * Call 2: staging JSON → FLUX staging script, 80-145 words (flux_prompt)
 *
 * Model: claude-sonnet-4-5 (pinned — do not change)
 */

import Anthropic from "@anthropic-ai/sdk";
import type { StyleFingerprint } from "@/types/fingerprint";
import type { RenderContext } from "@/lib/types/area2";
import { mergeToV2 } from "@/lib/ai/style-match";

const anthropic = new Anthropic();

// ── Type definitions ──────────────────────────────────────────────────────────

export interface DesignObject {
  name: string;
  material: string; // always specific: "walnut" not "wood", "bouclé" not "fabric"
  position: string; // spatial descriptor: "left foreground beside sofa"
}

export interface DepthLayer {
  zone: "foreground" | "midground" | "background";
  distance: string; // "0-3ft" | "4-8ft" | "8ft+"
  objects: DesignObject[];
}

export interface DesignBrief {
  roomType: string;
  styleAnchor: string;
  weaknesses: string[];         // visual weaknesses identified from photo
  compensations: string[];      // design moves that address each weakness
  palette: {
    dominant: string;           // 60% — walls/floor
    secondary: string;          // 30% — primary furniture
    accent: string;             // 10% — accessories/highlights
  };
  lighting: {
    source: string;             // "floor lamp" | "pendant" | "natural" etc.
    quality: string;            // "warm diffused" | "raked directional" etc.
    colorTemp: string;          // "2700K Edison" | "3000K warm-white" | "5000K"
    shadows: string;            // shadow quality/direction
  };
  materialTension: {
    warm: string;               // e.g. "brushed brass" — always specific
    cool: string;               // e.g. "honed slate" — always specific
  };
  depthLayers: {
    foreground: DepthLayer;     // 0-3ft
    midground: DepthLayer;      // 4-8ft
    background: DepthLayer;     // 8ft+
  };
  decorObjects: Array<
    DesignObject & { depthZone: "foreground" | "midground" | "background" }
  >;
  budgetTier: "ikea" | "west-elm" | "designer";
  totalObjectCount: number;
  wall_change_requested?: boolean;
  floor_change_requested?: boolean;
  wall_color?: string;
  removal_targets?: string[];   // specific visible objects to remove (clutter, dated fixtures, visual harm)
  required_objects?: string[];
}

export interface DesignDirectorInput {
  imageUrl: string;
  fingerprint: StyleFingerprint;
  roomType: string;
  styleAnchor: string;          // e.g. "Warm & Grounded"
  loraTrigger: string;          // e.g. "cvwmn"
  budgetMin: number;
  budgetMax: number;
  context?: RenderContext | null;
  removeItems?: string[];       // labels from step-7c user remove selections
  keepItems?: string[];         // labels from step-7c user keep selections
  chatHistory?: string | null;  // formatted chat string (highest priority — overrides all)
  chatContext?: Record<string, unknown> | null; // tabStates from step-7d chat (fallback)
  roomId?: string;
}

export interface DesignDirectorOutput {
  stagingJson: DesignBrief;
  fluxPrompt: string;
  negativePrompt: string;
}

// ── System prompt: Call 1 — Vision → Staging JSON ────────────────────────────
const CALL1_SYSTEM = `You are an expert interior designer with 20 years of Architectural Digest experience.

━━━ PRIORITY HIERARCHY — READ BEFORE ALL ELSE ━━━

When an "AUTHORITATIVE CLIENT DIRECTIVES" section appears in the user message,
it is the HIGHEST priority input. It overrides everything below it:
  → Your aesthetic judgment
  → The style fingerprint values
  → Style anchor defaults
  → Interior design best practices
  → Everything else in the user message

Rules that are ABSOLUTE when client directives are present:
1. Named products MUST appear verbatim in your JSON output.
   "65 inch Samsung Frame TV" → appears as "65 inch Samsung Frame TV wall-mounted"
   in the appropriate depthLayers objects array. Never paraphrase or generalize named products.
2. "keep the carpet/walls/floor" → set wall_change_requested: false AND/OR floor_change_requested: false AND
   the kept element MUST be noted in the compensations array with its current material/color preserved.
   Default wall_change_requested = true (allow change).
   Default floor_change_requested = false (preserve unless the user explicitly asked to change the floor material or color).
3. Material preferences ("dark sleek wood") override the style anchor's defaults for that category.

━━━ INTERIOR DESIGN PRINCIPLES (apply only when not overridden by client) ━━━

You will receive:
1. A room photo (the user's actual space)
2. A 12-dimensional style fingerprint
3. Unsplash reference images (professional interior photos matching the target style)

YOUR JOB: Analyze everything and produce a staging JSON that would make this specific room look like it belongs on the cover of Architectural Digest.

════════════════════════════════════════════════
REFERENCE IMAGE ANALYSIS (do this first)
════════════════════════════════════════════════

Before doing anything else, deeply analyze each Unsplash reference image provided. Extract and learn from:

DECORATION DENSITY: Count the exact number of objects on every surface. Note which surfaces are styled vs bare. Your staging must match this density exactly.

LAYERING TECHNIQUE: How many layers of objects exist on each surface? (e.g. coffee table: tray → books → object on books → vase). Replicate this layering depth.

MATERIAL COMBINATIONS: List every material visible and how they are combined. Note warm/cool pairings, matte/shiny contrasts, rough/smooth relationships. Use these exact combinations.

PLANT PLACEMENT: Where exactly are plants positioned? What species, what pot material, what size relative to surrounding furniture? Replicate placement logic.

LIGHTING SOURCES: Count every light source visible. Note color temperature, direction, and shadow patterns. Replicate the lighting layer count.

TEXTILE TECHNIQUE: How are throws draped? How are pillows arranged and in what quantities? What textures are mixed? Copy this exactly.

COLOR DISTRIBUTION: Where does the dominant color sit? Where does the accent appear? Map the 60-30-10 distribution across the actual room geometry.

NEGATIVE SPACE: Which areas are intentionally left empty? Why? Learn the rhythm of styled vs empty in these references.

════════════════════════════════════════════════
ROOM PHOTO ANALYSIS
════════════════════════════════════════════════

Analyze the user's room photo for:

ARCHITECTURAL BONES: Ceiling height, window placement and size, door positions, alcoves, built-ins, ceiling features. These are fixed constraints.

CURRENT FURNITURE FOOTPRINT: What exists, where it sits, approximate dimensions. This establishes the spatial logic.

LIGHT QUALITY: Direction of natural light, time of day apparent, existing artificial sources, shadow patterns.

ROOM WEAKNESSES (identify minimum 4, maximum 7):
- Empty wall voids (walls with nothing on them)
- Bare floor zones (carpet/floor with no rug or furniture)
- Lighting flatness (single source, no layers)
- Corner dead zones (unused corners)
- Surface clutter vs intentional styling
- Scale mismatches (furniture too small for wall)
- Missing vertical elements (nothing drawing eye upward)
- Color temperature conflicts
- Missing foreground anchor
- Missing background depth element
- Textile poverty (no throws, cushions, rugs)
- Plant absence
- Art absence

════════════════════════════════════════════════
INTERIOR DESIGN PRINCIPLES — NON-NEGOTIABLE
════════════════════════════════════════════════

60-30-10 COLOR RULE:
60% dominant: walls + largest furniture + floor
30% secondary: sofa/bed upholstery + rugs + curtains
10% accent: cushions + vases + art + small objects
Never deviate from this ratio.

THREE DEPTH LAYERS — ALL MUST BE POPULATED:
Foreground (0-3ft from camera): rug edge, coffee table styling, floor object, pouffe, plant at lens level
Midground (4-8ft): primary furniture, main lighting, primary art, main textile moment
Background (8ft+): wall treatment, tall plant, floor lamp behind furniture, art grouping, architectural detail

MATERIAL TENSION SYSTEM:
Always pair one warm material with one cool/contrasting:
- Warm: walnut, brass, amber glass, terracotta, linen, rattan
- Cool: marble, concrete, steel, glass, slate, bouclé white
- Bridge: a third material that connects both (jute, leather, aged brass, natural stone)
Never use just warm or just cool — tension creates interest.

SURFACE STYLING RULES:
Coffee table: always tray + 2-3 objects of varying height + one organic element (plant/stone/coral)
Nightstand: lamp + 1-2 small objects maximum, never bare
Shelves: books horizontal + vertical + object in front + plant trailing or upright at end
Windowsill: one object only, never cluttered
Floor: rug always, never bare carpet in the midground

PLANT RULES:
- density > 0.6: minimum 3 plants of different species and scale
- Always vary: one tall (fiddle leaf/monstera/snake plant), one trailing (pothos/string of pearls), one small (succulent/cactus/air plant in vessel)
- Always specify pot material (terracotta/ceramic/woven basket/concrete/brass)
- Never say "plant" — always name the species

LIGHTING LAYERS (minimum 2 sources always):
Primary: overhead ambient (pendant/chandelier/fan with light)
Secondary: floor lamp OR table lamp (always specify bulb type)
Accent optional: wall sconce/LED strip/candles
Always specify color temperature (2700K/3000K/4000K)
Always specify shadow direction relative to camera

TEXTILE RULES:
Bed: always duvet + throw + minimum 4 pillows in 2-3 sizes
Sofa: always minimum 2 throws (one draped arm, one folded) + 3 or 5 pillows never 2 or 4
Rug: always extend 12-18 inches beyond furniture edge, specify pile height (low/medium/high) and pattern

ACCESSORY GROUPING RULES:
Groups of 3 or 5 ONLY — never 2, never 4, never 6
Vary: height + material + shape in every group
Rule of odds: tallest in back or center, shortest in front
Triangle composition: objects form invisible triangle

ART RULES:
Hang art so center is at 57 inches from floor (gallery standard)
Above sofa: art width = 2/3 of sofa width minimum
Bedrooms: art above headboard centered, width = headboard width
Gallery walls: minimum 5 pieces, consistent frame material
Always specify: frame material + artwork style + dominant color

SCALE RULES:
Largest furniture anchors the room — everything scales from it
Pendant light diameter = 1/2 the table/surface below it
Rug should be large enough that front legs of all furniture sit on it
Floor plant minimum 4ft tall in rooms with 8ft+ ceilings

════════════════════════════════════════════════
ROOM TYPE SPECIFIC RULES
════════════════════════════════════════════════

BEDROOM:
Primary focal point: headboard wall — always fully styled
Headboard: upholstered or statement wood, touches ceiling or has art directly above it
Bedside symmetry: matching or complementary lamps both sides
Throw: always draped diagonally across foot of bed, never folded flat
Pillow architecture: 2 euro shams (26x26) + 2 standard (20x20) + 2-3 lumbar/decorative minimum
Bench or ottoman at foot of bed: always in rooms with space
Dresser/chest: always has tray + perfume/watch dish + small plant + one tall object (candle/sculpture)
Full length mirror: lean against wall at angle, never centered flat
Window treatment: floor to ceiling curtains always, hung 6 inches above window frame to maximize perceived height
Morning light simulation: describe light as coming from window side, casting soft diagonal shadows across bed
Ceiling: if fan exists describe as architectural element, add pendant or sconce as secondary source

LIVING ROOM:
Sofa placement: always floating (not against wall) unless room under 10ft wide
Coffee table: always centered, styled with tray system
Side table: one beside sofa arm, one beside chair
Console/sofa table behind floating sofa: always styled with lamp + art leaning + 3 objects
TV wall: always flanked by built-ins or shelving or large plants to avoid visual isolation
Rug: large enough that front legs of sofa AND chairs sit on it
Throw blanket: one draped over sofa arm, one folded on ottoman
Curtains: floor to ceiling, hung at ceiling height
Gallery wall or single oversized piece: always above sofa

OFFICE/STUDY:
Desk surface: laptop/monitor centered + task lamp right side + small plant left + pen cup + one personal object
Desk chair: always described (material + color)
Behind desk wall: either large art centered above monitor OR floating shelves with books + objects + small plant
Second seating: always include if room allows (reading chair + floor lamp)
Cable management: described as hidden/managed
Window: desk perpendicular to window for natural side light
Bookshelf: books arranged by color AND object groups between sections, trailing plant from top shelf

DINING ROOM:
Table centerpiece: always present — candles + low vessel + botanical element, never blocking sightlines
Pendant: always directly above table center, hung 30-34 inches above table surface, diameter = 1/2 table width
Chairs: always specify material + upholstery if applicable
Sideboard/buffet: always include if wall allows — styled with art above + objects on surface
Place settings: if room is staged, describe as set for 2 or 4 with placemats + napkin rings
Wine/bar cart: always include if budget allows

KITCHEN:
Counter styling: one side styled, one side functional
Styled section: fruit bowl or cutting board + herb pots + utensil jar in ceramic + cookbook leaning
Open shelving: books + ceramics + glass vessels + plants alternating
Pendant lights above island: always in pairs, specify material
Backsplash: always describe material and pattern

════════════════════════════════════════════════
BUDGET TIER MATERIAL GUIDE
════════════════════════════════════════════════

UNDER $500 (IKEA tier):
Furniture: IKEA birch/pine, cotton canvas, ceramic from Target, jute rugs, rattan
Accessories: H&M Home ceramics, IKEA glass vessels, cotton throws, affordable art prints in simple frames
Never specify designer brands at this tier

$500-2000 (West Elm / CB2 tier):
Furniture: Article bouclé, West Elm walnut, CB2 brass accents, wool-blend rugs, linen upholstery
Accessories: CB2 amber glass, West Elm ceramic vessels, quality cotton-linen throws, art prints in wood frames
Lighting: West Elm pendants, CB2 floor lamps, brass fixtures

OVER $2000 (Designer tier):
Furniture: custom millwork, Restoration Hardware leather, designer upholstery fabrics, hand-knotted wool rugs
Accessories: handblown glass, designer ceramics, original art or quality reproduction, cashmere throws
Lighting: designer pendants, sculptural floor lamps, custom shades
Specify brand names at this tier (Flos, Hay, Menu, Fritz Hansen, Muuto)

════════════════════════════════════════════════
USER CHAT INSTRUCTIONS (highest priority — always follow these)
════════════════════════════════════════════════

When provided in the user message under "USER EXPLICIT PREFERENCES FROM CHAT:", these are the user's own words and MUST override all fingerprint defaults and style assumptions:

- If user said a style direction (e.g. "dark sleek wood", "luxurious", "light and airy") → anchor the ENTIRE design around it. The fingerprint is secondary.
- If user said "keep walls the same" or similar → set wall_change_requested: false and preserve existing wall color exactly
- If user mentioned specific wall or floor colors (e.g. "light blue walls", "brown carpet") → note them and do NOT change them
- If user mentioned specific furniture → incorporate it as a named object in the appropriate depth layer
- If user specified tech (TV size, mount type, audio) → include as named objects in the staging brief
- If user gave keep instructions → honor them; do not redesign what they want kept

════════════════════════════════════════════════
WEAKNESS COMPENSATION SYSTEM
════════════════════════════════════════════════

For EACH weakness identified, provide an EXACT compensation:

Empty wall void → oversized art (specify exact dimensions relative to wall width) OR gallery wall (specify piece count) OR large-scale architectural mirror

Flat overhead lighting → add floor lamp behind primary furniture + table lamp on surface + specify both at 2700K to create warm layered glow with diagonal shadow play

Bare floor zone → layer rugs (jute base + smaller patterned on top) OR extend existing rug + add floor plant anchor

Corner dead zone → floor plant minimum 4ft + woven basket beneath + wall sconce above OR floor lamp + side table + small plant grouping

Missing vertical element → floor-to-ceiling curtains hung at ceiling + tall plant + vertical art OR tall floor lamp

Scale mismatch → specify larger replacement furniture OR add visual weight with oversized art to correct proportion

Missing foreground → rug edge at camera + floor object (tray with candle grouping / stack of books / large plant)

════════════════════════════════════════════════
ROOM-TYPE STAGING RULES:

BEDROOM:
- Primary focal point: bed headboard wall
- Camera: foot-of-bed level, slightly elevated
- Nightstands must be symmetrical if two are present
- Throw placed diagonally across lower third of bed
- Art centered above headboard at 57 inches from floor
- Always include: pillow layering system, one bedside light source

LIVING ROOM:
- Primary focal point: sofa wall or fireplace
- Camera: standing eye level (5ft), wide angle
- Coffee table objects in triangle arrangement
- Rug must extend 18 inches beyond sofa on each side
- Always include: throw on sofa arm, coffee table object grouping

HOME OFFICE:
- Primary focal point: desk wall
- Camera: slightly above desk level
- Monitor or screen always present as named object
- Task lighting required as named object
- Always include: one plant, one desk accessory grouping

KITCHEN:
- Primary focal point: counter or island
- Camera: counter height (36 inches)
- Always include: fruit bowl or plant on counter, open cookbook or cutting board, pendant lighting above island

BATHROOM:
- Camera: sink level
- Always include: folded towels, single plant, soap dispenser

════════════════════════════════════════════════
FINGERPRINT DIMENSION MAPPINGS — apply all thresholds:
- colorTemperature > 0.7   → warm amber/honey palette, 2700K Edison lighting
- colorTemperature 0.4-0.7 → balanced neutrals, 3000K warm-white lighting
- colorTemperature < 0.4   → cool crisp slate palette, 5000K blue-white lighting
- density > 0.7            → MAXIMUM 12 objects, MINIMUM 8 objects in decorObjects array. Count before submitting — over 12 is a violation.
- density 0.4-0.7          → MAXIMUM 8 objects, MINIMUM 5 objects in decorObjects array. Count before submitting — over 8 is a violation.
- density < 0.4            → MAXIMUM 4 objects, MINIMUM 2 objects in decorObjects array. Count before submitting — over 4 is a violation.
- nature > 0.7             → 3 or more named plant species, natural materials dominate
- texture > 0.7            → woven, rough, handcraft materials throughout
- material > 0.7           → designer-quality materials only, no accessible-tier substitutes
- spatial_openness > 0.7   → furniture floats with generous breathing room between pieces

FORBIDDEN WORDS — never output these in any field:
beautiful, stunning, gorgeous, modern, contemporary, cozy, luxurious, amazing, elegant, chic, stylish, nice, lovely, perfect, exquisite

MATERIAL SPECIFICITY — never use generic names:
- never "wood"   → always "walnut", "white oak", "teak", "maple"
- never "fabric" → always "bouclé", "linen", "velvet", "cashmere"
- never "stone"  → always "Carrara marble", "raw concrete", "honed slate"
- never "metal"  → always "brushed brass", "aged steel", "matte black iron"
- never "plant"  → always name the species

════════════════════════════════════════════════
REMOVAL TARGETS — populate from actual photo analysis
════════════════════════════════════════════════

Identify 3-6 specific objects visible in the photo that are clutter, dated, or visually harmful.
Name the actual object — not "clutter". Examples: "ceiling fan", "wall decal", "fluorescent strip light", "visible power cord", "popcorn ceiling", "dated valance", "mini blinds".
Do NOT include furniture or items the user may want to keep.
Do NOT include fixed architectural elements (windows, doors, load-bearing walls).
Aim for 3-6 named objects. If fewer than 3 are visible, list only what you see.

OUTPUT: Return ONLY a valid JSON object matching this exact schema.
No markdown fences, no explanation, no preamble. Only the JSON.

{
  "roomType": string,
  "styleAnchor": string,
  "weaknesses": [string, ...],
  "compensations": [string, ...],
  "palette": {
    "dominant": string,
    "secondary": string,
    "accent": string
  },
  "lighting": {
    "source": string,
    "quality": string,
    "colorTemp": string,
    "shadows": string
  },
  "materialTension": {
    "warm": string,
    "cool": string
  },
  "depthLayers": {
    "foreground": {
      "zone": "foreground",
      "distance": "0-3ft",
      "objects": [{ "name": string, "material": string, "position": string }]
    },
    "midground": {
      "zone": "midground",
      "distance": "4-8ft",
      "objects": [{ "name": string, "material": string, "position": string }]
    },
    "background": {
      "zone": "background",
      "distance": "8ft+",
      "objects": [{ "name": string, "material": string, "position": string }]
    }
  },
  "decorObjects": [
    {
      "name": string,
      "material": string,
      "position": string,
      "depthZone": "foreground" | "midground" | "background"
    }
  ],
  "budgetTier": "ikea" | "west-elm" | "designer",
  "totalObjectCount": number,
  "wall_change_requested": boolean,
  "floor_change_requested": boolean,
  "wall_color": "new wall color and finish description — only populated if wall_change_requested is true, empty string otherwise",
  "removal_targets": [
    "specific visible object name (ceiling fan, wall decal, power cord, etc.)",
    ...
  ]
}`;

// ── Universal quality guards — always last in negative_prompt ────────────────
const UNIVERSAL_QUALITY_GUARDS =
  "warped geometry, floating furniture, inconsistent lighting, overexposed windows, " +
  "blown highlights, blurry textures, watermark, text overlay, people, cartoonish, " +
  "illustration style, render artifact, fisheye distortion";

// ── Style DNA blocks — open every prompt with the style's visual signature ────
// FLUX weighs earlier tokens heavily. These 13-18 word blocks lock style before
// any room-specific content. Use VERBATIM — no paraphrasing.
export const STYLE_DNA_BLOCKS: Record<string, string> = {
  cvwmn: "Warm japandi interior. White oak, cream linen, terracotta clay, brushed brass. Soft diffused morning light through sheer curtains.",
  cvmax: "Maximalist layered interior. Jewel-toned velvet, patterned textiles, gallery wall, collected objects.",
  cvind: "Industrial loft interior. Exposed brick, blackened steel, worn leather, Edison filament light.",
  cvlux: "Refined luxury interior. Honed marble, aged brass, hand-stitched cashmere, directional pendant light.",
  cvcst: "Coastal bright interior. Whitewashed oak, bleached linen, sea glass tones, soft diffused natural light.",
  cvscn: "Nordic minimal interior. Pale ash, natural wool, muted stone, even cool daylight through tall windows.",
  cvmcm: "Mid-century modern interior. Walnut veneer, teak, hairpin legs, warm amber accent light.",
  cvboh: "Bohemian layered interior. Woven jute, embroidered textiles, terracotta, low-light lantern warmth.",
  cvdco: "Art deco interior. Lacquered surfaces, geometric inlay, velvet jewel tones, dramatic directional light.",
};

// ── System prompt: Call 2 — Staging JSON → FLUX Script (plain text) ─────────
const CALL2_SYSTEM = `You are a FLUX.1-dev prompt engineer specializing in interior design photography.
Convert a design brief JSON into a FLUX-optimized staging script.

━━━ FLUX PROMPT RULES ━━━

OUTPUT: Only the prompt text. Nothing else. No labels. No markdown. No JSON wrapper.

LENGTH: 60-90 words. Research confirms this is the sweet spot for interior design.
Longer prompts exceed FLUX's effective processing window — more is not better.

FORMAT: Natural language prose — NOT comma-separated keywords.
FLUX uses a T5 text encoder that processes natural language. Keyword lists perform
worse than descriptive sentences. Write how a photographer would brief a shot.

TOKEN WEIGHT: FLUX weighs earlier tokens more heavily.
The style DNA block MUST come first — it gets maximum weight and locks the aesthetic.
Structure: DNA block → dominant material → key objects → lighting → camera spec.

FORBIDDEN WORDS: beautiful, stunning, gorgeous, amazing, cozy, luxurious, modern,
contemporary, nice, elegant, perfect. These are meaningless to FLUX's T5 encoder.

DO NOT OUTPUT a negative prompt. FLUX does not support them and they throw API errors.
Write positive descriptions only: "clean minimal surfaces" not "no clutter".

━━━ REQUIRED PROMPT STRUCTURE ━━━

Follow this EXACT order (adapt prose to match the brief):

[STYLE DNA BLOCK — copy verbatim from the "DNA block" field in the user message].
[DOMINANT MATERIAL or KEY ARCHITECTURAL FEATURE of this room].
[PRIMARY FURNITURE with exact position and specific material].
[REQUIRED VERBATIM OBJECTS — if any were specified, include them EXACTLY].
[ONE LIVED-IN DETAIL — a specific object that makes the space feel inhabited, not staged].
[LIGHTING: direction, quality, interaction with a specific surface].
[STYLE TRIGGER WORD embedded naturally + CAMERA SPEC at the very end].

━━━ RULES FOR EACH ELEMENT ━━━

DNA BLOCK (required — first tokens, verbatim):
Copy the exact DNA block from the user message. Do not modify it.
It establishes the style signature before FLUX processes any room details.
If user chat overrides specific materials (e.g. "dark wood" vs DNA's "white oak"),
keep the DNA block verbatim and let the room-specific content override downstream.

CAMERA SPEC (required — at the END, not the beginning):
Use a real camera + lens that matches the aesthetic:
- Japandi/minimal: "Shot on Hasselblad X2D 100C, 24mm tilt-shift at f/8"
- Industrial/dark: "Shot on Sony A7R V, 16mm at f/5.6"
- Luxury/editorial: "Shot on Phase One IQ4 150MP, 28mm tilt-shift at f/8"
- Bright/airy: "Shot on Fujifilm GFX 100S, 23mm at f/11"
"Tilt-shift" corrects vertical distortion (architectural photography standard).
"f/8" gives deep focus across the whole room.

MATERIALS (required — specific, never generic):
✓ "warm walnut with visible grain" ✗ "wood"
✓ "aged terracotta glaze" ✗ "ceramic"
✓ "cream bouclé" ✗ "fabric"
✓ "brushed unlacquered brass" ✗ "metal"
✓ "pale ash veneer" ✗ "light wood"

LIVED-IN DETAIL (required — prevents sterile showroom look):
One specific small object that implies human habitation:
✓ "a stack of art books on the coffee table"
✓ "a wool throw draped over the armrest"
✓ "a ceramic carafe on the bedside table"
Must be plausible for the room's budget tier.

LIGHTING (required — describe interaction with surfaces):
✓ "soft morning light raking across the linen headboard"
✓ "warm Edison light casting long shadows across reclaimed oak"
✗ "good lighting" (meaningless)
Include light direction: "from the left window" / "overhead" / "low angle afternoon"

STYLE TRIGGER (required if LoRA trigger provided):
Embed the trigger word NATURALLY in the prose — not bolted on at the end.
✓ "...warm cvwmn interior, Japanese joinery..."
✗ "...photorealistic interior. cvwmn interior."

NAMED PRODUCTS (from client directives):
If the staging JSON depthLayers contain named client products, include them VERBATIM:
✓ "65 inch Samsung Frame TV wall-mounted above low credenza"
✗ "large smart TV on the wall"

WALL COLORS: Read wall_change_requested from staging JSON.
- If true: name the new wall color/finish early in the prompt.
- If false or absent: do NOT mention wall color — omit walls entirely.

FLOORING: Never describe floor material. Only describe objects ON the floor (rugs, furniture legs).

EDITORIAL QUALITY CUE (end with one of these):
- "Architectural Digest editorial photograph"
- "architectural photography, photorealistic"
- "interior design editorial, photorealistic"

━━━ VERIFY BEFORE RESPONDING ━━━
☐ Output is plain text only — no JSON, no markdown, no labels
☐ Word count is 60-90 (count every word)
☐ Starts with style DNA block (verbatim from user message — first word must match)
☐ Camera spec is at the END, not the beginning
☐ Required verbatim objects included exactly as specified
☐ Contains at least one lived-in detail
☐ Trigger word embedded naturally in prose
☐ No forbidden words
☐ All materials specific — no "wood", "fabric", "stone", "metal"
☐ No negative language anywhere
☐ Ends with "Architectural Digest editorial photograph" or equivalent`;

// ── Word ceiling enforcement ──────────────────────────────────────────────────

/**
 * Trims a FLUX prompt to maxWords while preserving the camera spec ending.
 * The camera spec begins at the last "Shot on" occurrence.
 */
function enforceWordCeiling(prompt: string, maxWords: number = 90): string {
  const words = prompt.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return prompt;

  const shotOnIdx = prompt.lastIndexOf("Shot on");
  if (shotOnIdx === -1) {
    // No camera spec — hard truncate at word boundary
    return words.slice(0, maxWords).join(" ");
  }

  const cameraSpec = prompt.slice(shotOnIdx);
  const cameraSpecWordCount = cameraSpec.split(/\s+/).filter(Boolean).length;
  const bodyBudget = maxWords - cameraSpecWordCount;

  const bodyText = prompt.slice(0, shotOnIdx).trimEnd();
  // Split on sentence boundaries
  const sentences = bodyText.match(/[^.!?]*[.!?]+\s*/g) ?? [bodyText];

  let kept = "";
  let wordsSoFar = 0;
  for (const sentence of sentences) {
    const sw = sentence.split(/\s+/).filter(Boolean).length;
    if (wordsSoFar + sw <= bodyBudget) {
      kept += sentence;
      wordsSoFar += sw;
    } else {
      break;
    }
  }

  return (kept.trimEnd() + " " + cameraSpec).trim();
}

// ── Density-based object count limits ────────────────────────────────────────

function getMaxObjectsForDensity(density: number): number {
  if (density > 0.7) return 12;
  if (density >= 0.4) return 8;
  return 4;
}

// ── Fingerprint dimension helpers ─────────────────────────────────────────────

function resolveBudgetTier(
  min: number,
  max: number,
): "ikea" | "west-elm" | "designer" {
  const mid = (min + max) / 2;
  if (mid < 500) return "ikea";
  if (mid <= 2000) return "west-elm";
  return "designer";
}

// V2 6-dimension descriptive bands.
// Order: warmth, visual_complexity, organicness, density, traditionalism, character
type V2Band = "low" | "moderate" | "high";

const V2_DIM_DESCRIPTIONS: Record<string, Record<V2Band, string>> = {
  warmth: {
    low: "cool tones, grey-blue palette, crisp whites",
    moderate: "balanced warm-cool, neutral base",
    high: "warm amber tones, honey oak, terracotta accents",
  },
  visual_complexity: {
    low: "minimal, clean surfaces, restrained decoration",
    moderate: "some layering, curated objects",
    high: "richly layered, many patterns, gallery walls",
  },
  organicness: {
    low: "industrial materials, concrete, steel, glass",
    moderate: "mix of natural and manufactured materials",
    high: "natural wood, linen, plants, organic textures",
  },
  density: {
    low: "sparse, generous negative space, few pieces",
    moderate: "comfortable amount of furniture and objects",
    high: "fully furnished, layered, maximalist arrangement",
  },
  traditionalism: {
    low: "contemporary, forward-looking, unconventional",
    moderate: "timeless balance of old and new",
    high: "classic forms, traditional details, heritage materials",
  },
  character: {
    low: "quiet, understated, lets materials speak",
    moderate: "some personality without being loud",
    high: "strong personal expression, cultural references, art",
  },
};

const V2_DIM_ORDER = [
  "warmth",
  "visual_complexity",
  "organicness",
  "density",
  "traditionalism",
  "character",
] as const;

function bandFor(value: number): V2Band {
  if (value < 0.35) return "low";
  if (value > 0.65) return "high";
  return "moderate";
}

/** Extract 6-dim V2 vector from a fingerprint that may be V1 or V2. */
function extractV2Vector(fp: StyleFingerprint): number[] {
  const d = fp.dimensions as Record<string, number>;
  if (fp.fingerprint_version === "v2") {
    // V2 fingerprints store dims in the first 6 legacy slots:
    // colorTemperature=warmth, colorSaturation=visual_complexity,
    // formality=organicness, density=density, era=traditionalism, material=character
    return [
      d.colorTemperature ?? 0.5,
      d.colorSaturation ?? 0.5,
      d.formality ?? 0.5,
      d.density ?? 0.5,
      d.era ?? 0.5,
      d.material ?? 0.5,
    ];
  }
  // V1 — merge to V2
  return mergeToV2(d);
}

function buildFingerprintContext(fp: StyleFingerprint): string {
  const v2 = extractV2Vector(fp);
  const parts: string[] = [];
  for (let i = 0; i < V2_DIM_ORDER.length; i++) {
    const dimName = V2_DIM_ORDER[i]!;
    const value = v2[i] ?? 0.5;
    const band = bandFor(value);
    const description = V2_DIM_DESCRIPTIONS[dimName]![band];
    parts.push(`${description} (${dimName}: ${band})`);
  }
  return `User style preferences: ${parts.join(", ")}`;
}

// ── Call 1: Vision analysis → staging JSON ───────────────────────────────────

async function callDesignBriefFromImage(
  input: DesignDirectorInput,
): Promise<DesignBrief> {
  const { imageUrl, fingerprint, roomType, styleAnchor, budgetMin, budgetMax, context, chatContext } = input;

  const budgetTier = resolveBudgetTier(budgetMin, budgetMax);
  const fingerprintContext = buildFingerprintContext(fingerprint);

  // Build context summary from RenderContext if available
  const contextSummary: string[] = [];
  if (context?.artBrief?.hasArtDirection) {
    contextSummary.push(
      `Art direction: ${context.artBrief.visualDirection ?? "not specified"}`,
    );
  }
  if (context?.techSpec?.smartLighting) {
    contextSummary.push("Smart lighting integration requested");
  }
  if (context?.sensoryProfile?.hasRug) {
    contextSummary.push(
      `Rug requested: ${context.sensoryProfile.rugStyle ?? "any style"}, ${context.sensoryProfile.rugSize ?? "any size"}`,
    );
  }
  if (context?.sensoryProfile?.plantPresence) {
    contextSummary.push(
      `Plants requested: ${context.sensoryProfile.plantSpecies?.join(", ") ?? "any species"}`,
    );
  }
  if (context?.identityBrief?.moodTarget) {
    contextSummary.push(`Mood target: ${context.identityBrief.moodTarget}`);
  }
  // Wall color change preference
  if (context?.wall_change_requested) {
    contextSummary.push(
      `Wall color change requested: yes${context.wall_color_preference ? `. Requested wall color: ${context.wall_color_preference}` : ""}`,
    );
  } else {
    contextSummary.push("Wall color change requested: no");
  }

  // Check for design_memory in render_context for refinement continuity
  const designMemory = (context as Record<string, unknown> | null)?.design_memory as {
    room_type: string;
    style_anchor: string;
    dominant_material: string;
    color_palette: { dominant: string; secondary: string; accent: string };
    key_furniture: string[];
    lighting_spec: string;
    lora_trigger: string;
  } | null | undefined;

  const designMemoryBlock = designMemory
    ? `\n\nORIGINAL DESIGN CONTEXT (refinement — maintain continuity):
- Room type: ${designMemory.room_type}
- Style anchor: ${designMemory.style_anchor}
- Dominant material: ${designMemory.dominant_material}
- Color palette: dominant ${designMemory.color_palette.dominant}, secondary ${designMemory.color_palette.secondary}, accent ${designMemory.color_palette.accent}
- Key furniture: ${designMemory.key_furniture.join(", ")}
- Lighting: ${designMemory.lighting_spec}
- LoRA trigger: ${designMemory.lora_trigger}

Build the refinement consistently with the above — do not restart from scratch.`
    : "";

  // ── Extract explicit user preferences from 7d chat tabs ──────────────────
  let chatContextBlock = "";
  if (chatContext && typeof chatContext === "object") {
    const lines: string[] = [];

    // "all" tab — style direction, keep instructions, color context
    const allTab = (chatContext as Record<string, unknown>)["all"] as Record<string, unknown> | undefined;
    if (allTab) {
      const allMessages = (allTab.messages ?? allTab.conversation ?? []) as Array<{ role: string; content: string }>;
      const userMsgs = allMessages.filter((m) => m.role === "user").map((m) => m.content).join(" ");
      if (userMsgs.trim()) {
        // Style direction — any strong descriptor the user gave
        const styleMatch = userMsgs.match(/(?:want|like|make it|going for|style[:\s]+)([^.!?\n]{5,60})/i);
        if (styleMatch) lines.push(`Style direction: ${styleMatch[1].trim()}`);

        // Keep instructions
        const keepMatch = userMsgs.match(/keep[^.!?\n]{0,80}/gi);
        if (keepMatch) lines.push(`Keep unchanged: ${keepMatch.slice(0, 3).join("; ")}`);

        // Color context
        const colorMatch = userMsgs.match(/(?:walls?|floor|carpet|ceiling)[^.!?\n]{0,60}/gi);
        if (colorMatch) lines.push(`Color context: ${colorMatch.slice(0, 2).join("; ")}`);

        // Full style dump if short enough
        if (userMsgs.length < 300) lines.push(`Full user direction: ${userMsgs}`);
      }
    }

    // "tech" tab — TV, audio, smart home
    const techTab = (chatContext as Record<string, unknown>)["tech"] as Record<string, unknown> | undefined;
    if (techTab) {
      const techExtracted = techTab.extractedData as Record<string, unknown> | undefined;
      const techLines: string[] = [];
      if (techExtracted?.hasTV) {
        const tvSize = techExtracted.tvSizeInches ? `${techExtracted.tvSizeInches}"` : "";
        const mount = techExtracted.tvMountType ? String(techExtracted.tvMountType) : "";
        techLines.push(`TV: ${[tvSize, mount].filter(Boolean).join(", ") || "requested"}`);
      }
      if (techExtracted?.audioSetup) techLines.push(`Audio: ${techExtracted.audioSetup}`);

      // Also scan tech tab user messages for TV mentions
      const techMessages = (techTab.messages ?? techTab.conversation ?? []) as Array<{ role: string; content: string }>;
      const techUserText = techMessages.filter((m) => m.role === "user").map((m) => m.content).join(" ");
      const tvMention = techUserText.match(/(\d{2,3})["\s-]*(?:inch|")\s*(?:tv|television|frame|screen)/i);
      if (tvMention && !techExtracted?.tvSizeInches) techLines.push(`TV: ${tvMention[1]}" (from chat)`);

      if (techLines.length > 0) lines.push(`Tech: ${techLines.join(", ")}`);
    }

    if (lines.length > 0) {
      chatContextBlock = lines.join("\n");
    }
  }

  // Resolve chat history: prefer explicit chatHistory string, fall back to parsed chatContext
  const resolvedChatHistory = input.chatHistory?.trim() || chatContextBlock || null;

  // ── Section 1: Client directives (HIGHEST PRIORITY — always first) ──────────
  const chatSection = resolvedChatHistory
    ? `CRITICAL: The following user preferences are authoritative and override all fingerprint data, style defaults, and room analysis below.

━━━ AUTHORITATIVE CLIENT DIRECTIVES ━━━

VERBATIM CLIENT CHAT:
"""
${resolvedChatHistory}
"""

Parse and enforce ALL of these constraints in your JSON:
- Any named product (TV brands, audio brands, furniture) → MUST appear verbatim in depthLayers objects
- Any "keep X" instruction → preserve it; do NOT redesign what they want kept
- Any material preference ("dark wood", "walnut", "marble") → overrides style anchor defaults for that category
- Any color preference → overrides fingerprint color values
- "keep walls/floor/carpet" → set wall_change_requested: false and floor_change_requested: false; record current colors
- Style adjectives ("dark", "sleek", "minimal", "bold") → anchor the ENTIRE design around them

`
    : `━━━ CLIENT CHAT ━━━
No explicit preferences provided. Use fingerprint and style anchor as primary guides.

`;

  // ── Section 2: Keep/remove from step-7c UI ──────────────────────────────────
  const keepItems = input.keepItems ?? [];
  const keepRemoveSection = (keepItems.length + (input.removeItems ?? []).length) > 0
    ? `━━━ KEEP / REMOVE (from step-7c UI) ━━━
Keep unchanged: ${keepItems.length > 0 ? keepItems.join(", ") : "none"}
Remove and replace: ${(input.removeItems ?? []).length > 0 ? (input.removeItems ?? []).join(", ") : "none"}

`
    : "";

  // ── Section 3: Style + fingerprint ──────────────────────────────────────────
  const fingerprintSection = `━━━ STYLE FINGERPRINT ━━━
(Secondary to client directives above. Override when client specified preference.)

Style anchor: ${styleAnchor}
LoRA trigger: "${input.loraTrigger}"
Room type: ${roomType}
Budget: $${budgetMin}–$${budgetMax} (${budgetTier} tier)

Fingerprint dimensions (apply all thresholds):
${fingerprintContext}

`;

  // ── Section 4: Additional preferences from render context ───────────────────
  const prefsSection = contextSummary.length > 0
    ? `━━━ ADDITIONAL PREFERENCES ━━━
${contextSummary.join("\n")}

`
    : "";

  // ── Section 5: Design memory for refinement continuity ──────────────────────
  const memorySection = designMemoryBlock ? `${designMemoryBlock}\n\n` : "";

  // ── Section 6: Task instruction ──────────────────────────────────────────────
  const instruction = `━━━ YOUR TASK ━━━
Analyze the attached room photo + all inputs above.

Output ONLY valid JSON matching the schema. No markdown fences. No preamble. No explanation.
Ensure all named client products appear verbatim in the appropriate depthLayers objects array.`;

  const userMessage = chatSection + keepRemoveSection + fingerprintSection + prefsSection + memorySection + instruction;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    system: CALL1_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "url",
              url: imageUrl,
            },
          },
          {
            type: "text",
            text: userMessage,
          },
        ],
      },
    ],
  });

  const block = response.content[0];
  if (!block || block.type !== "text" || !block.text.trim()) {
    throw new Error("[design-director] Call 1 returned empty response");
  }

  // Strip markdown fences if Claude wrapped the JSON anyway
  const raw = block.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  let brief: DesignBrief;
  try {
    brief = JSON.parse(raw) as DesignBrief;
  } catch {
    throw new Error(
      `[design-director] Call 1 JSON parse failed. Raw output:\n${raw.slice(0, 500)}`,
    );
  }

  // Validate and enforce density-based object count limits
  const density = fingerprint.dimensions.density;
  const maxObjects = getMaxObjectsForDensity(density);
  if (brief.decorObjects && brief.decorObjects.length > maxObjects) {
    console.warn(
      `[design-director] Call 1 object count ${brief.decorObjects.length} exceeds max ${maxObjects} for density=${density.toFixed(2)} — truncating to ${maxObjects}`,
    );
    brief.decorObjects = brief.decorObjects.slice(0, maxObjects);
    brief.totalObjectCount = maxObjects;
  }

  return brief;
}

// ── Required object extractor — finds named products in chat history ─────────
function extractRequiredObjects(chatHistory: string): string[] {
  const objects: string[] = [];

  // TV: "65 inch Samsung Frame TV", "65" Frame TV", "65-inch OLED"
  // Suffix list includes multi-word endings (Frame TV) before single-word ones so regex
  // tries the longer match first — prevents "Samsung Frame" from being captured instead
  // of "Samsung Frame TV".
  const tvMatches = Array.from(
    chatHistory.matchAll(
      /(\d{2,3})\s*["\s'-]*(?:inch|"|in\b)?\s*(?:-\s*)?([A-Z][A-Za-z0-9]+(?:\s+[A-Za-z0-9]+){0,3}?\s+(?:Frame\s+TV|OLED\s+TV|Smart\s+TV|TV|Television|OLED|Screen|Monitor))/g,
    ),
  );
  for (const m of tvMatches) {
    const size = m[1];
    const model = m[2].trim();
    objects.push(`${size} inch ${model}`);
  }

  // Named audio: Sonos Beam/Arc/Ray, Bose SoundLink, Bang & Olufsen, etc.
  const audioMatches = Array.from(
    chatHistory.matchAll(
      /\b(Sonos|Bose|Bang\s*(?:&|and)\s*Olufsen|Harman\s+Kardon|Denon|Yamaha|JBL|KEF|Devialet)\s+([A-Z][a-zA-Z0-9]+(?:\s+[a-zA-Z0-9]+)?)\b/g,
    ),
  );
  for (const m of audioMatches) {
    objects.push(`${m[1]} ${m[2].trim()}`);
  }

  // Named furniture/appliance brands
  const furnitureMatches = Array.from(
    chatHistory.matchAll(
      /\b(Herman\s+Miller|Eames|Knoll|Fritz\s+Hansen|Hay\s+Sofa|Muuto)\s+([A-Z][a-zA-Z0-9\s]{2,30})/g,
    ),
  );
  for (const m of furnitureMatches) {
    objects.push(`${m[1]} ${m[2].trim()}`);
  }

  return Array.from(new Set(objects)).filter(Boolean);
}

// ── Call 2: Staging JSON → FLUX script + negative prompt ─────────────────────

async function callFluxScriptFromBrief(
  brief: DesignBrief,
  loraTrigger: string,
  removeLabels: string[],
  styleAnchor: string,
  requiredObjects: string[],
): Promise<{ fluxPrompt: string; negativePrompt: string }> {
  // Note: CALL2_SYSTEM now outputs plain text only — no negative_prompt from Claude.
  // FLUX does not support negative prompts (throws API errors). We build one server-side
  // from removal targets + quality guards so Modal can use it if the pipeline supports it.

  // Resolve DNA block for this style/trigger
  const dnaBlock = STYLE_DNA_BLOCKS[loraTrigger] ?? null;

  const dnaSection = dnaBlock
    ? `DNA block (copy verbatim as the FIRST sentence of your output):
"${dnaBlock}"

`
    : "";

  const requiredSection =
    requiredObjects.length > 0
      ? `REQUIRED VERBATIM OBJECTS (include these EXACTLY — no paraphrasing):
${requiredObjects.map((o) => `- ${o}`).join("\n")}

`
      : "";

  const userMessage = `${dnaSection}${requiredSection}Staging brief:
${JSON.stringify(brief, null, 2)}

LoRA trigger word: "${loraTrigger}"
Style anchor: "${styleAnchor}"

Write the FLUX prompt now. ${dnaBlock ? "BEGIN with the DNA block above verbatim, then: dominant material → key objects → lighting → camera spec." : "Start with camera spec."} 60-90 words total. Plain text only.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 500,
    system: CALL2_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content[0];
  if (!block || block.type !== "text" || !block.text.trim()) {
    throw new Error("[design-director] Call 2 returned empty response");
  }

  // Output is plain text — strip any accidental markdown fences
  let fluxPrompt = block.text.trim().replace(/^```[^\n]*\n?/i, "").replace(/\n?```$/i, "").trim();

  // Enforce 90-word hard ceiling on flux_prompt
  const rawWordCount = fluxPrompt.split(/\s+/).filter(Boolean).length;
  if (rawWordCount > 90) {
    console.warn(
      `[design-director] Call 2 flux_prompt ${rawWordCount} words exceeds 90-word ceiling — trimming`,
    );
    fluxPrompt = enforceWordCeiling(fluxPrompt, 90);
    const trimmedCount = fluxPrompt.split(/\s+/).filter(Boolean).length;
    console.log(`[design-director] After trim: ${trimmedCount} words`);
  }

  // Warn if suspiciously short
  const finalWordCount = fluxPrompt.split(/\s+/).filter(Boolean).length;
  if (finalWordCount < 40) {
    console.warn(
      `[design-director] Call 2 flux_prompt ${finalWordCount} words is suspiciously short — check output quality`,
    );
  }

  // Build negative_prompt server-side (FLUX doesn't use it, but Modal pipeline may)
  const negParts: string[] = [];
  if (removeLabels.length > 0) negParts.push(removeLabels.join(", "));
  if (brief.removal_targets && brief.removal_targets.length > 0) {
    negParts.push(brief.removal_targets.join(", "));
  }
  negParts.push(UNIVERSAL_QUALITY_GUARDS);
  const negativePrompt = negParts.join(", ");

  console.log(
    `[design-director] negative_prompt assembled server-side: ${negParts.length} segments`,
  );

  return { fluxPrompt, negativePrompt };
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function runDesignDirector(
  input: DesignDirectorInput,
): Promise<DesignDirectorOutput> {
  console.log("[design-director] Starting — room:", input.roomType, "| anchor:", input.styleAnchor);

  // Call 1: vision → staging JSON
  const stagingJson = await callDesignBriefFromImage(input);
  const objectCount = stagingJson.totalObjectCount ?? stagingJson.decorObjects?.length ?? 0;
  console.log(
    `[design-director] Call 1 complete — ${objectCount} objects, tier: ${stagingJson.budgetTier}`,
    `| removal_targets: ${stagingJson.removal_targets?.length ?? 0}`,
  );

  // Assemble remove labels: step-7c user selections come first
  const removeLabels = input.removeItems ?? [];
  if (removeLabels.length > 0) {
    console.log(`[design-director] User remove selections: ${removeLabels.join(", ")}`);
  }

  // Extract required objects from chat history (named products that MUST appear verbatim)
  const requiredObjects = input.chatHistory
    ? extractRequiredObjects(input.chatHistory)
    : [];
  if (requiredObjects.length > 0) {
    console.log(`[design-director] Required objects extracted from chat: ${requiredObjects.join(", ")}`);
  }

  // Persist required_objects on the staging brief so the redesign route can
  // merge with prior runs and so the design_brief JSONB carries them forward.
  stagingJson.required_objects = requiredObjects;

  // Call 2: staging JSON → flux_prompt (additive) + negative_prompt
  const { fluxPrompt, negativePrompt } = await callFluxScriptFromBrief(
    stagingJson,
    input.loraTrigger,
    removeLabels,
    input.styleAnchor,
    requiredObjects,
  );
  const wordCount = fluxPrompt.split(/\s+/).filter(Boolean).length;
  console.log(`[design-director] Call 2 complete — flux_prompt: ${wordCount} words`);

  return { stagingJson, fluxPrompt, negativePrompt };
}
