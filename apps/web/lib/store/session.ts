import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SessionState {
  currentStep: number
  isLoading: boolean
  error: string | null
  pendingPhotoUrl: string | null
  pendingRoomId: string | null
  setStep: (step: number) => void
  nextStep: () => void
  prevStep: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  resetSession: () => void
  setPendingCapture: (photoUrl: string, roomId: string) => void
  clearPendingCapture: () => void
}

const INITIAL_STATE = {
  currentStep: 1,
  isLoading: false,
  error: null,
  pendingPhotoUrl: null,
  pendingRoomId: null,
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
      setPendingCapture: (pendingPhotoUrl, pendingRoomId) => set({ pendingPhotoUrl, pendingRoomId }),
      clearPendingCapture: () => set({ pendingPhotoUrl: null, pendingRoomId: null }),
    }),
    {
      name: 'cova-session',
      partialize: (state) => ({
        currentStep: state.currentStep,
        pendingPhotoUrl: state.pendingPhotoUrl,
        pendingRoomId: state.pendingRoomId,
      }),
    }
  )
)
