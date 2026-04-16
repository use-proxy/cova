/**
 * Design Director — Phase 5
 *
 * Two Claude calls that convert a room photo + style fingerprint +
 * user preferences into a room-aware design brief and FLUX prompt.
 *
 * Call 1 (Sonnet, vision): room photo → room analysis JSON (design_brief)
 *   - Detects room type, wall color, floor type, lighting, size
 *   - Builds explicit constraints from keep/remove decisions + visual analysis
 *   - Identifies specific improvement opportunities
 *
 * Call 2 (Haiku, fast): design_brief + style → compiled_prompt for Kontext Pro
 *   - Constraints override everything — no uninstructed additions
 *   - Color coherence: new items complement detected palette
 *   - Imperative language optimized for FLUX T5 encoder
 */

import Anthropic from "@anthropic-ai/sdk";
import type { StyleFingerprint } from "@/types/fingerprint";
import type { RenderContext } from "@/lib/types/area2";
import { mergeToV2 } from "@/lib/ai/style-match";

const anthropic = new Anthropic();

// ── Type definitions ──────────────────────────────────────────────────────────

export interface DesignBrief {
  // Phase 5 room analysis fields
  room_type: string;
  existing_palette: string[];
  wall_color: string;
  wall_color_hex?: string;
  floor_type: string;
  natural_light: "low" | "medium" | "high";
  natural_light_direction?: string;
  room_size: "small" | "medium" | "large";
  style_direction: string;
  secondary_style: string | null;
  constraints: string[];
  opportunities: string[];
  key_furniture: string[];
  depth_zones?: {
    foreground: string;
    midground: string;
    background: string;
  };

  // Backward-compat aliases used by route.ts and design_memory
  roomType: string;
  palette: {
    dominant: string;
    secondary: string;
    accent: string;
    reasoning?: string;
  };
  lighting: {
    source: string;
    quality: string;
    colorTemp: string;
    shadow_description?: string;
  };
  materialTension: {
    warm: string;
    cool: string;
  };
  budgetTier: "ikea" | "west-elm" | "designer";

  wall_change_requested?: boolean;
  floor_change_requested?: boolean;
  required_objects?: string[];
  kept_item_palette?: Array<{
    label: string;
    material: string;
    color: string;
    dominant_hex?: string;
  }>;
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
}

