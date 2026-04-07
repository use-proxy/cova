import { describe, it, expect, beforeEach } from 'vitest'
import { useFingerprintStore } from '@/lib/store/fingerprint'
import type { PairwiseResponse } from '@/lib/store/fingerprint'
import type { StyleFingerprint } from '@/types/fingerprint'

const mockFingerprint: StyleFingerprint = {
  dimensions: {
    luminosity: 0.4, density: -0.4, temperature: 0.6, form: 0.2,
    era: -0.2, texture: 0.4, scale: 0.0, nature: 0.0, saturation: 0.0, materialOrigin: 0.0,
  },
  covariance: Array(10).fill(Array(10).fill(0)) as number[][],
  confidence: 0.8,
}

// Test using zustand store API directly — avoids React dual-instance issues
describe('useFingerprintStore', () => {
  beforeEach(() => {
    useFingerprintStore.setState({
      roomType: null,
      budgetTier: null,
      budgetRange: null,
      isGiftMode: false,
      phaseASelections: [],
      phaseBResponses: [],
      fingerprint: null,
      styleName: null,
      styleTags: [],
      showcasePredictionIds: [],
    })
  })

  it('initializes with null values', () => {
    const state = useFingerprintStore.getState()
    expect(state.roomType).toBeNull()
    expect(state.budgetTier).toBeNull()
    expect(state.fingerprint).toBeNull()
  })

  it('setRoomType updates room type', () => {
    useFingerprintStore.getState().setRoomType('living_room')
    expect(useFingerprintStore.getState().roomType).toBe('living_room')
  })

  it('setBudget sets tier and correct range for budget tier', () => {
    useFingerprintStore.getState().setBudget('budget', [200, 500])
    expect(useFingerprintStore.getState().budgetTier).toBe('budget')
    expect(useFingerprintStore.getState().budgetRange).toEqual([200, 500])
  })

  it('setBudget sets correct range for mid tier', () => {
    useFingerprintStore.getState().setBudget('mid', [500, 2000])
    expect(useFingerprintStore.getState().budgetRange).toEqual([500, 2000])
  })

  it('setBudget sets correct range for premium tier', () => {
    useFingerprintStore.getState().setBudget('premium', [2000, 5000])
    expect(useFingerprintStore.getState().budgetRange).toEqual([2000, 5000])
  })

  it('setBudget sets correct range for luxury tier', () => {
    useFingerprintStore.getState().setBudget('luxury', [5000, 25000])
    expect(useFingerprintStore.getState().budgetRange).toEqual([5000, 25000])
  })

  it('setGiftMode toggles gift mode', () => {
    useFingerprintStore.getState().setGiftMode(true)
    expect(useFingerprintStore.getState().isGiftMode).toBe(true)
    useFingerprintStore.getState().setGiftMode(false)
    expect(useFingerprintStore.getState().isGiftMode).toBe(false)
  })

  it('addPhaseASelection appends image id', () => {
    useFingerprintStore.getState().addPhaseASelection('img-1')
    expect(useFingerprintStore.getState().phaseASelections).toContain('img-1')
  })

  it('removePhaseASelection removes image id', () => {
    useFingerprintStore.getState().addPhaseASelection('img-1')
    useFingerprintStore.getState().addPhaseASelection('img-2')
    useFingerprintStore.getState().removePhaseASelection('img-1')
    expect(useFingerprintStore.getState().phaseASelections).not.toContain('img-1')
    expect(useFingerprintStore.getState().phaseASelections).toContain('img-2')
  })

  it('addPhaseBResponse appends to responses array', () => {
    const response: PairwiseResponse = { pairId: 'pair-1', chosenId: 'img-A', responseTimeMs: 1200 }
    useFingerprintStore.getState().addPhaseBResponse(response)
    expect(useFingerprintStore.getState().phaseBResponses).toHaveLength(1)
    expect(useFingerprintStore.getState().phaseBResponses[0]?.chosenId).toBe('img-A')
  })

  it('addPhaseBResponse accumulates multiple responses', () => {
    useFingerprintStore.getState().addPhaseBResponse({ pairId: '1', chosenId: 'A', responseTimeMs: 800 })
    useFingerprintStore.getState().addPhaseBResponse({ pairId: '2', chosenId: 'B', responseTimeMs: 1100 })
    expect(useFingerprintStore.getState().phaseBResponses).toHaveLength(2)
  })

  it('setFingerprint stores StyleFingerprint object with styleTags', () => {
    useFingerprintStore.getState().setFingerprint(mockFingerprint, 'Warm Japandi', ['cozy', 'minimal'])
    expect(useFingerprintStore.getState().fingerprint).toEqual(mockFingerprint)
    expect(useFingerprintStore.getState().styleName).toBe('Warm Japandi')
    expect(useFingerprintStore.getState().styleTags).toEqual(['cozy', 'minimal'])
  })

  it('setShowcasePredictionIds stores prediction list', () => {
    useFingerprintStore.getState().setShowcasePredictionIds([
      { predictionId: 'pred-1', label: 'Japandi' },
    ])
    expect(useFingerprintStore.getState().showcasePredictionIds).toHaveLength(1)
    expect(useFingerprintStore.getState().showcasePredictionIds[0]?.predictionId).toBe('pred-1')
  })

  it('resetFingerprint clears all state', () => {
    useFingerprintStore.getState().setRoomType('bedroom')
    useFingerprintStore.getState().setBudget('luxury', [5000, 25000])
    useFingerprintStore.getState().setFingerprint(mockFingerprint, 'Warm Japandi', ['cozy'])
    useFingerprintStore.getState().setGiftMode(true)
    useFingerprintStore.getState().resetFingerprint()
    expect(useFingerprintStore.getState().roomType).toBeNull()
    expect(useFingerprintStore.getState().budgetTier).toBeNull()
    expect(useFingerprintStore.getState().fingerprint).toBeNull()
    expect(useFingerprintStore.getState().isGiftMode).toBe(false)
    expect(useFingerprintStore.getState().phaseBResponses).toHaveLength(0)
    expect(useFingerprintStore.getState().styleTags).toHaveLength(0)
  })
})
