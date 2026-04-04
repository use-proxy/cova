import { create } from 'zustand'

interface CameraState {
  /** Camera yaw in radians (rotation around Y axis) */
  yaw: number
  /** Camera pitch in radians (rotation around X axis) */
  pitch: number
  /** Camera vertical FOV in radians */
  fov: number
  /** Viewport aspect ratio (width / height) */
  aspect: number
  /** Update camera orientation from the render loop */
  setCameraState: (yaw: number, pitch: number, fov: number, aspect: number) => void
}

export const useCameraStore = create<CameraState>((set) => ({
  yaw: 0,
  pitch: 0,
  fov: (60 * Math.PI) / 180,
  aspect: 16 / 9,
  setCameraState: (yaw, pitch, fov, aspect) => set({ yaw, pitch, fov, aspect }),
}))
