/**
 * generate-quiz-library.ts — Session B: build the 12-dim quiz image library.
 *
 * Phases (sequential):
 *   A) 9 anchor images           via flux-1.1-pro
 *   B) 12 base rooms             via flux-1.1-pro  (one per dimension)
 *   C) 60 comparison pairs       via flux-kontext-pro (5 pairs × 12 dims)
 *   D) Livability validation     inline in A/B/C — Claude Sonnet 1-5 score
 *   E) DB seed + verify          inline in A/B/C — Phase E re-checks counts
 *
 * Resume: scripts/quiz-generation-progress.json. Re-running skips completed
 * items by key.
 *
 * Retries: every Replicate call up to 3 times with 5s backoff. Livability
 * regen: 1 attempt with augmented prompt; if still <3 the pair is skipped
 * (anchors are kept regardless of livability so we always end with 9).
 *
 * Budget ceiling: $20 (per user). The script aborts and reports if the
 * estimated spend exceeds the ceiling.
 *
 * Run: cd apps/web && npx tsx scripts/generate-quiz-library.ts
 */

import { createClient } from "@supabase/supabase-js";
import Replicate from "replicate";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, "..", ".env.local") });
config({ path: path.join(__dirname, "..", "..", "..", ".env.local") });

// ── Config ────────────────────────────────────────────────────────────────────

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!REPLICATE_API_TOKEN) throw new Error("REPLICATE_API_TOKEN not set");
if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL not set");
if (!SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PROGRESS_PATH = path.join(__dirname, "quiz-generation-progress.json");
const REPORT_PATH = path.join(__dirname, "quiz-library-report.md");

// Per-image cost estimates (USD). Used for the budget gate only.
const COST_FLUX_PRO = 0.055;
const COST_FLUX_KONTEXT = 0.055;
const COST_LIVABILITY = 0.001;
const BUDGET_CEILING_USD = 20;

// Replicate model IDs
const FLUX_PRO = "black-forest-labs/flux-1.1-pro";
const FLUX_KONTEXT = "black-forest-labs/flux-kontext-pro";

// ── Logging ───────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log(`[${ts()}]`, ...args);
}
function warn(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.warn(`[${ts()}] WARN`, ...args);
}
function err(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.error(`[${ts()}] ERROR`, ...args);
}

// ── Progress / resume ─────────────────────────────────────────────────────────

interface Progress {
  anchors: Record<
    string,
    { url: string; storage_path: string; livability: number | null }
  >;
  baseRooms: Record<
    string,
    { url: string; storage_path: string; livability: number | null }
  >;
  pairs: Record<
    string,
    {
      a_url: string;
      a_path: string;
      a_livability: number | null;
      b_url: string;
      b_path: string;
      b_livability: number | null;
      is_validated: boolean;
    }
  >;
  rejected: Array<{ kind: string; key: string; reason: string }>;
  spend: {
    flux_pro_calls: number;
    flux_kontext_calls: number;
    livability_calls: number;
  };
}

function loadProgress(): Progress {
  if (fs.existsSync(PROGRESS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_PATH, "utf-8")) as Progress;
    } catch (e) {
      warn("progress file corrupted, starting fresh:", (e as Error).message);
    }
  }
  return {
    anchors: {},
    baseRooms: {},
    pairs: {},
    rejected: [],
    spend: { flux_pro_calls: 0, flux_kontext_calls: 0, livability_calls: 0 },
  };
}

function saveProgress(p: Progress) {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(p, null, 2));
}

function estimatedSpend(p: Progress): number {
  return (
    p.spend.flux_pro_calls * COST_FLUX_PRO +
    p.spend.flux_kontext_calls * COST_FLUX_KONTEXT +
    p.spend.livability_calls * COST_LIVABILITY
  );
}

function checkBudget(p: Progress) {
  const spend = estimatedSpend(p);
  if (spend > BUDGET_CEILING_USD) {
    err(
      `BUDGET EXCEEDED: estimated $${spend.toFixed(2)} > ceiling $${BUDGET_CEILING_USD}`,
    );
    err("Halting per user instruction. Re-run after review.");
    process.exit(2);
  }
}

// ── Replicate helpers ─────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Run any replicate model with retry. Returns the output URL string. */
async function runReplicate(
  model: string,
  input: Record<string, unknown>,
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const output = await replicate.run(model as `${string}/${string}`, {
        input,
      });
      // Replicate SDK returns string | string[] | FileOutput | FileOutput[]
      const url = extractUrl(output);
      if (!url) throw new Error("Replicate returned no URL");
      return url;
    } catch (e) {
      lastErr = e;
      warn(
        `Replicate ${model} attempt ${attempt}/3 failed:`,
        (e as Error).message,
      );
      if (attempt < 3) await sleep(5000);
    }
  }
  throw new Error(
    `Replicate ${model} failed after 3 attempts: ${(lastErr as Error)?.message}`,
  );
}

function extractUrl(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    if (output.length === 0) return null;
    return extractUrl(output[0]);
  }
  if (output && typeof output === "object") {
    const o = output as { url?: () => unknown; href?: string };
    if (typeof o.url === "function") {
      const u = o.url();
      if (typeof u === "string") return u;
      if (u && typeof u === "object" && "href" in (u as object))
        return String((u as { href: string }).href);
    }
    if (typeof o.href === "string") return o.href;
  }
  return null;
}

