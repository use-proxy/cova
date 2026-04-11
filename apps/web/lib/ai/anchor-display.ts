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
  'Warm Japandi':         'Warm Japandi',
  'Pure Minimal White':   'Pure Minimal',
  'Coastal Bright':       'Coastal Bright',
  'Biophilic Jungle':     'Biophilic',
  'Dark Moody Glam':      'Dark & Moody',
  'Heritage Traditional': 'Heritage',
  'Industrial Loft':      'Industrial',
  'Maximalist Eclectic':  'Maximalist',
  'Retro Mid-Century':    'Retro Modern',
}

/**
 * Translate an internal anchor name to a user-facing display label.
 * Falls through unchanged for any name that is not one of the 9 anchors
 * (e.g. the "Your Unique Style" placeholder).
 */
export function toDisplayName(styleName: string | null | undefined): string {
  if (!styleName) return ''
  return STYLE_DISPLAY_NAMES[styleName] ?? styleName
}
