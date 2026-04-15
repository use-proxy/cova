/**
 * Test: Design Director (Session 4)
 * Run:  npx tsx --env-file=.env.local scripts/test-design-director.ts
 *
 * Tests the two-call VLM pipeline with the scenario from the session spec:
 *   Style anchor: "Warm & Grounded" (Japandi)  LoRA: "cvwmn"
 *   Budget: $500-2000 (West Elm tier)
 *   Fingerprint: warmth=0.8, density=0.6, naturalism=0.7, texture=0.6,
 *                material_refinement=0.6, spatial_openness≈0.5
 *
 * Prints the full staging JSON and the FLUX prompt for review.
 */

import { runDesignDirector } from "../lib/ai/design-director";
import type { StyleFingerprint } from "../types/fingerprint";

// ── Test fingerprint ──────────────────────────────────────────────────────────
// Maps session-spec aliases → actual fingerprint dimension names:
//   warmth            → colorTemperature
//   density           → density
//   naturalism        → nature (biophilic)
//   texture           → texture
//   material_refinement → material (natural vs synthetic)
//   spatial_openness  → derived from low density + lineQuality (no direct dim)

const testFingerprint: StyleFingerprint = {
  dimensions: {
    colorTemperature: 0.5,  // warmth=0.5 → balanced neutrals, 3000K warm-white
    colorSaturation: 0.45,  // balanced saturation
    density: 0.5,           // density=0.5 → 6-8 named objects (0.4-0.7 range)
    formality: 0.5,         // neutral formality
    era: 0.45,              // slightly contemporary
    material: 0.5,          // material_refinement=0.5 → mid-market natural materials
    texture: 0.4,           // texture=0.4 — below threshold, no forced woven push
    pattern: 0.3,           // low pattern
    lineQuality: 0.75,      // high organic → derived spatial_openness ≈ 0.60
    lightPreference: 0.55,  // moderate warm light preference
    nature: 0.4,            // naturalism=0.4 → below >0.7 threshold, light plant presence
    culturalInfluence: 0.4, // mild cultural influence
  },
  // Minimal identity covariance for test purposes
  covariance: Array.from({ length: 12 }, (_, i) =>
    Array.from({ length: 12 }, (_, j) => (i === j ? 0.01 : 0)),
  ),
  confidence: 0.82,
};