// ── System prompt: Call 1 — Vision → Room Analysis JSON ─────────────────────
const CALL1_SYSTEM = `You are an expert room analyst for an AI interior design app. Analyze a room photo and produce a structured design brief. You do NOT decide what furniture to add — Call 2 does that.

━━━ STEP 1: ANALYZE THE ROOM PHOTO ━━━

Detect from visual evidence only:
- Room type: bedroom, living_room, kitchen, bathroom, home_office, dining_room, nursery, studio
- Exact wall color as hex approximation AND description ("#A8C4D8 — soft slate blue")
- Floor material + color ("medium oak hardwood", "beige loop carpet", "grey porcelain tile")
- Natural light: direction (north/south/east/west), intensity (low/medium/high), quality (warm golden/cool white/diffused)
- Room dimensions from perspective cues: small (<150sqft), medium (150-300sqft), large (>300sqft)
- Every structural element: windows (count, size, treatment), doors, ceiling fixtures, built-ins, vents, outlets, columns, beams
- Existing furniture with materials, colors, and approximate positions
- Problem areas: bare walls, empty corners, poor lighting zones, clutter, dead spaces, unstyled surfaces

━━━ STEP 2: INTERPRET STYLE FINGERPRINT ━━━

Map the user's style preferences to specific aesthetic decisions:
- High warmth → warm wood tones (walnut, oak), amber lighting, terracotta accents
- Low warmth → cool tones (grey, blue, white), crisp whites, polished metals
- High visual_complexity → layered textures, gallery walls, collected objects, pattern mixing
- Low visual_complexity → clean surfaces, minimal decoration, negative space
- High organicness → natural materials (linen, jute, raw wood), abundant plants, handcrafted items
- Low organicness → manufactured materials (steel, glass, concrete), geometric forms
- High density → fully furnished, layered accessories, curated collections
- Low density → sparse, generous negative space, few statement pieces
- High traditionalism → classic forms, heritage details, antique character
- Low traditionalism → contemporary lines, forward-looking silhouettes
- High character → personal expression, cultural references, art-forward

━━━ STEP 3: ANALYZE PERSONALIZATION CONTEXT ━━━

If tech preferences are provided:
- hasTV=true → TV MUST appear in key_furniture, add constraint prohibiting its removal
- hasTV=false → add constraint "No television or monitor in this room"
- audioSetup specified → include audio equipment in key_furniture
- smartLighting=true → note color temperature preferences for lighting spec
- hasGamingSetup=true → include gaming peripherals context

If art preferences are provided:
- Specific art direction → include in opportunities ("wall above bed needs [style] art")
- Gallery wall preference → note as opportunity

If sensory preferences are provided:
- plantPresence level → scale plant recommendations in opportunities
- throwCushionDensity → note textile layering needs
- windowTreatments=none → add constraint "Do not add curtains or drapes"
- hasRug=true with style → include in key_furniture

━━━ STEP 4: BUILD CONSTRAINTS (absolute rules for Call 2) ━━━

ALWAYS include these universal constraints:
- "Do not add any electronics (TV, monitor, speakers) unless the user explicitly requested them"
- "Do not add window treatments over existing window coverings unless they are in the remove list"
- "Do not change the floor material unless floor_change_requested is true"

For each KEPT item:
- "Do not replace, obscure, or cover [item name]"
- If the kept item is window blinds, shutters, or any window covering, ALSO add:
  "Do not add curtains, drapes, sheers, or valances — existing window treatment is kept exactly as-is"

For each structural element: "Preserve [element] exactly as-is"
From tech spec: hasTV=false → "No television in this render"

━━━ STEP 4b: KEPT ITEM PALETTE (for color/material integration) ━━━

For EACH kept item visible in the photo, detect from visual evidence:
- material: specific material name ("white painted wood", "dark walnut", "brushed nickel", "grey linen")
- color: dominant color ("white", "dark brown", "cream", "charcoal grey")
- dominant_hex: hex approximation of the dominant color

Output as kept_item_palette array in JSON:
  "kept_item_palette": [
    {"label": "window blinds", "material": "white painted aluminum", "color": "white", "dominant_hex": "#F5F5F0"},
    {"label": "bed frame", "material": "dark walnut", "color": "dark brown", "dominant_hex": "#3B2518"}
  ]

This palette is used by Call 2 to ensure new furniture complements kept items.

━━━ STEP 5: BUILD OPPORTUNITIES (specific to THIS room) ━━━

Not generic ("add lighting") but specific:
- "Empty corner left of window: add tall vertical element (floor lamp or plant)"
- "Bare wall above bed (approximately 4ft wide): needs art at eye level"
- "Floor foreground is empty: needs area rug to anchor furniture grouping"
- "Single overhead light: add layered lighting (floor lamp + table lamp)"
- "No textiles visible: add throw pillows, draped blanket, textured cushions"

━━━ STEP 6: COLOR PALETTE ━━━

60-30-10 rule based on detected walls and floor:
- dominant (60%): the existing wall/floor colors — what's already there
- secondary (30%): complement for primary furniture — must harmonize with walls
- accent (10%): pop color for accessories — analogous or complementary

Reason explicitly: "Walls are [color], floor is [color], so furniture should be [color] to create [warm/cool/neutral] contrast."

COLOR CLASH REJECTION (apply to palette and key_furniture colors):
- If walls are cool (blue, grey, green): do NOT use terracotta, rust, or warm orange for large surfaces (rugs, upholstery). Use warm neutrals instead (cream, sand, warm white, natural linen).
- If walls are warm (cream, beige, yellow): do NOT use cool grey or icy blue for large surfaces.
- Accent colors (10%) can be warmer/cooler but must be small items only (pillows, ceramics, not rugs).

━━━ STEP 7: OUTPUT ━━━

Return ONLY valid JSON. No markdown fences. No explanation.

{
  "room_type": string,
  "existing_palette": [string, string, string],
  "wall_color": string,
  "wall_color_hex": string,
  "floor_type": string,
  "natural_light": "low" | "medium" | "high",
  "natural_light_direction": string,
  "room_size": "small" | "medium" | "large",
  "wall_change_requested": boolean,
  "floor_change_requested": boolean,
  "style_direction": string,
  "secondary_style": string | null,
  "constraints": [string, ...],
  "opportunities": [string, ...],
  "key_furniture": [string, ...],
  "depth_zones": {
    "foreground": string,
    "midground": string,
    "background": string
  },
  "kept_item_palette": [{"label": string, "material": string, "color": string, "dominant_hex": string}, ...],
  "roomType": string,
  "palette": {
    "dominant": string,
    "secondary": string,
    "accent": string,
    "reasoning": string
  },
  "lighting": {
    "source": string,
    "quality": string,
    "colorTemp": string,
    "shadow_description": string
  },
  "materialTension": {
    "warm": string,
    "cool": string
  },
  "budgetTier": "ikea" | "west-elm" | "designer"
}

RULES:
- room_type and roomType must be identical
- wall_change_requested defaults to false
- floor_change_requested defaults to false
- key_furniture: EXACT materials and colors for each piece ("dark walnut low-profile platform bed with cream linen headboard", not "a bed")
  Room size determines count:
    small room → 3-5 pieces maximum (1 anchor + 2-4 supporting/accent)
    medium room → 5-7 pieces
    large room → 6-8 pieces
- constraints: minimum 5 entries — 3 universal + room-specific
- opportunities: minimum 4 specific improvements with locations
- depth_zones: describe what should be in foreground (0-3ft from camera), midground (3-8ft), background (8ft+)
- palette.reasoning: one sentence explaining why these colors work with the detected walls/floor
- lighting.shadow_description: describe shadow quality ("diagonal shadows from east window", "soft diffused fill")
- Never use generic materials: "walnut" not "wood", "bouclé" not "fabric", "brushed brass" not "metal"
- Never use forbidden words: beautiful, stunning, gorgeous, modern, contemporary, cozy, luxurious
- If any field would be "undefined", use a sensible default instead`;

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

