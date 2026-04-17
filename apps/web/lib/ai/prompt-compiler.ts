/**
 * Prompt Compiler — Call 2: DesignBrief -> FLUX Kontext prompt
 *
 * Takes a structured DesignBrief from Call 1 (design-director.ts) and
 * compiles it into a single imperative prompt string for FLUX Kontext Pro.
 *
 * Uses Claude Haiku 4.5 at temperature=0.3 for fast, deterministic output.
 * Validates the result and retries once on failure.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { DesignBrief } from "@/lib/ai/design-director";
import { STYLE_DNA_BLOCKS } from "@/lib/ai/design-director";

const anthropic = new Anthropic();

// ── System prompt for Call 2 ────────────────────────────────────────────────

const CALL2_SYSTEM = `You are a FLUX-Kontext prompt compiler. Given a JSON design_brief, output ONE imperative prompt string for FLUX.1 Fill Pro inpainting.

RULES:
- Start with an imperative verb (Place / Install / Replace / Add / Hang / Arrange / Position).
- Use concrete material nouns (walnut, brass, boucle, linen, travertine). No abstract descriptors.
- Include depth_zones items in spatial order: foreground first, then midground, then background.
- Describe lighting as: direction + fixture + Kelvin + shadow hardness. One sentence.
- Append hard_constraints as preservation/exclusion clauses: "keep walls, windows, and floor unchanged", "no television", etc.
- Append "in [style_weights.primary_lora] style" at the very end ONLY if the LoRA trigger appears in the TRAINED TRIGGERS list provided.
- Target 100-140 tokens. No weights, no brackets, no markdown, no bullet points.
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

  if (words.length > 200) {
    errors.push(`prompt too long: ${words.length} words`);
  }
  if (words.length < 50) {
    errors.push(`prompt too short: ${words.length} words`);
  }

  if (
    !/^(place|install|add|replace|hang|arrange|position)/i.test(prompt)
  ) {
    errors.push(
      "not imperative — must start with Place/Install/Add/Replace/Hang/Arrange/Position",
    );
  }

  // Check LoRA trigger only if it's a trained trigger
  const lora = brief.style_weights?.primary_lora;
  if (lora && lora in STYLE_DNA_BLOCKS) {
    if (!prompt.toLowerCase().includes(lora.toLowerCase())) {
      errors.push(`missing LoRA trigger '${lora}'`);
    }
  }

  // Check anchor category is mentioned (normalize underscores to spaces)
  const anchorNorm = brief.anchor.category
    .replace(/_/g, " ")
    .toLowerCase();
  if (!prompt.toLowerCase().includes(anchorNorm)) {
    // Also check without spaces (e.g. "dining table" vs "diningtable")
    const anchorWords = anchorNorm.split(/\s+/);
    const promptLower = prompt.toLowerCase();
    const anyWordPresent = anchorWords.some(
      (w) => w.length > 3 && promptLower.includes(w),
    );
    if (!anyWordPresent) {
      errors.push(`missing anchor '${brief.anchor.category}'`);
    }
  }

  return errors;
}

// ── Main export: compilePrompt ──────────────────────────────────────────────

/**
 * Compiles a DesignBrief into a FLUX Kontext prompt string.
 * Validates the result and retries once on failure.
 * Throws if validation fails after retry.
 */
export async function compilePrompt(
  brief: DesignBrief,
): Promise<string> {
  const trainedTriggers = Object.keys(STYLE_DNA_BLOCKS).join(", ");
  const userMessage = `Design brief:\n${JSON.stringify(brief, null, 2)}\n\nTrained LoRA triggers: ${trainedTriggers}`;

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

  const wordCount = prompt.split(/\s+/).filter(Boolean).length;
  console.log(`[prompt-compiler] Compiled prompt: ${wordCount} words`);

  return prompt;
}
