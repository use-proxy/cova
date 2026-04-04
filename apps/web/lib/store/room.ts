import { create } from 'zustand'

interface KeepMaskItem {
  type: string
  bbox: [number, number, number, number]
  confidence: number
  keep: boolean
  label: string
}

interface RenderSession {
  id: string
  renderUrl: string
  iteration: number
  createdAt: string
}

interface RoomState {
  roomId: string | null
  originalPhotoUrl: string | null
  depthMapUrl: string | null
  renderUrl: string | null
  keepMask: KeepMaskItem[] | null
  renderSessions: RenderSession[]
  currentRenderIteration: number
  setRoom: (roomId: string) => void
  setPhotoUrl: (url: string) => void
  setDepthMapUrl: (url: string) => void
  setRenderUrl: (url: string) => void
  setKeepMask: (mask: KeepMaskItem[]) => void
  toggleKeepItem: (item: KeepMaskItem) => void
  addRenderSession: (session: RenderSession) => void
  clearRoom: () => void
}

const INITIAL_STATE = {
  roomId: null,
  originalPhotoUrl: null,
  depthMapUrl: null,
  renderUrl: null,
  keepMask: null,
  renderSessions: [],
  currentRenderIteration: 1,
}

export const useRoomStore = create<RoomState>()((set) => ({
  ...INITIAL_STATE,
  setRoom: (roomId) => set({ roomId }),
  setPhotoUrl: (originalPhotoUrl) => set({ originalPhotoUrl }),
  setDepthMapUrl: (depthMapUrl) => set({ depthMapUrl }),
  setRenderUrl: (renderUrl) => set({ renderUrl }),
  setKeepMask: (keepMask) => set({ keepMask }),
  toggleKeepItem: (item) => set((state) => ({
    keepMask: state.keepMask?.map((m) =>
      m.type === item.type &&
      m.bbox.toString() === item.bbox.toString()
        ? { ...m, keep: !m.keep }
        : m
    ) ?? [item],
  })),
  addRenderSession: (session) => set((state) => ({
    renderSessions: [...state.renderSessions, session],
    currentRenderIteration: session.iteration + 1,
  })),
  clearRoom: () => set(INITIAL_STATE),
}))