// ── System prompt: Call 2 — Design Brief → Kontext-optimized prompt ─────────
const CALL2_SYSTEM = `You produce FLUX Kontext Pro prompts for interior design renders. Output ONLY the prompt text — no JSON, no markdown, no labels.

═══════════════════════════════════════════════════════════════════
 AESTHETIC SYSTEM RULES — READ BEFORE GENERATING
 These 6 rules apply universally to every room type.
 Violating any rule = invalid output.
═══════════════════════════════════════════════════════════════════

RULE 1 — COLOR COHERENCE (apply before naming any color):
  Step A: List persistent colors: wall_color, floor color, kept item colors.
  Step B: For each new item, reason: "Wall is [X], floor is [Y], kept items are [Z].
    Therefore [item] should be [color] because it is complementary/analogous/neutral to all three."
  Step C: Reject any color that clashes with ANY persistent color:
    - If walls are cool blue/grey/green: NEVER use terracotta, rust, warm orange,
      or burnt sienna for LARGE surfaces (rugs, upholstery, throws). These are
      only acceptable as small accent items (a single pillow, a small vase).
    - Cool grey clashes with warm wood floors
    - Two high-saturation surfaces in the same room = visual noise
  Step D: For cool-walled rooms, prefer: cream, sand, warm white, natural linen,
    soft camel, muted sage — warm neutrals that bridge without clashing.
  Step E: Terracotta/rust is ONLY allowed on items smaller than 14 inches
    when walls are blue/grey/green.

RULE 2 — ONE FOCAL POINT (apply before placing furniture):
  Step A: Identify primary focal point by room type:
    bedroom=bed wall, living_room=seating facing TV/fireplace,
    dining_room=table center, home_office=desk wall,
    kitchen=island/range wall, bathroom=vanity wall.
  Step B: Categorize every piece:
    PRIMARY=focal anchor (1 only), SUPPORTING=frames eye to primary (max 3),
    ACCENT=small, does not compete (plants, lamps, art).
  Step C: No SUPPORTING piece may be taller, wider, or more visually dominant
    than the PRIMARY piece. A bookshelf taller than headboard=competing.
  Step D: Side wall furniture max 60% height of primary focal piece.
    If room_size=small, max 1 piece on side walls.

RULE 3 — PHYSICAL LIGHT SOURCES (always specify visible fixtures):
  Every prompt must describe at least TWO physical light sources:
  Primary: natural light with direction + color temp + shadow description.
    Example: "morning light from east window casting diagonal shadows at 5600K"
  Secondary: a physically visible artificial fixture.
    Example: "brass arc floor lamp pooling 2700K warm white on nightstand"
  NEVER use alone: "warm ambient lighting", "professional lighting", "well-lit".
  ALWAYS specify: direction + source fixture + color temperature + shadow quality.

RULE 4 — KEPT ITEM INTEGRATION (apply when kept_item_palette exists):
  Read kept_item_palette from the design brief.
  Every new furniture piece must be materially compatible with kept items:
  - Kept item is white/light → new pieces in warm naturals (cream, light oak, linen), not dark walnut
  - Kept item is dark wood → new pieces in cream/linen/brass, not competing dark tones
  - Kept item is metal/industrial → new pieces in similar finish family
  Never create high-contrast clashes between kept and new items in the same zone.

RULE 5 — ROOM SIZE FURNITURE LIMITS (adapt to detected room_size):
  small (room_size="small"):
    PRIMARY: 1 anchor. SUPPORTING: max 2 pieces under 48" tall.
    ACCENT: max 3 small items. No large bookcases, no sectionals.
  medium (room_size="medium"):
    PRIMARY: 1 anchor. SUPPORTING: max 3-4 pieces.
    ACCENT: up to 5. One statement piece OK if it supports focal point.
  large (room_size="large"):
    PRIMARY: 1 anchor + optional secondary seating area.
    SUPPORTING: up to 5. ACCENT: up to 7. Statement pieces on side walls OK.

RULE 6 — BILATERAL BALANCE (apply around anchor pieces):
  bedroom: bed must have nightstand/surface on each accessible side.
    If both sides accessible: matching or complementary pieces on each side.
    If one side against wall: single nightstand acceptable.
  living_room: sofa must have side table or lamp on at least one end.
    Preferred: balanced elements on both ends.
  Universal: no anchor piece should have one heavily styled side and
    one completely bare side unless physically blocked by wall/window.

═══════════════════════════════════════════════════════════════════

━━━ STEP 0: KEPT ITEM EXCLUSION (read BEFORE writing anything) ━━━

CRITICAL: Never describe a kept item in your furniture spec.
Read the KEPT ITEMS list from the user message. These items appear ONLY in
the preservation clause ("Keep bed...exactly unchanged") and NOWHERE ELSE
in your output. They are invisible to your furniture generation.

Examples:
  - If bed is kept → do NOT write about the bed in your furniture body.
    No "platform storage bed anchors the room." It only appears in "Keep bed...unchanged."
  - If ceiling fan is kept → do NOT describe it in your lighting spec.
  - If window blinds are kept → do NOT mention them in soft furnishing or window sections.

Kept items are already perfect. Focus ONLY on what is being added to empty spaces.
Any sentence in your furniture/lighting/textile body that names a kept item = invalid output.

━━━ STEP 1: READ CONSTRAINTS — ABSOLUTE RULES (do this FIRST) ━━━

Read EVERY constraint from design_brief.constraints. Write each one down mentally.
Constraints OVERRIDE all style preferences, DNA blocks, and style anchors.
If a constraint says "do not add curtains", the word "curtain" CANNOT appear in your output.
If a constraint says "do not add window treatments", no sheer/drape/curtain/valance language.
Any constraint violation = invalid output that will be rejected.

After writing your prompt, re-read every constraint and verify NO sentence violates ANY of them.
If any sentence would violate a constraint, DELETE that sentence entirely.

Specifically PROHIBITED unless user explicitly requested:
- Television, monitor, speakers (check tech preferences)
- Curtains, drapes, sheers, or valances over existing window blinds/shutters/shades
- Ottoman, bench, or extra seating not in the key_furniture list
- Additional windows, doors, fireplaces, built-in elements

ONLY include furniture items that appear in key_furniture from the design brief.
Do NOT invent additional furniture beyond what is listed.

━━━ STEP 2: BUILD REMOVAL CLAUSE (first 20 words) ━━━

Copy the REMOVAL LINE verbatim from the user message as the first words.
If no removal line → skip entirely. Never invent removals.

━━━ STEP 3: BUILD PRESERVATION CLAUSE ━━━

Copy the PRESERVATION LINE verbatim from the user message.
Include wall color + floor type descriptions from the design_brief.

━━━ STEP 4: BUILD ROOM-TYPE-SPECIFIC FURNITURE ━━━

Use room_type from the brief to determine the anchor piece:
- bedroom → bed spec (frame material, headboard, bedding description)
- living_room → sofa spec (upholstery, cushion style, throw)
- kitchen → counter/island styling (accessories, not replacement)
- bathroom → vanity/bath accessories (towels, plants, candles)
- home_office → desk spec (surface material, chair, task lighting)
- dining_room → table spec (material, chairs, overhead light)

For EACH piece from key_furniture, specify:
- Exact material: "matte dark walnut" not "wood"
- Exact color from palette.secondary or palette.accent
- Position relative to room elements

Color coherence rule: Read palette.reasoning. Walls are [wall_color], floor is [floor_type].
Furniture colors must complement — never clash. Use palette.secondary for large pieces,
palette.accent for small accessories.

━━━ STEP 5: POPULATE ALL THREE DEPTH ZONES ━━━

Read depth_zones from the brief. Ensure the prompt covers:

FOREGROUND (0-3ft from camera):
- Area rug with specific pattern and color (if not prohibited by constraints)
- Any foreground accent piece or plant

MIDGROUND (3-8ft):
- Primary furniture from Step 4
- Secondary pieces (side tables, lamps)
- Lighting fixtures with color temperature from lighting.colorTemp

BACKGROUND (8ft+):
- Wall art (ALWAYS include unless constraints prohibit)
- Plants (ALWAYS include at least one unless sensory preferences say none)
- Architectural detail treatment

━━━ STEP 6: LIGHTING (MANDATORY — must include both sources) ━━━

You MUST describe exactly TWO light sources per RULE 3:
SOURCE 1 (natural): "[direction] light from [window/skylight] at [color temp]K casting [shadow description]"
  Use lighting.source and natural_light_direction from the brief.
  Example: "Afternoon west light from window at 5000K casting diagonal shadows across bed."
SOURCE 2 (artificial): "[fixture name] [position] casting [color temp]K [quality]"
  Must be a physically named fixture from key_furniture.
  Example: "Dark walnut table lamp on nightstand casting 2700K warm glow."

Do NOT skip either source. Both must appear in your output.

━━━ STEP 7: SOFT FURNISHINGS + LIVED-IN DETAILS ━━━

ALWAYS include (unless constraints prohibit):
- At least one throw or blanket draped naturally
- Textured cushions or pillows (2-3, varied sizes)
- One organic element (plant, natural material, flowers)
- One lived-in detail (stack of books, ceramic carafe, folded magazine)

━━━ STEP 8: PHOTOGRAPHY SPEC (MANDATORY — always the last sentence) ━━━

The FINAL sentence of your output MUST be exactly:
"Shot on Hasselblad X2D 100C, 24mm tilt-shift at f/8, perfect exposure, professional architectural photography, Architectural Digest quality, no people, no text."

Copy this verbatim. Do not omit it. Do not paraphrase it. It must be the last sentence.

━━━ STEP 9: VALIDATE (critical — do this carefully) ━━━

Before returning, verify EACH of these:
1. Re-read EVERY constraint from Step 1. For each constraint, scan your output for violations.
   - If "do not add curtains" → search for curtain/drape/sheer/valance in your output
   - If "do not replace [item]" → ensure that item is not mentioned as being replaced
2. Every furniture item in your output exists in key_furniture — no invented additions
3. Contains room-type-appropriate anchor piece from Step 4
4. Contains at least one element in each depth zone
5. Contains lighting with color temperature
6. Contains photography spec at end
7. Contains no "undefined" strings
8. Total length 120-200 words (Kontext Pro optimal range)
9. FORBIDDEN WORDS: beautiful, stunning, gorgeous, modern, contemporary, cozy, luxurious
10. Plain text only — no JSON, no markdown, no labels

11. KEPT ITEM CHECK: Re-read the KEPT ITEMS list. For each kept item label,
    scan your furniture body (everything between preservation clause and photography spec).
    If ANY kept item label appears in the body, DELETE that sentence.

If ANY violation found in step 1, 2, or 11, DELETE the offending sentence and continue.`;