// ── Test image URL ────────────────────────────────────────────────────────────
// Real test room photo from Session 3 (restored version in Supabase public bucket).
const TEST_IMAGE_URL =
  "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/test/room_converted.jpeg";

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Design Director — Session 4 Test                           ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  console.log("Input scenario:");
  console.log("  Style anchor:  Warm & Grounded");
  console.log("  LoRA trigger:  cvwmn");
  console.log("  Budget:        $500–2000 (West Elm tier)");
  console.log("  warmth:        0.5 (colorTemperature)");
  console.log("  density:       0.5");
  console.log("  naturalism:    0.4 (nature)");
  console.log("  texture:       0.4");
  console.log("  material_ref:  0.5 (material)");
  console.log("  spatial_open:  ~0.60 (derived: (1-0.5)*0.6 + 0.75*0.4)");
  console.log("  Image URL:     Session 3 real room photo (Supabase)\n");

  console.log("Running Design Director...\n");

  const start = Date.now();

  const result = await runDesignDirector({
    imageUrl: TEST_IMAGE_URL,
    fingerprint: testFingerprint,
    roomType: "living room",
    styleAnchor: "Warm & Grounded",
    loraTrigger: "cvwmn",
    budgetMin: 500,
    budgetMax: 2000,
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Completed in ${elapsed}s\n`);

  // ── Print staging JSON ────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("STAGING JSON (rooms.design_brief)");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log(JSON.stringify(result.stagingJson, null, 2));

  // ── Print FLUX prompt ─────────────────────────────────────────────────────
  const wordCount = result.fluxPrompt.split(/\s+/).filter(Boolean).length;
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`FLUX STAGING SCRIPT (rooms.flux_prompt) — ${wordCount} words`);
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log(result.fluxPrompt);

  // ── Validation checks ─────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("VALIDATION");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const brief = result.stagingJson;

  // Word count — total prompt: removal ~15 + body 120-145 + camera spec ~30 = ~165-190
  const wordOk = wordCount >= 120 && wordCount <= 250;
  console.log(`  Word count:           ${wordCount} ${wordOk ? "✓" : "✗ (expected total 120-250, body 120-145)"}`);

  // Object count
  const objCount = brief.totalObjectCount ?? brief.decorObjects?.length ?? 0;
  const objOk = objCount >= 6 && objCount <= 16; // density=0.5 → 6-8 base; room-type rules add staging objects
  console.log(`  Object count:         ${objCount} ${objOk ? "✓" : "✗ (density=0.5 → expect 6-16 with room-type rules)"}`);

  // Budget tier
  const tierOk = brief.budgetTier === "west-elm";
  console.log(`  Budget tier:          ${brief.budgetTier} ${tierOk ? "✓" : "✗ (expect west-elm)"}`);

  // Depth layers populated
  const fgOk = (brief.depthLayers?.foreground?.objects?.length ?? 0) > 0;
  const mgOk = (brief.depthLayers?.midground?.objects?.length ?? 0) > 0;
  const bgOk = (brief.depthLayers?.background?.objects?.length ?? 0) > 0;
  console.log(`  Foreground objects:   ${brief.depthLayers?.foreground?.objects?.length ?? 0} ${fgOk ? "✓" : "✗ (must be populated)"}`);
  console.log(`  Midground objects:    ${brief.depthLayers?.midground?.objects?.length ?? 0} ${mgOk ? "✓" : "✗ (must be populated)"}`);
  console.log(`  Background objects:   ${brief.depthLayers?.background?.objects?.length ?? 0} ${bgOk ? "✓" : "✗ (must be populated)"}`);

  // Material tension
  const tensionOk = brief.materialTension?.warm && brief.materialTension?.cool;
  console.log(`  Material tension:     warm="${brief.materialTension?.warm}" cool="${brief.materialTension?.cool}" ${tensionOk ? "✓" : "✗ (both required)"}`);

  // 60-30-10 palette
  const paletteOk = brief.palette?.dominant && brief.palette?.secondary && brief.palette?.accent;
  console.log(`  60-30-10 palette:     dom="${brief.palette?.dominant}" sec="${brief.palette?.secondary}" acc="${brief.palette?.accent}" ${paletteOk ? "✓" : "✗"}`);

  // Weaknesses identified — new prompt requires minimum 4
  const weaknessOk = (brief.weaknesses?.length ?? 0) >= 4;
  console.log(`  Weaknesses:           ${brief.weaknesses?.length ?? 0} ${weaknessOk ? "✓" : "✗ (need ≥4 per new prompt)"}`);
  brief.weaknesses?.forEach((w, i) => {
    console.log(`    [${i + 1}] ${w}`);
  });

  // Forbidden words check — expanded per new system prompts
  const forbiddenWords = ["beautiful", "stunning", "gorgeous", "modern", "contemporary", "cozy", "luxurious", "amazing", "elegant", "chic", "stylish", "nice", "lovely", "perfect", "exquisite"];
  const promptLower = result.fluxPrompt.toLowerCase();
  const briefStr = JSON.stringify(brief).toLowerCase();
  const foundForbidden = forbiddenWords.filter(
    (w) => promptLower.includes(w) || briefStr.includes(w),
  );
  const forbiddenOk = foundForbidden.length === 0;
  console.log(
    `  Forbidden words:      ${forbiddenOk ? "none found ✓" : `FOUND: ${foundForbidden.join(", ")} ✗`}`,
  );

  // LoRA trigger in prompt
  const loraOk = result.fluxPrompt.toLowerCase().includes("cvwmn");
  console.log(`  LoRA trigger cvwmn:   ${loraOk ? "present ✓" : "missing ✗"}`);

  // Removal block present
  const removalOk = /remove\s+/i.test(result.fluxPrompt);
  console.log(`  Removal block:        ${removalOk ? "present ✓" : "missing ✗"}`);

  // Camera spec ending present
  // Must end with: "Shot on ... Architectural Digest editorial photograph, photorealistic interior design render."
  const cameraSpecOk =
    /shot on .+f\/[\d.]+.+iso\s*\d+/i.test(result.fluxPrompt) &&
    /architectural digest editorial photograph/i.test(result.fluxPrompt) &&
    /photorealistic interior design render/i.test(result.fluxPrompt);
  console.log(`  Camera spec ending:   ${cameraSpecOk ? "present ✓" : "missing ✗"}`);
  if (!cameraSpecOk) {
    // Print last 200 chars of prompt to diagnose
    console.log(`    Last 200 chars: ...${result.fluxPrompt.slice(-200)}`);
  }

  const allOk = wordOk && objOk && tierOk && fgOk && mgOk && bgOk && tensionOk && paletteOk && weaknessOk && forbiddenOk && removalOk && cameraSpecOk;
  console.log(`\n  Overall:              ${allOk ? "✓ ALL CHECKS PASSED" : "⚠ SOME CHECKS FAILED — review above"}`);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
