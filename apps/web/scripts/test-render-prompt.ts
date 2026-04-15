/**
 * One-shot test render — assembles and prints the full FLUX prompt for the
 * specified inputs. Uses the real Claude synthesizer (live API call).
 *
 * Run: cd apps/web && npx tsx scripts/test-render-prompt.ts
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local from apps/web/
config({ path: resolve(__dirname, "../.env.local") });

// Must come after dotenv
import { compilePromptWithClaude } from "../lib/ai/prompt-compiler";
import type { StyleFingerprint } from "../types/fingerprint";
import type { RenderContext } from "../lib/types/area2";

// ── Fingerprint — mapping user's conceptual dims to the 12-dim system ──
// warmth=0.85   → colorTemperature
// density=0.75  → density
// naturalism=0.8 → material
// contrast=0.6  → colorSaturation
// texture=0.7   → texture
// All others neutral at 0.5
const fingerprint: StyleFingerprint = {
  dimensions: {
    colorTemperature: 0.85,  // warmth
    colorSaturation: 0.6,    // contrast
    density: 0.75,
    formality: 0.5,
    era: 0.5,
    material: 0.8,           // naturalism
    texture: 0.7,
    pattern: 0.5,
    lineQuality: 0.5,
    lightPreference: 0.5,
    nature: 0.5,
    culturalInfluence: 0.5,
  },
  covariance: Array(12).fill(Array(12).fill(0)),
  confidence: 0.82,
};

// ── Style blend — "Warm & Grounded" maps to "warm japandi" key ──
const styleBlend: Record<string, number> = {
  "warm japandi": 0.78,
  "biophilic jungle": 0.22,
};

// ── RenderContext — budget, art, keep/remove ──
const context: RenderContext = {
  styleBlend,
  style_blend: styleBlend,

  budget: {
    rangeMin: 1000,
    rangeMax: 2000,
    strategy: "mix",
    splurgeCategory: null,
    tier: "mid",
  } as any,

  artBrief: {
    hasArtDirection: true,
    visualDirection: "abstract, warm tones",
    colorPalette: ["warm amber", "terracotta", "dusty rose"],
    mood: "contemplative",
    abstractionLevel: "abstract",
    subjectMatter: null,
    frameStyle: "thin wood or brass",
    placement: "above bed headboard",
    galleryWall: false,
    hasVinylCollection: false,
    hasBookCollection: false,
    includesPersonalPhotos: null,
  } as any,

  keepMask: {
    objects: [
      { type: "window", keep: true, immovable: true },
      { type: "hardwood floor", keep: true, immovable: true },
    ],
  } as any,

  techSpec: null,
  sensoryProfile: null,
  identityBrief: null,
  requestedProducts: [],
  roomConstraints: null,
};

async function main() {
  console.log("[test-render-prompt] Calling Claude synthesizer...\n");

  const prompt = await compilePromptWithClaude(
    context,
    "bedroom",
    fingerprint,
    null,  // no anchor prompt — will use reference quality examples
    null,
    null,
  );

  if (!prompt) {
    console.error("[test-render-prompt] ERROR: compilePromptWithClaude returned null");
    process.exit(1);
  }

  console.log("\n" + "═".repeat(70));
  console.log("FULL ASSEMBLED PROMPT");
  console.log("═".repeat(70));
  console.log(prompt);
  console.log("═".repeat(70));
}

main().catch((err) => {
  console.error("[test-render-prompt] Fatal:", err);
  process.exit(1);
});
