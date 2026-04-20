/**
 * LoRA Registry
 *
 * Maps style anchors to trained LoRA weights stored in the style_loras table.
 * Always returns a usable LoRA stack — never returns null.
 *
 * IMPORTANT: Use invented tokens with "interior" class descriptor.
 * Do NOT use "japandi", "scandinavian" etc. — those already exist in FLUX's
 * T5 vocabulary and conflate the LoRA's learned style with the model's prior.
 * "cvwmn interior" teaches FLUX: "this token = this aesthetic + it's an interior photo"
 */

import { type SupabaseClient } from "@supabase/supabase-js";

export const STYLE_ANCHOR_TO_TRIGGER: Record<string, string> = {
  "Warm & Grounded":        "cvwmn interior",
  "Bold & Eclectic":        "cvmax interior",
  "Bright & Airy":          "cvcst interior",
  "Pure & Calm":            "cvscn interior",
  "Vintage Modern":         "cvmcm interior",
  "Industrial":             "cvind interior",
  "Modern Luxe":            "cvlux interior",
  "Scandinavian":           "cvnrd interior",
  "Art Deco":               "cvdco interior",
  // App display names (STYLE_DISPLAY_NAMES values from anchor-display.ts)
  "Dark & Moody":           "cvlux interior",
  "Urban Industrial":       "cvind interior",
  "Classic Traditional":    "cvdco interior",
  "Biophilic":              "cvbio interior",
  "Balanced Contemporary":  "cvscn interior",
  // V3 COVA* style names → trigger words
  "COVASCANDINAV":          "cvscn interior",
  "COVAJAPANDI":            "cvwmn interior",
  "COVABIOPHILIC":          "cvbio interior",
  "COVAMINIMAL":            "cvscn interior",
  "COVAMIDCENTURY":         "cvmcm interior",
  "COVACOASTAL":            "cvcst interior",
  "COVABOHEMIAN":           "cvboh interior",
  "COVAINDUSTRIAL":         "cvind interior",
  "COVAFARMHOUSE":          "cvfrm interior",
  "COVAARTDECO":            "cvdco interior",
};

/**
 * Fallback LoRA stack: two LoRAs applied together.
 *
 * Research finding: stacking a style LoRA (0.5–0.8) + XLabs RealismLora (0.2–0.3)
 * produces better photorealism than either alone. Combined weight must stay ≤ 1.2.
 * This fallback stack (0.55 + 0.25 = 0.80) is safe for all room types.
 */
export const FALLBACK_LORA_STACK = [
  {
    // Shakker-Labs detail enhancer — adds material texture, surface grain, depth.
    // Doesn't impose a specific style. Safe at 0.55.
    url: "https://huggingface.co/Shakker-Labs/FLUX.1-dev-LoRA-add-details/resolve/main/FLUX-dev-lora-add_details.safetensors",
    scale: 0.55,
    name: "detail-enhancer",
  },
  {
    // XLabs RealismLora — shifts FLUX output toward photographic/editorial quality.
    // Stack with detail-enhancer. Keep at 0.25 to avoid over-sharpening.
    url: "https://huggingface.co/XLabs-AI/flux-RealismLora/resolve/main/lora.safetensors",
    scale: 0.25,
    name: "realism-lora",
  },
] as const;

export const MAX_COMBINED_LORA_SCALE = 1.2; // Hard cap from research

export interface LoraConfig {
  url: string;
  scale: number;
  name: string;
}

export interface LoraResult {
  loras: LoraConfig[];
  isFallback: boolean;
  totalScale: number;
  triggerWord: string | null; // The trigger word to embed in the FLUX prompt
}

/**
 * Resolves the LoRA stack for a given style anchor.
 *
 * If a custom trained LoRA exists in style_loras table:
 *   → Returns [custom_lora, realism_lora] stacked
 *   → triggerWord is set (must be embedded in flux_prompt)
 *
 * If no custom LoRA yet:
 *   → Returns [detail_enhancer, realism_lora] fallback stack
 *   → triggerWord is null (no trigger to embed when using fallback)
 */
