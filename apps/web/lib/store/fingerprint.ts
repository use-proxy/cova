import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { StyleFingerprint } from '@/types/fingerprint'

export type { StyleFingerprint }

export interface PairwiseResponse {
  pairId: string
  chosenId: string
  responseTimeMs: number
}

export interface ShowcasePrediction {
  predictionId: string
  label: string
}

type BudgetTier = 'budget' | 'mid' | 'premium' | 'luxury'

interface FingerprintState {
  roomType: string | null
  budgetTier: BudgetTier | null
  budgetRange: [number, number] | null
  isGiftMode: boolean
  phaseASelections: string[]
  phaseBResponses: PairwiseResponse[]
  fingerprint: StyleFingerprint | null
  styleName: string | null
  styleTags: string[]
  showcasePredictionIds: ShowcasePrediction[]

  setRoomType: (roomType: string) => void
  setBudget: (tier: BudgetTier, range: [number, number]) => void
  setGiftMode: (enabled: boolean) => void
  addPhaseASelection: (imageId: string) => void
  removePhaseASelection: (imageId: string) => void
  addPhaseBResponse: (response: PairwiseResponse) => void
  setFingerprint: (fingerprint: StyleFingerprint, styleName: string, styleTags: string[]) => void
  setShowcasePredictionIds: (ids: ShowcasePrediction[]) => void
  resetFingerprint: () => void
}

const INITIAL_STATE = {
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
}

export const useFingerprintStore = create<FingerprintState>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,
      setRoomType: (roomType) => set({ roomType }),
      setBudget: (tier, range) => set({ budgetTier: tier, budgetRange: range }),
      setGiftMode: (isGiftMode) => set({ isGiftMode }),
      addPhaseASelection: (imageId) =>
        set((state) => ({
          phaseASelections: [...state.phaseASelections, imageId],
        })),
      removePhaseASelection: (imageId) =>
        set((state) => ({
          phaseASelections: state.phaseASelections.filter((id) => id !== imageId),
        })),
      addPhaseBResponse: (response) =>
        set((state) => ({
          phaseBResponses: [...state.phaseBResponses, response],
        })),
      setFingerprint: (fingerprint, styleName, styleTags) =>
        set({ fingerprint, styleName, styleTags }),
      setShowcasePredictionIds: (showcasePredictionIds) =>
        set({ showcasePredictionIds }),
      resetFingerprint: () => set(INITIAL_STATE),
    }),
    {
      name: 'cova-fingerprint-v1',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        roomType: state.roomType,
        budgetTier: state.budgetTier,
        budgetRange: state.budgetRange,
        isGiftMode: state.isGiftMode,
        phaseASelections: state.phaseASelections,
        phaseBResponses: state.phaseBResponses,
        fingerprint: state.fingerprint,
        styleName: state.styleName,
        styleTags: state.styleTags,
        showcasePredictionIds: state.showcasePredictionIds,
      }),
    }
  )
)
