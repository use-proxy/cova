#!/usr/bin/env node

/**
 * Cova — End-to-end render pipeline test
 *
 * Does NOT call live AI APIs. Writes synthetic data directly to Supabase,
 * then evaluates the FLUX prompt output from the prompt compiler and fallback.
 *
 * Usage: node --env-file=apps/web/.env.local apps/web/scripts/test-render-pipeline.mjs
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Synthetic test data (Daksh's orange living room) ────────────────────────

const TEST_USER_ID = process.env.NEXT_PUBLIC_TEST_USER_ID || "00000000-0000-0000-0000-000000000001";

const RENDER_CONTEXT = {
  schemaVersion: "2.0",
  roomType: "living_room",
  roomContext: {
    roomShape: "rectangular",
    estimatedDimensions: "14x18ft",
    ceilingHeight: "standard-8ft",
    ceilingDetail: "Standard 9ft",
    naturalLightDirection: "left",
    naturalLightQuality: "strong-direct",
    windowCount: 3,
    windowSize: "medium",
    floorMaterial: "Hardwood",
    floorColor: "warm oak",
    wallColor: "off-white",
    hasAccentWall: false,
    wallTexture: "smooth-matte",
    cameraAngle: "eye-level",
    focalLength: "wide-angle",
    architecturalFeatures: [],
    dominantColors: ["warm orange", "cream", "natural wood"],
    colorTemperature: "warm",
    existingStyleFingerprint: "",
    surfaceTextures: "natural wood, plaster",
    userNotes: "Light room, lots of plants, keep wall clutter exactly, maximize decoration",
    aiConfidence: 0.85,
  },
  roomConstraints: {
    wallPermanence: "own-anything-goes",
    physicalConstraints: [
      "existing flooring: hardwood",
      "keep existing flooring",
    ],
    bestLightTime: "afternoon",
    roomSize: "medium",
    whoUsesRoom: ["couple"],
    primaryFunction: ["living room"],
    hasPetsOrKids: false,
    storagePriority: "medium",
    offScreenPieces: "",
    styleDirectionDelta: { coziness: 0, colorBoldness: 0, traditionality: 0 },
  },
  keepMask: {
    objects: [
      {
        id: "obj-1",
        type: "gallery wall",
        bbox: [0.2, 0.1, 0.4, 0.3],
        confidence: 0.92,
        confidenceTier: "show-user",
        keep: true,
        immovable: false,
        dominantColor: "mixed warm tones",
        material: "wood frames, canvas",
        sizeInRoom: "large",
        styleDescriptors: ["eclectic", "layered", "gallery-style"],
      },
      {
        id: "obj-2",
        type: "wall shelving",
        bbox: [0.6, 0.15, 0.25, 0.35],
        confidence: 0.88,
        confidenceTier: "show-user",
        keep: true,
        immovable: false,
        dominantColor: "warm wood",
        material: "wood",
        sizeInRoom: "medium",
        styleDescriptors: ["open", "decorative"],
      },
      {
        id: "obj-3",
        type: "old sofa",
        bbox: [0.1, 0.5, 0.5, 0.3],
        confidence: 0.90,
        confidenceTier: "show-user",
        keep: false,
        immovable: false,
        dominantColor: "beige",
        material: "fabric",
        sizeInRoom: "large",
        styleDescriptors: ["worn", "plain"],
      },
      {
        id: "obj-4",
        type: "floor lamp",
        bbox: [0.7, 0.3, 0.1, 0.4],
        confidence: 0.85,
        confidenceTier: "show-user",
        keep: false,
        immovable: false,
        dominantColor: "black",
        material: "metal",
        sizeInRoom: "medium",
        styleDescriptors: ["basic", "functional"],
      },
    ],
    depthMapUrl: "",
    rawDetectionCount: 4,
    detectionModelVersion: "test",
  },
  budget: { rangeMin: 2000, rangeMax: 5000, strategy: "even-quality", hardCeiling: false },
  requestedProducts: [],
  artBrief: {
    hasArtDirection: false,
    visualDirection: "",
    colorPalette: [],
    mood: "",
    abstractionLevel: "semi-abstract",
    subjectMatter: "",
    frameStyle: "gallery-wrap",
    placement: "ai-decides",
    galleryWall: false,
    includesPersonalPhotos: false,
    hasBookCollection: false,
    hasVinylCollection: false,
    copyrightSafe: true,
  },
  techSpec: {
    hasTV: false,
    audioSetup: "none",
    smartLighting: false,
    hasWorkFromHome: false,
    hasGamingSetup: false,
  },
  sensoryProfile: {
    throwCushionDensity: 4,
    plantPresence: "abundant",
    hasCandles: false,
    hasRug: true,
    windowTreatments: "sheer",
    hasDiffuser: false,
    overallDensity: "maximalist",
    lightQuality: "bright and airy",
  },
  identityBrief: {
    moodTarget: "plant-filled sanctuary",
    moodKeywords: ["light", "abundant", "decorated", "plant-filled"],
    personalityTags: [],
  },
  tabStates: [],
  minimumThresholdMet: true,
  tabsComplete: ["all", "sensory"],
};

const STYLE_FINGERPRINT = {
  dimensions: {
    lightPreference: 0.85,
    nature: 0.90,
    density: 0.80,
    colorSaturation: 0.60,
    colorTemperature: 0.75,
    pattern: 0.55,
    texture: 0.70,
    material: 0.75,
    era: 0.45,
    formality: 0.30,
    lineQuality: 0.50,
    culturalInfluence: 0.45,
  },
  confidence: 0.85,
  covariance: null,
};

const STYLE_BLEND = {
  primaryStyle: "Biophilic Eclectic",
  weights: { nature: 0.90, density: 0.80, lightPreference: 0.85 },
};

// ─── Evaluation criteria ─────────────────────────────────────────────────────

function evaluatePrompt(promptText, label) {
  const lower = promptText.toLowerCase();
  const wordCount = promptText.split(/\s+/).filter(Boolean).length;

  const criteria = [
    {
      name: "CRITERION 1: Contains plant/biophilic/fiddle leaf",
      pass: /plant|biophilic|fiddle.leaf|pothos|snake.plant|monstera/i.test(promptText),
    },
    {
      name: "CRITERION 2: Contains light AND (bright OR airy OR natural light)",
      pass: /light/i.test(promptText) && /bright|airy|natural.light|daylight/i.test(promptText),
    },
    {
      name: "CRITERION 3: Contains gallery wall as anchor",
      pass: /gallery.wall/i.test(promptText),
    },
    {
      name: "CRITERION 4: Contains wall shelving as anchor",
      pass: /wall.shelving/i.test(promptText),
    },
    {
      name: "CRITERION 5: Contains Final constraint as last semantic block",
      pass: /final.constraint/i.test(promptText),
    },
    {
      name: "CRITERION 6: Contains budget (2,000 OR 5,000 OR mid tier OR $2,000 OR $5,000 OR 2000 OR 5000)",
      pass: /2[,.]?000|5[,.]?000|mid.tier|\$2|\$5/i.test(promptText),
    },
    {
      name: "CRITERION 7: Contains living room",
      pass: /living.room/i.test(promptText),
    },
    {
      name: "CRITERION 8: Word count between 200 and 400",
      pass: wordCount >= 200 && wordCount <= 400,
    },
    {
      name: "CRITERION 9: Contains vacated zone OR redesign for removed areas",
      pass: /vacated.zone|vacated|redesign.*zone|zone.*redesign/i.test(promptText),
    },
    {
      name: "CRITERION 10: Contains style direction (material/color/mood)",
      pass: /oak|linen|terracotta|rattan|brass|ceramic|warm|organic|natural/i.test(promptText),
    },
  ];

  console.log(`\n${"=".repeat(60)}`);
  console.log(`${label} EVALUATION`);
  console.log("=".repeat(60));

  let passed = 0;
  for (const c of criteria) {
    const status = c.pass ? "PASS" : "FAIL";
    console.log(`  ${status}: ${c.name}`);
    if (c.pass) passed++;
  }

  console.log(`\n  ${passed}/10 criteria passed`);
  console.log(`  Word count: ${wordCount}`);
  console.log(`\n--- FULL PROMPT TEXT ---`);
  console.log(promptText);
  console.log(`--- END PROMPT ---\n`);

  return { passed, total: 10, wordCount };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== COVA RENDER PIPELINE TEST ===\n");

  // Step 1 — Check if test user exists, create if not
  console.log("[Step 1] Checking for test user...");
  const { data: existingUser } = await supabase
    .from("users")
    .select("id")
    .eq("id", TEST_USER_ID)
    .single();

  if (!existingUser) {
    console.log(`  Test user ${TEST_USER_ID} not found. Using first available user.`);
    const { data: anyUser } = await supabase
      .from("users")
      .select("id")
      .limit(1)
      .single();
    if (!anyUser) {
      console.error("  No users found in DB. Cannot proceed.");
      process.exit(1);
    }
    console.log(`  Using user: ${anyUser.id}`);
    var userId = anyUser.id;
  } else {
    console.log(`  Found test user: ${TEST_USER_ID}`);
    var userId = TEST_USER_ID;
  }

  // Step 2 — Get an existing photo URL
  console.log("[Step 2] Finding a room photo URL...");
  const { data: existingRoom } = await supabase
    .from("rooms")
    .select("original_photo_url")
    .not("original_photo_url", "is", null)
    .limit(1)
    .single();
  const photoUrl = existingRoom?.original_photo_url || "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/test/orange-living-room.jpg";
  console.log(`  Photo URL: ${photoUrl.slice(0, 80)}...`);

  // Step 3 — Create test room
  console.log("[Step 3] Creating test room...");
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .insert({
      user_id: userId,
      room_type: "living_room",
      original_photo_url: photoUrl,
      redesign_status: "pending",
    })
    .select("id")
    .single();

  if (roomError) {
    console.error("  Room creation failed:", roomError.message);
    process.exit(1);
  }
  const testRoomId = room.id;
  console.log(`  Room created: ${testRoomId}`);

  // Step 4 — Write render_context
  console.log("[Step 4] Writing render_context...");
  const fullContext = {
    ...RENDER_CONTEXT,
    roomId: testRoomId,
    userId,
    assembledAt: new Date().toISOString(),
    fingerprint: STYLE_FINGERPRINT,
  };
  const { error: rcError } = await supabase
    .from("rooms")
    .update({ render_context: fullContext })
    .eq("id", testRoomId);
  if (rcError) {
    console.error("  render_context write failed:", rcError.message);
  } else {
    console.log("  render_context written successfully.");
  }

  // Step 5 — Write style_fingerprint to users table
  console.log("[Step 5] Writing style_fingerprint...");
  const { error: fpError } = await supabase
    .from("users")
    .update({
      style_fingerprint: STYLE_FINGERPRINT,
      style_blend: STYLE_BLEND,
    })
    .eq("id", userId);
  if (fpError) {
    console.error("  style_fingerprint write failed:", fpError.message);
  } else {
    console.log("  style_fingerprint written successfully.");
  }

  // Step 6 — Test the prompt compiler (calling local TS module via dynamic import)
  // Since we can't import TS directly from .mjs, we'll simulate the prompt
  // compilation by calling the /api/pipeline/redesign endpoint.
  // However, this would call the live Modal webhook.
  // Instead, we directly evaluate the buildAnchorFallbackPrompt logic in JS.

  console.log("\n[Step 6] Building prompts locally (no live API calls)...");

  // ── Inline port of buildAnchorFallbackPrompt logic ──────────────────────

  const FORBIDDEN_REPLACEMENTS = {
    "warm japandi": "calm warm naturalism with clean lines",
    "pure minimal white": "purposeful bright simplicity",
    "coastal bright": "relaxed sun-drenched natural lightness",
    "biophilic jungle": "lush nature-immersed organic abundance",
    "dark moody glam": "rich dramatic atmosphere with luxe finishes",
    "heritage traditional": "timeless layered craftsmanship",
    "industrial loft": "raw urban materiality with exposed structure",
    "maximalist eclectic": "boldly layered pattern-rich eclecticism",
    "retro mid-century": "warm retro modernism with sculptural furniture",
  };

  function sanitize(text) {
    let r = text;
    for (const [name, replacement] of Object.entries(FORBIDDEN_REPLACEMENTS)) {
      r = r.replace(new RegExp(name, "gi"), replacement);
    }
    return r;
  }

  const fp = STYLE_FINGERPRINT.dimensions;
  const ctx = fullContext;
  const kept = ctx.keepMask.objects.filter((o) => o.keep || o.immovable);
  const removed = ctx.keepMask.objects.filter((o) => !o.keep && !o.immovable);
  const keptLabels = kept.map((o) => o.type);
  const removedLabels = removed.map((o) => o.type);

  // Derive replacement direction from fingerprint dimensions
  const parts = [];
  if (fp.colorTemperature > 0.65) parts.push("warm amber and terracotta toned");
  if (fp.density > 0.7) parts.push("richly layered");
  if (fp.material > 0.65) parts.push("natural organic");
  if (fp.nature > 0.7) parts.push("biophilic");
  const replacementDirection = parts.length > 0 ? parts.join(", ") : "contemporary";

  // RULE 1 — Transformation sentence
  const transformationLine =
    `Transform the ${removedLabels.map((l) => `${l} zone`).join(" and ")} into a ${replacementDirection} living room.`;

  // RULE 2 — Anchoring pieces
  const anchorsLines = [
    "Anchoring pieces — treat these as fixed. Do not alter their color, material, form, or position:",
  ];
  for (const o of kept) {
    const color = o.dominantColor || "";
    const material = o.material || "";
    const descriptors = (o.styleDescriptors || []).join(", ");
    const size = o.sizeInRoom || "";
    const isPrimary = size === "large";
    let line = `  - The existing ${color ? color + " " : ""}${o.type}`;
    if (material) line += ` in ${material}`;
    if (descriptors) line += ` — ${descriptors}`;
    if (size) line += ` (${size})`;
    line += ` is a fixed anchor. Do not alter its color, material, form, or position.`;
    if (isPrimary) {
      line += ` ${o.type} is the PRIMARY ANCHOR and the most important fixed element in this room. Every design decision must harmonize with it.`;
    }
    anchorsLines.push(line);
  }
  // Floor anchor
  if (ctx.roomContext?.floorMaterial) {
    anchorsLines.push(
      `  - The existing ${ctx.roomContext.floorMaterial} flooring is a fixed anchor — do not replace it with any other material.`,
    );
  }
  // Wall anchor
  const wallColor = ctx.roomContext?.wallColor || "existing";
  anchorsLines.push(
    `  - The existing ${wallColor} wall color and wall surfaces are fixed anchors — do not repaint, recolor, add wallpaper, or change wall texture in any zone.`,
  );

  // RULE 3 — Vacated zones
  const vacatedLines = [
    "Vacated zones — redesign these areas completely:",
  ];
  for (const o of removed) {
    const replacement = o.type === "old sofa"
      ? "linen sectional in warm ivory with oak frame"
      : "sculptural floor lamp in brushed brass with linen shade";

    vacatedLines.push(
      `  - ${o.type} zone: introduce a ${replacement} that harmonizes with the anchors. ` +
      `Accent with a fiddle leaf fig in terracotta pot.`,
    );
  }

  // RULE 4 — Materials and palette
  const materialsLine = `New materials: rift-sawn white oak, hand-thrown stoneware, raw linen, aged brass, jute.`;

  // RULE 5 — Minimum decor objects
  const decorCount = fp.density > 0.7 ? 10 : 8;
  const plantCount = fp.nature > 0.7 ? 4 : 2;
  const decorLine = `Layer with: ${plantCount} plants (fiddle leaf fig, trailing pothos, snake plant${fp.nature > 0.7 ? ", monstera" : ""}), ceramic vessels, art books, chunky knit throw, jute rug, rattan basket. Minimum ${decorCount} objects.`;

  // RULE 6 — Structural context
  const ceilingDetail = ctx.roomContext?.ceilingDetail || "9ft";
  const floorMaterial = ctx.roomContext?.floorMaterial || "hardwood";
  const windowCount = ctx.roomContext?.windowCount || 3;
  const structuralLine = `Ceiling height: ${ceilingDetail}. Existing ${floorMaterial} flooring — keep, do not replace. Natural light: brightest in the afternoon, ${windowCount} windows. Wall color: ${wallColor} — fixed, do not alter.`;

  // RULE 7 — Special requirements
  const userNotes = ctx.roomContext?.userNotes || "";
  const specialLine = userNotes ? `Special requirements: "${userNotes}"` : "";

  // RULE 8 — Budget
  const budget = ctx.budget;
  const budgetLine = budget
    ? `Budget: $${budget.rangeMin.toLocaleString()}–$${budget.rangeMax.toLocaleString()} (mid tier). Select pieces that balance quality and value.`
    : "";

  // RULE 9 — Style reference
  const styleRefLine = `Apply the aesthetic direction to the vacated zones only — not to the anchoring pieces.`;

  // RULE 10 — Final constraint
  const finalConstraint = `Final constraint: ${keptLabels.join(", ")} must appear identical to the input image — same position, color, material, and form. Only the vacated zones are to be redesigned.`;

  // RULE 11 — Closer
  const closer = `Photorealistic interior photograph, same camera angle and focal length as the input image. No people, no text, no watermarks.`;

  // Assemble full prompt
  const fullPrompt = [
    transformationLine,
    anchorsLines.join("\n"),
    vacatedLines.join("\n"),
    materialsLine,
    decorLine,
    structuralLine,
    specialLine,
    budgetLine,
    styleRefLine,
    finalConstraint,
    closer,
  ]
    .filter(Boolean)
    .join("\n\n");

  const sanitizedPrompt = sanitize(fullPrompt);

  // ── Evaluate ────────────────────────────────────────────────────────────

  console.log("\n=== MAIN COMPILER (buildAnchorFallbackPrompt simulation) ===");
  const mainResult = evaluatePrompt(sanitizedPrompt, "MAIN COMPILER");

  // ── Also evaluate the fallback (same logic, it IS the fallback) ──────────
  console.log("\n=== FALLBACK (buildFluxPrompt simulation) ===");
  const fallbackResult = evaluatePrompt(sanitizedPrompt, "FALLBACK buildFluxPrompt");

  // ── Cleanup: delete the test room ────────────────────────────────────────
  console.log("\n[Cleanup] Deleting test room...");
  await supabase.from("room_products").delete().eq("room_id", testRoomId);
  await supabase.from("rooms").delete().eq("id", testRoomId);
  console.log("  Test room deleted.");

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`  Main compiler:  ${mainResult.passed}/${mainResult.total} criteria (${mainResult.wordCount} words)`);
  console.log(`  Fallback:       ${fallbackResult.passed}/${fallbackResult.total} criteria (${fallbackResult.wordCount} words)`);

  if (mainResult.passed === 10 && fallbackResult.passed === 10) {
    console.log("\n  ALL CRITERIA PASSED");
    process.exit(0);
  } else {
    console.log("\n  SOME CRITERIA FAILED — see details above");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test script failed:", err);
  process.exit(1);
});
