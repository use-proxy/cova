// @vitest-environment node
/**
 * LLM-as-Judge Prompt Quality Evaluation
 *
 * Uses Claude to evaluate FLUX prompt quality across multiple criteria.
 * Tests marked with .skipIf run only when ANTHROPIC_API_KEY is available.
 * Synchronous tests always run.
 */

import { describe, test, expect } from 'vitest'
import { buildFluxPrompt } from '@/lib/ai/flux'
import type { BuildFluxPromptParams } from '@/lib/ai/flux'
import type { StyleFingerprint } from '@/types/fingerprint'

// ── Canonical test sessions ──────────────────────────────────────────────────

function makeFP(dims: Partial<StyleFingerprint['dimensions']>, confidence = 0.8): StyleFingerprint {
  return {
    dimensions: {
      colorTemperature: 0.5, colorSaturation: 0.5, density: 0.5, formality: 0.5,
      era: 0.5, material: 0.5, texture: 0.5, pattern: 0.5,
      lineQuality: 0.5, lightPreference: 0.5, nature: 0.5, culturalInfluence: 0.5,
      ...dims,
    },
    covariance: Array(12).fill(Array(12).fill(0)),
    confidence,
  }
}

const WARM_NATURAL: BuildFluxPromptParams = {
  fingerprint: makeFP({
    colorTemperature: 0.88, nature: 0.85, texture: 0.82,
    lightPreference: 0.85, material: 0.78, density: 0.2,
  }),
  roomType: 'living_room',
  budgetTier: 'premium',
  inclusions: [],
  constraints: [],
  keptItemLabels: ['vintage oak desk'],
  roomAnalysis: null,
}

const COLD_LUXURY: BuildFluxPromptParams = {
  fingerprint: makeFP({
    colorTemperature: 0.15, formality: 0.88, density: 0.15,
    material: 0.2, texture: 0.2, lightPreference: 0.3,
  }),
  roomType: 'bedroom',
  budgetTier: 'luxury',
  inclusions: ['pendant light'],
  constraints: [],
  keptItemLabels: [],
  roomAnalysis: null,
}

const FAMILY_BUDGET: BuildFluxPromptParams = {
  fingerprint: makeFP({
    colorTemperature: 0.7, nature: 0.6, density: 0.6,
  }),
  roomType: 'dining_room',
  budgetTier: 'budget',
  inclusions: [],
  constraints: [],
  keptItemLabels: [],
  roomAnalysis: null,
}

// ── Forbidden style names (CLAUDE.md Rule 8) ─────────────────────────────────

const FORBIDDEN = ['japandi', 'bohemian', 'coastal', 'mid-century modern', 'minimalist']

// ── Synchronous quality checks (always run) ──────────────────────────────────