// ── Livability check ──────────────────────────────────────────────────────────

const LIVABILITY_PROMPT =
  "Rate this room image on a scale of 1 to 5. Criteria: would a typical adult " +
  "feel comfortable and happy living in this room day-to-day? Consider: Is it " +
  "a realistic, well-designed space? Does it look like a real home (not a CGI " +
  "error or an extreme that no one would want)? Is there something genuinely " +
  "appealing about it even if it's not your personal taste? Return ONLY a " +
  "single integer between 1 and 5. Nothing else. No explanation.";

async function checkLivability(
  imageUrl: string,
  progress: Progress,
): Promise<number> {
  progress.spend.livability_calls += 1;
  saveProgress(progress);
  try {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 16,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: imageUrl } },
            { type: "text", text: LIVABILITY_PROMPT },
          ],
        },
      ],
    });
    const text =
      resp.content[0]?.type === "text" ? resp.content[0].text.trim() : "";
    const m = text.match(/[1-5]/);
    if (!m) {
      warn(`livability: unparseable response "${text}", defaulting to 3`);
      return 3;
    }
    return parseInt(m[0], 10);
  } catch (e) {
    warn(`livability check failed for ${imageUrl}:`, (e as Error).message);
    return 3; // optimistic — don't block on Claude flakes
  }
}

// ── Storage helpers ───────────────────────────────────────────────────────────

async function downloadBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

async function uploadToBucket(
  bytes: Uint8Array,
  storagePath: string,
  contentType: string,
): Promise<string> {
  const { error } = await admin.storage
    .from("quiz-images")
    .upload(storagePath, bytes, { contentType, upsert: true });
  if (error) throw new Error(`storage upload ${storagePath}: ${error.message}`);
  const { data } = admin.storage.from("quiz-images").getPublicUrl(storagePath);
  return data.publicUrl;
}

// ── Dimensions ────────────────────────────────────────────────────────────────

const DIMENSIONS = [
  "colorTemperature",
  "colorSaturation",
  "density",
  "formality",
  "era",
  "material",
  "texture",
  "pattern",
  "lineQuality",
  "lightPreference",
  "nature",
  "culturalInfluence",
] as const;
type DimKey = (typeof DIMENSIONS)[number];

const NEUTRAL_VEC: Record<DimKey, number> = Object.fromEntries(
  DIMENSIONS.map((d) => [d, 0.5]),
) as Record<DimKey, number>;

function vecWith(target: DimKey, value: number): Record<DimKey, number> {
  return { ...NEUTRAL_VEC, [target]: value };
}

// ── Phase A — anchors ─────────────────────────────────────────────────────────

interface AnchorSpec {
  index: number;
  styleName: string;
  styleVector: number[];
  prompt: string;
  dominantColors: string[];
}

const ANCHOR_BASE_SUFFIX =
  " Wide angle lens, eye level, architectural magazine editorial. Sharp focus.";

