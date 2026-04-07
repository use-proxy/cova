/**
 * StyleFingerprint — 10-dimensional style representation
 *
 * All dimension values are in the range [-1, 1].
 * Neutral band is [-0.3, 0.3] — values inside this range are considered
 * stylistically neutral and do not generate descriptor text in prompts.
 */
export interface StyleFingerprint {
  dimensions: {
    luminosity:     number  // [-1, 1]  dark/moody → bright/airy
    density:        number  // [-1, 1]  sparse/void → richly layered
    temperature:    number  // [-1, 1]  icy cool → warm amber
    form:           number  // [-1, 1]  hard geometric → organic curves
    era:            number  // [-1, 1]  ultra-modern → classic heritage
    texture:        number  // [-1, 1]  mirror-smooth → tactile richness
    scale:          number  // [-1, 1]  petite/delicate → oversized statement
    nature:         number  // [-1, 1]  synthetic/industrial → abundant natural
    saturation:     number  // [-1, 1]  achromatic/greige → rich saturated color
    materialOrigin: number  // [-1, 1]  precision-manufactured → artisanal craft
  }
  covariance: number[][]  // 10×10 covariance matrix
  confidence: number      // [0, 1] — how confident the system is in this fingerprint
}
