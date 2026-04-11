/**
 * Pure utility functions for the product match pipeline.
 * Extracted here so they can be imported and tested independently of the
 * Next.js route handler (which cannot export arbitrary names).
 */

import type { SerperProduct } from "@/lib/ai/serper";

// ── Scoring ───────────────────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    magA += (a[i] ?? 0) * (a[i] ?? 0);
    magB += (b[i] ?? 0) * (b[i] ?? 0);
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag === 0 ? 0 : dot / mag;
}

export function computeBudgetScore(
  price: number,
  range: [number, number],
): number {
  const [min, max] = range;
  const mid = (min + max) / 2;
  if (price < min) return 0.7 + 0.3 * (price / min); // under budget: 70-100%
  if (price > max) return Math.max(0, 1 - (price - max) / max); // over: falls to 0
  // Within range: peaks at midpoint
  const distFromMid = Math.abs(price - mid) / (max - min);
  return 1 - 0.3 * distFromMid;
}

export function getMatchLabel(
  score: number,
): "Perfect Match" | "Very Similar" | "Inspired By" {
  if (score >= 0.85) return "Perfect Match";
  if (score >= 0.75) return "Very Similar";
  return "Inspired By";
}

// ── Furniture filtering ───────────────────────────────────────────────────────

// Furniture retailer allowlist — keeps Serper/Lens results out of office-supply
// and electronics-accessory territory. Matched as substrings against retailer hostname.
export const FURNITURE_RETAILER_ALLOWLIST: string[] = [
  "wayfair",
  "westelm",
  "article",
  "crateandbarrel",
  "potterybarn",
  "ikea",
  "target",
  "cb2",
  "overstock",
  "homedepot",
  "bedbathandbeyond",
  "macys",
  "anthropologie",
  "restoration",
  "arhaus",
  "joybird",
  "burrow",
  "castlery",
  "amazon",
  "walmart",
  "costco",
  "zgallerie",
  "roomandboard",
  "livingspaces",
  "havertys",
  "ashley",
  "bob",
  "raymour",
  "ethan",
  "crate",
  "allmodern",
  "worldmarket",
  "lulu",
  "birchlane",
  "jossandmain",
  "nordstrom",
  "hayneedle",
  "mcgee",
  "serenaandlily",
];

export function isFurnitureRetailer(retailer: string): boolean {
  const host = retailer.toLowerCase().replace(/\s+/g, "");
  return FURNITURE_RETAILER_ALLOWLIST.some((r) => host.includes(r));
}

// Minimum price to eliminate paper, office supplies, electronics accessories
export const FURNITURE_PRICE_FLOOR = 30;

export function isFurnitureProduct(p: SerperProduct): boolean {
  if (p.price < FURNITURE_PRICE_FLOOR) return false;
  const retailerMatches = isFurnitureRetailer(p.retailer);
  let hostMatches = false;
  try {
    const host = new URL(p.productUrl).hostname
      .replace(/^www\./, "")
      .toLowerCase();
    hostMatches = FURNITURE_RETAILER_ALLOWLIST.some((r) => host.includes(r));
  } catch {
    hostMatches = false;
  }
  return retailerMatches || hostMatches;
}

// ── Category weights ──────────────────────────────────────────────────────────

// Category-aware final-score weights. Keys are substrings matched against
// attrs.category (lowercased); first substring hit wins, else "default".
export const CATEGORY_WEIGHTS: Record<
  string,
  {
    visual: number;
    budget: number;
    fit: number;
    quality: number;
  }
> = {
  furniture: { visual: 0.5, budget: 0.25, fit: 0.15, quality: 0.1 },
  sofa: { visual: 0.5, budget: 0.25, fit: 0.15, quality: 0.1 },
  chair: { visual: 0.5, budget: 0.25, fit: 0.15, quality: 0.1 },
  table: { visual: 0.5, budget: 0.25, fit: 0.1, quality: 0.15 },
  rug: { visual: 0.55, budget: 0.2, fit: 0.15, quality: 0.1 },
  lamp: { visual: 0.35, budget: 0.3, fit: 0.1, quality: 0.25 },
  lighting: { visual: 0.35, budget: 0.3, fit: 0.1, quality: 0.25 },
  art: { visual: 0.45, budget: 0.25, fit: 0.1, quality: 0.2 },
  plant: { visual: 0.4, budget: 0.3, fit: 0.05, quality: 0.25 },
  pillow: { visual: 0.55, budget: 0.25, fit: 0.05, quality: 0.15 },
  decor: { visual: 0.45, budget: 0.3, fit: 0.05, quality: 0.2 },
  default: { visual: 0.5, budget: 0.25, fit: 0.1, quality: 0.15 },
};

export function pickCategoryWeights(category: string): {
  visual: number;
  budget: number;
  fit: number;
  quality: number;
} {
  const cat = category.toLowerCase();
  for (const key of Object.keys(CATEGORY_WEIGHTS)) {
    if (key === "default") continue;
    if (cat.includes(key)) return CATEGORY_WEIGHTS[key]!;
  }
  return CATEGORY_WEIGHTS["default"]!;
}

// ── RRF merge ─────────────────────────────────────────────────────────────────

// Normalize a product title for fuzzy dedup: lowercase, strip punctuation,
// take first six words.
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");
}

// Classic DP Levenshtein for short normalized title strings.
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[m]![n]!;
}

// Reciprocal Rank Fusion: score(item) = sum over lists of 1/(k + rank).
// Primary key is productUrl; a second-pass normalized-title dedup with
// Levenshtein < 3 collapses near-duplicate listings across retailers.
export function rrfMerge(
  lists: SerperProduct[][],
  k = 60,
): Array<SerperProduct & { rrfScore: number }> {
  const byUrl = new Map<string, { product: SerperProduct; score: number }>();
  for (const list of lists) {
    list.forEach((product, idx) => {
      if (!product.productUrl) return;
      const contribution = 1 / (k + (idx + 1));
      const existing = byUrl.get(product.productUrl);
      if (existing) {
        existing.score += contribution;
      } else {
        byUrl.set(product.productUrl, { product, score: contribution });
      }
    });
  }

  const urlMerged = Array.from(byUrl.values())
    .map(({ product, score }) => ({ ...product, rrfScore: score }))
    .sort((a, b) => b.rrfScore - a.rrfScore);

  // Secondary: normalized-title fuzzy dedup (keep highest RRF score)
  const accepted: Array<
    SerperProduct & { rrfScore: number; _normTitle: string }
  > = [];
  for (const cand of urlMerged) {
    const norm = normalizeTitle(cand.title);
    if (!norm) {
      accepted.push({ ...cand, _normTitle: norm });
      continue;
    }
    const dup = accepted.find(
      (a) => a._normTitle && levenshtein(a._normTitle, norm) < 3,
    );
    if (!dup) {
      accepted.push({ ...cand, _normTitle: norm });
    }
  }
  return accepted.map(({ _normTitle, ...rest }) => {
    void _normTitle;
    return rest;
  });
}
