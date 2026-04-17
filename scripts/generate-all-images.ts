/**
 * generate-all-images.ts — Session B: Image Generation for 10 COVA styles
 *
 * Generates three sets of images via fal.ai FLUX Pro:
 *   SET A: 200 training images (20 per style × 10 styles)
 *   SET B: 840 swipe pair images (420 pairs × 2)
 *   SET C: 60 anchor images (10 styles × 6 room types)
 *
 * Total: 1,100 images. Budget: ~$85.77 (generation portion: ~$55)
 *
 * Resume: scripts/generation-progress.json — never regenerates completed images.
 *
 * Usage: cd scripts && npx tsx generate-all-images.ts
 */

import { fal } from "@fal-ai/client";
import { config } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, "..", "apps", "web", ".env.local") });
config({ path: path.join(__dirname, "..", ".env.local") });

const FAL_KEY = process.env.FAL_KEY;
if (!FAL_KEY) throw new Error("FAL_KEY not set in .env.local");

fal.config({ credentials: FAL_KEY });

// ── Constants ────────────────────────────────────────────────────────────────

const PROGRESS_PATH = path.join(__dirname, "generation-progress.json");
const COST_PER_IMAGE = 0.05;
const BUDGET_CEILING = 85.77;
// Reserve $25 for LoRA training ($20) + quality gate ($5)
const GENERATION_BUDGET = BUDGET_CEILING - 25;

const FAL_PARAMS = {
  image_size: "landscape_4_3" as const,
  num_inference_steps: 28,
  guidance_scale: 3.5,
  output_format: "jpeg" as const,
  safety_tolerance: "4",
  num_images: 1,
};

const ROOM_TYPES = [
  "bedroom",
  "living room",
  "kitchen",
  "bathroom",
  "home office",
  "dining room",
] as const;

// ── Style Definitions ────────────────────────────────────────────────────────

interface StyleDNA {
  trigger: string;
  keywords: string;
  colors: string;
  light: string;
  avoid: string;
}

const STYLES: Record<string, StyleDNA> = {
  COVASCANDINAV: {
    trigger: "COVASCANDINAV",
    keywords: "light pine, white paint, sheepskin, cotton, hygge",
    colors: "white, light grey, pale blue, birch wood",
    light: "cool white daylight, diffused, shadow-free",
    avoid: "dark colors, heavy furniture, warm wood tones",
  },
  COVAJAPANDI: {
    trigger: "COVAJAPANDI",
    keywords: "walnut, washi paper, linen, matte ceramic, bamboo",
    colors: "warm beige, cream, terracotta, sage, warm brown",
    light: "warm filtered morning light, soft shadows",
    avoid: "synthetic materials, high gloss, bright colors",
  },
  COVABIOPHILIC: {
    trigger: "COVABIOPHILIC",
    keywords: "living plants, moss, stone, raw wood, water features",
    colors: "forest green, earth brown, stone grey, sky blue",
    light: "cool green-filtered natural light, dappled",
    avoid: "synthetic materials, no plants, industrial elements",
  },
  COVAMINIMAL: {
    trigger: "COVAMINIMAL",
    keywords: "white oak, concrete, matte white, empty space",
    colors: "white, off-white, warm grey, single muted accent",
    light: "pure white, shadow-free, even exposure",
    avoid: "color, pattern, decorative objects, clutter",
  },
  COVAMIDCENTURY: {
    trigger: "COVAMIDCENTURY",
    keywords: "teak, molded plywood, wool, brass, tapered legs",
    colors: "mustard yellow, olive green, burnt orange, cream",
    light: "golden afternoon, long horizontal shadows",
    avoid: "ornate details, modern minimalism, farmhouse",
  },
  COVACOASTAL: {
    trigger: "COVACOASTAL",
    keywords: "whitewashed wood, jute, linen, sea glass, wicker",
    colors: "white, sand, seafoam, navy, coral, driftwood",
    light: "bright blown-out natural, airy, high key",
    avoid: "dark colors, heavy fabrics, urban elements",
  },
  COVABOHEMIAN: {
    trigger: "COVABOHEMIAN",
    keywords: "rattan, macrame, velvet, kilim, woven textiles",
    colors: "jewel tones, terracotta, mustard, deep teal",
    light: "warm amber, layered sources, Edison accents",
    avoid: "minimalism, matching sets, grey monotone",
  },
  COVAINDUSTRIAL: {
    trigger: "COVAINDUSTRIAL",
    keywords: "raw steel, exposed brick, concrete, leather, Edison",
    colors: "grey, black, brown, rust, exposed brick red",
    light: "cool grey, Edison accent pools, dramatic",
    avoid: "soft colors, floral patterns, farmhouse warmth",
  },
  COVAFARMHOUSE: {
    trigger: "COVAFARMHOUSE",
    keywords: "shiplap, distressed wood, cotton, galvanized metal",
    colors: "white, cream, sage green, navy, barn red",
    light: "warm soft diffused, golden, cozy",
    avoid: "modern minimalism, industrial metal, jewel tones",
  },
  COVAARTDECO: {
    trigger: "COVAARTDECO",
    keywords: "lacquered wood, velvet, gold, marble, mirrored",
    colors: "black, gold, emerald, sapphire, champagne, ivory",
    light: "warm dramatic, deep shadows, theatrical",
    avoid: "rustic elements, casual textures, minimalism",
  },
};