// ── Prompt sanitization — strip "undefined" fragments ────────────────────────

function sanitizePrompt(prompt: string): string {
  return prompt
    // Remove undefined fragments
    .replace(/\bundefined\b[\s\w]*[,.]?/g, '')
    // Remove dangling sentence fragments starting with Existing/Current/Original
    // (e.g. "Existing white" with no completing noun/verb)
    .replace(/\b(Existing|Current|Original)\s+\w+\s*[,.]?\s*/gi, '')
    // Collapse multiple spaces/newlines
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Word ceiling enforcement ──────────────────────────────────────────────────

/**
 * Trims a FLUX prompt to maxWords while preserving the camera spec ending.
 * The camera spec begins at the last "Shot on" occurrence.
 */
function enforceWordCeiling(prompt: string, maxWords: number = 200): string {
  const words = prompt.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return prompt;

  // Find camera spec — may start with "Shot on" or "Shot at"
  let shotOnIdx = prompt.lastIndexOf("Shot on");
  if (shotOnIdx === -1) shotOnIdx = prompt.lastIndexOf("Shot at");
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

// ── Call 1: Vision analysis → room analysis JSON ────────────────────────────

async function callDesignBriefFromImage(
  input: DesignDirectorInput,
): Promise<DesignBrief> {
  const { imageUrl, fingerprint, styleAnchor, budgetMin, budgetMax, context } = input;

  const budgetTier = resolveBudgetTier(budgetMin, budgetMax);
  const fingerprintContext = buildFingerprintContext(fingerprint);

  // Resolve chat history for user preferences
  const resolvedChatHistory = input.chatHistory?.trim() || null;

  // Build keep/remove section
  const keepItems = input.keepItems ?? [];
  const removeItems = input.removeItems ?? [];

  const keepRemoveSection = (keepItems.length + removeItems.length) > 0
    ? `━━━ KEEP / REMOVE DECISIONS (from user) ━━━
Items to KEEP unchanged: ${keepItems.length > 0 ? keepItems.join(", ") : "none"}
Items to REMOVE: ${removeItems.length > 0 ? removeItems.join(", ") : "none"}

For each KEPT item, add a constraint: "Do not replace or obscure [item name]"
`
    : "";

  // Wall/floor preferences from render context
  const wallPref = context?.wall_change_requested
    ? `Wall change: yes${context.wall_color_preference ? ` (requested: ${context.wall_color_preference})` : ""}`
    : "Wall change: no (preserve existing walls)";
  const floorPref = "Floor change: no (preserve existing floor unless user explicitly asked)";

  // Extract personalization data from renderContext
  const techSpec = (context as Record<string, unknown> | null)?.techSpec as {
    hasTV?: boolean;
    audioSetup?: string;
    smartLighting?: boolean;
    hasGamingSetup?: boolean;
    hasWorkFromHome?: boolean;
    tvSizeInches?: number;
  } | null | undefined;

  const sensoryProfile = (context as Record<string, unknown> | null)?.sensoryProfile as {
    plantPresence?: string;
    throwCushionDensity?: number;
    windowTreatments?: string;
    hasRug?: boolean;
    rugStyle?: string;
    overallDensity?: string;
  } | null | undefined;

  const artBrief = (context as Record<string, unknown> | null)?.artBrief as {
    hasArtDirection?: boolean;
    visualDirection?: string;
    frameStyle?: string;
    placement?: string;
    galleryWall?: boolean;
  } | null | undefined;

  const identityBrief = (context as Record<string, unknown> | null)?.identityBrief as {
    moodTarget?: string;
    moodKeywords?: string[];
  } | null | undefined;

  // Build personalization section for Call 1
  const personalizationParts: string[] = [];
  if (techSpec) {
    const techLines: string[] = [];
    if (techSpec.hasTV === true) techLines.push(`hasTV: true (${techSpec.tvSizeInches ?? 55} inch)`);
    else if (techSpec.hasTV === false) techLines.push("hasTV: false — NO television");
    if (techSpec.audioSetup && techSpec.audioSetup !== "none") techLines.push(`audioSetup: ${techSpec.audioSetup}`);
    if (techSpec.smartLighting) techLines.push("smartLighting: true");
    if (techSpec.hasGamingSetup) techLines.push("hasGamingSetup: true");
    if (techSpec.hasWorkFromHome) techLines.push("hasWorkFromHome: true");
    if (techLines.length > 0) personalizationParts.push(`Tech preferences:\n${techLines.join("\n")}`);
  }
  if (sensoryProfile) {
    const sensoryLines: string[] = [];
    if (sensoryProfile.plantPresence) sensoryLines.push(`plantPresence: ${sensoryProfile.plantPresence}`);
    if (sensoryProfile.throwCushionDensity) sensoryLines.push(`throwCushionDensity: ${sensoryProfile.throwCushionDensity}/5`);
    if (sensoryProfile.windowTreatments) sensoryLines.push(`windowTreatments: ${sensoryProfile.windowTreatments}`);
    if (sensoryProfile.hasRug) sensoryLines.push(`rug: yes${sensoryProfile.rugStyle ? ` (${sensoryProfile.rugStyle})` : ""}`);
    if (sensoryProfile.overallDensity) sensoryLines.push(`density: ${sensoryProfile.overallDensity}`);
    if (sensoryLines.length > 0) personalizationParts.push(`Sensory preferences:\n${sensoryLines.join("\n")}`);
  }
  if (artBrief?.hasArtDirection) {
    const artLines: string[] = [];
    if (artBrief.visualDirection) artLines.push(`Art direction: ${artBrief.visualDirection}`);
    if (artBrief.frameStyle) artLines.push(`Frame style: ${artBrief.frameStyle}`);
    if (artBrief.galleryWall) artLines.push("Gallery wall: yes");
    if (artLines.length > 0) personalizationParts.push(artLines.join("\n"));
  }
  if (identityBrief?.moodTarget) {
    personalizationParts.push(`Mood target: ${identityBrief.moodTarget}`);
  }
  if (identityBrief?.moodKeywords?.length) {
    personalizationParts.push(`Mood keywords: ${identityBrief.moodKeywords.join(", ")}`);
  }

  const personalizationSection = personalizationParts.length > 0
    ? `━━━ PERSONALIZATION CONTEXT (from user's tab selections) ━━━
${personalizationParts.join("\n\n")}

Use these to inform constraints, opportunities, and key_furniture.
`
    : "";

  // User chat section
  const chatSection = resolvedChatHistory
    ? `━━━ USER PREFERENCES (highest priority) ━━━
${resolvedChatHistory}

Parse these preferences and incorporate into constraints and style_direction.
Named products the user requested MUST appear in key_furniture.
"keep X" → add constraint. Material/color preferences → override style defaults.
`
    : "";

  // Design memory for refinement continuity
  const designMemory = (context as Record<string, unknown> | null)?.design_memory as {
    room_type: string;
    style_anchor: string;
    color_palette: { dominant: string; secondary: string; accent: string };
    key_furniture: string[];
  } | null | undefined;

  const memorySection = designMemory
    ? `━━━ PRIOR DESIGN (refinement — maintain continuity) ━━━
Prior palette: ${designMemory.color_palette.dominant}, ${designMemory.color_palette.secondary}, ${designMemory.color_palette.accent}
Prior furniture: ${designMemory.key_furniture.join(", ")}
Maintain consistency with prior design unless user requested changes.
`
    : "";

  const userMessage = `${chatSection}${personalizationSection}${keepRemoveSection}━━━ STYLE CONTEXT ━━━
Style anchor: ${styleAnchor}
Budget: $${budgetMin}–$${budgetMax} (${budgetTier} tier)
${fingerprintContext}
${wallPref}
${floorPref}

${memorySection}━━━ YOUR TASK ━━━
Analyze the attached room photo. Output ONLY valid JSON matching the schema.
No markdown fences. No preamble. No explanation.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2048,
    system: CALL1_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "url", url: imageUrl },
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

  const raw = block.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  let brief: DesignBrief;
  try {
    brief = JSON.parse(raw) as DesignBrief;
  } catch {
    throw new Error(
      `[design-director] Call 1 JSON parse failed. Raw output:\n${raw.slice(0, 500)}`,
    );
  }

  // Ensure backward-compat aliases are set
  if (!brief.roomType && brief.room_type) brief.roomType = brief.room_type;
  if (!brief.room_type && brief.roomType) brief.room_type = brief.roomType;

  // Enforce room-size-appropriate key_furniture count
  const maxFurniture = brief.room_size === "small" ? 5
    : brief.room_size === "large" ? 8
    : 7; // medium
  if (brief.key_furniture && brief.key_furniture.length > maxFurniture) {
    console.warn(
      `[design-director] Call 1 produced ${brief.key_furniture.length} key_furniture for ${brief.room_size} room — trimming to ${maxFurniture}`,
    );
    brief.key_furniture = brief.key_furniture.slice(0, maxFurniture);
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

// ── Post-generation constraint enforcement ──────────────────────────────────
// Strips sentences from the flux prompt that violate keep constraints.
// This is a hard filter — no LLM retry needed for simple violations.

/** Terms that indicate window treatment additions — always prohibited when blinds are kept */
const WINDOW_TREATMENT_TERMS = /\b(curtain|curtains|drape|drapes|sheer|sheers|valance|valances|drapery|draperies)\b/i;

/**
 * Extract prohibited nouns from "Do not add/include/place X" constraints.
 * Returns lowercase terms.
 */
function extractProhibitedTerms(constraints: string[]): string[] {
  const terms: string[] = [];
  for (const c of constraints) {
    // Match "Do not add/include/place/use X" patterns
    const match = c.match(/do not (?:add|include|use|place|introduce)\s+(?:any\s+)?(.+)/i);
    if (match) {
      // Extract key nouns from the remainder
      const remainder = match[1]!.toLowerCase();
      // Split on commas, "or", dashes to get individual terms
      const parts = remainder.split(/[,]|\bor\b|\b—\b/);
      for (const part of parts) {
        const trimmed = part.trim().replace(/[.!?]$/, '').trim();
        if (trimmed.length > 2) terms.push(trimmed);
      }
    }
  }
  return terms;
}

/**
 * Enforce constraints on the generated flux prompt by stripping violating sentences.
 * - Removes sentences mentioning curtains/drapes/sheers when window treatment is kept
 * - Removes sentences containing explicitly prohibited terms from constraints
 */
function enforceConstraints(
  prompt: string,
  constraints: string[],
  keepItems: string[],
): string {
  const hasKeptWindowTreatment = keepItems.some(
    (item) => /\b(blind|blinds|shutter|shutters|shade|shades|window)\b/i.test(item),
  );

  // Split into sentences for surgical removal
  const sentences = prompt.match(/[^.!?]+[.!?]+\s*/g) ?? [prompt];
  const violations: string[] = [];

  const filtered = sentences.filter((sentence) => {
    // Check window treatment violation
    if (hasKeptWindowTreatment && WINDOW_TREATMENT_TERMS.test(sentence)) {
      violations.push(`Window treatment in kept items — removed: "${sentence.trim()}"`);
      return false;
    }
    return true;
  });

  // Check for explicitly prohibited terms from constraints
  const prohibitedTerms = extractProhibitedTerms(constraints);
  const finalFiltered = filtered.filter((sentence) => {
    for (const term of prohibitedTerms) {
      if (sentence.toLowerCase().includes(term)) {
        violations.push(`Constraint violated ("${term}") — removed: "${sentence.trim()}"`);
        return false;
      }
    }
    return true;
  });

  if (violations.length > 0) {
    console.warn(
      `[design-director] Post-generation constraint enforcement stripped ${violations.length} sentence(s):\n` +
        violations.map((v) => `  • ${v}`).join("\n"),
    );
  }

  return finalFiltered.join("").trim();
}

// ── Call 2: Design brief → FLUX Kontext prompt + negative prompt ─────────────

async function callFluxScriptFromBrief(
  brief: DesignBrief,
  loraTrigger: string,
  removeLabels: string[],
  styleAnchor: string,
  requiredObjects: string[],
  keepItems: string[],
  personalizationContext?: string | null,
): Promise<{ fluxPrompt: string }> {
  // Resolve DNA block for this style/trigger
  let dnaBlock = STYLE_DNA_BLOCKS[loraTrigger] ?? null;

  // Strip curtain/sheer/drape language from DNA block when window blinds are kept
  const hasKeptWindowTreatment = keepItems.some(
    (item) => /\b(blind|blinds|shutter|shutters|shade|shades|window)\b/i.test(item),
  );
  if (dnaBlock && hasKeptWindowTreatment) {
    // Remove sentences containing curtain/drape/sheer/valance language
    dnaBlock = dnaBlock
      .replace(/[^.]*\b(curtain|curtains|drape|drapes|sheer|sheers|valance|drapery)\b[^.]*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\.\s*\./g, '.')
      .trim();
    console.log("[design-director] Stripped curtain language from DNA block — window treatment is kept");
  }

  // Build removal line from user keep_remove_decisions ONLY (single source of truth)
  const removalLine = removeLabels.length > 0
    ? removeLabels.map((item) => `Remove ${item.trim()} completely.`).join(" ")
    : "";

  // Build preservation line from wall/floor analysis
  const preservationParts: string[] = [];
  if (brief.wall_change_requested === false) {
    const wallColor = brief.wall_color || brief.palette?.dominant || "existing";
    preservationParts.push(`Keep ${wallColor} walls exactly as-is.`);
  } else if (brief.wall_change_requested === true && brief.wall_color) {
    preservationParts.push(`Change walls to ${brief.wall_color}.`);
  }
  if (brief.floor_change_requested === false) {
    const floorMaterial = brief.floor_type || "existing";
    preservationParts.push(`Keep ${floorMaterial} floor exactly as-is.`);
  }
  const preservationLine = preservationParts.join(" ");

  // Build pre-constructed lines for Call 2
  const removalSection = removalLine
    ? `REMOVAL LINE (copy verbatim as first words of your output):
"${removalLine}"
`
    : "REMOVAL LINE: None — skip.\n";

  const preservationSection = preservationLine
    ? `PRESERVATION LINE (copy verbatim as Line 2):
"${preservationLine}"
`
    : "PRESERVATION LINE: None — skip.\n";

  const dnaSection = dnaBlock
    ? `DNA block (embed naturally in Line 3):
"${dnaBlock}"
`
    : "";

  const requiredSection = requiredObjects.length > 0
    ? `REQUIRED VERBATIM OBJECTS (include exactly):
${requiredObjects.map((o) => `- ${o}`).join("\n")}
`
    : "";

  const keepSection = keepItems.length > 0
    ? `KEPT ITEMS (do NOT mention replacing these):
${keepItems.map((k) => `- ${k}`).join("\n")}
`
    : "";

  const personalizationBlock = personalizationContext
    ? `PERSONALIZATION CONTEXT (incorporate into prompt):
${personalizationContext}
`
    : "";

  const userMessage = `${removalSection}
${preservationSection}
${dnaSection}${requiredSection}${keepSection}${personalizationBlock}
Design brief:
${JSON.stringify(brief, null, 2)}

LoRA trigger word: "${loraTrigger}"
Style anchor: "${styleAnchor}"

Write the FLUX Kontext Pro prompt now. 120-200 words. Plain text only.
Structure: removal → preservation → anchor furniture with materials/colors → depth zones (foreground/midground/background) → soft furnishings → lighting with color temp → photography spec.
Honor ALL constraints. Populate all three depth zones. Include at least one plant and one textile detail.`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system: CALL2_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content[0];
  if (!block || block.type !== "text" || !block.text.trim()) {
    throw new Error("[design-director] Call 2 returned empty response");
  }

  let fluxPrompt = block.text.trim().replace(/^```[^\n]*\n?/i, "").replace(/\n?```$/i, "").trim();

  // Sanitize — strip any "undefined" fragments from template resolution failures
  fluxPrompt = sanitizePrompt(fluxPrompt);
  if (fluxPrompt !== block.text.trim()) {
    console.warn("[design-director] Call 2 flux_prompt contained 'undefined' fragments — sanitized");
  }

  // Enforce word ceiling — leave room for photography spec (~25 words) that may be appended later.
  // Kontext Pro optimal: 120-200 words total. Ceiling body at 175 so body + spec ≤ 200.
  const rawWordCount = fluxPrompt.split(/\s+/).filter(Boolean).length;
  const hasPhotoSpec = /\bShot (at|on)\b/i.test(fluxPrompt);
  const ceiling = hasPhotoSpec ? 200 : 175; // if spec already present, full 200; otherwise leave room
  if (rawWordCount > ceiling) {
    console.warn(`[design-director] Call 2 flux_prompt ${rawWordCount} words exceeds ceiling — trimming to ${ceiling}`);
    fluxPrompt = enforceWordCeiling(fluxPrompt, ceiling);
  }

  const finalWordCount = fluxPrompt.split(/\s+/).filter(Boolean).length;
  if (finalWordCount < 80) {
    console.warn(`[design-director] Call 2 flux_prompt ${finalWordCount} words — suspiciously short, may lack depth`);
  }

  // ── Post-generation constraint validation ──────────────────────────────────
  // Strip any sentences that violate keep constraints (curtains over blinds,
  // uninstructed items like ottomans when not requested, etc.)
  fluxPrompt = enforceConstraints(fluxPrompt, brief.constraints ?? [], keepItems);

  // ── Natural light enforcement ────────────────────────────────────────────────
  // If Call 2 dropped the natural light sentence (common after word ceiling trim),
  // inject one based on the design brief's lighting data.
  const hasNaturalLight = /\b(morning|afternoon|evening|west|east|north|south|daylight|sunlight|natural)\s*(light|sun|glow)/i.test(fluxPrompt);
  if (!hasNaturalLight && brief.natural_light_direction) {
    const lightDir = brief.natural_light_direction;
    const lightLevel = brief.natural_light ?? "medium";
    const colorTemp = lightLevel === "high" ? "5600K" : lightLevel === "low" ? "3200K" : "4500K";
    const lightSentence = `${lightDir.charAt(0).toUpperCase() + lightDir.slice(1)} natural light at ${colorTemp} casting soft shadows across the room.`;
    // Insert before the camera spec
    const shotIdx = fluxPrompt.lastIndexOf("Shot at");
    const shotOnIdx = fluxPrompt.lastIndexOf("Shot on");
    const insertIdx = Math.max(shotIdx, shotOnIdx);
    if (insertIdx > 0) {
      fluxPrompt = fluxPrompt.slice(0, insertIdx).trimEnd() + " " + lightSentence + " " + fluxPrompt.slice(insertIdx);
    } else {
      fluxPrompt = fluxPrompt.trimEnd().replace(/[.]?$/, ". ") + lightSentence;
    }
    console.warn("[design-director] Natural light sentence was missing — injected from design brief");
  }

  // ── Photography spec enforcement ────────────────────────────────────────────
  // If Call 2 omitted the camera closer, append it.
  const CAMERA_SPEC = "Shot on Hasselblad X2D 100C, 24mm tilt-shift at f/8, perfect exposure, professional architectural photography, Architectural Digest quality, no people, no text.";
  if (!/\bShot (at|on)\b/i.test(fluxPrompt)) {
    console.warn("[design-director] Call 2 omitted photography spec — appending");
    fluxPrompt = fluxPrompt.trimEnd().replace(/[.]?$/, ". ") + CAMERA_SPEC;
  }

  return { fluxPrompt };
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function runDesignDirector(
  input: DesignDirectorInput,
): Promise<DesignDirectorOutput> {
  console.log("[design-director] Starting — room:", input.roomType, "| anchor:", input.styleAnchor);

  // Call 1: vision → staging JSON
  const stagingJson = await callDesignBriefFromImage(input);
  console.log(
    `[design-director] Call 1 complete — room: ${stagingJson.room_type}, tier: ${stagingJson.budgetTier}`,
    `| constraints: ${stagingJson.constraints?.length ?? 0}`,
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

  // Build personalization summary for Call 2
  const context = input.context as Record<string, unknown> | null;
  const personalizationForCall2Parts: string[] = [];
  const techCtx = context?.techSpec as Record<string, unknown> | null | undefined;
  if (techCtx) {
    if (techCtx.hasTV === true) personalizationForCall2Parts.push(`Include a ${techCtx.tvSizeInches ?? 55}" TV`);
    if (techCtx.hasTV === false) personalizationForCall2Parts.push("No television");
    if (techCtx.smartLighting) personalizationForCall2Parts.push("Smart lighting with warm color temp");
  }
  const sensoryCtx = context?.sensoryProfile as Record<string, unknown> | null | undefined;
  if (sensoryCtx) {
    if (sensoryCtx.plantPresence === "none") personalizationForCall2Parts.push("No plants");
    if (sensoryCtx.windowTreatments === "none") personalizationForCall2Parts.push("No curtains or drapes");
  }
  const artCtx = context?.artBrief as Record<string, unknown> | null | undefined;
  if (artCtx?.hasArtDirection && artCtx.visualDirection) {
    personalizationForCall2Parts.push(`Art: ${artCtx.visualDirection}`);
  }
  const identityCtx = context?.identityBrief as Record<string, unknown> | null | undefined;
  if (identityCtx?.moodTarget) {
    personalizationForCall2Parts.push(`Mood: ${identityCtx.moodTarget}`);
  }
  const personalizationForCall2 = personalizationForCall2Parts.length > 0
    ? personalizationForCall2Parts.join(". ") + "."
    : null;

  // Call 2: design brief → Kontext-optimized flux_prompt
  const { fluxPrompt } = await callFluxScriptFromBrief(
    stagingJson,
    input.loraTrigger,
    removeLabels,
    input.styleAnchor,
    requiredObjects,
    input.keepItems ?? [],
    personalizationForCall2,
  );
  const wordCount = fluxPrompt.split(/\s+/).filter(Boolean).length;
  console.log(`[design-director] Call 2 complete — flux_prompt: ${wordCount} words`);

  return { stagingJson, fluxPrompt };
}
