import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface Detection {
  type: string
  label: string
  bbox: [number, number, number, number]  // [x, y, w, h] normalized 0-1
  confidence: number
  showToUser: boolean
  keep: boolean | null  // null = neutral, true = keep, false = remove
  maskUrl?: string
}

export interface RoomAnalysis {
  room_type: string
  dimensions_estimate: {
    width_ft: number
    length_ft: number
    ceiling_height_ft: number
  }
  existing_style: string
  architectural_features: string[]
  lighting_conditions: string
  floor_type: string
  wall_finish: string
  natural_light_level: 'high' | 'medium' | 'low'
}

export interface RenderSession {
  id: string
  renderUrl: string
  previewUrl: string | null
  parallaxVideoUrl: string | null
  iteration: number
  createdAt: string
}

export interface KeepMaskItem {
  type: string
  label: string
  bbox: [number, number, number, number]
  confidence: number
  keep: boolean
  maskUrl?: string
}

interface RoomState {
  roomId: string | null
  originalPhotoUrl: string | null
  depthMapUrl: string | null
  depthQuality: number | null
  roomAnalysis: RoomAnalysis | null
  detections: Detection[] | null
  renderUrl: string | null
  previewUrl: string | null
  parallaxVideoUrl: string | null
  keepMask: KeepMaskItem[] | null
  referenceImageUrls: string[]
  renderSessions: RenderSession[]
  currentRenderIteration: number
  swapRenderUrl: string | null
  predictionId: string | null
  schnellPredictionId: string | null

  setRoom: (roomId: string) => void
  setPhotoUrl: (url: string) => void
  setDepthMap: (url: string, quality: number) => void
  setRoomAnalysis: (analysis: RoomAnalysis) => void
  setDetections: (detections: Detection[]) => void
  setRenderUrl: (url: string) => void
  setPreviewUrl: (url: string) => void
  setParallaxVideoUrl: (url: string) => void
  setKeepMask: (items: KeepMaskItem[]) => void
  toggleKeepItem: (label: string, keep: boolean | null) => void
  setReferenceImages: (urls: string[]) => void
  addRenderSession: (session: RenderSession) => void
  setPredictionIds: (predictionId: string, schnellPredictionId?: string) => void
  setSwapRenderUrl: (url: string | null) => void
  resetRoom: () => void
}

const INITIAL_STATE = {
  roomId: null,
  originalPhotoUrl: null,
  depthMapUrl: null,
  depthQuality: null,
  roomAnalysis: null,
  detections: null,
  renderUrl: null,
  previewUrl: null,
  parallaxVideoUrl: null,
  keepMask: null,
  referenceImageUrls: [],
  renderSessions: [],
  currentRenderIteration: 1,
  swapRenderUrl: null,
  predictionId: null,
  schnellPredictionId: null,
}

export const useRoomStore = create<RoomState>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,
      setRoom: (roomId) => set({ roomId }),
      setPhotoUrl: (originalPhotoUrl) => set({ originalPhotoUrl }),
      setDepthMap: (depthMapUrl, depthQuality) => set({ depthMapUrl, depthQuality }),
      setRoomAnalysis: (roomAnalysis) => set({ roomAnalysis }),
      setDetections: (detections) => set({ detections }),
      setRenderUrl: (renderUrl) => set({ renderUrl }),
      setPreviewUrl: (previewUrl) => set({ previewUrl }),
      setParallaxVideoUrl: (parallaxVideoUrl) => set({ parallaxVideoUrl }),
      setKeepMask: (keepMask) => set({ keepMask }),
      toggleKeepItem: (label, keep) =>
        set((state) => {
          // Sync keep state on Detection if it exists
          const updatedDetections = state.detections
            ? state.detections.map((d) =>
                d.label === label ? { ...d, keep } : d
              )
            : state.detections

          // Upsert into keepMask
          const existing = state.keepMask?.find((m) => m.label === label)
          let updatedKeepMask: KeepMaskItem[]
          if (existing) {
            if (keep === null) {
              // Remove from keepMask when toggled back to neutral
              updatedKeepMask = state.keepMask!.filter((m) => m.label !== label)
            } else {
              updatedKeepMask = state.keepMask!.map((m) =>
                m.label === label ? { ...m, keep } : m
              )
            }
          } else if (keep !== null) {
            // Add to keepMask — find detection data to populate item
            const detection = state.detections?.find((d) => d.label === label)
            if (detection) {
              const item: KeepMaskItem = {
                type: detection.type,
                label: detection.label,
                bbox: detection.bbox,
                confidence: detection.confidence,
                keep,
                maskUrl: detection.maskUrl,
              }
              updatedKeepMask = [...(state.keepMask ?? []), item]
            } else {
              updatedKeepMask = state.keepMask ?? []
            }
          } else {
            updatedKeepMask = state.keepMask ?? []
          }

          return { detections: updatedDetections, keepMask: updatedKeepMask }
        }),
      setReferenceImages: (referenceImageUrls) => set({ referenceImageUrls }),
      addRenderSession: (session) =>
        set((state) => ({
          renderSessions: [...state.renderSessions, session],
          currentRenderIteration: session.iteration + 1,
        })),
      setPredictionIds: (predictionId, schnellPredictionId) =>
        set({ predictionId, schnellPredictionId: schnellPredictionId ?? null }),
      setSwapRenderUrl: (swapRenderUrl) => set({ swapRenderUrl }),
      resetRoom: () => set(INITIAL_STATE),
    }),
    {
      name: 'cova-room-v1',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        roomId: state.roomId,
        originalPhotoUrl: state.originalPhotoUrl,
        depthMapUrl: state.depthMapUrl,
        depthQuality: state.depthQuality,
        roomAnalysis: state.roomAnalysis,
        detections: state.detections,
        renderUrl: state.renderUrl,
        previewUrl: state.previewUrl,
        parallaxVideoUrl: state.parallaxVideoUrl,
        keepMask: state.keepMask,
        referenceImageUrls: state.referenceImageUrls,
        renderSessions: state.renderSessions,
        currentRenderIteration: state.currentRenderIteration,
        swapRenderUrl: state.swapRenderUrl,
        predictionId: state.predictionId,
        schnellPredictionId: state.schnellPredictionId,
      }),
    }
  )
)