const STYLE_NAMES = Object.keys(STYLES);

// ── Training Image Distribution ──────────────────────────────────────────────

const TRAINING_DISTRIBUTION: Array<{ room: string; count: number }> = [
  { room: "bedroom", count: 4 },
  { room: "living room", count: 4 },
  { room: "kitchen", count: 3 },
  { room: "bathroom", count: 3 },
  { room: "home office", count: 3 },
  { room: "dining room", count: 3 },
];

// ── Swipe Pair Dimensions ────────────────────────────────────────────────────

interface DimensionDef {
  name: string;
  pairsPerRoom: number;
  promptA: string;
  promptB: string;
}

const DIMENSIONS: DimensionDef[] = [
  {
    name: "warmth",
    pairsPerRoom: 6,
    promptA:
      "cool palette, grey-blue tones, contemporary, steel and glass elements",
    promptB:
      "warm palette, amber and honey tones, wood and textile dominant, candlelight quality",
  },
  {
    name: "complexity",
    pairsPerRoom: 6,
    promptA:
      "minimal, maximum 5 objects visible, negative space dominant, nothing decorative",
    promptB:
      "richly layered, every surface styled, multiple textures, abundant objects",
  },
  {
    name: "formality",
    pairsPerRoom: 6,
    promptA:
      "casual, lived-in, relaxed arrangement, mixed styles, comfortable imperfection",
    promptB:
      "formal, precise arrangement, matched set, architectural symmetry, deliberate composition",
  },
  {
    name: "natureMateriality",
    pairsPerRoom: 8,
    promptA:
      "raw natural materials, live edge wood, stone, woven natural fibers, unprocessed surfaces",
    promptB:
      "manufactured materials, lacquer, chrome, synthetic fabrics, processed glossy surfaces",
  },
  {
    name: "colorSaturation",
    pairsPerRoom: 4,
    promptA:
      "muted desaturated palette, grey undertones, tonal variation only, no bold color",
    promptB:
      "saturated vibrant palette, bold accent color, color as primary design element",
  },
  {
    name: "textureRichness",
    pairsPerRoom: 4,
    promptA:
      "smooth flat surfaces, minimal texture, clean lines, uniform materials",
    promptB:
      "heavily textured, multiple material textures, rough stone, chunky knit, woven rattan",
  },
  {
    name: "lightingDrama",
    pairsPerRoom: 8,
    promptA:
      "flat even bright light, no shadows, Scandinavian white room, high key photography",
    promptB:
      "dramatic directional light, deep shadows, moody atmosphere, pools of light, high contrast",
  },
  {
    name: "pattern",
    pairsPerRoom: 4,
    promptA:
      "solid colors throughout, no pattern, uniform surfaces, minimal visual noise",
    promptB:
      "bold pattern dominant, geometric print, floral wallpaper, patterned rug and textiles",
  },
  {
    name: "lightPreference",
    pairsPerRoom: 6,
    promptA:
      "dim moody room, low lux, intimate atmosphere, small windows, curtains drawn, lamp pools only",
    promptB:
      "maximally bright, floor to ceiling windows, white walls, abundant natural light, airy",
  },
  {
    name: "lineQuality",
    pairsPerRoom: 4,
    promptA:
      "organic curved forms, rounded edges, freeform shapes, irregular natural contours",
    promptB:
      "strict geometric lines, sharp right angles, architectural precision, clean rectangular forms",
  },
  {
    name: "symmetryPreference",
    pairsPerRoom: 6,
    promptA:
      "deliberate asymmetry, one nightstand, offset art placement, organic arrangement",
    promptB:
      "strict bilateral symmetry, matched pair nightstands, centered art, balanced composition",
  },
  {
    name: "plantPresence",
    pairsPerRoom: 8,
    promptA:
      "no plants, no nature elements, purely architectural, synthetic materials throughout",
    promptB:
      "abundant plants, living wall, multiple potted plants, trailing vines, botanical prints",
  },
];

