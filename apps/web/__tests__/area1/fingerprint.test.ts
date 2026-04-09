// @vitest-environment node
/**
 * Area 1 — fingerprint.test.ts
 * Tests for StyleFingerprint type shape and Zustand store behaviour.
 * Runs in Node environment (no jsdom) — document/window are not available.
 * The Zustand store uses a cookie adapter; we stub global.document so the
 * persist middleware can initialize without crashing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { StyleFingerprint } from '@/types/fingerprint'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal valid StyleFingerprint with all dims set to `value`. */
function makeFP(value = 0.5): StyleFingerprint {
  return {
    dimensions: {
      colorTemperature:  value,
      colorSaturation:   value,
      density:           value,
      formality:         value,
      era:               value,
      material:          value,
      texture:           value,
      pattern:           value,
      lineQuality:       value,
      lightPreference:   value,
      nature:            value,
      culturalInfluence: value,
    },
    covariance: Array.from({ length: 12 }, (_, i) =>
      Array.from({ length: 12 }, (__, j) => (i === j ? 0 : 0))
    ),
    confidence: 0.8,
  }
}

const ALL_DIM_KEYS = [
  'colorTemperature',
  'colorSaturation',
  'density',
  'formality',
  'era',
  'material',
  'texture',
  'pattern',
  'lineQuality',
  'lightPreference',
  'nature',
  'culturalInfluence',
] as const

// ── Section 1 — Type shape ─────────────────────────────────────────────────────

describe('StyleFingerprint type', () => {
  it('has exactly 12 numeric dimension keys', () => {
    const fp = makeFP()
    const keys = Object.keys(fp.dimensions)
    expect(keys).toHaveLength(12)
    expect(keys).toEqual(ALL_DIM_KEYS as unknown as string[])
  })

  it('all 12 dimensions are within [0, 1] — low bound', () => {
    const fp = makeFP(0)
    for (const k of ALL_DIM_KEYS) {
      expect(fp.dimensions[k]).toBeGreaterThanOrEqual(0)
      expect(fp.dimensions[k]).toBeLessThanOrEqual(1)
    }
  })

  it('all 12 dimensions are within [0, 1] — high bound', () => {
    const fp = makeFP(1)
    for (const k of ALL_DIM_KEYS) {
      expect(fp.dimensions[k]).toBeGreaterThanOrEqual(0)
      expect(fp.dimensions[k]).toBeLessThanOrEqual(1)
    }
  })

  it('fingerprint.dimensions has no extra or missing keys', () => {
    const fp = makeFP()
    expect(Object.keys(fp.dimensions)).toHaveLength(ALL_DIM_KEYS.length)
    for (const k of ALL_DIM_KEYS) {
      expect(fp.dimensions).toHaveProperty(k)
    }
  })

  it('covariance is a 12×12 matrix', () => {
    const fp = makeFP()
    expect(fp.covariance).toHaveLength(12)
    for (const row of fp.covariance) {
      expect(row).toHaveLength(12)
    }
  })

  it('confidence is a number in [0, 1]', () => {
    const fp = makeFP()
    expect(typeof fp.confidence).toBe('number')
    expect(fp.confidence).toBeGreaterThanOrEqual(0)
    expect(fp.confidence).toBeLessThanOrEqual(1)
  })
})

// ── Section 2 — Zustand store ─────────────────────────────────────────────────
//
// The store uses a cookie-based persist adapter that reads/writes
// document.cookie. In the node test environment, document is undefined.
// We stub it globally so the adapter initializes safely without crashing.

let cookieStore = ''

function installDocumentStub() {
  // Only install if not already present (node env has no document)
  if (typeof global.document === 'undefined') {
    Object.defineProperty(global, 'document', {
      configurable: true,
      writable: true,
      value: {
        get cookie() { return cookieStore },
        set cookie(val: string) { cookieStore = val },
      },
    })
  }
}

function removeDocumentStub() {
  if (typeof global.document !== 'undefined') {
    Object.defineProperty(global, 'document', {
      configurable: true,
      writable: true,
      value: undefined,
    })
  }
  cookieStore = ''
}

