/**
 * Design Director — 3 Test Case Runner
 * Run: cd apps/web && npx tsx --env-file=.env.local scripts/test-design-director-3cases.ts
 *
 * Test 1: Supabase test room photo (messy bedroom) — Warm & Grounded (cvwmn)
 *   Density: 0.7, Warmth: 0.8, Naturalism: 0.6, Art: abstract warm tones
 *   Budget: $500-2000
 *
 * Test 2: Unsplash living room — Industrial (cvind)
 *   Density: 0.5, Warmth: 0.3, Naturalism: 0.2, Budget: $300-1000
 *
 * Test 3: Unsplash bedroom — Pure & Calm (cvscn)
 *   Density: 0.3, Warmth: 0.4, Naturalism: 0.5, Budget: $200-500
 *
 * Saves full outputs to: tests/quality/design_director_test_outputs.txt
 */

import * as fs from "fs";
import * as path from "path";
import { runDesignDirector } from "../lib/ai/design-director";
import type { StyleFingerprint } from "../types/fingerprint";

// ── Unsplash helper ───────────────────────────────────────────────────────────

async function fetchUnsplashPhoto(query: string): Promise<string | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    console.warn("[unsplash] UNSPLASH_ACCESS_KEY not set — will use fallback URL");
    return null;
  }

  const params = new URLSearchParams({
    query,
    per_page: "1",
    orientation: "landscape",
    content_filter: "high",
  });

  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?${params.toString()}`,
      { headers: { Authorization: `Client-ID ${key}` } },
    );
    if (!res.ok) {
      console.warn(`[unsplash] ${res.status} for "${query}"`);
      return null;
    }
    const data = (await res.json()) as {
      results: Array<{ urls: { regular: string } }>;
    };
    return data.results[0]?.urls?.regular ?? null;
  } catch (err) {
    console.warn(`[unsplash] fetch error: ${err}`);
    return null;
  }
}

// ── Validation helpers ────────────────────────────────────────────────────────

function checkRemovalFirst(prompt: string): boolean {
  // Removal block must be the very first line (before any other content)
  return /^remove\s+/i.test(prompt.trimStart());
}

function checkCameraSpec(prompt: string): boolean {
  return (
    /shot on .+f\/[\d.]+.+iso\s*\d+/i.test(prompt) &&
    /architectural digest editorial photograph/i.test(prompt) &&
    /photorealistic interior design render/i.test(prompt)
  );
}

// ── Test case interface ───────────────────────────────────────────────────────

interface TestCase {
  name: string;
  imageUrl: string;
  fingerprint: StyleFingerprint;
  roomType: string;
  styleAnchor: string;
  loraTrigger: string;
  budgetMin: number;
  budgetMax: number;
}

// ── Individual test runner ────────────────────────────────────────────────────

async function runTestCase(tc: TestCase, index: number): Promise<string> {
  const sep = "═".repeat(70);
  const lines: string[] = [];

  lines.push(sep);
  lines.push(`TEST ${index}: ${tc.name}`);
  lines.push(`Style: ${tc.styleAnchor} (${tc.loraTrigger}) | Budget: $${tc.budgetMin}-${tc.budgetMax} | Room: ${tc.roomType}`);
  lines.push(`Image: ${tc.imageUrl}`);
  lines.push(sep);

  console.log(`\n[${index}/3] Running: ${tc.name}`);
  console.log(`  Image: ${tc.imageUrl.slice(0, 90)}...`);

  const start = Date.now();

  const result = await runDesignDirector({
    imageUrl: tc.imageUrl,
    fingerprint: tc.fingerprint,
    roomType: tc.roomType,
    styleAnchor: tc.styleAnchor,
    loraTrigger: tc.loraTrigger,
    budgetMin: tc.budgetMin,
    budgetMax: tc.budgetMax,
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`  Completed in ${elapsed}s`);

  const wordCount = result.fluxPrompt.split(/\s+/).filter(Boolean).length;
  const removalFirst = checkRemovalFirst(result.fluxPrompt);
  const cameraSpecOk = checkCameraSpec(result.fluxPrompt);

  // ── 1. Staging JSON ──────────────────────────────────────────────────────────
  lines.push("\n── CALL 1: Staging JSON (rooms.design_brief) ──────────────────────────");
  lines.push(JSON.stringify(result.stagingJson, null, 2));

  // ── 2. FLUX Staging Script ───────────────────────────────────────────────────
  lines.push(`\n── CALL 2: FLUX Staging Script — ${wordCount} words ───────────────────────`);
  lines.push(result.fluxPrompt);

  // ── 3. Quality Checks ────────────────────────────────────────────────────────
  lines.push("\n── QUALITY CHECKS ─────────────────────────────────────────────────────");

  const removalStatus = removalFirst ? "YES ✓" : "NO ✗  (should start with 'Remove ...')";
  lines.push(`  [3a] Removal block is first line:  ${removalStatus}`);

  const cameraStatus = cameraSpecOk ? "YES ✓" : "NO ✗  (should end with 'Shot on ... f/... ISO ... Architectural Digest...')";
  lines.push(`  [3b] Prompt ends with camera spec: ${cameraStatus}`);

  const wordOk = wordCount <= 130;
  lines.push(`  [3c] Total word count: ${wordCount} ${wordOk ? "✓" : "✗ (exceeds 130-word ceiling)"}`);

  lines.push(`  [3d] Budget tier: ${result.stagingJson.budgetTier}`);

  const expectedMaxObjects =
    tc.fingerprint.dimensions.density > 0.7 ? 12 :
    tc.fingerprint.dimensions.density >= 0.4 ? 8 : 4;
  const objectCountOk = result.stagingJson.decorObjects?.length <= expectedMaxObjects;
  lines.push(`  [3e] Total objects: ${result.stagingJson.totalObjectCount} (decorObjects: ${result.stagingJson.decorObjects?.length}, max for density=${tc.fingerprint.dimensions.density}: ${expectedMaxObjects}) ${objectCountOk ? "✓" : "✗"}`);

  lines.push(`  [3f] Weaknesses identified: ${result.stagingJson.weaknesses?.length ?? 0}`);

  const fgObjs = result.stagingJson.depthLayers?.foreground?.objects?.length ?? 0;
  const mgObjs = result.stagingJson.depthLayers?.midground?.objects?.length ?? 0;
  const bgObjs = result.stagingJson.depthLayers?.background?.objects?.length ?? 0;
  lines.push(`  [3g] Depth layers: FG=${fgObjs} MG=${mgObjs} BG=${bgObjs} ${fgObjs > 0 && mgObjs > 0 && bgObjs > 0 ? "✓ all populated" : "✗ missing layers"}`);

  lines.push(`  [3h] Material tension: warm="${result.stagingJson.materialTension?.warm}" cool="${result.stagingJson.materialTension?.cool}"`);

  const forbiddenWords = [
    "beautiful", "stunning", "gorgeous", "modern", "contemporary",
    "cozy", "luxurious", "amazing", "elegant", "chic",
    "stylish", "nice", "lovely", "perfect", "exquisite",
  ];
  const promptLower = result.fluxPrompt.toLowerCase();
  const briefStr = JSON.stringify(result.stagingJson).toLowerCase();
  const foundForbidden = forbiddenWords.filter(
    (w) => promptLower.includes(w) || briefStr.includes(w),
  );
  lines.push(`  [3i] Forbidden words: ${foundForbidden.length === 0 ? "none found ✓" : `FOUND: ${foundForbidden.join(", ")} ✗`}`);

  const loraOk = result.fluxPrompt.toLowerCase().includes(tc.loraTrigger.toLowerCase());
  lines.push(`  [3j] LoRA trigger "${tc.loraTrigger}": ${loraOk ? "present ✓" : "missing ✗"}`);

  // Console summary
  console.log(`  Removal first: ${removalFirst ? "✓" : "✗"} | Camera spec: ${cameraSpecOk ? "✓" : "✗"} | Words: ${wordCount}${wordCount > 130 ? " ✗ OVER" : " ✓"} | decorObjects: ${result.stagingJson.decorObjects?.length}/${expectedMaxObjects}`);
  if (!removalFirst) {
    console.log(`  ↳ Prompt starts with: "${result.fluxPrompt.slice(0, 60)}"`);
  }
  if (!cameraSpecOk) {
    console.log(`  ↳ Prompt ends with: "...${result.fluxPrompt.slice(-80)}"`);
  }

  return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║  Design Director — 3 Test Case Runner                           ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY not set in .env.local");
    process.exit(1);
  }

  // ── Fetch Unsplash photos for Test 2 and Test 3 ──────────────────────────────
  console.log("\nFetching Unsplash photos...");

  const livingRoomUrl =
    (await fetchUnsplashPhoto("industrial loft living room exposed concrete")) ??
    "https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=1200&q=80";

  const bedroomUrl =
    (await fetchUnsplashPhoto("minimalist bedroom white clean serene")) ??
    "https://images.unsplash.com/photo-1540518614846-7eded433c457?w=1200&q=80";

  console.log(`  Living room (Industrial): ${livingRoomUrl.slice(0, 80)}...`);
  console.log(`  Bedroom (Pure & Calm):    ${bedroomUrl.slice(0, 80)}...`);

  // ── Test case definitions ─────────────────────────────────────────────────────

  const identityCovariance = Array.from({ length: 12 }, (_, i) =>
    Array.from({ length: 12 }, (_, j) => (i === j ? 0.01 : 0)),
  );

  const testCases: TestCase[] = [
    // ── Test 1: Messy bedroom — Warm & Grounded ─────────────────────────────
    {
      name: "Messy Bedroom — Warm & Grounded",
      imageUrl:
        "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/test/room_converted.jpeg",
      fingerprint: {
        dimensions: {
          colorTemperature: 0.8,   // warmth=0.8 → warm amber/honey palette, 2700K Edison
          colorSaturation: 0.50,
          density: 0.7,            // density=0.7 → boundary: richly layered (10-12 objects)
          formality: 0.40,
          era: 0.45,
          material: 0.60,
          texture: 0.60,
          pattern: 0.35,
          lineQuality: 0.58,
          lightPreference: 0.62,
          nature: 0.6,             // naturalism=0.6 → below >0.7, moderate plants
          culturalInfluence: 0.40,
        },
        covariance: identityCovariance,
        confidence: 0.85,
      },
      roomType: "bedroom",
      styleAnchor: "Warm & Grounded",
      loraTrigger: "cvwmn",
      budgetMin: 500,
      budgetMax: 2000,
    },

    // ── Test 2: Unsplash living room — Industrial ────────────────────────────
    {
      name: "Living Room — Industrial",
      imageUrl: livingRoomUrl,
      fingerprint: {
        dimensions: {
          colorTemperature: 0.3,   // warmth=0.3 → cool slate palette, 5000K
          colorSaturation: 0.35,
          density: 0.5,            // density=0.5 → 6-8 objects balanced
          formality: 0.52,
          era: 0.30,               // slightly towards contemporary
          material: 0.35,          // manufactured — aged steel, raw concrete
          texture: 0.65,
          pattern: 0.25,
          lineQuality: 0.28,       // hard geometric — industrial character
          lightPreference: 0.42,
          nature: 0.2,             // naturalism=0.2 → minimal plant presence
          culturalInfluence: 0.30,
        },
        covariance: identityCovariance,
        confidence: 0.80,
      },
      roomType: "living room",
      styleAnchor: "Industrial",
      loraTrigger: "cvind",
      budgetMin: 300,
      budgetMax: 1000,
    },

    // ── Test 3: Unsplash bedroom — Pure & Calm ───────────────────────────────
    {
      name: "Bedroom — Pure & Calm",
      imageUrl: bedroomUrl,
      fingerprint: {
        dimensions: {
          colorTemperature: 0.4,   // warmth=0.4 → balanced neutrals, 3000K
          colorSaturation: 0.22,   // near-achromatic
          density: 0.3,            // density=0.3 → 3-4 objects, negative space emphasized
          formality: 0.45,
          era: 0.40,
          material: 0.52,
          texture: 0.40,
          pattern: 0.18,
          lineQuality: 0.68,       // organic soft lines — calm
          lightPreference: 0.72,   // bright natural daylight
          nature: 0.5,             // naturalism=0.5 → moderate
          culturalInfluence: 0.32,
        },
        covariance: identityCovariance,
        confidence: 0.78,
      },
      roomType: "bedroom",
      styleAnchor: "Pure & Calm",
      loraTrigger: "cvscn",
      budgetMin: 200,
      budgetMax: 500,
    },
  ];

  // ── Run all 3 tests sequentially ─────────────────────────────────────────────

  const fileLines: string[] = [
    "Design Director — 3 Test Case Outputs",
    `Generated: ${new Date().toISOString()}`,
    "═".repeat(70),
    "",
  ];

  let passCount = 0;
  let failCount = 0;

  for (let i = 0; i < testCases.length; i++) {
    try {
      const output = await runTestCase(testCases[i], i + 1);
      fileLines.push(output);
      fileLines.push("\n\n");
      passCount++;
    } catch (err) {
      const msg = `\n[ERROR in Test ${i + 1}: ${testCases[i].name}]\n${String(err)}\n`;
      console.error(msg);
      fileLines.push(msg);
      failCount++;
    }
  }

  fileLines.push("═".repeat(70));
  fileLines.push(`SUMMARY: ${passCount}/3 passed, ${failCount}/3 errored`);
  fileLines.push("═".repeat(70));

  // ── Save output ───────────────────────────────────────────────────────────────

  const outputPath = path.resolve(
    __dirname,
    "../../../tests/quality/design_director_test_outputs.txt",
  );

  fs.writeFileSync(outputPath, fileLines.join("\n"), "utf8");

  console.log(`\n${"═".repeat(70)}`);
  console.log(`DONE: ${passCount}/3 tests completed`);
  console.log(`Output saved to: ${outputPath}`);
  console.log("═".repeat(70));
}

main().catch((err) => {
  console.error("[test-design-director-3cases] Fatal:", err);
  process.exit(1);
});
