// @vitest-environment node
/**
 * Area 1 — anchor-display.test.ts
 * Tests for lib/ai/anchor-display.ts — the internal → user-facing style name map.
 * No mocks needed: the module is pure (no I/O, no network).
 */

import { describe, it, expect } from 'vitest'
import { STYLE_DISPLAY_NAMES, toDisplayName } from '@/lib/ai/anchor-display'

// ── The 9 known internal anchor names ────────────────────────────────────────

const INTERNAL_ANCHOR_NAMES = [
  'Warm Japandi',
  'Dark Moody Glam',
  'Coastal Bright',
  'Industrial Loft',
  'Maximalist Eclectic',
  'Heritage Traditional',
  'Pure Minimal White',
  'Biophilic Jungle',
  'Retro Mid-Century',
]

// Words forbidden in user-facing strings (CLAUDE.md Rule 8 + anchor-display comment)
const FORBIDDEN_WORDS = [
  'Japandi',
  'japandi',
  'Bohemian',
  'bohemian',
  'Coastal',
  'coastal',
  'Mid-Century',
  'mid-century',
  'mid_century',
  'Minimalist',
  'minimalist',
  'Minimal',   // "Pure Minimal White" internal name must NOT leak out
]

// ── STYLE_DISPLAY_NAMES record ────────────────────────────────────────────────

describe('STYLE_DISPLAY_NAMES', () => {
  it('has an entry for every known internal anchor name', () => {
    for (const name of INTERNAL_ANCHOR_NAMES) {
      expect(STYLE_DISPLAY_NAMES).toHaveProperty(name)
    }
  })

  it('has exactly 9 entries', () => {
    expect(Object.keys(STYLE_DISPLAY_NAMES)).toHaveLength(9)
  })

  it('every display value is a non-empty string', () => {
    for (const [, display] of Object.entries(STYLE_DISPLAY_NAMES)) {
      expect(typeof display).toBe('string')
      expect(display.length).toBeGreaterThan(0)
    }
  })

  it('no display value contains forbidden style words (CLAUDE.md Rule 8)', () => {
    for (const display of Object.values(STYLE_DISPLAY_NAMES)) {
      for (const forbidden of FORBIDDEN_WORDS) {
        expect(display).not.toContain(forbidden)
      }
    }
  })

  it('no display value is an ALL_CAPS_IDENTIFIER (no underscores)', () => {
    for (const [, display] of Object.entries(STYLE_DISPLAY_NAMES)) {
      expect(display).not.toMatch(/_/)
    }
  })

  it('display values are not ALL_CAPS', () => {
    for (const [, display] of Object.entries(STYLE_DISPLAY_NAMES)) {
      // A display string should not be fully uppercase
      expect(display).not.toBe(display.toUpperCase())
    }
  })

  it('display values differ from their internal key', () => {
    // The whole point is that the display name is different from the internal name
    for (const [internal, display] of Object.entries(STYLE_DISPLAY_NAMES)) {
      // At minimum the display should not literally equal the internal name
      // (it's a mapping, not an identity)
      expect(display).not.toBe(internal)
    }
  })
})

// ── toDisplayName() function ──────────────────────────────────────────────────

describe('toDisplayName()', () => {
  it('maps every internal anchor name to a non-empty display string', () => {
    for (const name of INTERNAL_ANCHOR_NAMES) {
      const result = toDisplayName(name)
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    }
  })

  it('display strings returned by toDisplayName do not contain forbidden words', () => {
    for (const name of INTERNAL_ANCHOR_NAMES) {
      const display = toDisplayName(name)
      for (const forbidden of FORBIDDEN_WORDS) {
        expect(display).not.toContain(forbidden)
      }
    }
  })

  it('returns the input unchanged for an unknown anchor name (pass-through)', () => {
    const unknown = 'Some Unknown Style Cluster'
    expect(toDisplayName(unknown)).toBe(unknown)
  })

  it('returns empty string for null input', () => {
    expect(toDisplayName(null)).toBe('')
  })

  it('returns empty string for undefined input', () => {
    expect(toDisplayName(undefined)).toBe('')
  })

  it('returns empty string for empty string input', () => {
    expect(toDisplayName('')).toBe('')
  })

  it('"Your Unique Style" placeholder passes through unchanged (not in the 9-anchor map)', () => {
    const placeholder = 'Your Unique Style'
    expect(toDisplayName(placeholder)).toBe(placeholder)
  })

  it('Warm Japandi → Warm & Grounded (specific mapping spot-check)', () => {
    expect(toDisplayName('Warm Japandi')).toBe('Warm & Grounded')
  })

  it('Coastal Bright → Bright & Airy (specific mapping spot-check)', () => {
    expect(toDisplayName('Coastal Bright')).toBe('Bright & Airy')
  })

  it('Retro Mid-Century → Vintage Modern (specific mapping spot-check)', () => {
    expect(toDisplayName('Retro Mid-Century')).toBe('Vintage Modern')
  })

  it('Pure Minimal White → Pure & Calm (does not contain "Minimal")', () => {
    const result = toDisplayName('Pure Minimal White')
    expect(result).toBe('Pure & Calm')
    expect(result).not.toContain('Minimal')
  })

  it('no returned display string is an ALL_CAPS_IDENTIFIER', () => {
    for (const name of INTERNAL_ANCHOR_NAMES) {
      const result = toDisplayName(name)
      expect(result).not.toMatch(/_/)
      expect(result).not.toBe(result.toUpperCase())
    }
  })
})