// Total pairs per room type: 6+6+6+8+4+4+8+4+6+4+6+8 = 70
// Total pairs: 70 × 6 room types = 420 pairs = 840 images

// ── Camera/density/time variations for training images ───────────────────────

const CAMERA_ANGLES = [
  "straight-on view",
  "slight left angle view",
  "slight right angle view",
];
const DENSITY_LEVELS = ["sparsely furnished", "fully furnished"];
const TIMES_OF_DAY = [
  "morning light",
  "afternoon golden light",
  "evening lamp light",
];

// ── Progress tracking ────────────────────────────────────────────────────────

interface Progress {
  training: Record<string, { url: string; caption: string }>;
  swipePairs: Record<string, { imageAUrl: string; imageBUrl: string }>;
  anchors: Record<string, { url: string }>;
  totalSpend: number;
}

function loadProgress(): Progress {
  if (fs.existsSync(PROGRESS_PATH)) {
    return JSON.parse(fs.readFileSync(PROGRESS_PATH, "utf-8"));
  }
  return { training: {}, swipePairs: {}, anchors: {}, totalSpend: 0 };
}

function saveProgress(p: Progress): void {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(p, null, 2));
}

// ── fal.ai generation ────────────────────────────────────────────────────────

async function generateImage(prompt: string): Promise<string> {
  const result = await fal.subscribe("fal-ai/flux-pro", {
    input: {
      prompt,
      ...FAL_PARAMS,
    },
  });

  const data = result.data as { images: Array<{ url: string }> };
  if (!data.images?.[0]?.url) {
    throw new Error("No image URL in fal.ai response");
  }
  return data.images[0].url;
}

async function generateWithRetry(
  prompt: string,
  retries = 3
): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      return await generateImage(prompt);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (i === retries - 1) throw e;
      console.warn(`  Retry ${i + 1}/${retries}: ${msg}`);
      await sleep(3000 * (i + 1));
    }
  }
  throw new Error("Unreachable");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function log(...args: unknown[]): void {
  console.log(`[${ts()}]`, ...args);
}

// ── SET A: Training Images ───────────────────────────────────────────────────

async function generateTrainingImages(progress: Progress): Promise<void> {
  log("═══ SET A: Training Images (200 total) ═══");

  for (const styleName of STYLE_NAMES) {
    const style = STYLES[styleName];
    let imageIndex = 0;

    for (const { room, count } of TRAINING_DISTRIBUTION) {
      for (let i = 0; i < count; i++) {
        const key = `training_${styleName}_${room.replace(/ /g, "_")}_${i}`;
        if (progress.training[key]) {
          imageIndex++;
          continue;
        }

        // Budget check
        if (progress.totalSpend + COST_PER_IMAGE > GENERATION_BUDGET) {
          throw new Error(
            `Budget exceeded! Spent: $${progress.totalSpend.toFixed(2)}`
          );
        }

        // Vary camera, density, time of day
        const angle = CAMERA_ANGLES[imageIndex % CAMERA_ANGLES.length];
        const density = DENSITY_LEVELS[imageIndex % DENSITY_LEVELS.length];
        const time = TIMES_OF_DAY[imageIndex % TIMES_OF_DAY.length];

        const prompt = `${style.keywords}, ${room} interior, ${style.colors} color palette, ${style.light}, ${angle}, ${density}, ${time}, professional interior photography, architectural digest quality, no people, no text, 4K sharp`;

        log(
          `  [${styleName}] ${room} ${i + 1}/${count} (image ${imageIndex + 1}/20)`
        );

        const url = await generateWithRetry(prompt);
        const caption = `${style.trigger} interior design style`;

        progress.training[key] = { url, caption };
        progress.totalSpend += COST_PER_IMAGE;
        saveProgress(progress);

        imageIndex++;
        await sleep(200); // Rate limiting
      }
    }

    log(
      `  ✓ ${styleName}: 20 training images done. Running total: $${progress.totalSpend.toFixed(2)}`
    );
  }

  log(
    `SET A complete: ${Object.keys(progress.training).length} training images`
  );
}

