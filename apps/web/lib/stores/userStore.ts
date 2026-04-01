import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'

interface UserState {
  user: User | null
  styleVector: number[] | null
  setUser: (user: User | null) => void
  setStyleVector: (vector: number[] | null) => void
  clearUser: () => void
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  styleVector: null,
  setUser: (user) => set({ user }),
  setStyleVector: (styleVector) => set({ styleVector }),
  clearUser: () => set({ user: null, styleVector: null }),
}))
