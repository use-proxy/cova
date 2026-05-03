#!/usr/bin/env node
/**
 * LoRA quality audit (2026-04-30)
 *
 * Generates pairs of images (with-LoRA vs prompt-only) for each of the 10
 * trained Cova style LoRAs, judges them via Claude Sonnet vision in
 * randomized A/B order, aggregates per-style verdicts, and writes a report.
 *
 * Run from apps/web so node can resolve @fal-ai/client and @anthropic-ai/sdk:
 *   cd apps/web && node ../../scripts/lora-audit/run.mjs
 *   cd apps/web && node ../../scripts/lora-audit/run.mjs --only japandi
 *   cd apps/web && node ../../scripts/lora-audit/run.mjs --resume
 */

import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = "/Users/daksh/Desktop/cova";
const OUT_DIR = `${ROOT}/cova-plan`;
const IMAGES_DIR = `${OUT_DIR}/lora-audit-images`;
const RAW_JSONL = `${OUT_DIR}/lora-audit-results.jsonl`;
const RAW_JSON = `${OUT_DIR}/lora-audit-raw.json`;
const COST_LOG = `${OUT_DIR}/lora-audit-cost.json`;

// Load env from apps/web/.env.local first, fall back to root .env.local.
for (const f of [`${ROOT}/apps/web/.env.local`, `${ROOT}/.env.local`]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

const FAL_KEY = process.env.FAL_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!FAL_KEY) { console.error("FAL_KEY missing"); process.exit(1); }
if (!ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY missing"); process.exit(1); }

// CLI args
const argv = process.argv.slice(2);
const ARG_ONLY = (() => {
  const i = argv.indexOf("--only");
  return i >= 0 ? argv[i + 1] : null;
})();
const RESUME = argv.includes("--resume");
const SMOKE = argv.includes("--smoke");

// 10 trained style LoRAs (mirrored from apps/web/lib/styles/lora-registry.ts).
const LORAS = {
  COVASCANDINAV: {
    quizStyle: "scandinavian",
    url: "https://v3b.fal.media/files/b/0a968d79/AB1tJAhP5ERC-mvpcMOMM_pytorch_lora_weights.safetensors",
    trigger: "cvscn",
    default_scale: 0.88,
  },
  COVAJAPANDI: {
    quizStyle: "japandi",
    url: "https://v3b.fal.media/files/b/0a968d9b/TbARCu6Zf_643uHs51Pkv_pytorch_lora_weights.safetensors",
    trigger: "cvwmn",
    default_scale: 0.88,
  },
  COVABIOPHILIC: {
    quizStyle: "organic-modern", // closest analog
    url: "https://v3b.fal.media/files/b/0a968dbb/GYaA_dQYrjs-PDpV0a4fd_pytorch_lora_weights.safetensors",
    trigger: "cvbio",
    default_scale: 0.92,
  },
  COVAMINIMAL: {
    quizStyle: "contemporary-minimalist",
    url: "https://v3b.fal.media/files/b/0a968e12/Yji4FJHHkUUw4URfsSDOc_pytorch_lora_weights.safetensors",
    trigger: "cvmin",
    default_scale: 0.95,
  },
  COVAMIDCENTURY: {
    quizStyle: "mid-century-modern",
    url: "https://v3b.fal.media/files/b/0a968e41/UEseNdIMoIb99kgJdii7k_pytorch_lora_weights.safetensors",
    trigger: "cvmcm",
    default_scale: 0.85,
  },
  COVACOASTAL: {
    quizStyle: "coastal",
    url: "https://v3b.fal.media/files/b/0a968e5b/NCxDRtxWaYmUxizoVuTlW_pytorch_lora_weights.safetensors",
    trigger: "cvcst",
    default_scale: 0.85,
  },
  COVABOHEMIAN: {
    quizStyle: "bohemian",
    url: "https://v3b.fal.media/files/b/0a968e7a/ywFfjfD3D9dDexPtA3ki8_pytorch_lora_weights.safetensors",
    trigger: "cvboh",
    default_scale: 0.78,
  },
  COVAINDUSTRIAL: {
    quizStyle: "industrial",
    url: "https://v3b.fal.media/files/b/0a968e98/_szQS8b6-cYx9_76iNDrx_pytorch_lora_weights.safetensors",
    trigger: "cvind",
    default_scale: 0.80,
  },
  COVAFARMHOUSE: {
    quizStyle: "modern-farmhouse",
    url: "https://v3b.fal.media/files/b/0a968eb2/gQJwXgd_ZtJGuUx9EES_P_pytorch_lora_weights.safetensors",
    trigger: "cvfrm",
    default_scale: 0.85,
  },
  COVAARTDECO: {
    quizStyle: "art-deco",
    url: "https://v3b.fal.media/files/b/0a968ecb/hzAWxKHrdtRCfrQhLMkrV_pytorch_lora_weights.safetensors",
    trigger: "cvdco",
    default_scale: 0.82,
  },
};

// Production utility LoRAs (style-neutral) — mirror redesign_pipeline.py L525-526.
const ADD_DETAILS = {
  url: "https://huggingface.co/Shakker-Labs/FLUX.1-dev-LoRA-add-details/resolve/main/FLUX-dev-lora-add_details.safetensors",
  scale: 0.55,
};
const REALISM = {
  url: "https://huggingface.co/XLabs-AI/flux-RealismLora/resolve/main/lora.safetensors",
  scale: 0.25,
};

// Display names for prompts. Style names appear in the test prompts (this is
// internal eval tooling, not user-facing — Hard Rule 8 only forbids strings
// shown to users).
const QUIZ_DISPLAY = {
  "scandinavian": "Scandinavian",
  "japandi": "Japandi",
  "mid-century-modern": "Mid-Century Modern",
  "modern-farmhouse": "Modern Farmhouse",
  "industrial": "Industrial",
  "contemporary-minimalist": "Contemporary Minimalist",
  "bohemian": "Bohemian",
  "coastal": "Coastal",
  "art-deco": "Art Deco",
  "organic-modern": "Organic Modern",
};

const TESTS = [
  { id: 1, room: "living room", time: "daytime", seed: 42 },
  { id: 2, room: "bedroom", time: "evening", seed: 100 },
  { id: 3, room: "kitchen", time: "daytime", seed: 200 },
];

// ---------- I/O helpers ----------
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
ensureDir(IMAGES_DIR);

async function downloadImage(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf-8").split("\n").filter(Boolean).map(JSON.parse);
}

function appendJsonl(p, obj) {
  fs.appendFileSync(p, JSON.stringify(obj) + "\n");
}

// ---------- fal client ----------
let _fal = null;
async function getFal() {
  if (!_fal) {
    const mod = await import("@fal-ai/client");
    mod.fal.config({ credentials: FAL_KEY });
    _fal = mod.fal;
  }
  return _fal;
}

async function fluxGenerate({ prompt, seed, loras }) {
  const fal = await getFal();
  const input = {
    prompt,
    image_size: "landscape_4_3",     // 1280x960
    num_inference_steps: 28,
    guidance_scale: 3.5,
    num_images: 1,
    enable_safety_checker: false,
    seed,
  };
  if (loras && loras.length > 0) {
    input.loras = loras.map(l => ({ path: l.url, scale: l.scale }));
  }
  const t0 = Date.now();
  const result = await fal.subscribe("fal-ai/flux-general", { input, logs: false });
  const url = result?.data?.images?.[0]?.url;
  if (!url) throw new Error(`no image returned: ${JSON.stringify(result?.data).slice(0, 200)}`);
  return { url, latencyMs: Date.now() - t0 };
}

// ---------- anthropic ----------
async function anthropicVisionPair(imgAUrl, imgBUrl, style, room) {
  const prompt = `Two images of a ${room} in ${style} interior design style.
Image A and Image B were generated with the same prompt; one used a trained
style LoRA, the other was prompt-only.

Compare them on:

STYLE_FIDELITY (0-10): how textbook-correct is each image for ${style}?
VISUAL_QUALITY (0-10): photorealism, lighting, composition.

Then pick STRONGER_OVERALL ("A", "B", or "tie") and give 1-2 sentences of
REASONING describing what differentiates them.

Respond with JSON only, no other text:
{"style_fidelity_a": <number>, "style_fidelity_b": <number>, "visual_quality_a": <number>, "visual_quality_b": <number>, "stronger_overall": "A"|"B"|"tie", "reasoning": "..."}`;

  const body = {
    model: "claude-sonnet-4-5",
    max_tokens: 800,
    temperature: 0,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Image A:" },
        { type: "image", source: { type: "url", url: imgAUrl } },
        { type: "text", text: "Image B:" },
        { type: "image", source: { type: "url", url: imgBUrl } },
        { type: "text", text: prompt },
      ],
    }],
  };

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`anthropic ${r.status}: ${txt.slice(0, 300)}`);
  }
  const json = await r.json();
  const text = (json.content || []).filter(b => b.type === "text").map(b => b.text).join("");

  // Extract JSON (may be wrapped in code fences).
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`no JSON in response: ${text.slice(0, 200)}`);
  return { judgment: JSON.parse(m[0]), usage: json.usage };
}