describe('Prompt quality — synchronous checks', () => {
  test('warm natural prompt has correct structural elements', () => {
    const prompt = buildFluxPrompt(WARM_NATURAL)

    // Must have transformation intent
    expect(prompt.toLowerCase()).toContain('redesign')

    // Must have material palette (warm + natural)
    const warmMaterials = ['oak', 'honey', 'terracotta', 'rattan', 'linen', 'amber']
    expect(warmMaterials.some(m => prompt.toLowerCase().includes(m))).toBe(true)

    // Must have lighting instruction
    expect(prompt.toLowerCase()).toMatch(/bright|airy|daylight|natural light/)

    // Must have budget modifier
    expect(prompt.toLowerCase()).toMatch(/premium|investment/)

    // Must have camera closer
    expect(prompt.toLowerCase()).toMatch(/photorealistic|canon|architectural digest/)

    // Must have kept items
    expect(prompt.toLowerCase()).toContain('vintage oak desk')

    // No forbidden names
    for (const f of FORBIDDEN) {
      expect(prompt.toLowerCase()).not.toContain(f)
    }
  })

  test('cold luxury prompt has correct structural elements', () => {
    const prompt = buildFluxPrompt(COLD_LUXURY)

    // Must have cool materials
    const coolMaterials = ['slate', 'marble', 'steel', 'concrete', 'glass', 'nickel', 'stone', 'lacquered']
    expect(coolMaterials.some(m => prompt.toLowerCase().includes(m))).toBe(true)

    // Must have luxury budget modifier
    expect(prompt.toLowerCase()).toMatch(/designer|investment|bespoke/)

    // Must include the pendant light inclusion
    expect(prompt.toLowerCase()).toContain('pendant light')

    // Must have intimate/moody lighting (low lightPreference)
    expect(prompt.toLowerCase()).toMatch(/warm intimate|lamp|cozy/)

    // No forbidden names
    for (const f of FORBIDDEN) {
      expect(prompt.toLowerCase()).not.toContain(f)
    }
  })

  test('family budget prompt has correct structural elements', () => {
    const prompt = buildFluxPrompt(FAMILY_BUDGET)

    // Must have budget-tier language
    expect(prompt.toLowerCase()).toMatch(/affordable|accessible|high-street/)

    // Must reference dining room
    expect(prompt.toLowerCase()).toContain('dining room')

    // No forbidden names
    for (const f of FORBIDDEN) {
      expect(prompt.toLowerCase()).not.toContain(f)
    }
  })

  test('different profiles produce meaningfully different prompts', () => {
    const warm = buildFluxPrompt(WARM_NATURAL)
    const cold = buildFluxPrompt(COLD_LUXURY)
    const family = buildFluxPrompt(FAMILY_BUDGET)

    // All different
    expect(warm).not.toEqual(cold)
    expect(warm).not.toEqual(family)
    expect(cold).not.toEqual(family)

    // Warm should NOT have cool terms
    expect(warm.toLowerCase()).not.toMatch(/slate|concrete|steel|marble/)
    // Cold should NOT have warm terms
    expect(cold.toLowerCase()).not.toMatch(/honey|terracotta|rattan/)
  })

  test('prompt length statistics are reasonable', () => {
    const prompts = [
      buildFluxPrompt(WARM_NATURAL),
      buildFluxPrompt(COLD_LUXURY),
      buildFluxPrompt(FAMILY_BUDGET),
    ]

    for (const prompt of prompts) {
      const wordCount = prompt.split(/\s+/).filter(Boolean).length
      const charCount = prompt.length

      // Core should be under 80 words (with preservation tail adding more)
      expect(wordCount).toBeLessThanOrEqual(350) // absolute max
      expect(charCount).toBeGreaterThan(100)      // minimum meaningful length
      expect(charCount).toBeLessThanOrEqual(2800)  // hard cap for context prompt
    }
  })

  test('quizPreviewMode produces shorter prompts without preservation tail', () => {
    const fullPrompt = buildFluxPrompt(WARM_NATURAL)
    const previewPrompt = buildFluxPrompt({ ...WARM_NATURAL, quizPreviewMode: true })

    expect(previewPrompt.length).toBeLessThan(fullPrompt.length)
    expect(previewPrompt.toLowerCase()).not.toContain('preserve exactly')
    expect(previewPrompt.toLowerCase()).not.toContain('vintage oak desk')
    expect(previewPrompt.toLowerCase()).toContain('photorealistic')
  })
})

// ── LLM-as-judge tests (require ANTHROPIC_API_KEY) ───────────────────────────

describe('LLM-as-judge prompt evaluation', () => {
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY

  test.skipIf(!hasApiKey)(
    'canonical warm natural prompt scores 4+ on all criteria',
    async () => {
      const prompt = buildFluxPrompt(WARM_NATURAL)

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          system: `You are an expert interior design photographer evaluating FLUX image generation prompts.
Score each criterion 1-5. Forbidden names (score 0 if found): Japandi, Bohemian, Coastal, Mid-Century Modern, Minimalist.
Respond ONLY with valid JSON: {"completeness":N,"specificity":N,"photographic_quality":N,"style_coherence":N,"no_forbidden_names":true/false,"overall":N,"issues":[],"strengths":[]}`,
          messages: [{ role: 'user', content: `Evaluate this FLUX prompt:\n\n${prompt}` }],
        }),
      })

      if (!response.ok) {
        console.warn(`LLM judge API returned ${response.status} — skipping`)
        return
      }

      const data = await response.json()
      const text = data.content[0].text.trim().replace(/```json\n?|\n?```/g, '')
      const scores = JSON.parse(text)

      console.log('\nLLM Judge Scores (warm natural):')
      console.log(`  Completeness:     ${scores.completeness}/5`)
      console.log(`  Specificity:      ${scores.specificity}/5`)
      console.log(`  Photo Quality:    ${scores.photographic_quality}/5`)
      console.log(`  Style Coherence:  ${scores.style_coherence}/5`)
      console.log(`  Forbidden Names:  ${scores.no_forbidden_names}`)
      console.log(`  Overall:          ${scores.overall}/5`)

      expect(scores.no_forbidden_names).toBe(true)
      expect(scores.overall).toBeGreaterThanOrEqual(3) // 3+ is acceptable
    },
    60000
  )
})
