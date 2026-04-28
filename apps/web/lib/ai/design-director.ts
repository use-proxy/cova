/**
 * Design Director — Call 1: Vision Analyzer
 *
 * Uses Claude Sonnet 4.6 with forced tool_choice to analyze a room photo
 * and emit a structured DesignBrief. The tool schema guarantees valid
 * structured output — no JSON parsing needed.
 *
 * Call 2 (DesignBrief -> FLUX prompt) lives in prompt-compiler.ts.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { StyleFingerprint } from "@/types/fingerprint";
import type { RenderContext } from "@/lib/types/area2";
import { mergeToV2 } from "@/lib/ai/style-match";
import {
  containsForbiddenStyleName,
  findForbiddenStyleNames,
} from "@/lib/ai/forbidden-names";
import { buildLorasFromBlend, normalizeLoras } from "@/lib/ai/lora-blending";

const anthropic = new Anthropic();

// ── Type definitions ──────────────────────────────────────────────────────────

export type RoomType =
  | "bedroom"
  | "living_room"
  | "kitchen"
  | "bathroom"
  | "home_office"
  | "dining"
  | "entryway";

export interface DesignBrief {
  room_type: RoomType;
  architecture_preserved: {
    walls: string;
    windows: string;
    ceiling_height_est_ft: number;
    floor_type: string;
    camera_pov: string;
  };
  anchor: {
    category: string;
    material: string;
    color: string;
    scale: string;
  };
  palette: {
    primary_hex: string;
    secondary_hex: string;
    accent_hex: string;
    neutral_hex: string;
  };
  materials: string[];
  lighting: {
    direction: string;
    fixture: string;
    color_temp_k: number;
    shadow_intensity: "soft" | "medium" | "hard";
  };
  depth_zones: {
    foreground: string[];
    midground: string[];
    background: string[];
  };
  style_weights: {
    primary_lora: string;
    primary_scale: number;
    secondary_lora?: string;
    secondary_scale?: number;
    // Phase 3: weighted LoRA blend. Keys are cv* triggers (what FLUX consumes),
    // values are blend proportions summing to 1.0. Additive — primary_lora is
    // still populated for back-compat with frozen Edge Functions (CLAUDE.md
    // Rule 12) and legacy rows. Phase 5 renderer prefers `loras` when present.
    loras?: Record<string, number>;
  };
  hard_constraints: string[];

  // ── Session 8 additions ─────────────────────────────────────────────────────
  focal_point: {
    description: string;
    position: string;
    viewer_eye_path: string;
  };
  color_story: {
    primary: { name: string; hex: string; coverage_pct: number };
    secondary: { name: string; hex: string; coverage_pct: number };
    accent: { name: string; hex: string; coverage_pct: number };
    neutral_ground: { name: string; hex: string; coverage_pct: number };
  };
  three_materials: Array<{ name: string; finish: string; application: string }>;
  lighting_concept: {
    natural_light: string;
    artificial_light: string[];
  };
  object_hierarchy: {
    hero: { item: string; position: string };
    supporting: Array<{ item: string; position: string }>;
    accessories: Array<{ item: string; position: string }>;
  };
  negative_space: {
    instruction: string;
    forbidden_zones: string[];
  };
  statement_piece: { description: string; position: string };
  design_rationale: string;
  smart_suggestions: string[];
  wall_change_requested: boolean;
  floor_change_requested: boolean;
  room_scale: "small" | "medium" | "large";

  // Auxiliary fields (set programmatically after tool call, not from Claude)
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
  styleAnchor: string;
  loraTrigger: string;
  budgetMin: number;
  budgetMax: number;
  context?: RenderContext | null;
  removeItems?: string[];
  keepItems?: string[];
  chatHistory?: string | null;
  chatContext?: Record<string, unknown> | null;
  roomId?: string;
}

export interface DesignDirectorOutput {
  stagingJson: DesignBrief;
  fluxPrompt: string;
}

// ── Style DNA blocks — lock style before room-specific content ───────────────
// Exported for quiz/style-preview route. Each trigger maps to a concise
// material-first block that FLUX weighs heavily in early token positions.

export const STYLE_DNA_BLOCKS: Record<string, string> = {
  cvwmn: "Warm japandi interior. White oak, cream linen, terracotta clay, brushed brass. Soft diffused morning light through sheer curtains.",
  cvmax: "Maximalist layered interior. Jewel-toned velvet, patterned textiles, gallery wall, collected objects.",
  cvind: "Industrial loft interior. Exposed brick, blackened steel, worn leather, Edison filament light.",
  cvlux: "Refined luxury interior. Honed marble, aged brass, hand-stitched cashmere, directional pendant light.",
  cvcst: "Coastal bright interior. Whitewashed oak, bleached linen, sea glass tones, soft diffused natural light.",
  cvscn: "Nordic minimal interior. Pale ash, natural wool, muted stone, even cool daylight through tall windows.",
  cvmcm: "Retro mid-century interior. Walnut veneer, teak, hairpin legs, warm amber accent light.",
  cvboh: "Maximalist eclectic interior. Woven jute, embroidered textiles, terracotta, low-light lantern warmth.",
  cvdco: "Art deco interior. Lacquered surfaces, geometric inlay, velvet jewel tones, dramatic directional light.",
  cvbio: "Biophilic interior. Living walls, natural stone, reclaimed wood beams, abundant plants, filtered green light through canopy.",
  cvfrm: "Farmhouse interior. Reclaimed barn wood, shiplap walls, linen slipcovers, warm Edison pendant light.",
};

// ── Tool schema for forced structured output ────────────────────────────────

const EMIT_DESIGN_BRIEF_TOOL: Anthropic.Messages.Tool = {
  name: "emit_design_brief",
  description: "Emit a structured design brief for the room redesign pipeline.",
  input_schema: {
    type: "object" as const,
    properties: {
      room_type: {
        type: "string",
        enum: [
          "bedroom",
          "living_room",
          "kitchen",
          "bathroom",
          "home_office",
          "dining",
          "entryway",
        ],
      },
      architecture_preserved: {
        type: "object",
        properties: {
          walls: {
            type: "string",
            description:
              "Wall color, texture, and finish (e.g. 'smooth warm beige walls with matte finish')",
          },
          windows: {
            type: "string",
            description:
              "Count, direction, size, and treatment (e.g. '2 east-facing windows with white horizontal blinds')",
          },
          ceiling_height_est_ft: {
            type: "number",
            description: "Estimated ceiling height in feet",
          },
          floor_type: {
            type: "string",
            description:
              "Floor material and color (e.g. 'medium oak hardwood', 'beige loop carpet', 'grey porcelain tile')",
          },
          camera_pov: {
            type: "string",
            description:
              "Camera position and facing direction (e.g. 'eye-level, facing bed wall from doorway')",
          },
        },
        required: [
          "walls",
          "windows",
          "ceiling_height_est_ft",
          "floor_type",
          "camera_pov",
        ],
      },
      anchor: {
        type: "object",
        description:
          "Room-type-specific anchor piece. bedroom=bed, living_room=sofa, kitchen=island or cabinetry_run, bathroom=vanity, home_office=desk, dining=dining_table, entryway=console.",
        properties: {
          category: {
            type: "string",
            description:
              "Anchor category matching room type (bed, sofa, island, cabinetry_run, vanity, desk, dining_table, console)",
          },
          material: {
            type: "string",
            description:
              "Specific materials (e.g. 'dark walnut frame with cream linen headboard')",
          },
          color: { type: "string", description: "Dominant color(s)" },
          scale: {
            type: "string",
            description: "Size description (e.g. 'queen, 60x80')",
          },
        },
        required: ["category", "material", "color", "scale"],
      },
      palette: {
        type: "object",
        description:
          "60-30-10 color palette as hex. primary=walls/floor (60%), secondary=furniture (30%), accent=accessories (10%), neutral=bridge tone.",
        properties: {
          primary_hex: { type: "string" },
          secondary_hex: { type: "string" },
          accent_hex: { type: "string" },
          neutral_hex: { type: "string" },
        },
        required: ["primary_hex", "secondary_hex", "accent_hex", "neutral_hex"],
      },
      materials: {
        type: "array",
        items: { type: "string" },
        description:
          "3-6 specific material names for the redesign (e.g. 'walnut', 'brushed brass', 'boucle', 'travertine', 'linen')",
      },
      lighting: {
        type: "object",
        properties: {
          direction: {
            type: "string",
            description: "Natural light direction (e.g. 'east morning light')",
          },
          fixture: {
            type: "string",
            description:
              "Primary artificial fixture (e.g. 'brass arc floor lamp')",
          },
          color_temp_k: {
            type: "number",
            description: "Color temperature in Kelvin (e.g. 2700, 4000, 5600)",
          },
          shadow_intensity: {
            type: "string",
            enum: ["soft", "medium", "hard"],
          },
        },
        required: [
          "direction",
          "fixture",
          "color_temp_k",
          "shadow_intensity",
        ],
      },
      depth_zones: {
        type: "object",
        description:
          "Objects to place in each depth zone. foreground=0-3ft from camera, midground=3-8ft, background=8ft+.",
        properties: {
          foreground: {
            type: "array",
            items: { type: "string" },
            description: "Items closest to camera (area rug, plants, accent pieces)",
          },
          midground: {
            type: "array",
            items: { type: "string" },
            description: "Primary furniture, side tables, lamps",
          },
          background: {
            type: "array",
            items: { type: "string" },
            description: "Wall art, shelving, tall plants",
          },
        },
        required: ["foreground", "midground", "background"],
      },
      style_weights: {
        type: "object",
        properties: {
          primary_lora: {
            type: "string",
            description: "LoRA trigger word provided in context",
          },
          primary_scale: {
            type: "number",
            description: "LoRA scale 0.0-1.0 (default 0.8)",
          },
          secondary_lora: { type: "string" },
          secondary_scale: { type: "number" },
          loras: {
            type: "object",
            description:
              "Optional weighted blend of cv* LoRA triggers. Keys are cv* codes (cvwmn, cvscn, etc.), values are proportions in [0,1] summing to 1.0. Overridden server-side post-call.",
            additionalProperties: { type: "number" },
          },
        },
        required: ["primary_lora", "primary_scale"],
      },
      hard_constraints: {
        type: "array",
        items: { type: "string" },
        description:
          "What MUST NOT appear or change. Include architecture preservation, kept-item constraints, and exclusions.",
      },
      focal_point: {
        type: "object",
        description: "The room's visual focal point and how the viewer's eye travels.",
        properties: {
          description: { type: "string", description: "What the focal point is" },
          position: { type: "string", description: "Where it is (back wall, left corner, etc.)" },
          viewer_eye_path: { type: "string", description: "Where the eye travels after the focal point" },
        },
        required: ["description", "position", "viewer_eye_path"],
      },
      color_story: {
        type: "object",
        description: "60-30-10 color story with named colors and coverage percentages.",
        properties: {
          primary: {
            type: "object",
            properties: {
              name: { type: "string" }, hex: { type: "string" }, coverage_pct: { type: "number" },
            },
            required: ["name", "hex", "coverage_pct"],
          },
          secondary: {
            type: "object",
            properties: {
              name: { type: "string" }, hex: { type: "string" }, coverage_pct: { type: "number" },
            },
            required: ["name", "hex", "coverage_pct"],
          },
          accent: {
            type: "object",
            properties: {
              name: { type: "string" }, hex: { type: "string" }, coverage_pct: { type: "number" },
            },
            required: ["name", "hex", "coverage_pct"],
          },
          neutral_ground: {
            type: "object",
            properties: {
              name: { type: "string" }, hex: { type: "string" }, coverage_pct: { type: "number" },
            },
            required: ["name", "hex", "coverage_pct"],
          },
        },
        required: ["primary", "secondary", "accent", "neutral_ground"],
      },
      three_materials: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Material name (e.g., 'white oak')" },
            finish: { type: "string", description: "Surface finish (e.g., 'matte', 'brushed', 'honed')" },
            application: { type: "string", description: "Where it's used (e.g., 'bed frame', 'accent table')" },
          },
          required: ["name", "finish", "application"],
        },
        minItems: 3,
        maxItems: 3,
        description: "Exactly 3 materials — no more. Trade-name specificity required.",
      },
      lighting_concept: {
        type: "object",
        properties: {
          natural_light: { type: "string", description: "Direction, quality, time of day (e.g., 'warm afternoon light from south-facing window')" },
          artificial_light: {
            type: "array",
            items: { type: "string" },
            description: "Fixtures and their positions (e.g., 'brass arc floor lamp behind sofa')",
          },
        },
        required: ["natural_light", "artificial_light"],
      },
      object_hierarchy: {
        type: "object",
        description: "Furniture hierarchy: one hero anchor, 2-4 supporting, 3-7 accessories. Total must respect room_scale max.",
        properties: {
          hero: {
            type: "object",
            properties: {
              item: { type: "string" }, position: { type: "string" },
            },
            required: ["item", "position"],
          },
          supporting: {
            type: "array",
            items: {
              type: "object",
              properties: { item: { type: "string" }, position: { type: "string" } },
              required: ["item", "position"],
            },
            description: "2-4 supporting pieces",
          },
          accessories: {
            type: "array",
            items: {
              type: "object",
              properties: { item: { type: "string" }, position: { type: "string" } },
              required: ["item", "position"],
            },
            description: "3-7 small accessory items",
          },
        },
        required: ["hero", "supporting", "accessories"],
      },
      negative_space: {
        type: "object",
        properties: {
          instruction: { type: "string", description: "How to handle empty space intentionally" },
          forbidden_zones: {
            type: "array",
            items: { type: "string" },
            description: "Areas that MUST remain empty (e.g., 'center of room', '2ft around bed')",
          },
        },
        required: ["instruction", "forbidden_zones"],
      },
      statement_piece: {
        type: "object",
        description: "One unexpected element that makes the room memorable.",
        properties: {
          description: { type: "string" },
          position: { type: "string" },
        },
        required: ["description", "position"],
      },
      design_rationale: {
        type: "string",
        description: "Exactly 3 sentences explaining the key design decisions and why they work for this room.",
      },
      smart_suggestions: {
        type: "array",
        items: { type: "string" },
        description: "3-5 specific refinement options the user could request (e.g., 'swap oak for walnut', 'add a reading nook').",
        minItems: 3,
        maxItems: 5,
      },
      wall_change_requested: {
        type: "boolean",
        description: "Whether the user requested wall changes. Default false — preserve existing walls.",
      },
      floor_change_requested: {
        type: "boolean",
        description: "Whether the user requested floor changes. Default false — preserve existing floor.",
      },
      room_scale: {
        type: "string",
        enum: ["small", "medium", "large"],
        description: "Estimated room scale: small (<12m²), medium (12-25m²), large (>25m²). Determines max furniture count.",
      },
    },
    required: [
      "room_type",
      "architecture_preserved",
      "anchor",
      "palette",
      "materials",
      "lighting",
      "depth_zones",
      "style_weights",
      "hard_constraints",
      "focal_point",
      "color_story",
      "three_materials",
      "lighting_concept",
      "object_hierarchy",
      "negative_space",
      "statement_piece",
      "design_rationale",
      "smart_suggestions",
      "wall_change_requested",
      "floor_change_requested",
      "room_scale",
    ],
  },
};

// ── System prompt for Call 1 ────────────────────────────────────────────────

const CALL1_SYSTEM = `You are a senior interior designer analyzing a room photo for a redesign pipeline. Look at the architecture, lighting, existing furniture, and the user's target style. Emit a design_brief via the emit_design_brief tool.

REASONING CHAIN (answer these 5 questions INTERNALLY before generating the brief):
  1. "What is the single worst design problem in this room worth fixing?"
  2. "What is the single best thing worth preserving or celebrating?"
  3. "What design decision will have the biggest visual impact?"
  4. "What would a professional designer NEVER place here given these proportions?"
  5. "What unexpected element would make this room memorable?"

ROOM SCALE RULES (enforce in object_hierarchy):
  Estimate room_scale from the photo:
    small (<12m²): max 4 furniture pieces total (hero=1, supporting=1-2, accessories=1-2)
    medium (12-25m²): max 7 pieces total (hero=1, supporting=2-3, accessories=3-4)
    large (>25m²): max 10 pieces total (hero=1, supporting=3-4, accessories=5-7)
  Total pieces = 1 hero + len(supporting) + len(accessories). Must not exceed room_scale max.

ROOM-TYPE ANCHOR RULES (anchor.category MUST match):
  bedroom -> anchor.category = "bed" (specify headboard material, frame, bedding)
  living_room -> "sofa" (2/3-seater, upholstery material, color)
  kitchen -> "island" or "cabinetry_run" (countertop material, cabinet finish)
  bathroom -> "vanity" (basin, countertop material, cabinet finish)
  home_office -> "desk" (surface material, dimensions)
  dining -> "dining_table" (material, shape, seating count)
  entryway -> "console" (material, width, leg style)

MATERIAL SPECIFICITY (non-negotiable):
  Never use generic words. Always use trade-name specificity:
  "walnut" not "wood", "boucle" not "fabric", "brushed brass" not "metal",
  "travertine" not "stone", "linen" not "cloth", "oak" not "timber".

DEPTH ZONES (all three MUST be populated):
  foreground (0-3ft from camera): area rug, plants, accent pieces
  midground (3-8ft): primary furniture (anchor piece), side tables, lamps
  background (8ft+): wall art, shelving, tall plants, architectural details

COLOR COHERENCE (apply to palette):
  Use the 60-30-10 rule: primary_hex = existing walls/floor (60%), secondary_hex = furniture (30%), accent_hex = accessories (10%), neutral_hex = bridge tone.
  If walls are cool (blue/grey/green): do NOT use warm orange or rust for secondary. Use cream, sand, warm white, natural linen.
  If walls are warm (cream/beige/yellow): do NOT use cool grey or icy blue for secondary.

KEPT ITEM HANDLING:
  For each item the user wants to KEEP, add to hard_constraints:
    "do not replace, obscure, or cover [item name]"
  If kept item is window blinds/shutters/shades, ALSO add:
    "no curtains, drapes, sheers, or valances"

HARD CONSTRAINTS (always include these universal entries):
  - "keep all walls, windows, door frames, ceiling, and flooring exactly as shown"
  - One entry per KEPT item
  - "no television, no screens, no monitors" (unless user explicitly requested TV)

FINGERPRINT INTERPRETATION:
  The user message includes style dimension scores (0-1 scale, 0.5 = neutral).
  Use dimensions that deviate from 0.5 to guide material and object choices:
  warmth > 0.65 -> warm wood tones, amber lighting, earth accents
  warmth < 0.35 -> cool tones, grey-blue palette, crisp whites
  visual_complexity > 0.65 -> layered textures, gallery walls, pattern mixing
  visual_complexity < 0.35 -> clean surfaces, minimal decoration
  organicness > 0.65 -> natural materials (linen, jute, raw wood), plants
  organicness < 0.35 -> manufactured (steel, glass, concrete)
  density > 0.65 -> fully furnished, layered accessories (8+ objects in depth zones)
  density < 0.35 -> sparse, generous negative space (4-5 objects max)
  traditionalism > 0.65 -> classic forms, heritage details
  traditionalism < 0.35 -> contemporary lines, forward-looking
  character > 0.65 -> personal expression, cultural references, art-forward
  character < 0.35 -> quiet, understated, lets materials speak

PERSONALIZATION CONSTRAINTS (hard — override style defaults when present):
  If personalization_context is provided:
  - Smart tech items marked accepted=true MUST appear in the final design at their placement zone
  - Art layout_type MUST be honored exactly — do not suggest a different art arrangement
  - Lifestyle constraints override fingerprint-based density and lighting:
      works_from_room=true -> add task lighting and desk area to the brief
      time_preference=morning -> maximize natural light, cool morning palette, color_temp_k >= 5000K
      time_preference=evening -> warm ambient lighting, color_temp_k <= 2700K
      density=restrained -> reduce max objects to 4 regardless of room_scale
      density=collector -> increase to upper bound of room_scale range
  - required_object is THE hero anchor — build the entire design around it
      It overrides the default room-type anchor if present
      Set object_hierarchy.hero to the required_object description`;

// ── Fingerprint dimension helpers ────────────────────────────────────────────

type V2Band = "low" | "moderate" | "high";

const V2_DIM_DESCRIPTIONS: Record<string, Record<V2Band, string>> = {
  warmth: {
    low: "cool tones, grey-blue palette, crisp whites",
    moderate: "balanced warm-cool, neutral base",
    high: "warm amber tones, honey oak, earth accents",
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

function extractV2Vector(fp: StyleFingerprint): number[] {
  const d = fp.dimensions as Record<string, number>;
  if (fp.fingerprint_version === "v2") {
    return [
      d.colorTemperature ?? 0.5,
      d.colorSaturation ?? 0.5,
      d.formality ?? 0.5,
      d.density ?? 0.5,
      d.era ?? 0.5,
      d.material ?? 0.5,
    ];
  }
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
    parts.push(`${dimName}: ${value.toFixed(2)} (${band}) -> ${description}`);
  }
  return parts.join("\n");
}

function resolveBudgetTier(
  min: number,
  max: number,
): "ikea" | "west-elm" | "designer" {
  const mid = (min + max) / 2;
  if (mid < 500) return "ikea";
  if (mid <= 2000) return "west-elm";
  return "designer";
}

// ── Required object extractor — named products from chat history ─────────────

function extractRequiredObjects(chatHistory: string): string[] {
  const objects: string[] = [];

  const tvMatches = Array.from(
    chatHistory.matchAll(
      /(\d{2,3})\s*["\s'-]*(?:inch|"|in\b)?\s*(?:-\s*)?([A-Z][A-Za-z0-9]+(?:\s+[A-Za-z0-9]+){0,3}?\s+(?:Frame\s+TV|OLED\s+TV|Smart\s+TV|TV|Television|OLED|Screen|Monitor))/g,
    ),
  );
  for (const m of tvMatches) {
    objects.push(`${m[1]} inch ${m[2]!.trim()}`);
  }

  const audioMatches = Array.from(
    chatHistory.matchAll(
      /\b(Sonos|Bose|Bang\s*(?:&|and)\s*Olufsen|Harman\s+Kardon|Denon|Yamaha|JBL|KEF|Devialet)\s+([A-Z][a-zA-Z0-9]+(?:\s+[a-zA-Z0-9]+)?)\b/g,
    ),
  );
  for (const m of audioMatches) {
    objects.push(`${m[1]} ${m[2]!.trim()}`);
  }

  const furnitureMatches = Array.from(
    chatHistory.matchAll(
      /\b(Herman\s+Miller|Eames|Knoll|Fritz\s+Hansen|Hay\s+Sofa|Muuto)\s+([A-Z][a-zA-Z0-9\s]{2,30})/g,
    ),
  );
  for (const m of furnitureMatches) {
    objects.push(`${m[1]} ${m[2]!.trim()}`);
  }

  return Array.from(new Set(objects)).filter(Boolean);
}

// ── Build user message for Call 1 ───────────────────────────────────────────

function buildUserMessage(input: DesignDirectorInput): string {
  const {
    fingerprint,
    styleAnchor,
    loraTrigger,
    budgetMin,
    budgetMax,
    context,
  } = input;

  const budgetTier = resolveBudgetTier(budgetMin, budgetMax);
  const fingerprintContext = buildFingerprintContext(fingerprint);

  const sections: string[] = [];

  // Style context
  sections.push(`STYLE CONTEXT:
Style anchor: ${styleAnchor}
LoRA trigger: ${loraTrigger}
Budget: $${budgetMin}-$${budgetMax} (${budgetTier} tier)

FINGERPRINT DIMENSIONS (0-1 scale, 0.5 = neutral):
${fingerprintContext}`);

  // Keep/remove decisions
  const keepItems = input.keepItems ?? [];
  const removeItems = input.removeItems ?? [];
  if (keepItems.length + removeItems.length > 0) {
    sections.push(`KEEP/REMOVE DECISIONS (from user):
Items to KEEP unchanged: ${keepItems.length > 0 ? keepItems.join(", ") : "none"}
Items to REMOVE: ${removeItems.length > 0 ? removeItems.join(", ") : "none"}`);
  }

  // Wall/floor preferences
  const wallChange = context?.wall_change_requested ?? false;
  const wallPref = wallChange
    ? "Wall change: yes (user requested)"
    : "Wall change: no (preserve existing walls)";
  sections.push(`${wallPref}
Floor change: no (preserve existing floor unless user explicitly asked)`);

  // Personalization from render context
  const ctxRaw = context as Record<string, unknown> | null;
  const personalizationParts: string[] = [];

  const techSpec = ctxRaw?.techSpec as Record<string, unknown> | null | undefined;
  if (techSpec) {
    const techLines: string[] = [];
    if (techSpec.hasTV === true)
      techLines.push(`hasTV: true (${techSpec.tvSizeInches ?? 55} inch)`);
    else if (techSpec.hasTV === false)
      techLines.push("hasTV: false - NO television");
    if (techSpec.audioSetup && techSpec.audioSetup !== "none")
      techLines.push(`audioSetup: ${techSpec.audioSetup}`);
    if (techSpec.smartLighting) techLines.push("smartLighting: true");
    if (techSpec.hasGamingSetup) techLines.push("hasGamingSetup: true");
    if (techSpec.hasWorkFromHome) techLines.push("hasWorkFromHome: true");
    if (techLines.length > 0)
      personalizationParts.push(`Tech preferences:\n${techLines.join("\n")}`);
  }

  const sensoryProfile = ctxRaw?.sensoryProfile as Record<string, unknown> | null | undefined;
  if (sensoryProfile) {
    const sensoryLines: string[] = [];
    if (sensoryProfile.plantPresence)
      sensoryLines.push(`plantPresence: ${sensoryProfile.plantPresence}`);
    if (sensoryProfile.throwCushionDensity)
      sensoryLines.push(
        `throwCushionDensity: ${sensoryProfile.throwCushionDensity}/5`,
      );
    if (sensoryProfile.windowTreatments)
      sensoryLines.push(
        `windowTreatments: ${sensoryProfile.windowTreatments}`,
      );
    if (sensoryProfile.hasRug)
      sensoryLines.push(
        `rug: yes${sensoryProfile.rugStyle ? ` (${sensoryProfile.rugStyle})` : ""}`,
      );
    if (sensoryLines.length > 0)
      personalizationParts.push(
        `Sensory preferences:\n${sensoryLines.join("\n")}`,
      );
  }

  const artBrief = ctxRaw?.artBrief as Record<string, unknown> | null | undefined;
  if (artBrief?.hasArtDirection) {
    const artLines: string[] = [];
    if (artBrief.visualDirection)
      artLines.push(`Art direction: ${artBrief.visualDirection}`);
    if (artBrief.frameStyle)
      artLines.push(`Frame style: ${artBrief.frameStyle}`);
    if (artBrief.galleryWall) artLines.push("Gallery wall: yes");
    if (artLines.length > 0)
      personalizationParts.push(artLines.join("\n"));
  }

  const identityBrief = ctxRaw?.identityBrief as Record<string, unknown> | null | undefined;
  if (identityBrief?.moodTarget)
    personalizationParts.push(`Mood target: ${identityBrief.moodTarget}`);
  if (
    Array.isArray(identityBrief?.moodKeywords) &&
    (identityBrief.moodKeywords as string[]).length > 0
  )
    personalizationParts.push(
      `Mood keywords: ${(identityBrief.moodKeywords as string[]).join(", ")}`,
    );

  if (personalizationParts.length > 0) {
    sections.push(
      `PERSONALIZATION CONTEXT:\n${personalizationParts.join("\n\n")}`,
    );
  }

  // Personalization moments (from step-7e/7f/7g/7h screens)
  const personalizationContext = ctxRaw?.personalization_context as Record<string, unknown> | null | undefined;
  if (personalizationContext && Object.keys(personalizationContext).length > 0) {
    const momentParts: string[] = [];

    // Smart tech (step-7e)
    const smartTech = personalizationContext.smart_tech as Array<{
      item: string;
      accepted: boolean;
      placement_zone: string;
    }> | undefined;
    if (smartTech && smartTech.length > 0) {
      const accepted = smartTech.filter((t) => t.accepted);
      if (accepted.length > 0) {
        momentParts.push(
          `REQUIRED SMART TECH (must appear in design):\n${accepted.map((t) => `- ${t.item} at ${t.placement_zone}`).join("\n")}`,
        );
      }
    }

    // Art layout (step-7f)
    const artLayout = personalizationContext.art as {
      layout_type: string;
      poster_urls?: string[];
      selected_poster_url?: string;
      position?: string;
    } | undefined;
    if (artLayout && artLayout.layout_type !== "none") {
      const layoutDescriptions: Record<string, string> = {
        gallery_wall: "Gallery wall arrangement with 6 framed pieces in a grid",
        statement_piece: "One large statement artwork as focal point",
        triptych: "Three connected pieces in a horizontal triptych",
        salon_wall: "Asymmetric salon-style mix of different sized frames",
      };
      momentParts.push(
        `ART ARRANGEMENT (honor exactly): ${layoutDescriptions[artLayout.layout_type] ?? artLayout.layout_type} on ${artLayout.position ?? "focal wall"}`,
      );
    }

    // Lifestyle signals (step-7g)
    const lifestyle = personalizationContext.lifestyle as {
      works_from_room: boolean | string;
      time_preference: string;
      density: string;
    } | undefined;
    if (lifestyle) {
      const lifestyleLines: string[] = [];
      if (lifestyle.works_from_room === true || lifestyle.works_from_room === "sometimes") {
        lifestyleLines.push("Task lighting required, define a desk/work area in the design");
      }
      if (lifestyle.time_preference === "morning") {
        lifestyleLines.push("Maximize natural light, cool morning palette, color_temp_k >= 5000K");
      } else if (lifestyle.time_preference === "evening") {
        lifestyleLines.push("Warm ambient lighting, color_temp_k <= 2700K, layered light sources");
      }
      if (lifestyle.density === "minimalist") {
        // Internal DB/UI value is "minimalist" (kept for backward compat with
        // existing rooms.personalization_context rows). The token sent to
        // Sonnet is rewritten to "RESTRAINED" so it cannot echo a forbidden
        // style name into design_rationale (CLAUDE.md Rule 8).
        lifestyleLines.push("RESTRAINED: reduce max objects to 4 total regardless of room_scale");
      } else if (lifestyle.density === "collector") {
        lifestyleLines.push("COLLECTOR: maximize objects to upper bound of room_scale, layer accessories");
      }
      if (lifestyleLines.length > 0) {
        momentParts.push(`LIFESTYLE CONSTRAINTS (override style defaults):\n${lifestyleLines.join("\n")}`);
      }
    }

    // Required object anchor (step-7h)
    const requiredObject = personalizationContext.required_object as {
      description: string;
      is_override_anchor: boolean;
    } | undefined;
    if (requiredObject?.description) {
      momentParts.push(
        `HERO ANCHOR (build entire design around this): "${requiredObject.description}"\nThis is the user's #1 priority. Set object_hierarchy.hero to incorporate this element.`,
      );
    }

    if (momentParts.length > 0) {
      sections.push(
        `PERSONALIZATION MOMENTS (hard constraints from user screens):\n${momentParts.join("\n\n")}`,
      );
    }
  }

  // Chat history (highest priority signal)
  const chatHistory = input.chatHistory?.trim();
  if (chatHistory) {
    sections.push(`USER PREFERENCES (highest priority - overrides style defaults):
${chatHistory}

Parse these preferences and incorporate into hard_constraints and depth_zones.
Named products MUST appear in the appropriate depth zone.`);
  }

  // Design memory for refinement continuity
  const designMemory = ctxRaw?.design_memory as Record<string, unknown> | null | undefined;
  if (designMemory) {
    const palette = designMemory.color_palette as Record<string, string> | undefined;
    const furniture = designMemory.key_furniture as string[] | undefined;
    sections.push(`PRIOR DESIGN (refinement - maintain continuity):
Prior palette: ${palette?.dominant ?? "?"}, ${palette?.secondary ?? "?"}, ${palette?.accent ?? "?"}
Prior furniture: ${furniture?.join(", ") ?? "none"}
Maintain consistency with prior design unless user requested changes.`);
  }

  // Final instruction
  sections.push(
    "Analyze the attached room photo and emit the design_brief via the emit_design_brief tool.",
  );

  return sections.join("\n\n");
}

// ── Hard constraint enforcement (post-tool-call) ────────────────────────────

function enforceHardConstraints(
  brief: DesignBrief,
  input: DesignDirectorInput,
): void {
  const constraints = brief.hard_constraints;
  const lc = constraints.map((c) => c.toLowerCase()).join(" ");

  // Universal: architecture preservation
  if (!lc.includes("keep all walls")) {
    constraints.unshift(
      "keep all walls, windows, door frames, ceiling, and flooring exactly as shown",
    );
  }

  // Kept items
  const keepItems = input.keepItems ?? [];
  for (const item of keepItems) {
    const itemLower = item.toLowerCase();
    if (!lc.includes(itemLower)) {
      constraints.push(`do not replace, obscure, or cover ${item}`);
    }
    // Window treatment protection
    if (/\b(blind|blinds|shutter|shutters|shade|shades)\b/i.test(item)) {
      if (!lc.includes("no curtains")) {
        constraints.push("no curtains, drapes, sheers, or valances");
      }
    }
  }

  // TV constraint — check both techSpec and personalization_context.smart_tech
  const ctxRaw = input.context as Record<string, unknown> | null;
  const techSpec = ctxRaw?.techSpec as Record<string, unknown> | null | undefined;
  const hasTV = techSpec?.hasTV;
  // Check if user accepted a TV via smart tech discovery (step-7e)
  const pCtx = ctxRaw?.personalization_context as Record<string, unknown> | null | undefined;
  const smartTech = pCtx?.smart_tech as Array<{ item: string; accepted: boolean }> | undefined;
  const acceptedTV = smartTech?.some(
    (t) => t.accepted && /tv|television|projector|frame/i.test(t.item),
  );
  if (hasTV === false && !acceptedTV && !lc.includes("no television")) {
    constraints.push("no television, no screens, no monitors");
  }

  // Bedroom ceiling fan
  if (
    brief.room_type === "bedroom" &&
    hasTV !== true &&
    !lc.includes("no ceiling fan")
  ) {
    const userRequestedFan = (input.chatHistory ?? "")
      .toLowerCase()
      .includes("ceiling fan");
    if (!userRequestedFan) {
      constraints.push("no ceiling fan");
    }
  }

  // Color introduction guard: if palette has no blue, don't introduce blue
  const hexes = [
    brief.palette.primary_hex,
    brief.palette.secondary_hex,
    brief.palette.accent_hex,
    brief.palette.neutral_hex,
  ];
  const hasBlue = hexes.some((hex) => {
    if (!hex || hex.length < 7) return false;
    const b = parseInt(hex.slice(5, 7), 16);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    return b > 150 && b > r * 1.3 && b > g * 1.3;
  });
  if (!hasBlue && !lc.includes("do not introduce blue")) {
    constraints.push("do not introduce blue");
  }

  brief.hard_constraints = constraints;
}

// ── Main export: generateDesignBrief ────────────────────────────────────────

export async function generateDesignBrief(
  input: DesignDirectorInput,
): Promise<DesignBrief> {
  const { imageUrl } = input;

  console.log(
    `[design-director] Call 1 starting — room: ${input.roomType}, anchor: ${input.styleAnchor}`,
  );

  const userMessage = buildUserMessage(input);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    tool_choice: { type: "tool", name: "emit_design_brief" },
    tools: [EMIT_DESIGN_BRIEF_TOOL],
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

  // Extract tool_use block from response
  const toolBlock = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock =>
      block.type === "tool_use" && block.name === "emit_design_brief",
  );

  if (!toolBlock) {
    throw new Error(
      "[design-director] Call 1 did not return emit_design_brief tool call",
    );
  }

  const brief = toolBlock.input as DesignBrief;

  // Layer 4 (research §7.4): Zod .refine forbidden-name check on Sonnet
  // free-text fields. These fields ultimately reach rooms.design_brief (JSONB)
  // and may surface to user on the design-reveal screen. Reject before write.
  const forbiddenCheck = z.object({
    design_rationale: z
      .string()
      .refine((s) => !containsForbiddenStyleName(s), {
        message: "design_rationale contains forbidden style name",
      }),
    smart_suggestions: z.array(z.string()).refine(
      (arr) => arr.every((s) => !containsForbiddenStyleName(s)),
      { message: "smart_suggestions contains forbidden style name" },
    ),
  });
  const zResult = forbiddenCheck.safeParse({
    design_rationale: brief.design_rationale ?? "",
    smart_suggestions: brief.smart_suggestions ?? [],
  });
  if (!zResult.success) {
    const rationaleHits = findForbiddenStyleNames(brief.design_rationale ?? "");
    const suggestionHits = (brief.smart_suggestions ?? [])
      .flatMap((s) => findForbiddenStyleNames(s))
      .filter((n, i, arr) => arr.indexOf(n) === i);
    const hits = [...rationaleHits, ...suggestionHits];
    throw new Error(
      `[design-director] Forbidden style name in Sonnet output: ${hits.join(", ")}. ` +
        `Fields: ${zResult.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }

  // Override wall/floor change with actual user input (Claude may guess wrong)
  brief.wall_change_requested = input.context?.wall_change_requested ?? false;
  brief.floor_change_requested = false;

  // Extract required objects from chat
  if (input.chatHistory) {
    brief.required_objects = extractRequiredObjects(input.chatHistory);
  }

  // Ensure style_weights reflect input (Claude may echo these, but override to be safe)
  brief.style_weights.primary_lora = input.loraTrigger;
  if (!brief.style_weights.primary_scale) {
    brief.style_weights.primary_scale = 0.8;
  }

  // Phase 3: populate `loras` weighted blend.
  //
  // Source precedence:
  //   1. RenderContext.style_blend (archetype distribution from step-3b)
  //   2. loraTrigger fallback → { [primary_trigger]: 1.0 }
  //
  // primary_lora stays populated regardless (dual-field back-compat policy,
  // Phase 0 D-3). loras keys are cv* triggers (what FLUX consumes); COVA*
  // archetype keys from the quiz blend are mapped via COVA_TO_DNA_TRIGGER
  // inside buildLorasFromBlend.
  const ctxRaw = input.context as Record<string, unknown> | null;
  const styleBlend = ctxRaw?.style_blend as Record<string, number> | null | undefined;
  const primaryTriggerForFallback = input.loraTrigger.split(/\s+/)[0]!.toLowerCase();

  let blendResult;
  if (styleBlend && Object.keys(styleBlend).length > 0) {
    blendResult = buildLorasFromBlend(styleBlend, primaryTriggerForFallback);
  } else if (brief.style_weights.loras && Object.keys(brief.style_weights.loras).length > 0) {
    // Sonnet echoed a loras map — normalize defensively.
    blendResult = normalizeLoras(brief.style_weights.loras, primaryTriggerForFallback);
  } else {
    blendResult = normalizeLoras(null, primaryTriggerForFallback);
  }
  brief.style_weights.loras = blendResult.loras;

  // Enforce hard constraints programmatically
  enforceHardConstraints(brief, input);

  const totalPieces = 1 + (brief.object_hierarchy?.supporting?.length ?? 0) + (brief.object_hierarchy?.accessories?.length ?? 0);
  console.log(
    `[design-director] Call 1 complete — room: ${brief.room_type}, anchor: ${brief.anchor.category}`,
    `| scale: ${brief.room_scale}, pieces: ${totalPieces}`,
    `| materials: ${brief.three_materials?.length ?? brief.materials.length}`,
    `| constraints: ${brief.hard_constraints.length}`,
    `| focal: ${brief.focal_point?.position ?? "?"}`,
    `| suggestions: ${brief.smart_suggestions?.length ?? 0}`,
  );

  return brief;
}

// ── Convenience wrapper (calls both generateDesignBrief + compilePrompt) ────

export async function runDesignDirector(
  input: DesignDirectorInput,
): Promise<DesignDirectorOutput> {
  // Import here to avoid circular dependency at module load time
  const { compilePrompt } = await import("@/lib/ai/prompt-compiler");

  console.log(
    "[design-director] Starting — room:",
    input.roomType,
    "| anchor:",
    input.styleAnchor,
  );

  // Call 1: vision -> design brief
  const stagingJson = await generateDesignBrief(input);

  // Extract required objects from chat and merge with prior
  const requiredObjects = stagingJson.required_objects ?? [];
  if (requiredObjects.length > 0) {
    console.log(
      `[design-director] Required objects from chat: ${requiredObjects.join(", ")}`,
    );
  }

  // Call 2: design brief -> FLUX prompt
  const fluxPrompt = await compilePrompt(stagingJson);
  const wordCount = fluxPrompt.split(/\s+/).filter(Boolean).length;
  console.log(
    `[design-director] Call 2 complete — flux_prompt: ${wordCount} words`,
  );

  return { stagingJson, fluxPrompt };
}