// ---------- main ----------
async function processStyle(loraKey, lora) {
  const styleName = QUIZ_DISPLAY[lora.quizStyle];
  const styleSlug = lora.quizStyle;
  console.log(`\n[${loraKey}] quiz-style=${styleSlug} trigger=${lora.trigger} scale=${lora.default_scale}`);

  const results = [];
  for (const test of TESTS) {
    const basePrompt = `${test.room} in ${styleName} interior design style, well-lit, photorealistic, ${test.time}`;
    const triggerPrefix = `${lora.trigger} ${lora.trigger} ${lora.trigger}, `;
    const triggerSuffix = `, ${lora.trigger} ${lora.trigger}`;
    const promptWithLora = `${triggerPrefix}${basePrompt}${triggerSuffix}`;
    const promptOnly = basePrompt;

    const stack = [
      { url: lora.url, scale: lora.default_scale, name: loraKey },
      { url: ADD_DETAILS.url, scale: ADD_DETAILS.scale, name: "add-details" },
      { url: REALISM.url, scale: REALISM.scale, name: "realism" },
    ];

    const tag = `${styleSlug}_t${test.id}`;
    const loraPath = path.join(IMAGES_DIR, `${tag}_withLoRA.jpg`);
    const plainPath = path.join(IMAGES_DIR, `${tag}_promptOnly.jpg`);

    // Skip if both images exist and we're resuming.
    let loraUrl, plainUrl, latLora = 0, latPlain = 0;
    if (RESUME && fs.existsSync(loraPath) && fs.existsSync(plainPath)) {
      // Read prior URLs from JSONL (if any).
      const prior = readJsonl(RAW_JSONL).find(
        r => r.style === styleSlug && r.test_id === test.id && r.kind === "pair"
      );
      if (prior) {
        loraUrl = prior.lora_url;
        plainUrl = prior.plain_url;
        latLora = prior.latency_lora_ms || 0;
        latPlain = prior.latency_plain_ms || 0;
        console.log(`  test ${test.id} (${test.room}): RESUME (skipped generation)`);
      }
    }

    if (!loraUrl) {
      console.log(`  test ${test.id} (${test.room}): generating with-LoRA…`);
      try {
        const g = await fluxGenerate({ prompt: promptWithLora, seed: test.seed, loras: stack });
        loraUrl = g.url;
        latLora = g.latencyMs;
        await downloadImage(loraUrl, loraPath);
      } catch (e) {
        console.log(`    FAIL: ${e.message}`);
        appendJsonl(RAW_JSONL, {
          ts: new Date().toISOString(), style: styleSlug, test_id: test.id,
          kind: "error", phase: "gen-lora", error: e.message,
        });
        continue;
      }
    }

    if (!plainUrl) {
      console.log(`  test ${test.id} (${test.room}): generating prompt-only…`);
      try {
        const g = await fluxGenerate({ prompt: promptOnly, seed: test.seed, loras: [] });
        plainUrl = g.url;
        latPlain = g.latencyMs;
        await downloadImage(plainUrl, plainPath);
      } catch (e) {
        console.log(`    FAIL: ${e.message}`);
        appendJsonl(RAW_JSONL, {
          ts: new Date().toISOString(), style: styleSlug, test_id: test.id,
          kind: "error", phase: "gen-plain", error: e.message,
        });
        continue;
      }
    }

    // Randomize A/B order so Sonnet doesn't pattern-match position.
    const aIsLora = Math.random() < 0.5;
    const imgA = aIsLora ? loraUrl : plainUrl;
    const imgB = aIsLora ? plainUrl : loraUrl;

    console.log(`  test ${test.id}: judging (A=${aIsLora ? "LoRA" : "plain"})…`);
    let judgment, usage;
    try {
      const out = await anthropicVisionPair(imgA, imgB, styleName, test.room);
      judgment = out.judgment;
      usage = out.usage;
    } catch (e) {
      console.log(`    JUDGE FAIL: ${e.message}`);
      appendJsonl(RAW_JSONL, {
        ts: new Date().toISOString(), style: styleSlug, test_id: test.id,
        kind: "error", phase: "judge", error: e.message,
      });
      continue;
    }

    // Translate A/B back to lora/plain labels.
    const result = {
      ts: new Date().toISOString(),
      kind: "pair",
      style: styleSlug,
      lora_key: loraKey,
      trigger: lora.trigger,
      default_scale: lora.default_scale,
      test_id: test.id,
      room: test.room,
      time: test.time,
      seed: test.seed,
      lora_url: loraUrl,
      plain_url: plainUrl,
      lora_path: loraPath,
      plain_path: plainPath,
      latency_lora_ms: latLora,
      latency_plain_ms: latPlain,
      a_is_lora: aIsLora,
      style_fidelity_lora: aIsLora ? judgment.style_fidelity_a : judgment.style_fidelity_b,
      style_fidelity_plain: aIsLora ? judgment.style_fidelity_b : judgment.style_fidelity_a,
      visual_quality_lora: aIsLora ? judgment.visual_quality_a : judgment.visual_quality_b,
      visual_quality_plain: aIsLora ? judgment.visual_quality_b : judgment.visual_quality_a,
      lora_won: judgment.stronger_overall === "tie"
        ? "tie"
        : (aIsLora && judgment.stronger_overall === "A") || (!aIsLora && judgment.stronger_overall === "B"),
      reasoning: judgment.reasoning,
      raw_judgment: judgment,
      anthropic_usage: usage,
    };
    results.push(result);
    appendJsonl(RAW_JSONL, result);

    console.log(`    fidelity: LoRA=${result.style_fidelity_lora} vs plain=${result.style_fidelity_plain} | won=${result.lora_won} | "${result.reasoning.slice(0, 80)}…"`);
  }

  return results;
}

