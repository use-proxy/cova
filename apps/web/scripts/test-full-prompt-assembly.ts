/**
 * test-full-prompt-assembly.ts
 *
 * Verifies that buildSystemPrompt correctly incorporates a StyleFingerprint
 * into the system prompt text.
 *
 * Run: cd apps/web && npx tsx scripts/test-full-prompt-assembly.ts
 */

import { buildSystemPrompt } from '../lib/ai/chat/systemPrompts'
import type { StyleFingerprint } from '../types/fingerprint'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`PASS: ${message}`)
}

// --- Test 1: No fingerprint — prompt should not contain fingerprint section ---
{
  const prompt = buildSystemPrompt('budget', null, null, null)
  assert(
    !prompt.includes('STYLE FINGERPRINT'),
    'No fingerprint → no STYLE FINGERPRINT section'
  )
}

// --- Test 2: Fingerprint with clear high/low values ---
const fp: StyleFingerprint = {
  dimensions: {
    colorTemperature:  0.8,  // hi → warm tones
    colorSaturation:   0.2,  // lo → muted palette
    density:           0.5,  // neutral
    formality:         0.5,  // neutral
    era:               0.5,  // neutral
    material:          0.9,  // hi → natural organic materials
    texture:           0.5,  // neutral
    pattern:           0.1,  // lo → solid plain
    lineQuality:       0.5,  // neutral
    lightPreference:   0.7,  // hi → bright airy daylight
    nature:            0.5,  // neutral
    culturalInfluence: 0.5,  // neutral
  },
  covariance: Array(12).fill(Array(12).fill(0)),
  confidence: 0.82,
}

{
  const prompt = buildSystemPrompt('budget', null, null, fp)
  assert(prompt.includes('STYLE FINGERPRINT'), 'Fingerprint present → section appears')
  assert(prompt.includes('warm tones'), 'High colorTemperature → warm tones')
  assert(prompt.includes('natural organic materials'), 'High material → natural organic materials')
  assert(prompt.includes('bright airy daylight'), 'High lightPreference → bright airy daylight')
  assert(prompt.includes('muted palette'), 'Low colorSaturation → muted palette')
  assert(prompt.includes('solid plain'), 'Low pattern → solid plain')
  assert(prompt.includes('82%'), 'Confidence renders as 82%')
  assert(!prompt.includes('maximalist'), 'Neutral density → not in output')
}

// --- Test 3: All neutral fingerprint — no fingerprint section emitted ---
const neutralFp: StyleFingerprint = {
  dimensions: {
    colorTemperature:  0.5,
    colorSaturation:   0.5,
    density:           0.5,
    formality:         0.5,
    era:               0.5,
    material:          0.5,
    texture:           0.5,
    pattern:           0.5,
    lineQuality:       0.5,
    lightPreference:   0.5,
    nature:            0.5,
    culturalInfluence: 0.5,
  },
  covariance: Array(12).fill(Array(12).fill(0)),
  confidence: 0.5,
}

{
  const prompt = buildSystemPrompt('art', null, null, neutralFp)
  assert(
    !prompt.includes('STYLE FINGERPRINT'),
    'All-neutral fingerprint → no STYLE FINGERPRINT section'
  )
}

// --- Test 4: Fingerprint appears in all tabs ---
for (const tab of ['budget', 'products', 'art', 'tech', 'sensory', 'identity'] as const) {
  const prompt = buildSystemPrompt(tab, null, null, fp)
  assert(prompt.includes('STYLE FINGERPRINT'), `Tab ${tab} includes fingerprint section`)
}

console.log('\nAll assertions passed.')