const ANCHORS: AnchorSpec[] = [
  {
    index: 1,
    styleName: "Warm Japandi",
    styleVector: [
      0.8, 0.25, 0.3, 0.4, 0.45, 0.85, 0.55, 0.1, 0.75, 0.65, 0.6, 0.25,
    ],
    dominantColors: [
      "honey oak",
      "cream",
      "warm sand",
      "dried pampas",
      "amber",
    ],
    prompt:
      "Photorealistic interior photograph of a living room. Honey oak hardwood floors with visible wood grain. " +
      "Cream boucle sofa with natural linen throw. Single washi paper pendant lamp casting warm amber glow. " +
      "Raw clay ceramic vase with dried pampas grass. Warm sand-toned walls. Wide angle lens, eye level, " +
      "afternoon window light, architectural magazine editorial. Sharp focus.",
  },
  {
    index: 2,
    styleName: "Dark Moody Glam",
    styleVector: [
      0.25, 0.8, 0.65, 0.85, 0.35, 0.25, 0.8, 0.55, 0.2, 0.1, 0.05, 0.3,
    ],
    dominantColors: [
      "charcoal plum",
      "emerald velvet",
      "brass",
      "marble",
      "dark herringbone",
    ],
    prompt:
      "Photorealistic interior photograph of a living room. Deep charcoal-plum painted walls. Emerald velvet " +
      "tufted sofa with brass nail-head trim. Brass and black chandelier. Marble-topped side table. Dark " +
      "herringbone wood floor. Rich jewel-toned environment, dramatically lit with warm candlelight and table " +
      "lamps. Wide angle lens, eye level, moody cinematic lighting, architectural magazine editorial. Sharp focus.",
  },
  {
    index: 3,
    styleName: "Coastal Bright",
    styleVector: [
      0.5, 0.2, 0.35, 0.25, 0.4, 0.7, 0.3, 0.2, 0.6, 0.95, 0.75, 0.2,
    ],
    dominantColors: [
      "white-washed",
      "rattan",
      "sheer linen",
      "pale blue-green",
      "jute",
    ],
    prompt:
      "Photorealistic interior photograph of a living room. Bleached white-washed walls. Natural rattan sofa with " +
      "white cotton cushions. Sheer linen curtains filtering bright sunlight. Pale blue-green ceramic table lamp. " +
      "Jute area rug on whitewash wood floor. Ocean blue accent pillow. Flooded with natural daylight. Wide angle " +
      "lens, eye level, bright coastal morning light, architectural magazine editorial. Sharp focus.",
  },
  {
    index: 4,
    styleName: "Industrial Loft",
    styleVector: [
      0.15, 0.3, 0.55, 0.5, 0.3, 0.05, 0.45, 0.05, 0.05, 0.5, 0.05, 0.15,
    ],
    dominantColors: [
      "concrete",
      "brick",
      "matte black steel",
      "aged leather",
      "edison bulb",
    ],
    prompt:
      "Photorealistic interior photograph of a living room. Raw exposed concrete ceiling and one brick wall. " +
      "Matte black steel shelving unit with industrial pipe brackets. Worn dark brown leather Chesterfield sofa. " +
      "Edison bulb pendant lights on black cable. Polished concrete floor. No soft textiles. Purely functional, " +
      "masculine, urban. Wide angle lens, eye level, mixed tungsten and daylight, architectural magazine editorial. " +
      "Sharp focus.",
  },
  {
    index: 5,
    styleName: "Maximalist Eclectic",
    styleVector: [
      0.6, 0.9, 0.95, 0.3, 0.5, 0.6, 0.85, 0.95, 0.7, 0.6, 0.65, 0.9,
    ],
    dominantColors: [
      "gallery wall",
      "red velvet",
      "mustard",
      "kilim",
      "macrame",
      "brass",
    ],
    prompt:
      "Photorealistic interior photograph of a living room. Gallery wall of mismatched art frames in bold colors. " +
      "Two different-pattern sofas: one deep red velvet, one mustard yellow. Layered kilim and Persian rugs " +
      "overlapping. Hanging macrame and trailing pothos plants. Moroccan-style lantern, brass floor lamp, neon " +
      "sign. Visually dense, every surface has objects. Wide angle lens, eye level, warm layered lighting, " +
      "architectural magazine editorial. Sharp focus.",
  },
  {
    index: 6,
    styleName: "Heritage Traditional",
    styleVector: [
      0.55, 0.45, 0.7, 0.95, 0.95, 0.8, 0.8, 0.85, 0.25, 0.45, 0.2, 0.35,
    ],
    dominantColors: [
      "mahogany",
      "burgundy leather",
      "persian rug",
      "stone fireplace",
      "brass",
    ],
    prompt:
      "Photorealistic interior photograph of a living room. Dark mahogany wood-paneled walls. Tufted burgundy " +
      "leather Chesterfield sofa. Intricate Persian area rug in deep reds and navy. Stone fireplace with ornate " +
      "carved mantel. Crown moulding, wainscoting. Brass table lamp with green shade. Stacked leather-bound books. " +
      "Old money English library aesthetic. Wide angle lens, eye level, warm lamp and firelight, architectural " +
      "magazine editorial. Sharp focus.",
  },
  {
    index: 7,
    styleName: "Pure Minimal White",
    styleVector: [
      0.3, 0.05, 0.05, 0.55, 0.1, 0.2, 0.05, 0.0, 0.1, 0.9, 0.15, 0.1,
    ],
    dominantColors: ["white", "concrete", "fiddle leaf"],
    prompt:
      "Photorealistic interior photograph of a living room. Absolute white walls, white ceiling, white concrete " +
      "floor. Single low-profile white sofa. One small fiddle leaf fig in a white planter. Empty floating white " +
      "shelf. Nothing on surfaces. Complete architectural calm, zero clutter. Shot on a 24mm wide angle lens, " +
      "eye level, flooded with pure white daylight from full-height windows. Architectural magazine editorial. " +
      "Sharp focus.",
  },
  {
    index: 8,
    styleName: "Biophilic Jungle",
    styleVector: [
      0.65, 0.55, 0.75, 0.2, 0.25, 0.95, 0.7, 0.3, 0.8, 0.7, 1.0, 0.5,
    ],
    dominantColors: [
      "monstera green",
      "living moss",
      "natural stone",
      "rattan",
      "wood beams",
    ],
    prompt:
      "Photorealistic interior photograph of a living room that is entirely overtaken by plants. Floor-to-ceiling " +
      "monstera, philodendron, ferns, and trailing pothos. Living moss accent wall. Natural stone floor. Woven " +
      "rattan sofa. Wood ceiling with exposed beams. The room feels like a tropical greenhouse. Dappled green " +
      "light filtering through foliage. Wide angle lens, eye level, natural diffused light, architectural " +
      "magazine editorial. Sharp focus.",
  },
  {
    index: 9,
    styleName: "Retro Mid-Century",
    styleVector: [
      0.7, 0.65, 0.45, 0.6, 0.75, 0.65, 0.4, 0.7, 0.35, 0.65, 0.35, 0.3,
    ],
    dominantColors: [
      "avocado green",
      "burnt orange",
      "walnut",
      "cognac leather",
      "mustard",
    ],
    prompt:
      "Photorealistic interior photograph of a living room. Avocado green and burnt orange color palette. Walnut " +
      "wood credenza with tapered legs. Eames-style lounge chair in cognac leather. Sunburst wall clock. " +
      "Geometric patterned wallpaper in mustard and brown. Shag rug. Arc floor lamp with white dome shade. " +
      "Distinctly 1960s-1970s American aesthetic. Wide angle lens, eye level, warm tungsten lighting, " +
      "architectural magazine editorial. Sharp focus.",
  },
];

