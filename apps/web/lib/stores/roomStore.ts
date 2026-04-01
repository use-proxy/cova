import { create } from 'zustand'

type ProcessingStage =
  | 'idle'
  | 'uploading'
  | 'reconstructing'
  | 'redesigning'
  | 'matching'
  | 'complete'
  | 'error'

interface RoomState {
  currentRoomId: string | null
  splatUrl: string | null
  redesignSplatUrl: string | null
  processingStage: ProcessingStage
  setRoom: (roomId: string) => void
  setSplatUrl: (url: string | null) => void
  setRedesignSplatUrl: (url: string | null) => void
  setProcessingStage: (stage: ProcessingStage) => void
  clearRoom: () => void
}

export const useRoomStore = create<RoomState>((set) => ({
  currentRoomId: null,
  splatUrl: null,
  redesignSplatUrl: null,
  processingStage: 'idle',
  setRoom: (roomId) => set({ currentRoomId: roomId }),
  setSplatUrl: (url) => set({ splatUrl: url }),
  setRedesignSplatUrl: (url) => set({ redesignSplatUrl: url }),
  setProcessingStage: (stage) => set({ processingStage: stage }),
  clearRoom: () =>
    set({
      currentRoomId: null,
      splatUrl: null,
      redesignSplatUrl: null,
      processingStage: 'idle',
    }),
}))
