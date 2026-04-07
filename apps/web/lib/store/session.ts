import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface SessionState {
  currentStep: number  // 1-9
  isLoading: boolean
  error: string | null
  pendingPhotoUrl: string | null
  pendingRoomId: string | null

  setStep: (step: number) => void
  nextStep: () => void
  prevStep: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setPendingCapture: (photoUrl: string, roomId: string) => void
  clearPendingCapture: () => void
  resetSession: () => void
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
        currentStep: Math.min(state.currentStep + 1, 9),
      })),
      prevStep: () => set((state) => ({
        currentStep: Math.max(state.currentStep - 1, 1),
      })),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      setPendingCapture: (pendingPhotoUrl, pendingRoomId) =>
        set({ pendingPhotoUrl, pendingRoomId }),
      clearPendingCapture: () =>
        set({ pendingPhotoUrl: null, pendingRoomId: null }),
      resetSession: () => set(INITIAL_STATE),
    }),
    {
      name: 'cova-session',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        currentStep: state.currentStep,
        pendingPhotoUrl: state.pendingPhotoUrl,
        pendingRoomId: state.pendingRoomId,
      }),
    }
  )
)