async function generateAnchor(spec: AnchorSpec, progress: Progress) {
  const key = `${spec.index}-${spec.styleName}`;
  if (progress.anchors[key]) {
    log(`[A] anchor ${key} already done — skipping`);
    return;
  }

  log(`[A] generating anchor ${spec.index}: ${spec.styleName}`);

  // First attempt
  let attemptPrompt = spec.prompt;
  let livability = 0;
  let replicateUrl = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    progress.spend.flux_pro_calls += 1;
    saveProgress(progress);
    checkBudget(progress);

    replicateUrl = await runReplicate(FLUX_PRO, {
      prompt: attemptPrompt,
      aspect_ratio: "1:1",
      output_format: "webp",
      safety_tolerance: 2,
    });
    livability = await checkLivability(replicateUrl, progress);
    log(`[A]   attempt ${attempt}: livability=${livability}`);
    if (livability >= 3) break;
    attemptPrompt =
      spec.prompt + " photorealistic, lived-in, professionally designed";
    warn(
      `[A]   anchor ${key} livability=${livability}, regenerating with augmented prompt`,
    );
  }

  // Anchors are kept regardless — we always need 9. Log if low.
  if (livability < 3) {
    warn(`[A] anchor ${key} kept with low livability=${livability}`);
  }

  // Download + upload
  const bytes = await downloadBytes(replicateUrl);
  const storagePath = `anchors/${spec.index}-${slug(spec.styleName)}.webp`;
  const publicUrl = await uploadToBucket(bytes, storagePath, "image/webp");

  // Insert DB row (idempotent — delete-then-insert by style_index)
  await admin.from("quiz_anchor_images").delete().eq("style_index", spec.index);
  const { error: insErr } = await admin.from("quiz_anchor_images").insert({
    style_name: spec.styleName,
    style_index: spec.index,
    image_url: publicUrl,
    storage_path: storagePath,
    style_vector: vecArrayToObject(spec.styleVector),
    dominant_colors: spec.dominantColors,
    flux_prompt: spec.prompt,
    livability_score: livability,
  });
  if (insErr) throw new Error(`anchor insert: ${insErr.message}`);

  progress.anchors[key] = {
    url: publicUrl,
    storage_path: storagePath,
    livability,
  };
  saveProgress(progress);
  log(`[A] ✓ anchor ${key} → ${publicUrl}`);
}

