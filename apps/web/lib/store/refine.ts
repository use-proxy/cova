import { create } from 'zustand'

interface RefineState {
  refinementText: string | null
  styleStrength: number
  setRefinement: (text: string | null, strength: number) => void
  clearRefinement: () => void
}

export const useRefineStore = create<RefineState>()((set) => ({
  refinementText: null,
  styleStrength: 0.7,
  setRefinement: (text, strength) => set({ refinementText: text, styleStrength: strength }),
  clearRefinement: () => set({ refinementText: null, styleStrength: 0.7 }),
}))
