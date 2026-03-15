import { create } from 'zustand';
import type { User, Room, SceneState } from '@cova/shared';

interface AppStore {
  user: User | null;
  currentRoom: Room | null;
  sceneState: SceneState | null;
  tokenBalance: number;
  setUser: (user: User | null) => void;
  setCurrentRoom: (room: Room | null) => void;
  setSceneState: (state: SceneState | null) => void;
  setTokenBalance: (balance: number) => void;
  spendTokens: (amount: number) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  user: null,
  currentRoom: null,
  sceneState: null,
  tokenBalance: 0,
  setUser: (user) => set({ user }),
  setCurrentRoom: (currentRoom) => set({ currentRoom }),
  setSceneState: (sceneState) => set({ sceneState }),
  setTokenBalance: (tokenBalance) => set({ tokenBalance }),
  spendTokens: (amount) =>
    set((state) => ({ tokenBalance: Math.max(0, state.tokenBalance - amount) })),
}));