function vecArrayToObject(vec: number[]): Record<DimKey, number> {
  const out = {} as Record<DimKey, number>;
  DIMENSIONS.forEach((d, i) => {
    out[d] = vec[i] ?? 0.5;
  });
  return out;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Phase B — base rooms ──────────────────────────────────────────────────────

interface BaseRoomSpec {
  dimIndex: number;
  dimName: DimKey;
  prompt: string;
}

const BASE_ROOMS: BaseRoomSpec[] = [
  {
    dimIndex: 0,
    dimName: "colorTemperature",
    prompt:
      "Photorealistic interior photograph of a living room. Greige walls (warm gray-beige, neither warm nor cool). Medium oak floor. Gray linen sofa. Neutral cream cotton cushions. Simple brushed nickel floor lamp. No strong color temperature bias. Wide angle lens, eye level, balanced natural daylight, architectural magazine editorial. Sharp focus.",
  },
  {
    dimIndex: 1,
    dimName: "colorSaturation",
    prompt:
      "Photorealistic interior photograph of a living room. Medium-toned walls with moderate color saturation, dusty sage green. Warm oak floor. Linen sofa in muted terracotta. No bold colors, no pure whites. Naturally saturated, not vivid, not washed out. Wide angle lens, eye level, soft afternoon light, architectural magazine editorial. Sharp focus.",
  },
  {
    dimIndex: 2,
    dimName: "density",
    prompt:
      "Photorealistic interior photograph of a living room. Comfortably furnished — sofa, coffee table, side table, floor lamp, two throw pillows, one plant, one small piece of wall art. Neither sparse nor crowded. Medium density. Wide angle lens, eye level, afternoon daylight, architectural magazine editorial. Sharp focus.",
  },
  {
    dimIndex: 3,
    dimName: "formality",
    prompt:
      "Photorealistic interior photograph of a living room. Semi-formal setting. Clean lines but approachable. Structured sofa with neat cushions. Coffee table with books and a candle. Neither stiff and museum-like nor casual and messy. Wide angle lens, eye level, balanced natural light, architectural magazine editorial. Sharp focus.",
  },
  {
    dimIndex: 4,
    dimName: "era",
    prompt:
      "Photorealistic interior photograph of a living room. Transitional style — elements from multiple eras combined. Neither distinctly contemporary nor vintage. Clean furniture with some traditional moulding details. Wide angle lens, eye level, afternoon daylight, architectural magazine editorial. Sharp focus.",
  },
  {
    dimIndex: 5,
    dimName: "material",
    prompt:
      "Photorealistic interior photograph of a living room. Equal mix of natural and manufactured materials. Half wood and linen, half painted surfaces and metal fixtures. No strong bias toward organic or synthetic. Wide angle lens, eye level, natural daylight, architectural magazine editorial. Sharp focus.",
  },
  {
    dimIndex: 6,
    dimName: "texture",
    prompt:
      "Photorealistic interior photograph of a living room. Medium texture variety — smooth painted walls, medium-weave fabric sofa, simple area rug. Neither silky-smooth throughout nor heavily layered textures. Wide angle lens, eye level, afternoon daylight, architectural magazine editorial. Sharp focus.",
  },
  {
    dimIndex: 7,
    dimName: "pattern",
    prompt:
      "Photorealistic interior photograph of a living room. One subtle pattern element — a lightly textured area rug or a simple geometric throw pillow. Otherwise solid colors. Not pattern-free, not pattern-heavy. Wide angle lens, eye level, afternoon daylight, architectural magazine editorial. Sharp focus.",
  },
  {
    dimIndex: 8,
    dimName: "lineQuality",
    prompt:
      "Photorealistic interior photograph of a living room. Mix of straight and curved lines — structured rectangular sofa with round coffee table, square shelving with an arched mirror. Wide angle lens, eye level, afternoon daylight, architectural magazine editorial. Sharp focus.",
  },
  {
    dimIndex: 9,
    dimName: "lightPreference",
    prompt:
      "Photorealistic interior photograph of a living room. Medium brightness — bright enough to see everything clearly but not flooded with light. Late afternoon sun through one large window, creating soft shadows. Wide angle lens, eye level, architectural magazine editorial. Sharp focus.",
  },
  {
    dimIndex: 10,
    dimName: "nature",
    prompt:
      "Photorealistic interior photograph of a living room. Two or three plants in pots. One botanical print on the wall. Otherwise urban modern setting. Nature present but not dominant. Wide angle lens, eye level, afternoon daylight, architectural magazine editorial. Sharp focus.",
  },
  {
    dimIndex: 11,
    dimName: "culturalInfluence",
    prompt:
      "Photorealistic interior photograph of a living room. Primarily Western contemporary style with one or two subtle globally-influenced accent pieces — a Moroccan-style side table or a Japanese ceramic. Cultural influence present but not dominant. Wide angle lens, eye level, afternoon daylight, architectural magazine editorial. Sharp focus.",
  },
];

async function generateBaseRoom(spec: BaseRoomSpec, progress: Progress) {
  const key = `dim-${spec.dimIndex}-${spec.dimName}`;
  if (progress.baseRooms[key]) {
    log(`[B] base ${key} already done — skipping`);
    return;
  }

  log(`[B] generating base room ${spec.dimIndex}: ${spec.dimName}`);
  progress.spend.flux_pro_calls += 1;
  saveProgress(progress);
  checkBudget(progress);

  const replicateUrl = await runReplicate(FLUX_PRO, {
    prompt: spec.prompt,
    aspect_ratio: "1:1",
    output_format: "webp",
    safety_tolerance: 2,
  });
  const livability = await checkLivability(replicateUrl, progress);
  log(`[B]   ${key} livability=${livability}`);
  // Base rooms are kept regardless — they're inputs to Phase C, not user-visible.

  const bytes = await downloadBytes(replicateUrl);
  const storagePath = `base-rooms/dim-${spec.dimIndex}-${slug(spec.dimName)}.webp`;
  const publicUrl = await uploadToBucket(bytes, storagePath, "image/webp");

  progress.baseRooms[key] = {
    url: publicUrl,
    storage_path: storagePath,
    livability,
  };
  saveProgress(progress);
  log(`[B] ✓ base ${key} → ${publicUrl}`);
}

// ── Phase C — comparison pairs ────────────────────────────────────────────────

interface PairEditPrompts {
  a: string; // describes the "low end" (stop 2)
  b: string; // describes the "high end" (stop 4)
}

const PAIR_EDIT_PROMPTS: Record<DimKey, PairEditPrompts> = {
  colorTemperature: {
    a: "Change the room to have warm amber tones. Warm honey wood, terracotta accents, amber table lamp glow, warm cream walls. Keep all furniture positions and room layout identical.",
    b: "Change the room to have cool slate tones. Cool blue-gray walls, brushed steel fixtures, stone gray floor, cool white LED lighting. Keep all furniture positions and room layout identical.",
  },
  colorSaturation: {
    a: "Make the room's colors muted and desaturated. Pale dusty sage, greige, washed-out linen, faded terracotta. No bold or vivid colors. Keep all furniture positions and room layout identical.",
    b: "Make the room's colors bold and saturated. Deep cobalt blue sofa, rich emerald cushions, burnt orange rug. Vivid, confident color choices. Keep all furniture positions and room layout identical.",
  },
  density: {
    a: "Make the room sparse and minimal. Remove most objects. Keep only the sofa and one small plant. Large empty floor space. No items on surfaces. Keep room layout and walls identical.",
    b: "Make the room richly layered with objects. Add gallery wall, multiple plants, stacked books, objects on every surface, layered rugs, additional lighting. Keep room layout and walls identical.",
  },
  formality: {
    a: "Make the room feel casual and relaxed. Add a cozy throw blanket draped casually, a few books left open, comfortable worn-in fabrics, nothing perfectly arranged. Keep room layout and walls identical.",
    b: "Make the room formal and structured. Cushions perfectly placed, everything symmetrical, formal drapery with tiebacks, structured furniture arrangement, nothing casual. Keep room layout and walls identical.",
  },
  era: {
    a: "Transform the room to feel very contemporary and modern — 2020s aesthetic. Clean lines, matte black fixtures, concrete accents, minimal ornamentation. Keep room layout identical.",
    b: "Transform the room to feel vintage and heritage — 1900s-1940s aesthetic. Dark wood furniture, tufted upholstery, antique brass hardware, patterned wallpaper, Victorian moulding. Keep room layout identical.",
  },
  material: {
    a: "Replace all materials with natural organic materials. Raw linen, reclaimed wood, natural stone, rattan, jute, clay. No metal or plastic visible. Keep room layout and furniture positions identical.",
    b: "Replace all materials with manufactured modern materials. Polished steel, glass surfaces, lacquered panels, chrome fixtures, synthetic fabrics. No raw natural materials. Keep room layout and furniture positions identical.",
  },
  texture: {
    a: "Make the room's surfaces very smooth and sleek. Lacquered walls, polished floor, silk cushions, smooth leather. No rough or tactile textures. Keep room layout and furniture positions identical.",
    b: "Make the room richly textural. Rough plaster walls, chunky knit throw, shaggy rug, woven rattan, raw linen, textured wallpaper. Maximally tactile. Keep room layout and furniture positions identical.",
  },
  pattern: {
    a: "Remove all patterns. Make every surface a solid color. Plain walls, solid rug, plain cushions, no prints. Completely pattern-free. Keep room layout and furniture positions identical.",
    b: "Add patterns to every surface. Geometric wallpaper, patterned area rug, printed cushions, patterned throw. Pattern-rich without being chaotic. Keep room layout and furniture positions identical.",
  },
  lineQuality: {
    a: "Transform all furniture to have sharp geometric lines. Square sofa, rectangular coffee table, angular shelving, straight-edged everything. No curves anywhere. Keep room layout identical.",
    b: "Transform all furniture to have organic curved lines. Curved sofa, round coffee table, arched doorway, kidney-shaped rug, oval mirror. No sharp angles. Keep room layout identical.",
  },
  lightPreference: {
    a: "Make the room feel cozy and warmly lit by lamps only. No daylight. Multiple warm table lamps and floor lamps casting golden pools of light. Soft shadows, intimate atmosphere. Keep room layout identical.",
    b: "Make the room bright and flooded with daylight. Remove window coverings, full afternoon sun streaming in, evenly lit, no shadows, airy and light-filled. Keep room layout identical.",
  },
  nature: {
    a: "Remove all plants and natural references. Urban, city apartment feel. No greenery, no botanical elements, no natural materials visible. Keep room layout and furniture positions identical.",
    b: "Fill the room with plants and biophilic elements. Large monstera, trailing pothos, ferns in every corner, botanical prints, moss accent detail. Dense greenery. Keep room layout identical.",
  },
  culturalInfluence: {
    a: "Make the room feel purely Western contemporary — Scandinavian-American design. No cultural references beyond mainstream Western style. Keep room layout identical.",
    b: "Add rich global cultural influences — Japanese wabi-sabi ceramics, Moroccan zellige tiles on a feature wall, African kente textile throw, Indian brass objects. Globally eclectic. Keep room layout identical.",
  },
};

const PAIRS_PER_DIM = 5;

/** Slight prompt variation for repeated pairs within a dimension. */
function decoratePairPrompt(base: string, pairIndex: number): string {
  const decorators = [
    "",
    " Slight variation in styling.",
    " Alternate camera framing.",
    " Different time of day.",
    " Different accent palette.",
  ];
  return base + (decorators[pairIndex] ?? "");
}

async function generateOnePairImage(
  baseUrl: string,
  prompt: string,
  storagePath: string,
  progress: Progress,
): Promise<{ url: string; livability: number }> {
  let attemptPrompt = prompt;
  let livability = 0;
  let replicateUrl = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    progress.spend.flux_kontext_calls += 1;
    saveProgress(progress);
    checkBudget(progress);

    replicateUrl = await runReplicate(FLUX_KONTEXT, {
      input_image: baseUrl,
      prompt: attemptPrompt,
      output_format: "png",
      safety_tolerance: 2,
    });
    livability = await checkLivability(replicateUrl, progress);
    log(`    pair attempt ${attempt}: livability=${livability}`);
    if (livability >= 3) break;
    attemptPrompt =
      prompt +
      " Ensure this looks like a real, well-designed, comfortable living room a normal person would happily live in.";
    warn(`    livability=${livability}, regenerating with augmented prompt`);
  }

  const bytes = await downloadBytes(replicateUrl);
  const url = await uploadToBucket(bytes, storagePath, "image/png");
  return { url, livability };
}

