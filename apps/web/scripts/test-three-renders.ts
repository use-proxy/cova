/**
 * Generate 3 renders of the same room with distinct style anchors.
 * Evaluates style differentiation, geometry preservation, and density accuracy.
 *
 * Run: cd apps/web && npx tsx scripts/test-three-renders.ts [photo_url]
 *
 * Renders:
 *   1. "Warm & Grounded"  — density=0.80, warmth=0.85
 *   2. "Pure & Calm"      — density=0.25, warmth=0.20
 *   3. "Bold & Eclectic"  — density=0.85, contrast=0.80
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Support both CommonJS __dirname and ESM import.meta.url contexts
const _dir = typeof __dirname !== "undefined"
  ? __dirname
  : dirname(fileURLToPath(import.meta.url));

// Try both the scripts-relative path and cwd-relative path
config({ path: resolve(_dir, "../.env.local") });
config({ path: resolve(process.cwd(), ".env.local"), override: false });

import Replicate from "replicate";
import { compilePromptWithClaude } from "../lib/ai/prompt-compiler";
import type { StyleFingerprint } from "../types/fingerprint";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

// ── Photo URL — pass as CLI arg or override here ──────────────────────────────
const PHOTO_URL =
  process.argv[2] ??
  "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=1280&q=90";

const ROOM_TYPE = "bedroom";
const DEPTH_MODEL = "black-forest-labs/flux-depth-pro";

// ── Render configurations ─────────────────────────────────────────────────────

interface RenderConfig {
  label: string;
  anchor: string;
  styleBlend: Record<string, number>;
  fingerprint: StyleFingerprint;
  // context passed as minimal partial object (cast as any) — only styleBlend
  // is needed; the rest of RenderContext fields are optional at runtime.
  context: any;
}

const neutralDims = {
  formality: 0.5,
  era: 0.5,
  pattern: 0.5,
  lineQuality: 0.5,
  nature: 0.5,
  culturalInfluence: 0.5,
};

const configs: RenderConfig[] = [
  // ── Render 1: Warm & Grounded ────────────────────────────────────────────
  {
    label: "Render 1 — Warm & Grounded",
    anchor: "Warm & Grounded",
    styleBlend: { "warm japandi": 0.80, "biophilic jungle": 0.20 },
    fingerprint: {
      dimensions: {
        colorTemperature: 0.85,   // warmth=0.85
        colorSaturation: 0.55,    // slightly warm saturation
        density: 0.80,            // richly layered
        material: 0.80,           // natural organic — triggers Warm & Grounded anchor
        texture: 0.72,            // tactile surfaces (linen, woven cotton)
        lightPreference: 0.55,    // slightly warm daylight
        ...neutralDims,
      },
      covariance: Array(12).fill(Array(12).fill(0)) as number[][],
      confidence: 0.85,
    },
    // Minimal context — styleBlend drives anchor derivation in prompt-compiler
    context: {
      styleBlend: { "warm japandi": 0.80, "biophilic jungle": 0.20 },
      style_blend: { "warm japandi": 0.80, "biophilic jungle": 0.20 },
      budget: { rangeMin: 1000, rangeMax: 2500, strategy: "mix", splurgeCategory: null, tier: "mid" },
      keepMask: { objects: [{ type: "window", keep: true, immovable: true }, { type: "floor", keep: true, immovable: true }] },
    },
  },

  // ── Render 2: Pure & Calm ────────────────────────────────────────────────
  {
    label: "Render 2 — Pure & Calm",
    anchor: "Pure & Calm",
    styleBlend: { "pure minimal white": 0.90, "coastal bright": 0.10 },
    fingerprint: {
      dimensions: {
        colorTemperature: 0.20,   // warmth=0.20 (cool, near-white palette)
        colorSaturation: 0.10,    // fully desaturated — near monochrome
        density: 0.25,            // 2-3 objects max, negative space emphasized
        material: 0.55,           // slight natural lean (linen, light wood)
        texture: 0.15,            // smooth polished surfaces
        lightPreference: 0.88,    // bright airy natural daylight
        ...neutralDims,
      },
      covariance: Array(12).fill(Array(12).fill(0)) as number[][],
      confidence: 0.88,
    },
    context: {
      styleBlend: { "pure minimal white": 0.90, "coastal bright": 0.10 },
      style_blend: { "pure minimal white": 0.90, "coastal bright": 0.10 },
      budget: { rangeMin: 1000, rangeMax: 2500, strategy: "mix", splurgeCategory: null, tier: "mid" },
      keepMask: { objects: [{ type: "window", keep: true, immovable: true }, { type: "floor", keep: true, immovable: true }] },
    },
  },

  // ── Render 3: Bold & Eclectic ────────────────────────────────────────────
  {
    label: "Render 3 — Bold & Eclectic",
    anchor: "Bold & Eclectic",
    styleBlend: { "maximalist eclectic": 0.70, "dark moody glam": 0.30 },
    fingerprint: {
      dimensions: {
        colorTemperature: 0.30,   // cool tones (jewel palette)
        colorSaturation: 0.80,    // contrast=0.80 (bold saturated colors)
        density: 0.85,            // 8-10 objects, richly layered
        material: 0.30,           // manufactured/luxe (velvet, lacquer, brass)
        texture: 0.92,            // ultra-tactile (velvet, bouclé, embroidery)
        pattern: 0.82,            // pattern-rich, mixed motifs
        lightPreference: 0.25,    // intimate moody lamp-lit
        culturalInfluence: 0.75,  // globally eclectic references
        ...{ formality: 0.65, era: 0.5, lineQuality: 0.35, nature: 0.30 },
      },
      covariance: Array(12).fill(Array(12).fill(0)) as number[][],
      confidence: 0.83,
    },
    context: {
      styleBlend: { "maximalist eclectic": 0.70, "dark moody glam": 0.30 },
      style_blend: { "maximalist eclectic": 0.70, "dark moody glam": 0.30 },
      budget: { rangeMin: 1000, rangeMax: 2500, strategy: "mix", splurgeCategory: null, tier: "mid" },
      keepMask: { objects: [{ type: "window", keep: true, immovable: true }, { type: "floor", keep: true, immovable: true }] },
    },
  },
];

// ── Replicate polling ─────────────────────────────────────────────────────────

async function pollPrediction(
  predictionId: string,
  label: string,
  timeoutMs = 300_000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  let dots = 0;
  while (Date.now() < deadline) {
    const p = await replicate.predictions.get(predictionId);
    if (p.status === "succeeded") {
      const out = p.output;
      if (typeof out === "string") return out;
      if (Array.isArray(out) && out.length > 0) return String(out[0]);
      return null;
    }
    if (p.status === "failed" || p.status === "canceled") {
      console.error(`  [${label}] FAILED — ${JSON.stringify(p.error ?? "no details")}`);
      return null;
    }
    process.stdout.write(`\r  [${label}] ${p.status}${".".repeat((dots++ % 4) + 1)}   `);
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.error(`  [${label}] TIMED OUT after ${timeoutMs / 1000}s`);
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(70));
  console.log("THREE-RENDER STYLE DIFFERENTIATION TEST");
  console.log("=".repeat(70));
  console.log(`Photo URL: ${PHOTO_URL}`);
  console.log(`Room type: ${ROOM_TYPE}`);
  console.log();

  if (!process.env.REPLICATE_API_TOKEN) {
    console.error("ERROR: REPLICATE_API_TOKEN not set in .env.local");
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY not set in .env.local");
    process.exit(1);
  }

  // ── Step 1: Compile all 3 prompts via Claude synthesizer ─────────────────
  console.log("STEP 1 — Compiling prompts via Claude synthesizer...\n");

  const compiledPrompts: Array<{ label: string; prompt: string }> = [];

  for (const cfg of configs) {
    process.stdout.write(`  Compiling [${cfg.label}]...`);
    const prompt = await compilePromptWithClaude(
      cfg.context,
      ROOM_TYPE,
      cfg.fingerprint,
      null,  // no anchor reference image — use built-in quality examples
      null,
      null,
    );
    if (!prompt) {
      console.error(`\n  ERROR: Claude returned null for ${cfg.label}`);
      process.exit(1);
    }
    compiledPrompts.push({ label: cfg.label, prompt });
    console.log(" done");
  }

  // Print all 3 prompts
  console.log("\n" + "─".repeat(70));
  console.log("COMPILED PROMPTS");
  console.log("─".repeat(70));
  for (const { label, prompt } of compiledPrompts) {
    const wordCount = prompt.split(/\s+/).filter(Boolean).length;
    console.log(`\n[${label}] (${wordCount} words)`);
    console.log(prompt);
  }

  // ── Step 2: Submit all 3 renders to Replicate in parallel ────────────────
  console.log("\n" + "─".repeat(70));
  console.log("STEP 2 — Submitting renders to FLUX Depth Pro...\n");

  const predictionIds: Array<{ label: string; id: string; prompt: string }> = [];

  for (const { label, prompt } of compiledPrompts) {
    const prediction = await replicate.predictions.create({
      model: DEPTH_MODEL,
      input: {
        control_image: PHOTO_URL,
        prompt,
        guidance: 30,
        steps: 28,
        output_format: "png",
        safety_tolerance: 2,
      },
    });
    predictionIds.push({ label, id: prediction.id, prompt });
    console.log(`  [${label}] queued → prediction_id=${prediction.id}`);
  }

  // ── Step 3: Poll all 3 in parallel ───────────────────────────────────────
  console.log("\n" + "─".repeat(70));
  console.log("STEP 3 — Polling for completion (≤5min each)...\n");

  const results = await Promise.all(
    predictionIds.map(({ label, id, prompt }) =>
      pollPrediction(id, label).then((url) => ({ label, id, prompt, url })),
    ),
  );

  // ── Step 4: Evaluation report ─────────────────────────────────────────────
  console.log("\n\n" + "═".repeat(70));
  console.log("EVALUATION REPORT");
  console.log("═".repeat(70));

  const evalChecklist = [
    "1. Does room geometry hold? (walls, windows, floor in correct position)",
    "2. Is the style distinctly different from the other two renders?",
    "3. Are walls/surfaces transforming or staying the same?",
    "4. Is decoration count right? (sparse=2-3, rich=8-10 objects)",
    "5. Does overall quality feel like editorial photography?",
  ];

  for (const { label, id, url } of results) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`${label}`);
    console.log(`Prediction: ${id}`);
    console.log(`URL: ${url ?? "FAILED — no output"}`);
    if (url) {
      console.log("\nChecklist:");
      for (const item of evalChecklist) {
        console.log(`  [ ] ${item}`);
      }
    }
  }

  console.log("\n" + "═".repeat(70));
  const successCount = results.filter((r) => r.url).length;
  console.log(`SUMMARY: ${successCount}/3 renders completed successfully`);

  if (successCount < 3) {
    console.log("\nFailed renders:");
    for (const r of results.filter((r) => !r.url)) {
      console.log(`  • ${r.label} (${r.id})`);
    }
    process.exit(1);
  }

  console.log("\nAll 3 renders complete. Open URLs above to evaluate.");
  console.log("=".repeat(70));
}

main().catch((err) => {
  console.error("[test-three-renders] Fatal:", err);
  process.exit(1);
});
