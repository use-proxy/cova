// Maps the 9 internal anchor names to user-facing display labels.
//
// CLAUDE.md hard rule #8 forbids the literal style names "Japandi",
// "Bohemian", "Coastal", "Mid-Century Modern", and "Minimalist" in any
// user-facing string. The internal anchor names — used as DB labels and
// inside server-side matching code — include three names that contain
// forbidden words ("Warm Japandi", "Coastal Bright", "Retro Mid-Century")
// and one borderline ("Pure Minimal White"). Every code path that surfaces
// a style label to the client must pass through `toDisplayName()` so the
// raw internal name never reaches the UI.
//
// The fingerprint route's response `style_name` field already carries the
// display name (mapped before save and before return) — so DB rows in
// `style_fingerprints.style_name` and store reads via
// `useFingerprintStore.styleName` are both safe.

export const STYLE_DISPLAY_NAMES: Record<string, string> = {
  "Warm Japandi": "Warm & Grounded",
  "Dark Moody Glam": "Dark & Moody",
  "Coastal Bright": "Bright & Airy",
  "Industrial Loft": "Urban Industrial",
  "Maximalist Eclectic": "Bold & Eclectic",
  "Heritage Traditional": "Classic Traditional",
  "Pure Minimal White": "Pure & Calm",
  "Biophilic Jungle": "Biophilic",
  "Retro Mid-Century": "Vintage Modern",
};

/**
 * Translate an internal anchor name to a user-facing display label.
 * Falls through unchanged for any name that is not one of the 9 anchors
 * (e.g. the "Your Unique Style" placeholder).
 */
export function toDisplayName(styleName: string | null | undefined): string {
  if (!styleName) return "";
  return STYLE_DISPLAY_NAMES[styleName] ?? styleName;
}

// COVA* archetype keys (used by quiz step-3b, fingerprint blending, LoRA
// registry) mapped to user-facing display labels. These labels intentionally
// avoid every canonical forbidden token (Japandi, Bohemian, Coastal,
// Mid-Century Modern, Minimalist, Scandinavian) so they can be rendered
// directly in the UI without routing through a second sanitizer.
export const COVA_KEY_DISPLAY_NAMES: Record<string, string> = {
  COVASCANDINAV: "Bright & Nordic",
  COVAJAPANDI: "Warm & Grounded",
  COVABIOPHILIC: "Biophilic",
  COVAMINIMAL: "Pure & Calm",
  COVAMIDCENTURY: "Vintage Modern",
  COVACOASTAL: "Bright & Airy",
  COVABOHEMIAN: "Layered & Collected",
  COVAINDUSTRIAL: "Urban Industrial",
  COVAFARMHOUSE: "Modern Farmhouse",
  COVAARTDECO: "Art Deco",
};

/**
 * Translate a COVA* archetype key to a user-facing display label. Falls
 * through unchanged for any key not in the map.
 */
export function toCovaKeyDisplayName(styleKey: string | null | undefined): string {
  if (!styleKey) return "";
  return COVA_KEY_DISPLAY_NAMES[styleKey] ?? styleKey;
}