async function generatePairsForDimension(
  spec: BaseRoomSpec,
  progress: Progress,
) {
  const baseKey = `dim-${spec.dimIndex}-${spec.dimName}`;
  const baseInfo = progress.baseRooms[baseKey];
  if (!baseInfo) {
    err(`[C] base room missing for ${baseKey} — cannot generate pairs`);
    return;
  }
  const baseUrl = baseInfo.url;

  const edits = PAIR_EDIT_PROMPTS[spec.dimName];

  for (let pairIndex = 0; pairIndex < PAIRS_PER_DIM; pairIndex++) {
    const pairKey = `dim-${spec.dimIndex}-${spec.dimName}-pair-${pairIndex}`;
    if (progress.pairs[pairKey]?.is_validated) {
      log(`[C] pair ${pairKey} already validated — skipping`);
      continue;
    }

    log(`[C] generating pair ${pairKey}`);

    const promptA = decoratePairPrompt(edits.a, pairIndex);
    const promptB = decoratePairPrompt(edits.b, pairIndex);
    const pathA = `pairs/dim-${spec.dimIndex}/${pairIndex}-a.png`;
    const pathB = `pairs/dim-${spec.dimIndex}/${pairIndex}-b.png`;

    let aResult: { url: string; livability: number };
    let bResult: { url: string; livability: number };
    try {
      aResult = await generateOnePairImage(baseUrl, promptA, pathA, progress);
      bResult = await generateOnePairImage(baseUrl, promptB, pathB, progress);
    } catch (e) {
      err(`[C] pair ${pairKey} failed: ${(e as Error).message}`);
      progress.rejected.push({
        kind: "pair",
        key: pairKey,
        reason: (e as Error).message,
      });
      saveProgress(progress);
      continue;
    }

    const isValidated = aResult.livability >= 3 && bResult.livability >= 3;
    if (!isValidated) {
      warn(
        `[C] pair ${pairKey} not validated (a=${aResult.livability}, b=${bResult.livability}) — recording but flagging`,
      );
      progress.rejected.push({
        kind: "pair",
        key: pairKey,
        reason: `livability_a=${aResult.livability}, livability_b=${bResult.livability}`,
      });
    }

    // Vector A: dim at 0.25; Vector B: dim at 0.75. All others at neutral 0.5.
    const vecA = vecWith(spec.dimName, 0.25);
    const vecB = vecWith(spec.dimName, 0.75);

    // Idempotent: delete any existing row for this (dimension, pair_index) first
    await admin
      .from("quiz_comparison_pairs")
      .delete()
      .eq("dimension", spec.dimName)
      .eq("pair_index", pairIndex);

    const { error: insErr } = await admin.from("quiz_comparison_pairs").insert({
      dimension: spec.dimName,
      dimension_index: spec.dimIndex,
      pair_index: pairIndex,
      image_a_url: aResult.url,
      image_a_storage_path: pathA,
      image_a_stop: 2,
      image_b_url: bResult.url,
      image_b_storage_path: pathB,
      image_b_stop: 4,
      image_a_vector: vecA,
      image_b_vector: vecB,
      base_room_url: baseUrl,
      flux_prompt_a: promptA,
      flux_prompt_b: promptB,
      livability_score_a: aResult.livability,
      livability_score_b: bResult.livability,
      is_validated: isValidated,
    });
    if (insErr) {
      err(`[C] pair ${pairKey} insert failed: ${insErr.message}`);
      progress.rejected.push({
        kind: "pair",
        key: pairKey,
        reason: `db_insert: ${insErr.message}`,
      });
      saveProgress(progress);
      continue;
    }

    progress.pairs[pairKey] = {
      a_url: aResult.url,
      a_path: pathA,
      a_livability: aResult.livability,
      b_url: bResult.url,
      b_path: pathB,
      b_livability: bResult.livability,
      is_validated: isValidated,
    };
    saveProgress(progress);
    log(`[C] ✓ pair ${pairKey} validated=${isValidated}`);
  }
}

