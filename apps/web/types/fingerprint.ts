/**
 * StyleFingerprint — 12-dimensional style representation
 *
 * All dimension values are in the range [0, 1].
 * Neutral midpoint is 0.5. Values within 0.2 of the midpoint
 * (i.e. 0.3 ≤ v ≤ 0.7) are considered stylistically neutral and do not
 * generate directional descriptor text in prompts.
 *
 * Migrated from the previous 10-dim [-1, 1] system on 2026-04-08.
 * The 12 dimensions correspond 1:1 (in this order) to the vectors used by
 * the quiz anchor library and quiz_anchor_images / quiz_comparison_pairs
 * tables. Do not reorder.
 */
export interface StyleFingerprint {
  dimensions: {
    colorTemperature:  number  // [0, 1]  cool slate → warm amber
    colorSaturation:   number  // [0, 1]  achromatic greige → vivid bold
    density:           number  // [0, 1]  sparse void → richly layered
    formality:         number  // [0, 1]  casual relaxed → formal structured
    era:               number  // [0, 1]  ultra-contemporary → heritage classic
    material:          number  // [0, 1]  synthetic manufactured → natural organic
    texture:           number  // [0, 1]  mirror-smooth → tactile rich
    pattern:           number  // [0, 1]  pattern-free → pattern-rich
    lineQuality:       number  // [0, 1]  hard geometric → organic curves
    lightPreference:   number  // [0, 1]  cozy warm lamps → bright daylight
    nature:            number  // [0, 1]  urban no plants → biophilic abundant
    culturalInfluence: number  // [0, 1]  pure western → globally eclectic
  }
  covariance: number[][]  // 12×12 covariance matrix
  confidence: number      // [0, 1] — how confident the system is in this fingerprint
}
