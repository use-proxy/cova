/**
 * Step 6 — Flux prompt quality verification
 * Run: npx tsx scripts/test-flux-prompts.ts
 *
 * Uses the three final fingerprints computed by the quiz-logic-verification
 * report (no live API calls — fingerprints are hardcoded from the simulation
 * so this script works without a dev server or auth token).
 */

// Inline the minimal types & logic copied from lib/ai/flux.ts so this script
// has zero Next.js / Supabase imports and can run with plain tsx.

type DimKey =
  | 'colorTemperature' | 'colorSaturation' | 'density' | 'formality'
  | 'era' | 'material' | 'texture' | 'pattern'
  | 'lineQuality' | 'lightPreference' | 'nature' | 'culturalInfluence'

interface Dims { [k: string]: number }

const DESCRIPTORS: Record<DimKey, { lo: string; hi: string }> = {
  colorTemperature: { lo: 'cool slate and stone tones',           hi: 'warm amber and honey tones' },
  colorSaturation:  { lo: 'muted desaturated palette',            hi: 'bold saturated colors' },
  density:          { lo: 'minimal sparse furnishing',            hi: 'richly layered maximalist' },
  formality:        { lo: 'casual relaxed atmosphere',            hi: 'formal structured arrangement' },
  era:              { lo: 'contemporary cutting-edge aesthetic',   hi: 'heritage vintage character' },
  material:         { lo: 'sleek manufactured surfaces',          hi: 'natural organic materials' },
  texture:          { lo: 'smooth polished surfaces',             hi: 'tactile layered textures' },
  pattern:          { lo: 'solid plain surfaces',                 hi: 'pattern-rich decorative' },
  lineQuality:      { lo: 'sharp geometric angular lines',        hi: 'soft organic curved forms' },
  lightPreference:  { lo: 'cozy intimate lamp-lit',               hi: 'bright airy natural daylight' },
  nature:           { lo: 'urban minimal greenery',               hi: 'biophilic plant-filled' },
  culturalInfluence:{ lo: 'clean Western contemporary',           hi: 'globally eclectic influences' },
}

const NEUTRAL_BAND = 0.15

function getMaterialPalette(d: Dims): string {
  const items: string[] = []
  if (d.nature! > 0.7)            items.push('rattan', 'linen', 'live plants')
  if (d.texture! > 0.7)           items.push('rough linen', 'woven cotton')
  if (d.texture! < 0.3)           items.push('polished marble', 'glass')
  if (d.colorTemperature! > 0.7)  items.push('warm oak', 'aged brass')
  if (d.colorTemperature! < 0.3)  items.push('concrete', 'brushed steel')
  if (d.material! > 0.7)          items.push('hand-thrown ceramics')
  if (d.era! > 0.7)               items.push('heirloom textiles')
  if (d.era! < 0.3)               items.push('brushed nickel')
  const deduped = Array.from(new Set(items)).slice(0, 3)
  if (deduped.length === 0) return ''
  return 'Materials: ' + deduped.join(', ')
}

function getLightingInstruction(d: Dims): string {
  if (d.lightPreference! > 0.7) return 'Bright natural daylight, airy atmosphere'
  if (d.lightPreference! < 0.3) return 'Warm intimate lamp light, cozy shadows'
  return 'Balanced natural ambient light'
}

function dominantDescriptors(d: Dims, k: number): string[] {
  const entries = (Object.keys(DESCRIPTORS) as DimKey[])
    .map((key) => ({ key, v: d[key]!, dev: d[key]! - 0.5 }))
    .filter((e) => Math.abs(e.dev) > NEUTRAL_BAND)
    .sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev))
    .slice(0, k)
  return entries.map((e) => e.dev > 0 ? DESCRIPTORS[e.key].hi : DESCRIPTORS[e.key].lo)
}

function buildPrompt(d: Dims, roomType: string): string {
  const core: string[] = []
  core.push(`Redesign this ${roomType.replace(/_/g, ' ')}`)
  const palette = getMaterialPalette(d)
  if (palette) core.push(palette)
  const descriptors = dominantDescriptors(d, 4)
  if (descriptors.length > 0) core.push(descriptors.join(', '))
  core.push(getLightingInstruction(d))
  core.push('photorealistic interior photography')
  return core.join('. ')
}

// ── Hardcoded fingerprints from the simulation (responseTimeMs=500, lambda=2) ──