export async function getLorasForStyle(
  styleAnchor: string,
  supabaseClient: SupabaseClient,
): Promise<LoraResult> {
  const fullTrigger = STYLE_ANCHOR_TO_TRIGGER[styleAnchor];
  const shortTrigger = fullTrigger?.split(" ")[0]; // "cvwmn" from "cvwmn interior"

  if (shortTrigger) {
    const { data, error } = await supabaseClient
      .from("style_loras")
      .select("lora_url, recommended_scale, style_name, trigger_word")
      .eq("trigger_word", shortTrigger)
      .order("quality_score", { ascending: false })
      .limit(1)
      .single();

    if (!error && data?.lora_url?.startsWith("https://")) {
      // Custom LoRA found. Stack it with RealismLora.
      // Scale the custom LoRA to leave room for RealismLora within the 1.2 cap.
      // cvwmn (Warm & Grounded) uses 0.85 default — stronger style signal improves
      // japandi coherence. Other styles keep 0.75 default.
      const defaultScale = shortTrigger === "cvwmn" ? 0.85 : 0.75;
      const customScale = Math.min(data.recommended_scale ?? defaultScale, 0.90);
      const realismScale = Math.min(0.30, MAX_COMBINED_LORA_SCALE - customScale);

      console.log(
        `[LoRA] Trained "${styleAnchor}": ${customScale} + realism: ${realismScale} = ${customScale + realismScale} total`,
      );

      return {
        loras: [
          { url: data.lora_url, scale: customScale, name: data.style_name },
          { url: FALLBACK_LORA_STACK[1].url, scale: realismScale, name: "realism-lora" },
        ],
        isFallback: false,
        totalScale: customScale + realismScale,
        triggerWord: fullTrigger, // e.g. "cvwmn interior"
      };
    }

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found (expected pre-training). Other errors are real.
      console.error(`[LoRA] Supabase error for "${styleAnchor}":`, error);
    }
  }

  // No trained LoRA — use dual fallback stack
  console.log(
    `[LoRA] No trained LoRA for "${styleAnchor}" — using fallback stack (detail + realism)`,
  );
  const totalScale = FALLBACK_LORA_STACK[0].scale + FALLBACK_LORA_STACK[1].scale;

  return {
    loras: [...FALLBACK_LORA_STACK],
    isFallback: true,
    totalScale,
    triggerWord: null, // No trigger to embed in prompt when using fallback
  };
}

/**
 * Resolves the LoRA stack by extracting the trigger word directly from the
 * flux_prompt generated by the design director. This is the preferred lookup
 * path because the trigger word is always embedded in the prompt at generation
 * time (e.g. "cvwmn interior" appears verbatim), whereas the styleAnchor
 * string passed to getLorasForStyle can be a verbose description that never
 * matches STYLE_ANCHOR_TO_TRIGGER keys.
 */
export async function getLorasFromFluxPrompt(
  fluxPrompt: string | null | undefined,
  supabaseClient: SupabaseClient,
): Promise<LoraResult> {
  if (!fluxPrompt) {
    console.log('[LoRA] No flux_prompt — using fallback stack');
    return { loras: [...FALLBACK_LORA_STACK], isFallback: true, totalScale: 0.80, triggerWord: null };
  }

  // Extract trigger word: look for any known trigger pattern in the prompt.
  // Trigger words follow pattern: cv + 3-4 letters + " interior"
  const triggerMatch = fluxPrompt.match(/\b(cv[a-z]{2,4})\b/i);

  if (!triggerMatch) {
    console.log(`[LoRA] No trigger word found in flux_prompt — using fallback stack. Prompt prefix: "${fluxPrompt.slice(0, 200)}"`);
    return { loras: [...FALLBACK_LORA_STACK], isFallback: true, totalScale: 0.80, triggerWord: null };
  }

  const triggerWord = triggerMatch[1].toLowerCase(); // e.g. "cvwmn"
  console.log(`[LoRA] Extracted trigger word from flux_prompt: "${triggerWord}"`);

  const { data, error } = await supabaseClient
    .from('style_loras')
    .select('lora_url, recommended_scale, style_name, full_trigger')
    .eq('trigger_word', triggerWord)
    .order('quality_score', { ascending: false })
    .limit(1)
    .single();

  if (!error && data?.lora_url?.startsWith('https://')) {
    const defaultScale = triggerWord === 'cvwmn' ? 0.85 : 0.75;
    const customScale = Math.min(data.recommended_scale ?? defaultScale, 0.90);
    const realismScale = Math.min(0.30, MAX_COMBINED_LORA_SCALE - customScale);
    const fullTrigger = (data.full_trigger as string | null) ?? `${triggerWord} interior`;

    console.log(`[LoRA] Found trained LoRA "${data.style_name}": ${customScale} + realism: ${realismScale}`);

    return {
      loras: [
        { url: data.lora_url, scale: customScale, name: data.style_name as string },
        { url: FALLBACK_LORA_STACK[1].url, scale: realismScale, name: 'realism-lora' },
      ],
      isFallback: false,
      totalScale: customScale + realismScale,
      triggerWord: fullTrigger,
    };
  }

  if (error && error.code !== 'PGRST116') {
    console.error(`[LoRA] Supabase error for trigger "${triggerWord}":`, error);
  }

  console.log(`[LoRA] No trained LoRA for trigger "${triggerWord}" — using fallback stack`);
  return { loras: [...FALLBACK_LORA_STACK], isFallback: true, totalScale: 0.80, triggerWord: null };
}
