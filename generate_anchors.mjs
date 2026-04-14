import Replicate from "replicate";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { config } from "dotenv";

// Load env from apps/web/.env.local
config({ path: "./apps/web/.env.local" });

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET = "quiz-images";
const STORAGE_PATH = "anchors/room-specific";
const QUALITY_SUFFIX = "As featured in Architectural Digest. Shot by a leading architectural photographer. Perfectly exposed. Sharp focus throughout.";

const STYLE_DNA = {
  "warm-japandi": {
    prestige: "Kengo Kuma-inspired wabi-sabi interior. Artisan ceramics from Kyoto craftspeople.",
    palette: "aged dark walnut floors with natural grain, charcoal-taupe walls, no bright whites, no warm amber tones",
    signature: "low-profile charcoal linen sofa, handmade clay ceramic bowl with visible throwing marks, dried branch arrangement, intentional negative space as a design decision",
    lighting: "overcast diffused north light",
  },
  "dark-moody-glam": {
    prestige: "Maximally sophisticated dark interior.",
    palette: "deep charcoal-plum lacquered walls, Nero Marquina marble, dark herringbone European oak floor",
    signature: "emerald velvet tufted sofa with brass nail-head trim, bespoke brass and smoked glass chandelier, jewel tones throughout",
    lighting: "dramatic warm candlelight and custom lamp lighting, deep shadows",
  },
  "coastal-bright": {
    prestige: "Architect-designed Amalfi coast villa interior.",
    palette: "limewash white walls with natural texture, bleached European oak floor, pale aqua accents",
    signature: "custom rattan sofa with European linen cushions, sheer Belgian linen curtains, hand-thrown pale aqua ceramic lamp",
    lighting: "flooded with pure Mediterranean coastal daylight",
  },
  "industrial-loft": {
    prestige: "Award-winning architect-designed converted Victorian warehouse, London.",
    palette: "soaring exposed concrete ceiling with original steel I-beams, honed concrete floor with subtle sheen",
    signature: "bespoke matte black steel shelving fabricated by local metalworkers, premium dark cognac leather sofa with clean lines, every material premium-grade and intentional",
    lighting: "mixed tungsten and cool north daylight",
  },
  "maximalist-eclectic": {
    prestige: "Expertly curated maximalist interior by a celebrated collector.",
    palette: "deep red velvet sofa, mustard silk armchair, antique kilim over hand-knotted Persian rug",
    signature: "gallery wall of original artworks in considered arrangement, every object intentional and covetable, trailing philodendron and pothos, Moroccan hand-blown glass lantern",
    lighting: "warm layered custom lighting from multiple sources",
  },
  "heritage-traditional": {
    prestige: "Impeccably appointed English country house. Generational wealth aesthetic.",
    palette: "dark mahogany paneled walls, antique Persian Tabriz rug in deep reds and navy",
    signature: "hand-tufted burgundy leather Chesterfield sofa, hand-carved stone fireplace with oak mantel, egg-and-dart crown moulding, raised wainscoting, first-edition leather-bound books",
    lighting: "warm antique brass lamp and firelight",
  },
  "pure-minimal-white": {
    prestige: "John Pawson-level architectural minimalism. The architecture IS the decoration. Axel Vervoordt restraint.",
    palette: "warm white Roman travertine floor with natural veining, white plaster walls with subtle hand-applied texture, double-height ceiling",
    signature: "single custom low-profile sofa in warm ivory bouclé, one enormous floor-to-ceiling window with deep reveal casting a dramatic raking shadow across the travertine floor, a single beam of afternoon sunlight crossing the room",
    lighting: "golden afternoon sun raking across travertine floor creating long dramatic shadows, warm not cold",
  },
  "biophilic-jungle": {
    prestige: "Patrick Blanc-inspired living wall installation. Tropical modernist architecture, Singapore school.",
    palette: "honed natural basalt stone floor, exposed Douglas fir ceiling beams",
    signature: "floor-to-ceiling monstera deliciosa, philodendron gloriosum, bird-of-paradise, trailing pothos, museum-quality living moss wall panel, custom woven rattan sofa",
    lighting: "cool green-filtered dappled light through foliage canopy",
  },
  "retro-mid-century": {
    prestige: "Museum-quality restoration of a 1965 Palm Springs case study house.",
    palette: "avocado green and burnt sienna palette, custom geometric wallpaper in period-accurate mustard and walnut, hand-knotted shag rug",
    signature: "authentic walnut credenza with solid brass tapered legs, original Eames lounge chair in cognac aniline leather, hand-applied sunburst wall clock in solid brass, impeccably preserved period detail",
    lighting: "warm tungsten period lighting",
  },
};

