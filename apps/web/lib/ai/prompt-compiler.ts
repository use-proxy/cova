/**
 * Prompt Compiler — Call 2: DesignBrief -> FLUX prompt
 *
 * Takes a structured DesignBrief from Call 1 (design-director.ts) and
 * compiles it into a single natural-language prompt for FLUX Fill Pro.
 *
 * Uses Claude Haiku 4.5 at temperature=0.3 for fast, deterministic output.
 * Validates the result and retries once on failure.
 *
 * Session 8: Rewritten for 7-token ordering, 50-80 words, anti-clutter rules.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { DesignBrief } from "@/lib/ai/design-director";
import { STYLE_DNA_BLOCKS } from "@/lib/ai/design-director";
import { sanitizeForbiddenNames } from "@/lib/ai/forbidden-names";

const anthropic = new Anthropic();

// ── Anti-clutter rules per COVA* trigger ──────────────────────────────────────

// Keyed by both COVA style names AND short trigger words so lookups from
// brief.style_weights.primary_lora (e.g. "cvwmn") match correctly.
const ANTI_CLUTTER_RULES: Record<string, string> = {
  COVAJAPANDI:   "three materials maximum, generous negative space, odd groupings",
  cvwmn:         "three materials maximum, generous negative space, odd groupings",
  COVAMINIMAL:   "maximum 5 objects visible, surfaces bare except hero",
  cvscn:         "maximum 5 objects visible, surfaces bare except hero",
  COVABOHEMIAN:  "layered textures but intentional — nothing random",
  cvboh:         "layered textures but intentional — nothing random",
  COVABIOPHILIC: "plants as structural elements not accessories",
  cvbio:         "plants as structural elements not accessories",
  COVAARTDECO:   "strict bilateral symmetry, one hero surface per zone",
  cvdco:         "strict bilateral symmetry, one hero surface per zone",
  COVASCANDINAV: "light palette, functional simplicity, no ornament",
  cvnrd:         "light palette, functional simplicity, no ornament",
  COVAMIDCENTURY:"clean lines, organic curves, one statement piece per zone",
  cvmcm:         "clean lines, organic curves, one statement piece per zone",
  COVACOASTAL:   "airy and open, natural light emphasis, no clutter",
  cvcst:         "airy and open, natural light emphasis, no clutter",
  COVAINDUSTRIAL:"raw materials, exposed structure, intentional sparseness",
  cvind:         "raw materials, exposed structure, intentional sparseness",
  COVAFARMHOUSE: "rustic warmth, practical comfort, curated not cluttered",
  cvfrm:         "rustic warmth, practical comfort, curated not cluttered",
};

// ── System prompt for Call 2 ────────────────────────────────────────────────

const CALL2_SYSTEM = `You are a FLUX prompt compiler. Given a JSON design_brief, output ONE natural-language prompt string for FLUX Fill Pro.

TARGET: 50-80 words total. Natural language only — no tag lists, no weight syntax, no brackets, no markdown, no bullet points.

EXACT TOKEN ORDERING (follow this sequence):
  Token 1: Style trigger word(s) — the LoRA trigger from the brief (e.g., "COVAJAPANDI")
  Token 2: Room type + structural features — e.g., "bedroom with arched window"
  Token 3: Exactly 3 materials — from three_materials field (e.g., "light oak, cream linen, brushed brass")
  Token 4: Object hierarchy hero first — from object_hierarchy.hero, then 1-2 supporting (e.g., "low platform bed centered, walnut nightstand left")
  Token 5: Lighting — from lighting_concept (e.g., "warm afternoon light from left window")
  Token 6: Camera — e.g., "eye level, wide-angle, magazine photography"
  Token 7: Mood — from the overall feel (e.g., "restrained, calm, generous negative space")

FIELD USAGE (read these from the design_brief):
  - focal_point.description → inform Token 4 hero placement
  - three_materials[].name + three_materials[].finish → Token 3 (exactly 3, no more)
  - object_hierarchy.hero → Token 4 first item
  - object_hierarchy.supporting → Token 4 after hero (pick 1-2 most important)
  - lighting_concept.natural_light → Token 5
  - color_story → inform mood in Token 7
  - hard_constraints → items marked "do not replace" are KEPT — mention them if visible

ANTI-CLUTTER RULES BY STYLE:
  COVAJAPANDI: three materials maximum, generous negative space, odd groupings
  COVAMINIMAL: maximum 5 objects visible, surfaces bare except hero
  COVABOHEMIAN: layered textures but intentional — nothing random
  COVABIOPHILIC: plants as structural elements not accessories
  COVAARTDECO: strict bilateral symmetry, one hero surface per zone
  All styles: slightly asymmetric composition, casually draped throw, lived-in warmth

CRITICAL RULES:
  - 50-80 words. Count carefully.
  - Use concrete material nouns (walnut, brass, boucle, linen, travertine). No abstract words.
  - Do NOT mention items from hard_constraints exclusions (e.g., if "no television" is a constraint, never mention TV).
  - Append the LoRA trigger word at the end ONLY if it appears in the TRAINED TRIGGERS list.
  - Do NOT start with an imperative verb. Start directly with the trigger word.

Respond with ONLY the prompt string — no preamble, no explanation.`;

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Validates a compiled prompt against the DesignBrief.
 * Returns an array of error strings. Empty array = valid.
 */
