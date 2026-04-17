/**
 * StyleFingerprint — style representation
 *
 * All dimension values are in the range [0, 1].
 * Neutral midpoint is 0.5. Values within 0.2 of the midpoint
 * (i.e. 0.3 ≤ v ≤ 0.7) are considered stylistically neutral and do not
 * generate directional descriptor text in prompts.
 *
 * V2 (2026-04-12): Collapsed from 12 dims to 6 merged dims for better
 * quiz signal-to-noise. The interface still uses the original 12 field names
 * for DB compatibility. In V2, slots 7-12 (texture through culturalInfluence)
 * are set to 0.5 (neutral) and should be ignored.
 *
 * V2 dimension mapping (stored in existing field names):
 *   colorTemperature → warmth         (0.6*colorTemp + 0.4*lightPref)
 *   colorSaturation  → visual_complexity (0.5*colorSat + 0.5*pattern)
 *   density          → density        (unchanged)
 *   formality        → organicness    (0.4*material + 0.3*texture + 0.3*nature)
 *   era              → traditionalism (0.5*formality + 0.5*era)
 *   material         → character      (0.6*lineQuality + 0.4*culturalInfluence)
 *   texture-culturalInfluence → 0.5 (unused in V2)
 */
export interface StyleFingerprint {
  dimensions: {
    colorTemperature: number; // V1: cool→warm | V2: warmth
    colorSaturation: number; // V1: muted→bold | V2: visual_complexity
    density: number; // [0, 1]  sparse → layered (same in V1/V2)
    formality: number; // V1: casual→formal | V2: organicness
    era: number; // V1: modern→heritage | V2: traditionalism
    material: number; // V1: manufactured→natural | V2: character
    texture: number; // V2: 0.5 (unused)
    pattern: number; // V2: 0.5 (unused)
    lineQuality: number; // V2: 0.5 (unused)
    lightPreference: number; // V2: 0.5 (unused)
    nature: number; // V2: 0.5 (unused)
    culturalInfluence: number; // V2: 0.5 (unused)
  };
  covariance: number[][]; // V1: 12×12 | V2: 6×6
  confidence: number; // [0, 1]
  fingerprint_version?: "v1" | "v2";
}

// ── V3 Fingerprint ────────────────────────────────────────────────────────────
// V3 (2026-04-16): New 12-dim system with renamed dimensions for the 10-style
// quiz. Uses DIMENSION_ORDER from style-archetypes.ts. Stored as JSONB in DB
// with fingerprint_version: "v3".

import type { DimensionName } from '@/lib/quiz/style-archetypes';

export interface StyleFingerprintV3 {
  dimensions: Record<DimensionName, number>;
  covariance: number[][]; // 12×12
  confidence: number;
  fingerprint_version: "v3";
}

export type AnyFingerprint = StyleFingerprint | StyleFingerprintV3;

export function isFingerprintV3(fp: AnyFingerprint): fp is StyleFingerprintV3 {
  return fp.fingerprint_version === "v3";
}
