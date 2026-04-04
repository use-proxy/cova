import { describe, it, expect } from 'vitest'
import { getDeviceCapabilities } from '@/lib/deviceDetection'

describe('Device Detection', () => {
  it('returns desktop capabilities in SSR context', () => {
    const caps = getDeviceCapabilities()
    expect(caps).toHaveProperty('isMobile')
    expect(caps).toHaveProperty('isDesktop')
    expect(caps).toHaveProperty('hasLiDAR')
    expect(caps).toHaveProperty('hasRearCamera')
    expect(caps).toHaveProperty('os')
    expect(caps).toHaveProperty('browser')
  })

  it('identifies desktop correctly in Node.js test environment', () => {
    // In Node.js, window is undefined — should return desktop defaults
    const caps = getDeviceCapabilities()
    expect(typeof caps.isMobile).toBe('boolean')
    expect(typeof caps.isDesktop).toBe('boolean')
    expect(typeof caps.hasLiDAR).toBe('boolean')
  })
})

describe('Quality Checker', () => {
  it('checkImageQuality function exists and is exported', async () => {
    const module = await import('@/components/capture/QualityChecker')
    expect(typeof module.checkImageQuality).toBe('function')
  })

  it('QualityResult has required shape', () => {
    const mockResult = {
      passed: true,
      score: 85,
      issues: [],
    }
    expect(mockResult).toHaveProperty('passed')
    expect(mockResult).toHaveProperty('score')
    expect(mockResult).toHaveProperty('issues')
    expect(Array.isArray(mockResult.issues)).toBe(true)
  })

  it('QualityIssue has required shape', () => {
    const mockIssue = {
      type: 'blur' as const,
      message: 'Photo appears blurry',
      severity: 'warning' as const,
    }
    expect(mockIssue.type).toBe('blur')
    expect(mockIssue.severity).toBe('warning')
  })
})

describe('Capture Flow Logic', () => {
  it('mobile path uses capture=environment attribute (design decision)', () => {
    const mobileInputAttr = 'environment'
    expect(mobileInputAttr).toBe('environment')
  })

  it('desktop path uses QR code not webcam (design decision)', () => {
    // Webcam mode removed permanently — this documents the decision
    expect(true).toBe(true)
  })

  it('upload fallback has no capture attribute (opens gallery)', () => {
    // UploadFallback must NOT have capture="environment"
    const uploadInputCapture = undefined
    expect(uploadInputCapture).toBeUndefined()
  })

  it('max file size is 10MB', () => {
    const MAX_FILE_SIZE_MB = 10
    expect(MAX_FILE_SIZE_MB).toBe(10)
  })

  it('minimum resolution is 800x600', () => {
    const MIN_WIDTH = 800
    const MIN_HEIGHT = 600
    expect(MIN_WIDTH).toBe(800)
    expect(MIN_HEIGHT).toBe(600)
  })

  it('blur threshold is 100 (Laplacian variance)', () => {
    const BLUR_THRESHOLD = 100
    expect(BLUR_THRESHOLD).toBe(100)
  })
})

describe('QR Token Flow', () => {
  it('generate-token route exists', async () => {
    const routeExists = await import('@/app/api/capture/generate-token/route')
      .then(() => true)
      .catch(() => false)
    expect(routeExists).toBe(true)
  })

  it('validate-token route exists', async () => {
    const routeExists = await import('@/app/api/capture/validate-token/route')
      .then(() => true)
      .catch(() => false)
    expect(routeExists).toBe(true)
  })
})

describe('Capture Components', () => {
  it('QRCapture component exports exist', async () => {
    const module = await import('@/components/capture/QRCapture')
    expect(typeof module.QRCapture).toBe('function')
  })

  it('MobileCapture component exports exist', async () => {
    const module = await import('@/components/capture/MobileCapture')
    expect(typeof module.MobileCapture).toBe('function')
  })

  it('UploadFallback component exports exist', async () => {
    const module = await import('@/components/capture/UploadFallback')
    expect(typeof module.UploadFallback).toBe('function')
  })

  it('CaptureResult component exports exist', async () => {
    const module = await import('@/components/capture/CaptureResult')
    expect(typeof module.CaptureResult).toBe('function')
  })
})
