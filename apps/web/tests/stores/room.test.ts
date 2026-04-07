import { describe, it, expect, beforeEach } from 'vitest'
import { useRoomStore } from '@/lib/store/room'
import type { Detection } from '@/lib/store/room'

// Test using zustand store API directly — avoids React dual-instance issues
describe('useRoomStore', () => {
  beforeEach(() => {
    useRoomStore.setState({
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
    })
  })

  it('initializes with null values', () => {
    const state = useRoomStore.getState()
    expect(state.roomId).toBeNull()
    expect(state.renderUrl).toBeNull()
  })

  it('setRoom stores room id', () => {
    useRoomStore.getState().setRoom('room-123')
    expect(useRoomStore.getState().roomId).toBe('room-123')
  })

  it('setPhotoUrl stores photo url', () => {
    useRoomStore.getState().setPhotoUrl('https://example.com/photo.jpg')
    expect(useRoomStore.getState().originalPhotoUrl).toBe('https://example.com/photo.jpg')
  })

  it('setDepthMap stores depth map url and quality', () => {
    useRoomStore.getState().setDepthMap('https://example.com/depth.jpg', 0.9)
    expect(useRoomStore.getState().depthMapUrl).toBe('https://example.com/depth.jpg')
    expect(useRoomStore.getState().depthQuality).toBe(0.9)
  })

  it('setRenderUrl stores render url', () => {
    useRoomStore.getState().setRenderUrl('https://example.com/render.jpg')
    expect(useRoomStore.getState().renderUrl).toBe('https://example.com/render.jpg')
  })

  it('setDetections stores detection array', () => {
    const detections: Detection[] = [
      {
        type: 'furniture',
        label: 'sofa',
        bbox: [0.1, 0.2, 0.3, 0.4],
        confidence: 0.92,
        showToUser: true,
        keep: null,
      },
    ]
    useRoomStore.getState().setDetections(detections)
    expect(useRoomStore.getState().detections).toHaveLength(1)
    expect(useRoomStore.getState().detections?.[0]?.label).toBe('sofa')
  })

  it('setKeepMask stores detection mask', () => {
    const mask = [
      {
        type: 'furniture',
        label: 'sofa',
        bbox: [0.1, 0.2, 0.3, 0.4] as [number, number, number, number],
        confidence: 0.92,
        keep: false,
      },
    ]
    useRoomStore.getState().setKeepMask(mask)
    expect(useRoomStore.getState().keepMask).toHaveLength(1)
    expect(useRoomStore.getState().keepMask?.[0]?.label).toBe('sofa')
  })

  it('toggleKeepItem updates keep status in keepMask from detections', () => {
    const detections: Detection[] = [
      {
        type: 'furniture',
        label: 'sofa',
        bbox: [0.1, 0.2, 0.3, 0.4],
        confidence: 0.92,
        showToUser: true,
        keep: null,
      },
    ]
    useRoomStore.getState().setDetections(detections)
    useRoomStore.getState().toggleKeepItem('sofa', true)
    expect(useRoomStore.getState().keepMask?.[0]?.keep).toBe(true)
    expect(useRoomStore.getState().detections?.[0]?.keep).toBe(true)
  })

  it('toggleKeepItem removes item from keepMask when set to null', () => {
    const detections: Detection[] = [
      {
        type: 'furniture',
        label: 'sofa',
        bbox: [0.1, 0.2, 0.3, 0.4],
        confidence: 0.92,
        showToUser: true,
        keep: null,
      },
    ]
    useRoomStore.getState().setDetections(detections)
    useRoomStore.getState().toggleKeepItem('sofa', true)
    expect(useRoomStore.getState().keepMask).toHaveLength(1)
    useRoomStore.getState().toggleKeepItem('sofa', null)
    expect(useRoomStore.getState().keepMask).toHaveLength(0)
  })

  it('addRenderSession appends to sessions array', () => {
    useRoomStore.getState().addRenderSession({
      id: 'session-1',
      renderUrl: 'https://example.com/render.jpg',
      previewUrl: null,
      parallaxVideoUrl: null,
      iteration: 1,
      createdAt: new Date().toISOString(),
    })
    expect(useRoomStore.getState().renderSessions).toHaveLength(1)
  })

  it('addRenderSession increments iteration counter', () => {
    useRoomStore.getState().addRenderSession({
      id: 'session-1',
      renderUrl: 'https://example.com/render.jpg',
      previewUrl: null,
      parallaxVideoUrl: null,
      iteration: 1,
      createdAt: new Date().toISOString(),
    })
    expect(useRoomStore.getState().currentRenderIteration).toBe(2)
  })

  it('resetRoom resets all state', () => {
    useRoomStore.getState().setRoom('room-123')
    useRoomStore.getState().setRenderUrl('https://example.com/render.jpg')
    useRoomStore.getState().resetRoom()
    expect(useRoomStore.getState().roomId).toBeNull()
    expect(useRoomStore.getState().renderUrl).toBeNull()
    expect(useRoomStore.getState().renderSessions).toHaveLength(0)
  })
})
