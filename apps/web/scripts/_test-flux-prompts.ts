/* eslint-disable @typescript-eslint/no-require-imports */
import { buildFluxPrompt } from '../lib/ai/flux'
import type { StyleFingerprint } from '../types/fingerprint'

const DIMENSION_ORDER = [
  'colorTemperature', 'colorSaturation', 'density', 'formality',
  'era', 'material', 'texture', 'pattern',
  'lineQuality', 'lightPreference', 'nature', 'culturalInfluence',
] as const

const ANCHORS: Array<{ name: string; center: number[] }> = [
  { name: 'Warm Japandi',         center: [0.80, 0.25, 0.30, 0.40, 0.45, 0.85, 0.55, 0.10, 0.75, 0.65, 0.60, 0.25] },
  { name: 'Dark Moody Glam',      center: [0.25, 0.80, 0.65, 0.85, 0.35, 0.25, 0.80, 0.55, 0.20, 0.10, 0.05, 0.30] },
  { name: 'Coastal Bright',       center: [0.50, 0.20, 0.35, 0.25, 0.40, 0.70, 0.30, 0.20, 0.60, 0.95, 0.75, 0.20] },
  { name: 'Industrial Loft',      center: [0.15, 0.30, 0.55, 0.50, 0.30, 0.05, 0.45, 0.05, 0.05, 0.50, 0.05, 0.15] },
  { name: 'Maximalist Eclectic',  center: [0.60, 0.90, 0.95, 0.30, 0.50, 0.60, 0.85, 0.95, 0.70, 0.60, 0.65, 0.90] },
  { name: 'Heritage Traditional', center: [0.55, 0.45, 0.70, 0.95, 0.95, 0.80, 0.80, 0.85, 0.25, 0.45, 0.20, 0.35] },
  { name: 'Pure Minimal White',   center: [0.30, 0.05, 0.05, 0.55, 0.10, 0.20, 0.05, 0.00, 0.10, 0.90, 0.15, 0.10] },
  { name: 'Biophilic Jungle',     center: [0.65, 0.55, 0.75, 0.20, 0.25, 0.95, 0.70, 0.30, 0.80, 0.70, 1.00, 0.50] },
  { name: 'Retro Mid-Century',    center: [0.70, 0.65, 0.45, 0.60, 0.75, 0.65, 0.40, 0.70, 0.35, 0.65, 0.35, 0.30] },
]

function toFingerprint(vec: number[]): StyleFingerprint {
  const dims = {} as StyleFingerprint['dimensions']
  DIMENSION_ORDER.forEach((k, i) => {
    ;(dims as unknown as Record<string, number>)[k] = vec[i] ?? 0.5
  })
  return {
    dimensions: dims,
    covariance: Array.from({ length: 12 }, () => Array(12).fill(0)) as number[][],
    confidence: 0.8,
  }
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

let maxWords = 0
let failures = 0
for (const anchor of ANCHORS) {
  const fp = toFingerprint(anchor.center)
  const prompt = buildFluxPrompt({
    fingerprint: fp,
    roomType: 'living_room',
    budgetTier: 'mid',
    inclusions: [],
    constraints: [],
    keptItemLabels: [],
    roomAnalysis: null,
    quizPreviewMode: true,
  })
  const wc = wordCount(prompt)
  maxWords = Math.max(maxWords, wc)
  const under = wc <= 80
  if (!under) failures++
  console.log(`\n── ${anchor.name} ──  (${wc} words)  ${under ? 'OK' : 'OVER'}`)
  console.log(prompt)
}

console.log(`\n────────────────`)
console.log(`Max words: ${maxWords}`)
console.log(`Failures (>80): ${failures} / ${ANCHORS.length}`)
process.exit(failures > 0 ? 1 : 0)