export function validatePrompt(
  prompt: string,
  brief: DesignBrief,
): string[] {
  const errors: string[] = [];
  const words = prompt.split(/\s+/).filter(Boolean);

  if (words.length > 80) {
    errors.push(`prompt too long: ${words.length} words (max 80)`);
  }
  if (words.length < 50) {
    errors.push(`prompt too short: ${words.length} words (min 50)`);
  }

  // Check LoRA trigger only if it's a trained trigger
  const lora = brief.style_weights?.primary_lora;
  if (lora && lora in STYLE_DNA_BLOCKS) {
    if (!prompt.toLowerCase().includes(lora.toLowerCase())) {
      errors.push(`missing LoRA trigger '${lora}'`);
    }
  }

  // Check hero item is mentioned (from object_hierarchy or anchor)
  const heroItem = brief.object_hierarchy?.hero?.item ?? brief.anchor?.category;
  if (heroItem) {
    const heroNorm = heroItem.replace(/_/g, " ").toLowerCase();
    const promptLower = prompt.toLowerCase();
    const heroWords = heroNorm.split(/\s+/);
    const anyWordPresent = heroWords.some(
      (w) => w.length > 3 && promptLower.includes(w),
    );
    if (!anyWordPresent) {
      errors.push(`missing hero item '${heroItem}'`);
    }
  }

  return errors;
}

// ── Build focused user message from design_brief ────────────────────────────