async function main() {
  const startTs = new Date().toISOString();
  const targets = ARG_ONLY
    ? Object.entries(LORAS).filter(([k, v]) => v.quizStyle === ARG_ONLY || k.toLowerCase() === ARG_ONLY.toLowerCase())
    : Object.entries(LORAS);

  if (targets.length === 0) {
    console.error(`no LoRAs match --only ${ARG_ONLY}. Valid quizStyles:`, Object.values(LORAS).map(l => l.quizStyle));
    process.exit(1);
  }

  console.log(`LoRA audit starting — ${targets.length} LoRA(s), ${TESTS.length * 2} generations each`);
  console.log(`Output dir: ${IMAGES_DIR}`);
  console.log(`Raw JSONL: ${RAW_JSONL}`);
  if (SMOKE) console.log("(SMOKE mode — first style only)");

  const all = [];
  let i = 0;
  for (const [loraKey, lora] of targets) {
    if (SMOKE && i >= 1) break;
    const out = await processStyle(loraKey, lora);
    all.push(...out);
    i++;
    if (i % 3 === 0) console.log(`\n=== progress: ${i}/${targets.length} styles done ===\n`);
  }

  // Aggregate per style
  const byStyle = {};
  for (const r of all) {
    if (!byStyle[r.style]) byStyle[r.style] = [];
    byStyle[r.style].push(r);
  }

  const summary = {};
  for (const [style, rows] of Object.entries(byStyle)) {
    const n = rows.length;
    const avg = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0) / n;
    const fidL = avg("style_fidelity_lora");
    const fidP = avg("style_fidelity_plain");
    const visL = avg("visual_quality_lora");
    const visP = avg("visual_quality_plain");
    const wins = rows.filter(r => r.lora_won === true).length;
    const ties = rows.filter(r => r.lora_won === "tie").length;
    const winRate = wins / n;
    const delta = fidL - fidP;

    let verdict;
    if (winRate < 0.33) verdict = "REGRESSION";
    else if (delta >= 1.5 && winRate >= 0.67) verdict = "USE";
    else if (delta < 0.5 && winRate < 0.5) verdict = "SKIP";
    else verdict = "MARGINAL";

    summary[style] = {
      n_pairs: n,
      avg_fidelity_lora: +fidL.toFixed(2),
      avg_fidelity_plain: +fidP.toFixed(2),
      delta_fidelity: +delta.toFixed(2),
      avg_visual_quality_lora: +visL.toFixed(2),
      avg_visual_quality_plain: +visP.toFixed(2),
      lora_wins: wins,
      ties,
      lora_win_rate: +winRate.toFixed(2),
      verdict,
    };
  }

  const finalReport = {
    started_at: startTs,
    completed_at: new Date().toISOString(),
    n_styles_evaluated: Object.keys(byStyle).length,
    n_pairs_total: all.length,
    summary,
    pairs: all,
  };

  fs.writeFileSync(RAW_JSON, JSON.stringify(finalReport, null, 2));
  console.log(`\nSummary written to ${RAW_JSON}`);
  console.table(summary);
}

main().catch(e => { console.error(e); process.exit(1); });
