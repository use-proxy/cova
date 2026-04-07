import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface KeepMaskItem {
  type: string
  bbox: [number, number, number, number]
  confidence: number
  keep: boolean | null
  label: string
  mask_url?: string
  showToUser?: boolean
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

export const useRoomStore = create<RoomState>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,
      setRoom: (roomId) => set({ roomId }),
      setPhotoUrl: (originalPhotoUrl) => set({ originalPhotoUrl }),
      setDepthMapUrl: (depthMapUrl) => set({ depthMapUrl }),
      setRenderUrl: (renderUrl) => set({ renderUrl }),
      setKeepMask: (keepMask) => set({ keepMask }),
      toggleKeepItem: (item) =>
        set((state) => {
          const existing = state.keepMask?.find(
            (m) =>
              m.type === item.type &&
              m.bbox[0] === item.bbox[0] &&
              m.bbox[1] === item.bbox[1]
          )
          if (existing) {
            return {
              keepMask: state.keepMask!.map((m) =>
                m.type === item.type &&
                m.bbox[0] === item.bbox[0] &&
                m.bbox[1] === item.bbox[1]
                  ? { ...m, keep: item.keep }
                  : m
              ),
            }
          }
          return {
            keepMask: [...(state.keepMask ?? []), item],
          }
        }),
      addRenderSession: (session) =>
        set((state) => ({
          renderSessions: [...state.renderSessions, session],
          currentRenderIteration: session.iteration + 1,
        })),
      clearRoom: () => set(INITIAL_STATE),
    }),
    {
      name: 'cova-room-v1',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        roomId: state.roomId,
        originalPhotoUrl: state.originalPhotoUrl,
        depthMapUrl: state.depthMapUrl,
        renderUrl: state.renderUrl,
        keepMask: state.keepMask,
        renderSessions: state.renderSessions,
        currentRenderIteration: state.currentRenderIteration,
      }),
    }
  )
)