function buildCall2UserMessage(brief: DesignBrief): string {
  const trainedTriggers = Object.keys(STYLE_DNA_BLOCKS).join(", ");

  // Extract key fields for focused prompt compilation
  const sections: string[] = [];

  sections.push(`Trained LoRA triggers: ${trainedTriggers}`);

  // Style trigger
  const loraTrigger = brief.style_weights?.primary_lora ?? "";
  sections.push(`Style trigger: ${loraTrigger}`);

  // Room type + architecture
  sections.push(`Room type: ${brief.room_type}`);
  sections.push(`Architecture: walls=${brief.architecture_preserved?.walls}, windows=${brief.architecture_preserved?.windows}, floor=${brief.architecture_preserved?.floor_type}`);

  // Focal point
  if (brief.focal_point) {
    sections.push(`Focal point: ${brief.focal_point.description} at ${brief.focal_point.position}. Eye path: ${brief.focal_point.viewer_eye_path}`);
  }

  // Three materials
  if (brief.three_materials?.length) {
    const mats = brief.three_materials.map((m) => `${m.name} (${m.finish}, ${m.application})`).join(", ");
    sections.push(`Three materials: ${mats}`);
  } else if (brief.materials?.length) {
    sections.push(`Materials: ${brief.materials.slice(0, 3).join(", ")}`);
  }

  // Object hierarchy
  if (brief.object_hierarchy) {
    const hero = brief.object_hierarchy.hero;
    const supporting = brief.object_hierarchy.supporting?.map((s) => `${s.item} at ${s.position}`).join(", ") ?? "";
    sections.push(`Hero: ${hero.item} at ${hero.position}`);
    if (supporting) sections.push(`Supporting: ${supporting}`);
  }

  // Lighting
  if (brief.lighting_concept) {
    sections.push(`Natural light: ${brief.lighting_concept.natural_light}`);
    if (brief.lighting_concept.artificial_light?.length) {
      sections.push(`Artificial: ${brief.lighting_concept.artificial_light.join(", ")}`);
    }
  } else if (brief.lighting) {
    sections.push(`Lighting: ${brief.lighting.direction}, ${brief.lighting.fixture}`);
  }

  // Color story mood
  if (brief.color_story) {
    sections.push(`Color story: ${brief.color_story.primary.name} (${brief.color_story.primary.coverage_pct}%), ${brief.color_story.secondary.name} (${brief.color_story.secondary.coverage_pct}%), accent ${brief.color_story.accent.name}`);
  }

  // Negative space
  if (brief.negative_space) {
    sections.push(`Negative space: ${brief.negative_space.instruction}`);
  }

  // Room scale
  if (brief.room_scale) {
    sections.push(`Room scale: ${brief.room_scale}`);
  }

  // Hard constraints (kept items + exclusions)
  if (brief.hard_constraints?.length) {
    sections.push(`Constraints: ${brief.hard_constraints.join("; ")}`);
  }

  // Anti-clutter rule for this style — check both raw trigger and uppercased
  const antiClutter =
    ANTI_CLUTTER_RULES[loraTrigger] ??
    ANTI_CLUTTER_RULES[loraTrigger.toUpperCase()];
  if (antiClutter) {
    sections.push(`Anti-clutter rule: ${antiClutter}`);
  }

  return sections.join("\n");
}

// ── Main export: compilePrompt ──────────────────────────────────────────────

/**
 * Compiles a DesignBrief into a FLUX prompt string (50-80 words).
 * Validates the result and retries once on failure.
 * Throws if validation fails after retry.
 */
export async function compilePrompt(
  brief: DesignBrief,
): Promise<string> {
  const userMessage = buildCall2UserMessage(brief);

  const callHaiku = async (extraSystem?: string): Promise<string> => {
    const system = extraSystem
      ? `${CALL2_SYSTEM}\n\n${extraSystem}`
      : CALL2_SYSTEM;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      temperature: 0.3,
      system,
      messages: [{ role: "user", content: userMessage }],
    });

    const block = response.content[0];
    if (!block || block.type !== "text" || !block.text.trim()) {
      throw new Error("[prompt-compiler] Call 2 returned empty response");
    }

    return block.text
      .trim()
      .replace(/^```[^\n]*\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();
  };

  // First attempt
  let prompt = await callHaiku();
  let errors = validatePrompt(prompt, brief);

  if (errors.length > 0) {
    console.warn(
      `[prompt-compiler] Validation failed (attempt 1): ${errors.join(", ")}`,
    );

    // Retry with errors appended to system prompt
    prompt = await callHaiku(
      `VALIDATION ERRORS FROM PREVIOUS ATTEMPT — fix these:\n${errors.map((e) => `- ${e}`).join("\n")}`,
    );
    errors = validatePrompt(prompt, brief);

    if (errors.length > 0) {
      const msg = `[prompt-compiler] Validation failed after retry: ${errors.join(", ")}`;
      console.error(msg);
      throw new Error(msg);
    }
  }

  // Layer 3 (research §7.4): runtime forbidden-name sanitizer on Haiku output.
  // Idempotent; rewrites standalone forbidden tokens to descriptive phrases.
  // Applied AFTER validation so the trigger-word check (which expects
  // cv-prefixed codes, not style names) is unaffected.
  prompt = sanitizeForbiddenNames(prompt);

  const wordCount = prompt.split(/\s+/).filter(Boolean).length;
  console.log(`[prompt-compiler] Compiled prompt: ${wordCount} words`);

  return prompt;
}
