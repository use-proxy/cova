import { describe, it, expect, beforeEach } from 'vitest'
import { useRoomStore } from '@/lib/store/room'

// Test using zustand store API directly — avoids React dual-instance issues
describe('useRoomStore', () => {
  beforeEach(() => {
    useRoomStore.setState({
      roomId: null,
      originalPhotoUrl: null,
      depthMapUrl: null,
      renderUrl: null,
      keepMask: null,
      renderSessions: [],
      currentRenderIteration: 1,
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

  it('setDepthMapUrl stores depth map url', () => {
    useRoomStore.getState().setDepthMapUrl('https://example.com/depth.jpg')
    expect(useRoomStore.getState().depthMapUrl).toBe('https://example.com/depth.jpg')
  })

  it('setRenderUrl stores render url', () => {
    useRoomStore.getState().setRenderUrl('https://example.com/render.jpg')
    expect(useRoomStore.getState().renderUrl).toBe('https://example.com/render.jpg')
  })

  it('setKeepMask stores detection mask', () => {
    const mask = [
      {
        type: 'furniture',
        label: 'sofa',
        bbox: [100, 200, 300, 400] as [number, number, number, number],
        confidence: 0.92,
        keep: false,
      },
    ]
    useRoomStore.getState().setKeepMask(mask)
    expect(useRoomStore.getState().keepMask).toHaveLength(1)
    expect(useRoomStore.getState().keepMask?.[0]?.label).toBe('sofa')
  })

  it('toggleKeepItem flips keep status', () => {
    const item = {
      type: 'furniture',
      label: 'sofa',
      bbox: [100, 200, 300, 400] as [number, number, number, number],
      confidence: 0.92,
      keep: false,
    }
    useRoomStore.getState().setKeepMask([item])
    useRoomStore.getState().toggleKeepItem(item)
    expect(useRoomStore.getState().keepMask?.[0]?.keep).toBe(true)
  })

  it('addRenderSession appends to sessions array', () => {
    useRoomStore.getState().addRenderSession({
      id: 'session-1',
      renderUrl: 'https://example.com/render.jpg',
      iteration: 1,
      createdAt: new Date().toISOString(),
    })
    expect(useRoomStore.getState().renderSessions).toHaveLength(1)
  })

  it('addRenderSession increments iteration counter', () => {
    useRoomStore.getState().addRenderSession({
      id: 'session-1',
      renderUrl: 'https://example.com/render.jpg',
      iteration: 1,
      createdAt: new Date().toISOString(),
    })
    expect(useRoomStore.getState().currentRenderIteration).toBe(2)
  })

  it('clearRoom resets all state', () => {
    useRoomStore.getState().setRoom('room-123')
    useRoomStore.getState().setRenderUrl('https://example.com/render.jpg')
    useRoomStore.getState().clearRoom()
    expect(useRoomStore.getState().roomId).toBeNull()
    expect(useRoomStore.getState().renderUrl).toBeNull()
    expect(useRoomStore.getState().renderSessions).toHaveLength(0)
  })
})