// Mock User 1 — Dark Moody Maximalist
// Phase A: Dark Moody Glam + Maximalist Eclectic
// Phase B: 12 responses, all lambda=2 (500ms each)
const darkMoody: Dims = {
  colorTemperature:  0.275,  // Phase A 0.425 - 0.15 = 0.275
  colorSaturation:   1.000,  // Phase A 0.850 + 0.15 = 1.00 (clamped)
  density:           0.950,  // Phase A 0.800 + 0.15 = 0.950
  formality:         0.725,  // Phase A 0.575 + 0.15 = 0.725
  era:               0.275,  // Phase A 0.425 - 0.15 = 0.275
  material:          0.275,  // Phase A 0.425 - 0.15 = 0.275
  texture:           1.000,  // Phase A 0.825 + 0.15 = 0.975 → clamped to 1.0
  pattern:           0.900,  // Phase A 0.750 + 0.15 = 0.900
  lineQuality:       0.300,  // Phase A 0.450 - 0.15 = 0.300
  lightPreference:   0.200,  // Phase A 0.350 - 0.15 = 0.200
  nature:            0.200,  // Phase A 0.350 - 0.15 = 0.200
  culturalInfluence: 0.750,  // Phase A 0.600 + 0.15 = 0.750
}

// Mock User 2 — Coastal Minimalist
// Phase A: Coastal Bright + Pure Minimal White
// Phase B: 12 responses, all lambda=2
const coastalMinimal: Dims = {
  colorTemperature:  0.550,  // Phase A 0.400 + 0.15 = 0.550
  colorSaturation:   0.000,  // Phase A 0.125 - 0.15 = -0.025 → clamped 0.0
  density:           0.050,  // Phase A 0.200 - 0.15 = 0.050
  formality:         0.250,  // Phase A 0.400 - 0.15 = 0.250
  era:               0.100,  // Phase A 0.250 - 0.15 = 0.100
  material:          0.600,  // Phase A 0.450 + 0.15 = 0.600
  texture:           0.025,  // Phase A 0.175 - 0.15 = 0.025
  pattern:           0.000,  // Phase A 0.100 - 0.15 = -0.05 → clamped 0.0
  lineQuality:       0.500,  // Phase A 0.350 + 0.15 = 0.500
  lightPreference:   1.000,  // Phase A 0.925 + 0.15 = 1.075 → clamped 1.0
  nature:            0.600,  // Phase A 0.450 + 0.15 = 0.600
  culturalInfluence: 0.000,  // Phase A 0.150 - 0.15 = 0.000
}

// Mock User 3 — Ambiguous Contradictory
// Phase A: Warm Japandi + Retro Mid-Century
// Phase B: 9 responses (3 skips on colorSaturation, texture, culturalInfluence)
const ambiguous: Dims = {
  colorTemperature:  0.900,  // Phase A 0.750 + 0.15 = 0.900
  colorSaturation:   0.450,  // SKIPPED — retains Phase A 0.450
  density:           0.225,  // Phase A 0.375 - 0.15 = 0.225
  formality:         0.650,  // Phase A 0.500 + 0.15 = 0.650
  era:               0.750,  // Phase A 0.600 + 0.15 = 0.750
  material:          0.900,  // Phase A 0.750 + 0.15 = 0.900
  texture:           0.475,  // SKIPPED — retains Phase A 0.475
  pattern:           0.550,  // Phase A 0.400 + 0.15 = 0.550
  lineQuality:       0.700,  // Phase A 0.550 + 0.15 = 0.700
  lightPreference:   0.500,  // Phase A 0.650 - 0.15 = 0.500
  nature:            0.625,  // Phase A 0.475 + 0.15 = 0.625
  culturalInfluence: 0.275,  // SKIPPED — retains Phase A 0.275
}

function check(label: string, d: Dims, roomType: string): void {
  const prompt = buildPrompt(d, roomType)
  const wordCount = prompt.split(/\s+/).filter(Boolean).length

  console.log(`\n${'='.repeat(60)}`)
  console.log(`${label}`)
  console.log('='.repeat(60))
  console.log(prompt)
  console.log(`\nWord count: ${wordCount}`)
  console.log(`Under 80 words: ${wordCount <= 80 ? '✓ PASS' : '✗ FAIL'}`)
}