const ROOM_OBJECTS = {
  "living-room": "sofa, coffee table, floor lamp, area rug, considered seating arrangement",
  "bedroom": "platform bed with premium bedding, bedside table, table lamp",
  "dining-room": "dining table, dining chairs, pendant lighting above table, sideboard",
  "kitchen": "cabinetry, countertop, open shelving, pendant lighting",
  "bathroom": "bath or vanity, premium fittings and fixtures, storage, mirror",
  "home-office": "desk, task chair, shelving, desk lamp",
};

const ROUND_FRAMING = {
  1: "Wide angle lens, eye level, full room overview showing the complete space.",
  2: "50mm lens, eye level, intimate vignette detail of a specific corner or surface arrangement.",
  3: "Wide angle lens, eye level, lived-in atmosphere — evidence of life (open book, tea cup, morning light patterns on floor). The space feels inhabited mid-moment. No people visible.",
};

function buildPrompt(styleSlug, room, round) {
  const dna = STYLE_DNA[styleSlug];
  const roomLabel = room.replace(/-/g, " ");
  return [
    `Photorealistic interior photograph of a ${roomLabel}.`,
    dna.prestige,
    dna.palette + ".",
    `Key ${roomLabel} elements: ${ROOM_OBJECTS[room]}.`,
    dna.signature + ".",
    dna.lighting + ".",
    ROUND_FRAMING[round],
    QUALITY_SUFFIX,
  ].join(" ");
}

function getFilename(styleSlug, room, round) {
  return `phase-a-${styleSlug}-${room}-r${round}.webp`;
}

async function fileExistsInStorage(filename) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(STORAGE_PATH, { search: filename });
  return data && data.some((f) => f.name === filename);
}

async function generateAndUpload(styleSlug, room, round) {
  const filename = getFilename(styleSlug, room, round);
  const storagePath = `${STORAGE_PATH}/${filename}`;

  // Skip if exists
  const exists = await fileExistsInStorage(filename);
  if (exists) {
    console.log(`  SKIP  ${filename} (already exists)`);
    return { status: "skipped", filename };
  }

  const prompt = buildPrompt(styleSlug, room, round);
  console.log(`  GEN   ${filename}`);

  // Generate via Replicate
  const output = await replicate.run("black-forest-labs/flux-1.1-pro", {
    input: {
      prompt,
      width: 1024,
      height: 768,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      output_format: "webp",
      output_quality: 90,
    },
  });

  // Fetch image bytes
  const imageUrl = typeof output === "string" ? output : output?.url ? output.url().href : output[0];
  const imgResp = await fetch(imageUrl);
  const imageBuffer = Buffer.from(await imgResp.arrayBuffer());

  // Upload to Supabase
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, imageBuffer, {
      contentType: "image/webp",
      upsert: true,
    });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
  console.log(`  DONE  ${filename}`);
  return { status: "success", filename, url: publicUrl };
}

// ── Main ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const batchArg = args.find((a) => a.startsWith("--batch="))?.split("=")[1] ?? "round1";
const styleArg = args.find((a) => a.startsWith("--style="))?.split("=")[1];
const roomArg = args.find((a) => a.startsWith("--room="))?.split("=")[1];

const STYLES = Object.keys(STYLE_DNA);
const ROOMS = ["living-room", "bedroom", "dining-room", "kitchen", "bathroom", "home-office"];
const roundMap = { round1: [1], round2: [2], round3: [3], all: [1, 2, 3] };
const targetRounds = roundMap[batchArg] ?? [1];
const targetStyles = styleArg ? [styleArg] : STYLES;
const targetRooms = roomArg ? [roomArg] : ROOMS;

const jobs = [];
for (const round of targetRounds)
  for (const style of targetStyles)
    for (const room of targetRooms)
      jobs.push({ style, room, round });

console.log(`\nCOVA ANCHOR GENERATOR`);
console.log(`Batch: ${batchArg} | Jobs: ${jobs.length} | Dry run: ${dryRun}`);
console.log("=".repeat(60));

if (dryRun) {
  for (const { style, room, round } of jobs) {
    console.log(`\nFILE: ${getFilename(style, room, round)}`);
    console.log(`PROMPT: ${buildPrompt(style, room, round)}`);
  }
  process.exit(0);
}

// Run sequentially to avoid Replicate rate limits
// (parallel risks 429s — sequential is safer for a one-time batch)
let success = 0, skipped = 0, errors = 0;
for (const { style, room, round } of jobs) {
  try {
    const result = await generateAndUpload(style, room, round);
    if (result.status === "success") success++;
    else skipped++;
  } catch (e) {
    console.error(`  ERROR ${getFilename(style, room, round)}: ${e.message}`);
    errors++;
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log(`Done. Success: ${success}  Skipped: ${skipped}  Errors: ${errors}`);