describe('useFingerprintStore', () => {
  beforeEach(() => {
    cookieStore = ''
    installDocumentStub()
    vi.resetModules()
  })

  afterEach(() => {
    removeDocumentStub()
  })

  it('initializes with null fingerprint', async () => {
    const { useFingerprintStore } = await import('@/lib/store/fingerprint')
    useFingerprintStore.getState().resetFingerprint()
    expect(useFingerprintStore.getState().fingerprint).toBeNull()
  })

  it('setFingerprint stores a valid StyleFingerprint', async () => {
    const { useFingerprintStore } = await import('@/lib/store/fingerprint')
    useFingerprintStore.getState().resetFingerprint()
    const fp = makeFP(0.7)
    useFingerprintStore.getState().setFingerprint(fp, 'Warm & Grounded', ['Warm Tones', 'Natural & Organic'])
    const state = useFingerprintStore.getState()
    expect(state.fingerprint).toEqual(fp)
    expect(state.styleName).toBe('Warm & Grounded')
    expect(state.styleTags).toEqual(['Warm Tones', 'Natural & Organic'])
  })

  it('resetFingerprint returns state to initial (fingerprint = null)', async () => {
    const { useFingerprintStore } = await import('@/lib/store/fingerprint')
    useFingerprintStore.getState().setFingerprint(makeFP(), 'Some Style', [])
    useFingerprintStore.getState().resetFingerprint()
    expect(useFingerprintStore.getState().fingerprint).toBeNull()
    expect(useFingerprintStore.getState().styleName).toBeNull()
    expect(useFingerprintStore.getState().styleTags).toEqual([])
  })

  it('resetFingerprint clears phaseASelections and phaseBResponses', async () => {
    const { useFingerprintStore } = await import('@/lib/store/fingerprint')
    useFingerprintStore.getState().addPhaseASelection('img-001')
    useFingerprintStore.getState().resetFingerprint()
    expect(useFingerprintStore.getState().phaseASelections).toEqual([])
    expect(useFingerprintStore.getState().phaseBResponses).toEqual([])
  })

  it('addPhaseASelection appends an ID', async () => {
    const { useFingerprintStore } = await import('@/lib/store/fingerprint')
    useFingerprintStore.getState().resetFingerprint()
    useFingerprintStore.getState().addPhaseASelection('img-abc')
    expect(useFingerprintStore.getState().phaseASelections).toContain('img-abc')
  })

  it('removePhaseASelection removes the ID', async () => {
    const { useFingerprintStore } = await import('@/lib/store/fingerprint')
    useFingerprintStore.getState().resetFingerprint()
    useFingerprintStore.getState().addPhaseASelection('img-abc')
    useFingerprintStore.getState().removePhaseASelection('img-abc')
    expect(useFingerprintStore.getState().phaseASelections).not.toContain('img-abc')
  })

  it('store persists via cookie — document.cookie is written on setFingerprint', async () => {
    const setCalls: string[] = []
    // Replace stub with a spy that captures writes
    Object.defineProperty(global, 'document', {
      configurable: true,
      writable: true,
      value: {
        get cookie() { return cookieStore },
        set cookie(val: string) {
          cookieStore = val
          setCalls.push(val)
        },
      },
    })

    const { useFingerprintStore } = await import('@/lib/store/fingerprint')
    useFingerprintStore.getState().resetFingerprint()
    useFingerprintStore.getState().setFingerprint(makeFP(0.3), 'Bold & Dramatic', [])

    // At least one cookie write should include the COOKIE_NAME key
    const hasCovaCookie = setCalls.some((c) => c.startsWith('cova_anon_fingerprint='))
    expect(hasCovaCookie).toBe(true)
  })

  it('addPhaseBResponse appends to the list', async () => {
    const { useFingerprintStore } = await import('@/lib/store/fingerprint')
    useFingerprintStore.getState().resetFingerprint()
    useFingerprintStore.getState().addPhaseBResponse({
      pairId: 'pair-01',
      chosenSide: 'A',
      responseTimeMs: 1200,
    })
    expect(useFingerprintStore.getState().phaseBResponses).toHaveLength(1)
    expect(useFingerprintStore.getState().phaseBResponses[0]!.pairId).toBe('pair-01')
  })
})

// ── Section 3 — StyleFingerprint value invariants ─────────────────────────────

describe('StyleFingerprint value invariants', () => {
  it('extreme inputs (0 and 1) do not produce NaN', () => {
    const fp0 = makeFP(0)
    const fp1 = makeFP(1)
    for (const k of ALL_DIM_KEYS) {
      expect(Number.isNaN(fp0.dimensions[k])).toBe(false)
      expect(Number.isNaN(fp1.dimensions[k])).toBe(false)
    }
  })

  it('extreme inputs stay within bounds', () => {
    const fp0 = makeFP(0)
    const fp1 = makeFP(1)
    for (const k of ALL_DIM_KEYS) {
      expect(fp0.dimensions[k]).toBeGreaterThanOrEqual(0)
      expect(fp0.dimensions[k]).toBeLessThanOrEqual(1)
      expect(fp1.dimensions[k]).toBeGreaterThanOrEqual(0)
      expect(fp1.dimensions[k]).toBeLessThanOrEqual(1)
    }
  })

  it('partial / default fingerprint (all 0.5) is defined and not undefined', () => {
    const fp = makeFP(0.5)
    expect(fp).toBeDefined()
    expect(fp.dimensions).toBeDefined()
    for (const k of ALL_DIM_KEYS) {
      expect(fp.dimensions[k]).toBeDefined()
    }
  })

})
