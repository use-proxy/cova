/* eslint-disable @typescript-eslint/no-require-imports */
import { buildFluxPrompt } from "../lib/ai/flux";
import type { StyleFingerprint } from "../types/fingerprint";

const DIMENSION_ORDER = [
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

const ANCHORS: Array<{ name: string; center: number[] }> = [
  {
    name: "Warm Japandi",
    center: [0.8, 0.25, 0.3, 0.4, 0.45, 0.85, 0.55, 0.1, 0.75, 0.65, 0.6, 0.25],
  },
  {
    name: "Dark Moody Glam",
    center: [0.25, 0.8, 0.65, 0.85, 0.35, 0.25, 0.8, 0.55, 0.2, 0.1, 0.05, 0.3],
  },
  {
    name: "Coastal Bright",
    center: [0.5, 0.2, 0.35, 0.25, 0.4, 0.7, 0.3, 0.2, 0.6, 0.95, 0.75, 0.2],
  },
  {
    name: "Industrial Loft",
    center: [
      0.15, 0.3, 0.55, 0.5, 0.3, 0.05, 0.45, 0.05, 0.05, 0.5, 0.05, 0.15,
    ],
  },
  {
    name: "Maximalist Eclectic",
    center: [0.6, 0.9, 0.95, 0.3, 0.5, 0.6, 0.85, 0.95, 0.7, 0.6, 0.65, 0.9],
  },
  {
    name: "Heritage Traditional",
    center: [
      0.55, 0.45, 0.7, 0.95, 0.95, 0.8, 0.8, 0.85, 0.25, 0.45, 0.2, 0.35,
    ],
  },
  {
    name: "Pure Minimal White",
    center: [0.3, 0.05, 0.05, 0.55, 0.1, 0.2, 0.05, 0.0, 0.1, 0.9, 0.15, 0.1],
  },
  {
    name: "Biophilic Jungle",
    center: [0.65, 0.55, 0.75, 0.2, 0.25, 0.95, 0.7, 0.3, 0.8, 0.7, 1.0, 0.5],
  },
  {
    name: "Retro Mid-Century",
    center: [0.7, 0.65, 0.45, 0.6, 0.75, 0.65, 0.4, 0.7, 0.35, 0.65, 0.35, 0.3],
  },
];

function toFingerprint(vec: number[]): StyleFingerprint {
  const dims = {} as StyleFingerprint["dimensions"];
  DIMENSION_ORDER.forEach((k, i) => {
    (dims as unknown as Record<string, number>)[k] = vec[i] ?? 0.5;
  });
  return {
    dimensions: dims,
    covariance: Array.from({ length: 12 }, () =>
      Array(12).fill(0),
    ) as number[][],
    confidence: 0.8,
  };
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

let maxWords = 0;
let failures = 0;
for (const anchor of ANCHORS) {
  const fp = toFingerprint(anchor.center);
  const prompt = buildFluxPrompt({
    fingerprint: fp,
    roomType: "living_room",
    budgetTier: "mid",
    inclusions: [],
    constraints: [],
    keptItemLabels: [],
    roomAnalysis: null,
    quizPreviewMode: true,
  });
  const wc = wordCount(prompt);
  maxWords = Math.max(maxWords, wc);
  const under = wc <= 80;
  if (!under) failures++;
  console.log(
    `\n── ${anchor.name} ──  (${wc} words)  ${under ? "OK" : "OVER"}`,
  );
  console.log(prompt);
}

console.log(`\n────────────────`);
console.log(`Max words: ${maxWords}`);
console.log(`Failures (>80): ${failures} / ${ANCHORS.length}`);
process.exit(failures > 0 ? 1 : 0);