// ── Phase E — verify + report ─────────────────────────────────────────────────

async function verify(progress: Progress) {
  log("[E] verifying acceptance criteria…");
  const issues: string[] = [];

  // 1. 9 anchors in DB
  const { count: anchorCount } = await admin
    .from("quiz_anchor_images")
    .select("*", { count: "exact", head: true });
  if ((anchorCount ?? 0) !== 9) {
    issues.push(`anchor count is ${anchorCount}, expected 9`);
  }

  // 2. Validated pairs per dimension
  const { data: pairs } = await admin
    .from("quiz_comparison_pairs")
    .select("dimension, is_validated");
  const totalPairs = pairs?.length ?? 0;
  const validatedPairs = pairs?.filter((p) => p.is_validated).length ?? 0;
  const perDim: Record<string, { total: number; validated: number }> = {};
  for (const dim of DIMENSIONS) perDim[dim] = { total: 0, validated: 0 };
  for (const p of pairs ?? []) {
    const d = p.dimension as string;
    if (!perDim[d]) perDim[d] = { total: 0, validated: 0 };
    perDim[d].total += 1;
    if (p.is_validated) perDim[d].validated += 1;
  }
  for (const dim of DIMENSIONS) {
    if (perDim[dim].validated < 3) {
      issues.push(
        `dimension '${dim}' has ${perDim[dim].validated} validated pairs (need ≥3)`,
      );
    }
  }

  // 3. Anchor URLs all return 200
  const { data: anchors } = await admin
    .from("quiz_anchor_images")
    .select("image_url, style_index");
  for (const a of anchors ?? []) {
    try {
      const r = await fetch(a.image_url as string, { method: "HEAD" });
      if (r.status !== 200)
        issues.push(`anchor ${a.style_index} URL HTTP ${r.status}`);
    } catch (e) {
      issues.push(
        `anchor ${a.style_index} fetch failed: ${(e as Error).message}`,
      );
    }
  }

  // 4. Sample query (simulate quiz API call)
  const { data: sample, error: sampleErr } = await admin
    .from("quiz_comparison_pairs")
    .select("*")
    .eq("dimension", "colorTemperature")
    .eq("is_validated", true)
    .limit(2);
  if (sampleErr) issues.push(`sample query failed: ${sampleErr.message}`);
  if (!sample || sample.length === 0)
    issues.push("sample query returned 0 rows");

  // Write report
  const spend = estimatedSpend(progress);
  const lines: string[] = [];
  lines.push("# Quiz Library Generation Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Counts");
  lines.push(`- Anchor images: **${anchorCount}** (target: 9)`);
  lines.push(`- Comparison pairs total: **${totalPairs}**`);
  lines.push(
    `- Comparison pairs validated: **${validatedPairs}** (target: ≥36 across 12 dims)`,
  );
  lines.push("");
  lines.push("## Per-dimension validated pair counts");
  for (const dim of DIMENSIONS) {
    const v = perDim[dim].validated;
    const t = perDim[dim].total;
    const flag = v >= 3 ? "✓" : "⚠";
    lines.push(`- ${flag} **${dim}**: ${v}/${t} validated`);
  }
  lines.push("");
  lines.push("## Replicate spend");
  lines.push(
    `- flux-1.1-pro calls:        ${progress.spend.flux_pro_calls}  ≈ $${(progress.spend.flux_pro_calls * COST_FLUX_PRO).toFixed(2)}`,
  );
  lines.push(
    `- flux-kontext-pro calls:    ${progress.spend.flux_kontext_calls}  ≈ $${(progress.spend.flux_kontext_calls * COST_FLUX_KONTEXT).toFixed(2)}`,
  );
  lines.push(
    `- Claude livability calls:   ${progress.spend.livability_calls}  ≈ $${(progress.spend.livability_calls * COST_LIVABILITY).toFixed(2)}`,
  );
  lines.push(
    `- **Total estimated spend:   $${spend.toFixed(2)}** (ceiling: $${BUDGET_CEILING_USD})`,
  );
  lines.push("");
  lines.push(`## Rejections (${progress.rejected.length})`);
  if (progress.rejected.length === 0) {
    lines.push("_None._");
  } else {
    for (const r of progress.rejected) {
      lines.push(`- [${r.kind}] ${r.key}: ${r.reason}`);
    }
  }
  lines.push("");
  lines.push(`## Issues found (${issues.length})`);
  if (issues.length === 0) {
    lines.push("_None — all acceptance criteria pass._");
  } else {
    for (const i of issues) lines.push(`- ⚠ ${i}`);
  }
  lines.push("");
  fs.writeFileSync(REPORT_PATH, lines.join("\n"));
  log(`[E] report → ${REPORT_PATH}`);

  if (issues.length > 0) {
    warn(`[E] ${issues.length} acceptance issue(s) — see report`);
  } else {
    log("[E] ✓ all acceptance criteria pass");
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const progress = loadProgress();
  log("starting quiz library generation");
  log(`progress file: ${PROGRESS_PATH}`);
  log(
    `current spend so far: $${estimatedSpend(progress).toFixed(2)} (ceiling $${BUDGET_CEILING_USD})`,
  );

  // Phase A
  log("=== Phase A — 9 anchor images ===");
  for (const spec of ANCHORS) {
    await generateAnchor(spec, progress);
  }

  // Phase B
  log("=== Phase B — 12 base rooms ===");
  for (const spec of BASE_ROOMS) {
    await generateBaseRoom(spec, progress);
  }

  // Phase C
  log("=== Phase C — 60 comparison pairs ===");
  for (const spec of BASE_ROOMS) {
    await generatePairsForDimension(spec, progress);
  }

  // Phase E (D is inline)
  log("=== Phase E — verify ===");
  await verify(progress);

  log(`done. final spend: $${estimatedSpend(progress).toFixed(2)}`);
}

main().catch((e) => {
  err("fatal:", e);
  if (e instanceof Error && e.stack) err(e.stack);
  process.exit(1);
});
