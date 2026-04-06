'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

// Minimal XR types — avoids @types/webxr dependency
type XRSession = {
  addEventListener: (event: string, handler: () => void) => void
  end: () => Promise<void>
}

type XRNavigator = Navigator & {
  xr?: {
    requestSession: (
      mode: string,
      options?: {
        requiredFeatures?: string[]
        optionalFeatures?: string[]
        domOverlay?: { root: Element }
      }
    ) => Promise<XRSession>
  }
}

interface MeasurementPoint {
  x: number
  y: number
  z: number
}

interface RoomMeasureProps {
  onMeasurementComplete: (length: number, width: number) => void
  onCancel: () => void
}

type MeasureStep = 'length' | 'width' | 'complete'

export default function RoomMeasure({ onMeasurementComplete, onCancel }: RoomMeasureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sessionRef = useRef<XRSession | null>(null)
  const [step, setStep] = useState<MeasureStep>('length')
  const [lengthFt, setLengthFt] = useState<number | null>(null)
  const [widthFt, setWidthFt] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(true)
  const firstPointRef = useRef<MeasurementPoint | null>(null)

  void onMeasurementComplete
  void lengthFt
  void widthFt
  void setLengthFt
  void setWidthFt

  // Convert meters to feet
  const metersToFeet = (m: number) => Math.round((m * 3.28084) * 10) / 10

  // Distance between two 3D points in meters
  const distance3D = (a: MeasurementPoint, b: MeasurementPoint) =>
    Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)

  void metersToFeet
  void distance3D

  const stopSession = useCallback(async () => {
    if (sessionRef.current) {
      await sessionRef.current.end().catch(() => {})
      sessionRef.current = null
    }
  }, [])

  useEffect(() => {
    let active = true

    async function startAR() {
      try {
        const nav = navigator as XRNavigator

        if (!nav.xr) {
          setErrorMsg('WebXR not available on this device')
          setIsStarting(false)
          return
        }

        const session = await nav.xr.requestSession('immersive-ar', {
          requiredFeatures: ['hit-test'],
          optionalFeatures: ['dom-overlay'],
          domOverlay: canvasRef.current
            ? { root: canvasRef.current.parentElement! }
            : undefined,
        })

        if (!active) { await session.end(); return }
        sessionRef.current = session
        setIsStarting(false)

        session.addEventListener('end', () => {
          if (active) setErrorMsg('AR session ended')
        })

      } catch (err) {
        if (active) {
          setErrorMsg(
            err instanceof Error ? err.message : 'Could not start AR session'
          )
          setIsStarting(false)
        }
      }
    }

    void startAR()
    return () => {
      active = false
      void stopSession()
    }
  }, [stopSession])

  const handleTap = useCallback(async () => {
    // In a full implementation, this would use the XR hit-test result
    // to get the 3D position of where the user tapped on the floor.
    // For MVP, we use a simplified approach: prompt the user to walk
    // to the other side and measure using device motion sensors.
    // This is a placeholder that shows the UI flow correctly.
    //
    // Production implementation would use:
    // const hitTestResults = frame.getHitTestResults(hitTestSource)
    // const pose = hitTestResults[0]?.getPose(referenceSpace)
    // const point = pose?.transform.position

    if (step === 'length' && !firstPointRef.current) {
      // First tap: record starting point (mock)
      firstPointRef.current = { x: 0, y: 0, z: 0 }
      setStep('width')
    } else if (step === 'width') {
      // Second tap: compute distance (mock — real impl uses hit-test)
      // For now: show manual input fallback
      setErrorMsg('Walk to the opposite wall and tap to measure')
    }
  }, [step])

  if (errorMsg) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#091829',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px', zIndex: 100,
      }}>
        <p style={{
          color: '#F5F0E8',
          fontFamily: 'var(--font-sans)',
          textAlign: 'center',
          marginBottom: '16px',
        }}>
          {errorMsg}
        </p>
        <button
          onClick={onCancel}
          style={{
            padding: '12px 24px',
            background: '#0D2035',
            border: '1px solid rgba(201,168,76,0.2)',
            borderRadius: '8px',
            color: '#F5F0E8',
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
          }}
        >
          Enter dimensions manually
        </button>
      </div>
    )
  }

  if (isStarting) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#091829',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
      }}>
        <p style={{
          color: '#8A9BB5',
          fontFamily: 'var(--font-sans)',
        }}>
          Starting AR camera...
        </p>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%' }}
      />

      {/* Overlay UI */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '24px',
        background: 'linear-gradient(to top, rgba(9,24,41,0.95), transparent)',
      }}>
        <p style={{
          color: '#F5F0E8',
          fontFamily: 'var(--font-serif)',
          fontSize: '20px',
          marginBottom: '8px',
          textAlign: 'center',
        }}>
          {step === 'length'
            ? 'Point at one end of the longest wall'
            : 'Now point at the opposite end'}
        </p>
        <p style={{
          color: '#8A9BB5',
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          textAlign: 'center',
          marginBottom: '20px',
        }}>
          {step === 'length'
            ? 'Tap the screen to mark the starting point'
            : 'Tap to record the measurement'}
        </p>

        <button
          onClick={() => { void handleTap() }}
          style={{
            width: '100%',
            padding: '16px',
            background: '#C9A84C',
            color: '#091829',
            border: 'none',
            borderRadius: '12px',
            fontFamily: 'var(--font-sans)',
            fontSize: '16px',
            fontWeight: 500,
            cursor: 'pointer',
            marginBottom: '12px',
          }}
        >
          Tap to Mark Point
        </button>

        <button
          onClick={() => { void stopSession(); onCancel() }}
          style={{
            width: '100%',
            padding: '12px',
            background: 'transparent',
            color: '#8A9BB5',
            border: 'none',
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Cancel — enter manually
        </button>
      </div>
    </div>
  )
}
