"use client"

import { useEffect, useRef, useCallback, useState } from "react"

export interface QualityState {
  passing: boolean
  message: string | null
}

interface QualityCheckerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  enabled: boolean
  onQualityChange: (quality: QualityState) => void
}

function computeBlurScore(imageData: ImageData): number {
  const { data, width, height } = imageData
  // Convert to grayscale and compute Laplacian variance
  const gray = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4
    gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
  }

  let sum = 0
  let sumSq = 0
  let count = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      const laplacian =
        gray[idx - width] + gray[idx + width] + gray[idx - 1] + gray[idx + 1] - 4 * gray[idx]
      sum += laplacian
      sumSq += laplacian * laplacian
      count++
    }
  }
  const mean = sum / count
  return sumSq / count - mean * mean
}

function computeMeanBrightness(imageData: ImageData): number {
  const { data } = imageData
  let sum = 0
  const pixelCount = data.length / 4
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  return sum / pixelCount
}

export function useQualityChecker(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean
): QualityState {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [quality, setQuality] = useState<QualityState>({ passing: true, message: null })
  const lastCheckRef = useRef(0)

  const checkQuality = useCallback(() => {
    const video = videoRef.current
    if (!video || !enabled || video.readyState < 2) return

    const now = Date.now()
    if (now - lastCheckRef.current < 500) return
    lastCheckRef.current = now

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas")
    }
    const canvas = canvasRef.current
    // Use small size for performance
    const w = 160
    const h = 120
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return

    ctx.drawImage(video, 0, 0, w, h)
    const imageData = ctx.getImageData(0, 0, w, h)

    const brightness = computeMeanBrightness(imageData)
    if (brightness < 40) {
      setQuality({ passing: false, message: "Too dark \u2014 find more light" })
      return
    }
    if (brightness > 220) {
      setQuality({ passing: false, message: "Too bright \u2014 avoid direct light" })
      return
    }

    const blurScore = computeBlurScore(imageData)
    if (blurScore < 80) {
      setQuality({ passing: false, message: "Too much motion \u2014 hold steady" })
      return
    }

    setQuality({ passing: true, message: null })
  }, [videoRef, enabled])

  useEffect(() => {
    if (!enabled) {
      setQuality({ passing: true, message: null })
      return
    }

    let rafId: number
    const loop = () => {
      checkQuality()
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [enabled, checkQuality])

  return quality
}

export function QualityCheckerComponent({ videoRef, enabled, onQualityChange }: QualityCheckerProps) {
  const quality = useQualityChecker(videoRef, enabled)

  useEffect(() => {
    onQualityChange(quality)
  }, [quality, onQualityChange])

  return null
}
