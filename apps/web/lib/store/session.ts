import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SessionState {
  currentStep: number
  isLoading: boolean
  error: string | null
  setStep: (step: number) => void
  nextStep: () => void
  prevStep: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  resetSession: () => void
}

const INITIAL_STATE = {
  currentStep: 1,
  isLoading: false,
  error: null,
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,
      setStep: (step) => set({ currentStep: step }),
      nextStep: () => set((state) => ({
        currentStep: Math.min(state.currentStep + 1, 10)
      })),
      prevStep: () => set((state) => ({
        currentStep: Math.max(state.currentStep - 1, 1)
      })),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      resetSession: () => set(INITIAL_STATE),
    }),
    {
      name: 'cova-session',
      partialize: (state) => ({ currentStep: state.currentStep }),
    }
  )
)