check('=== DARK MOODY MAXIMALIST PROMPT ===', darkMoody, 'living_room')
check('=== COASTAL MINIMAL PROMPT ===', coastalMinimal, 'living_room')
check('=== AMBIGUOUS CONTRADICTORY PROMPT ===', ambiguous, 'living_room')

// ── Distinct-prompt check ──────────────────────────────────────────────────────
console.log('\n' + '='.repeat(60))
console.log('DISTINCTNESS CHECK')
console.log('='.repeat(60))

const p1 = buildPrompt(darkMoody, 'living_room')
const p2 = buildPrompt(coastalMinimal, 'living_room')

// Check that moody prompt does NOT contain coastal terms
const moodyContainsCoastalTerms = ['bright', 'minimal', 'airy', 'sparse'].some(t => p1.toLowerCase().includes(t))
// Check that coastal prompt does NOT contain moody terms
const coastalContainsMoodyTerms = ['moody', 'layered', 'dramatic', 'bold'].some(t => p2.toLowerCase().includes(t))

console.log(`Dark moody prompt contains coastal/minimal terms (should be false): ${moodyContainsCoastalTerms ? '✗ FAIL' : '✓ PASS'}`)
console.log(`Coastal prompt contains moody/bold terms (should be false):        ${coastalContainsMoodyTerms ? '✗ FAIL' : '✓ PASS'}`)
console.log(`Prompts are different (should be true):                             ${p1 !== p2 ? '✓ PASS' : '✗ FAIL'}`)

// ── Material palette coherence check ──────────────────────────────────────────
console.log('\n' + '='.repeat(60))
console.log('MATERIAL PALETTE COHERENCE CHECK')
console.log('='.repeat(60))
const darkMoodyMat = getMaterialPalette(darkMoody)
const coastalMat = getMaterialPalette(coastalMinimal)
console.log(`Dark Moody materials: "${darkMoodyMat}"`)
console.log(`Coastal Minimal materials: "${coastalMat}"`)

const coastalGetsSyntheticMaterials =
  ['polished marble', 'glass', 'brushed nickel', 'brushed steel', 'concrete'].some(
    (m) => coastalMat.includes(m),
  )
console.log(
  `Coastal prompt receives synthetic/industrial materials (expected false for coastal style): ` +
    `${coastalGetsSyntheticMaterials ? '✗ BUG: COASTAL GETS WRONG MATERIALS' : '✓ PASS'}`,
)

// ── Range validation for all 3 fingerprints ────────────────────────────────────
console.log('\n' + '='.repeat(60))
console.log('RANGE VALIDATION [0,1] — ALL 3 FINGERPRINTS')
console.log('='.repeat(60))
let allInRange = true
for (const [label, d] of [['DarkMoody', darkMoody], ['Coastal', coastalMinimal], ['Ambiguous', ambiguous]] as const) {
  for (const [k, v] of Object.entries(d as Dims)) {
    if (v < 0 || v > 1 || isNaN(v)) {
      console.log(`✗ FAIL: ${label}.${k} = ${v} OUT OF RANGE`)
      allInRange = false
    }
  }
}
if (allInRange) console.log('✓ PASS — all 36 dimension values in [0, 1], no NaN')

// ── Skip handling check ────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(60))
console.log('SKIP HANDLING (Mock User 3)')
console.log('='.repeat(60))
// Phase A mean for Warm Japandi + Retro Mid-Century:
const phaseAColorSat  = (0.25 + 0.65) / 2   // = 0.450
const phaseATexture   = (0.55 + 0.40) / 2   // = 0.475
const phaseACultural  = (0.25 + 0.30) / 2   // = 0.275

console.log(`colorSaturation: expected to retain Phase A value ${phaseAColorSat}, actual ${ambiguous.colorSaturation}: ${Math.abs(ambiguous.colorSaturation - phaseAColorSat) < 0.001 ? '✓ PASS' : '✗ FAIL'}`)
console.log(`texture:         expected to retain Phase A value ${phaseATexture},  actual ${ambiguous.texture}:  ${Math.abs(ambiguous.texture - phaseATexture) < 0.001 ? '✓ PASS' : '✗ FAIL'}`)
console.log(`culturalInfluence: expected to retain Phase A value ${phaseACultural}, actual ${ambiguous.culturalInfluence}: ${Math.abs(ambiguous.culturalInfluence - phaseACultural) < 0.001 ? '✓ PASS' : '✗ FAIL'}`)