// ── SET B: Swipe Pair Images ─────────────────────────────────────────────────

async function generateSwipePairImages(progress: Progress): Promise<void> {
  log("═══ SET B: Swipe Pair Images (840 total) ═══");

  let pairCount = 0;

  for (const roomType of ROOM_TYPES) {
    for (const dim of DIMENSIONS) {
      for (let pairIdx = 0; pairIdx < dim.pairsPerRoom; pairIdx++) {
        const key = `pair_${dim.name}_${roomType.replace(/ /g, "_")}_${String(pairIdx).padStart(3, "0")}`;

        if (progress.swipePairs[key]) {
          pairCount++;
          continue;
        }

        // Budget check
        if (progress.totalSpend + COST_PER_IMAGE * 2 > GENERATION_BUDGET) {
          throw new Error(
            `Budget exceeded! Spent: $${progress.totalSpend.toFixed(2)}`
          );
        }

        // Vary sub-prompts slightly for diversity across pairs within same dim+room
        const variationSuffix = getVariationSuffix(pairIdx);

        const promptA = `${dim.promptA}, ${roomType} interior, ${variationSuffix}, professional interior photography, architectural digest quality, no people, no text, 4K sharp`;
        const promptB = `${dim.promptB}, ${roomType} interior, ${variationSuffix}, professional interior photography, architectural digest quality, no people, no text, 4K sharp`;

        log(
          `  [${dim.name}] ${roomType} pair ${pairIdx + 1}/${dim.pairsPerRoom}`
        );

        const imageAUrl = await generateWithRetry(promptA);
        progress.totalSpend += COST_PER_IMAGE;

        const imageBUrl = await generateWithRetry(promptB);
        progress.totalSpend += COST_PER_IMAGE;

        progress.swipePairs[key] = { imageAUrl, imageBUrl };
        saveProgress(progress);

        pairCount++;
        await sleep(200);
      }
    }

    log(
      `  ✓ ${roomType}: all dimension pairs done. Running total: $${progress.totalSpend.toFixed(2)}`
    );
  }

  log(
    `SET B complete: ${Object.keys(progress.swipePairs).length} pairs (${Object.keys(progress.swipePairs).length * 2} images)`
  );
}

function getVariationSuffix(pairIdx: number): string {
  const variations = [
    "wide angle view, spacious layout",
    "medium shot, detailed furnishings",
    "corner perspective, cozy arrangement",
    "centered composition, balanced layout",
    "angled view, depth layered",
    "window-side view, natural light emphasis",
    "doorway perspective, inviting entry",
    "close framing, intimate atmosphere",
  ];
  return variations[pairIdx % variations.length];
}

// ── SET C: Anchor Images ─────────────────────────────────────────────────────

async function generateAnchorImages(progress: Progress): Promise<void> {
  log("═══ SET C: Anchor Images (60 total) ═══");

  for (const styleName of STYLE_NAMES) {
    const style = STYLES[styleName];

    for (const roomType of ROOM_TYPES) {
      const key = `anchor_${styleName}_${roomType.replace(/ /g, "_")}`;

      if (progress.anchors[key]) continue;

      if (progress.totalSpend + COST_PER_IMAGE > GENERATION_BUDGET) {
        throw new Error(
          `Budget exceeded! Spent: $${progress.totalSpend.toFixed(2)}`
        );
      }

      const styleFriendlyName = styleName.replace("COVA", "").toLowerCase();
      const prompt = `The most iconic ${styleFriendlyName} style ${roomType}, ${style.keywords}, ${style.colors} color palette, ${style.light}, perfectly represents the aesthetic, immediately recognizable, professional interior photography, architectural digest quality, 4K sharp, no people, no text`;

      log(`  [${styleName}] anchor: ${roomType}`);

      const url = await generateWithRetry(prompt);

      progress.anchors[key] = { url };
      progress.totalSpend += COST_PER_IMAGE;
      saveProgress(progress);

      await sleep(200);
    }

    log(`  ✓ ${styleName}: 6 anchor images done`);
  }

  log(
    `SET C complete: ${Object.keys(progress.anchors).length} anchor images`
  );
}

