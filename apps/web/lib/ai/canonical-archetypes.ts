/**
 * Canonical archetype names for v9 pipeline.
 *
 * Legacy COVA* keys map to forbidden names (Japandi, Bohemian, Coastal,
 * Mid-Century Modern, Minimalist, Scandinavian) which must NEVER reach
 * user-facing strings. This mapping enforces canonical names everywhere.
 */

export const CANONICAL_ARCHETYPE_MAP: Record<string, string> = {
  COVAJAPANDI: "Warm Japandi",
  COVASCANDINAV: "Pure Minimal White",
  COVABIOPHILIC: "Biophilic Jungle",
  COVAMINIMAL: "Pure Minimal White",
  COVAMIDCENTURY: "Retro Mid-Century",
  COVACOASTAL: "Coastal Bright",
  COVABOHEMIAN: "Maximalist Eclectic",
  COVAINDUSTRIAL: "Industrial Loft",
  COVAFARMHOUSE: "Heritage Traditional",
  COVAARTDECO: "Dark Moody Glam",
};

/**
 * Get canonical archetype name for a LoRA key.
 * Returns the key itself if not mapped (defensive default).
 */
export function getCanonicalArchetype(loraKey: string): string {
  return CANONICAL_ARCHETYPE_MAP[loraKey] ?? loraKey;
}

/**
 * The 9 canonical archetype names (v9 spec).
 * Use these for any user-facing string, prompt template, or UI label.
 */
export const CANONICAL_ARCHETYPES = [
  "Biophilic Jungle",
  "Coastal Bright",
  "Dark Moody Glam",
  "Heritage Traditional",
  "Industrial Loft",
  "Maximalist Eclectic",
  "Pure Minimal White",
  "Retro Mid-Century",
  "Warm Japandi",
] as const;

export type CanonicalArchetype = typeof CANONICAL_ARCHETYPES[number];
