import Replicate from "replicate";
import type { StyleFingerprint } from "@/types/fingerprint";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function embedImage(imageUrl: string): Promise<number[]> {
  const output = (await replicate.run(
    "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
    {
      input: {
        inputs: imageUrl,
      },
    },
  )) as Array<{ embedding: number[] }> | { embedding: number[] };

  if (Array.isArray(output) && output.length > 0) {
    return output[0]!.embedding;
  }

  if (!Array.isArray(output) && output.embedding) {
    return output.embedding;
  }

  throw new Error("Unexpected CLIP embedding output format");
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have equal length");
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += (a[i] ?? 0) * (b[i] ?? 0);
    magnitudeA += (a[i] ?? 0) ** 2;
    magnitudeB += (b[i] ?? 0) ** 2;
  }

  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

// Maps fingerprint dimensions to style descriptor terms
// used to align with product style_tags. All dimensions are in [0, 1] with
// 0.5 as the neutral midpoint.
export function fingerprintToStyleTags(
  fingerprint: StyleFingerprint,
): string[] {
  const d = fingerprint.dimensions;
  const tags: string[] = [];

  if (d.lightPreference >= 0.5) tags.push("bright", "airy", "light");
  else tags.push("moody", "dark", "dramatic");

  if (d.density >= 0.5) tags.push("maximalist", "layered", "rich");
  else tags.push("minimal", "clean", "simple");

  if (d.colorTemperature >= 0.5)
    tags.push("warm", "amber", "wood", "terracotta");
  else tags.push("cool", "slate", "concrete", "grey");

  if (d.lineQuality >= 0.5) tags.push("organic", "curved", "natural", "rattan");
  else tags.push("geometric", "structured", "angular");

  if (d.era >= 0.5) tags.push("traditional", "heritage", "classic", "antique");
  else tags.push("modern", "contemporary", "minimal");

  if (d.texture >= 0.5) tags.push("textured", "tactile", "linen", "stone");
  else tags.push("smooth", "polished", "sleek", "lacquered");

  return tags;
}

export function computeFingerprintAlignment(
  productStyleTags: string[],
  fingerprintTags: string[],
): number {
  if (productStyleTags.length === 0 || fingerprintTags.length === 0) return 0.5;

  const productSet = new Set(productStyleTags.map((t) => t.toLowerCase()));
  const matches = fingerprintTags.filter((t) =>
    productSet.has(t.toLowerCase()),
  ).length;

  return Math.min(matches / fingerprintTags.length, 1);
}

export function computeBudgetFit(
  price: number,
  budgetRange: [number, number],
): number {
  const budgetCenter = (budgetRange[0] + budgetRange[1]) / 2;
  const budgetSpread = budgetRange[1] - budgetRange[0];
  if (budgetSpread === 0) return price === budgetCenter ? 1 : 0;
  return Math.max(0, 1 - Math.abs(price - budgetCenter) / budgetSpread);
}
