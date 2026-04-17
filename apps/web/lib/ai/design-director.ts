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
import type { StyleFingerprint } from "@/types/fingerprint";
import type { RenderContext } from "@/lib/types/area2";
import { mergeToV2 } from "@/lib/ai/style-match";

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
  };
  hard_constraints: string[];

  // Auxiliary fields (set programmatically after tool call, not from Claude)
  required_objects?: string[];
  kept_item_palette?: Array<{
    label: string;
    material: string;
    color: string;
    dominant_hex?: string;
  }>;
  wall_change_requested?: boolean;
  floor_change_requested?: boolean;
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
  cvmcm: "Mid-century modern interior. Walnut veneer, teak, hairpin legs, warm amber accent light.",
  cvboh: "Bohemian layered interior. Woven jute, embroidered textiles, terracotta, low-light lantern warmth.",
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
        },
        required: ["primary_lora", "primary_scale"],
      },
      hard_constraints: {
        type: "array",
        items: { type: "string" },
        description:
          "What MUST NOT appear or change. Include architecture preservation, kept-item constraints, and exclusions.",
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
    ],
  },
};

// ── System prompt for Call 1 ────────────────────────────────────────────────

const CALL1_SYSTEM = `You are a senior interior designer analyzing a room photo for a redesign pipeline. Look at the architecture, lighting, existing furniture, and the user's target style. Emit a design_brief via the emit_design_brief tool.

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
  character < 0.35 -> quiet, understated, lets materials speak`;

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

  // TV constraint
  const ctxRaw = input.context as Record<string, unknown> | null;
  const techSpec = ctxRaw?.techSpec as Record<string, unknown> | null | undefined;
  const hasTV = techSpec?.hasTV;
  if (hasTV === false && !lc.includes("no television")) {
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
    max_tokens: 8192,
    thinking: { type: "enabled", budget_tokens: 4096 },
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

  // Set auxiliary fields
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

  // Enforce hard constraints programmatically
  enforceHardConstraints(brief, input);

  console.log(
    `[design-director] Call 1 complete — room: ${brief.room_type}, anchor: ${brief.anchor.category}`,
    `| materials: ${brief.materials.length}`,
    `| constraints: ${brief.hard_constraints.length}`,
    `| depth: fg=${brief.depth_zones.foreground.length} mg=${brief.depth_zones.midground.length} bg=${brief.depth_zones.background.length}`,
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
