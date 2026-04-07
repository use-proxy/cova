import { describe, it, expect, beforeEach } from 'vitest'
import { useFingerprintStore } from '@/lib/store/fingerprint'
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
      quizResponses: [],
      fingerprint: null,
      styleName: null,
      entryPath: null,
      dimensions: null,
      constraints: [],
      inclusions: [],
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

  it('addQuizResponse appends to responses array', () => {
    useFingerprintStore.getState().addQuizResponse({
      pairId: '1',
      chosen: 'A',
      superLiked: false,
    })
    expect(useFingerprintStore.getState().quizResponses).toHaveLength(1)
    expect(useFingerprintStore.getState().quizResponses[0]?.chosen).toBe('A')
  })

  it('addQuizResponse supports super liked responses', () => {
    useFingerprintStore.getState().addQuizResponse({
      pairId: '1',
      chosen: 'B',
      superLiked: true,
    })
    expect(useFingerprintStore.getState().quizResponses[0]?.superLiked).toBe(true)
  })

  it('setFingerprint stores StyleFingerprint object', () => {
    useFingerprintStore.getState().setFingerprint(mockFingerprint, 'Warm Japandi')
    expect(useFingerprintStore.getState().fingerprint).toEqual(mockFingerprint)
    expect(useFingerprintStore.getState().styleName).toBe('Warm Japandi')
  })

  it('toggleConstraint adds constraint when not present', () => {
    useFingerprintStore.getState().toggleConstraint('I rent')
    expect(useFingerprintStore.getState().constraints).toContain('I rent')
  })

  it('toggleConstraint removes constraint when already present', () => {
    useFingerprintStore.getState().toggleConstraint('I rent')
    useFingerprintStore.getState().toggleConstraint('I rent')
    expect(useFingerprintStore.getState().constraints).not.toContain('I rent')
  })

  it('toggleInclusion adds inclusion when not present', () => {
    useFingerprintStore.getState().toggleInclusion('TV')
    expect(useFingerprintStore.getState().inclusions).toContain('TV')
  })

  it('toggleInclusion removes inclusion when already present', () => {
    useFingerprintStore.getState().toggleInclusion('TV')
    useFingerprintStore.getState().toggleInclusion('TV')
    expect(useFingerprintStore.getState().inclusions).not.toContain('TV')
  })

  it('supports multiple constraints simultaneously', () => {
    useFingerprintStore.getState().toggleConstraint('I rent')
    useFingerprintStore.getState().toggleConstraint('I have pets')
    useFingerprintStore.getState().toggleConstraint("Can't drill into walls")
    expect(useFingerprintStore.getState().constraints).toHaveLength(3)
  })

  it('resetFingerprint clears all state', () => {
    useFingerprintStore.getState().setRoomType('bedroom')
    useFingerprintStore.getState().setBudget('luxury', [5000, 25000])
    useFingerprintStore.getState().setFingerprint(mockFingerprint, 'Warm Japandi')
    useFingerprintStore.getState().resetFingerprint()
    expect(useFingerprintStore.getState().roomType).toBeNull()
    expect(useFingerprintStore.getState().budgetTier).toBeNull()
    expect(useFingerprintStore.getState().fingerprint).toBeNull()
    expect(useFingerprintStore.getState().quizResponses).toHaveLength(0)
  })
})