// ── Write manifests ──────────────────────────────────────────────────────────

function writeManifests(progress: Progress): void {
  log("Writing manifests...");

  // Training data manifests (one per style)
  for (const styleName of STYLE_NAMES) {
    const dir = path.join(__dirname, "..", "training-data", styleName);
    fs.mkdirSync(dir, { recursive: true });

    const images: Array<{
      key: string;
      url: string;
      caption: string;
      room: string;
    }> = [];

    for (const [key, val] of Object.entries(progress.training)) {
      if (key.startsWith(`training_${styleName}_`)) {
        const parts = key.split("_");
        // training_STYLE_room_type_idx
        const roomParts = parts.slice(2, -1);
        images.push({
          key,
          url: val.url,
          caption: val.caption,
          room: roomParts.join(" "),
        });
      }
    }

    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({ style: styleName, images }, null, 2)
    );
  }

  // Swipe pairs manifest
  const swipeDir = path.join(__dirname, "..", "swipe-pairs");
  fs.mkdirSync(swipeDir, { recursive: true });

  const pairs: Array<{
    pair_id: string;
    dimension: string;
    room_type: string;
    image_a_url: string;
    image_b_url: string;
    a_is_high: boolean;
    b_is_high: boolean;
  }> = [];

  for (const [key, val] of Object.entries(progress.swipePairs)) {
    // key: pair_dimensionName_room_type_idx
    const match = key.match(
      /^pair_(\w+?)_(bedroom|living_room|kitchen|bathroom|home_office|dining_room)_(\d+)$/
    );
    if (match) {
      pairs.push({
        pair_id: key,
        dimension: match[1],
        room_type: match[2].replace(/_/g, " "),
        image_a_url: val.imageAUrl,
        image_b_url: val.imageBUrl,
        a_is_high: false, // Image A is always the LOW end
        b_is_high: true, // Image B is always the HIGH end
      });
    }
  }

  fs.writeFileSync(
    path.join(swipeDir, "manifest.json"),
    JSON.stringify({ total_pairs: pairs.length, pairs }, null, 2)
  );

  // Anchor images manifest
  const anchorDir = path.join(__dirname, "..", "anchor-images");
  fs.mkdirSync(anchorDir, { recursive: true });

  const anchors: Array<{
    style: string;
    room_type: string;
    url: string;
    is_anchor: true;
  }> = [];

  for (const [key, val] of Object.entries(progress.anchors)) {
    const match = key.match(
      /^anchor_(\w+?)_(bedroom|living_room|kitchen|bathroom|home_office|dining_room)$/
    );
    if (match) {
      anchors.push({
        style: match[1],
        room_type: match[2].replace(/_/g, " "),
        url: val.url,
        is_anchor: true,
      });
    }
  }

  fs.writeFileSync(
    path.join(anchorDir, "manifest.json"),
    JSON.stringify({ total_anchors: anchors.length, anchors }, null, 2)
  );

  log(
    `Manifests written: ${STYLE_NAMES.length} training, 1 swipe-pairs, 1 anchors`
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log("Session B — Image Generation");
  log(`Budget ceiling: $${GENERATION_BUDGET.toFixed(2)} for generation`);

  const progress = loadProgress();
  log(`Resuming from progress: $${progress.totalSpend.toFixed(2)} spent`);
  log(
    `  Training: ${Object.keys(progress.training).length}/200, Pairs: ${Object.keys(progress.swipePairs).length}/420, Anchors: ${Object.keys(progress.anchors).length}/60`
  );

  await generateTrainingImages(progress);
  await generateSwipePairImages(progress);
  await generateAnchorImages(progress);

  writeManifests(progress);

  log("═══ GENERATION COMPLETE ═══");
  log(`Total images: ${Object.keys(progress.training).length + Object.keys(progress.swipePairs).length * 2 + Object.keys(progress.anchors).length}`);
  log(`Total spend: $${progress.totalSpend.toFixed(2)}`);
  log(`Budget remaining: $${(GENERATION_BUDGET - progress.totalSpend).toFixed(2)}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
