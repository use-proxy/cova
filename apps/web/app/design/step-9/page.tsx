'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useRoomStore } from '@/lib/store/room'
import { useFingerprintStore } from '@/lib/store/fingerprint'
import { useSessionStore } from '@/lib/store/session'
import { useRefineStore } from '@/lib/store/refine'

export default function Step9Page() {
  const router = useRouter()

  const { renderUrl, renderSessions, addRenderSession } = useRoomStore()
  const { inclusions, toggleInclusion } = useFingerprintStore()
  const { setStep } = useSessionStore()
  const { setRefinement, clearRefinement } = useRefineStore()

  // suppress unused-var warnings — inclusions/toggleInclusion kept for future Task 6 expansion
  void inclusions
  void toggleInclusion

  const [inputValue, setInputValue] = useState('')
  const [sliderValue, setSliderValue] = useState(70)

  // Guard — redirect if no render URL
  useEffect(() => {
    if (!renderUrl) {
      router.replace('/design/step-8')
    }
  }, [renderUrl, router])

  if (!renderUrl) return null

  // Version badge: hidden on first render (no sessions archived yet)
  const versionNumber = renderSessions.length + 1
  const showVersionBadge = renderSessions.length > 0

  // "Refine My Design" disabled when user has changed nothing
  const isRefineDisabled = inputValue.trim().length === 0 && sliderValue === 70

  function archiveCurrentRender() {
    addRenderSession({
      id: crypto.randomUUID(),
      renderUrl: renderUrl!,
      iteration: renderSessions.length + 1,
      createdAt: new Date().toISOString(),
    })
  }

  function handleRefine() {
    archiveCurrentRender()
    setRefinement(inputValue.trim() || null, sliderValue / 100)
    setStep(7)
    router.push('/design/step-7')
  }

  function handleTryAgain() {
    archiveCurrentRender()
    clearRefinement()
    setStep(7)
    router.push('/design/step-7')
  }

  function handleStartOver() {
    archiveCurrentRender()
    clearRefinement()
    setStep(1)
    router.push('/design/step-1')
  }

  function handleShopThisLook() {
    setStep(10)
    router.push('/design/step-10')
  }

  function handleAddSomething() {
    setInputValue((prev) => (prev.trim() ? prev : 'Include a '))
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      style={{
        minHeight: '100svh',
        background: 'var(--cova-bg)',
        display: 'flex',
        flexDirection: 'column',
        paddingBottom: 40,
      }}
    >
      {/* ── Progress ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '20px 24px 0' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 8,
        }}>
          <span style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-xs)',
            color: 'var(--cova-muted)',
          }}>
            9 of 10
          </span>
        </div>
        <div style={{
          height: 2,
          background: 'var(--cova-subtle)',
          borderRadius: 9999,
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${(9 / 10) * 100}%`,
            height: '100%',
            background: 'var(--cova-gold)',
            borderRadius: 9999,
          }} />
        </div>
      </div>

      {/* ── Render image ──────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '4 / 3',
        marginTop: 20,
        overflow: 'hidden',
        background: 'var(--cova-surface)',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={renderUrl}
          alt="Your redesigned room"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />

        {/* Version badge — hidden for first render */}
        {showVersionBadge && (
          <div style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'rgba(10, 22, 40, 0.85)',
            border: '1px solid var(--cova-border)',
            borderRadius: 24,
            padding: '4px 12px',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-xs)',
            color: 'var(--cova-gold)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}>
            Version {versionNumber}
          </div>
        )}
      </div>

      {/* ── Action section ────────────────────────────────────────────────── */}
      <div style={{ padding: '28px 24px 0', flex: 1 }}>

        {/* Heading */}
        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--text-2xl)',
          color: 'var(--cova-ivory)',
          margin: '0 0 6px',
        }}>
          How does it look?
        </h1>
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-sm)',
          color: 'var(--cova-muted)',
          margin: '0 0 24px',
        }}>
          Refine the design or move on to shop your look.
        </p>

        {/* Refinement textarea */}
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Describe what you'd like to change..."
          rows={3}
          style={{
            width: '100%',
            background: 'var(--cova-surface)',
            border: '1px solid var(--cova-border)',
            borderRadius: 8,
            padding: '12px 14px',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-sm)',
            color: 'var(--cova-ivory)',
            resize: 'none',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color var(--transition-base)',
          }}
        />

        {/* Style strength slider */}
        <div style={{ marginTop: 16 }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}>
            <span style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-xs)',
              color: 'var(--cova-muted)',
            }}>
              Style strength
            </span>
            <span style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-xs)',
              color: 'var(--cova-gold)',
            }}>
              {sliderValue}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={sliderValue}
            onChange={(e) => setSliderValue(Number(e.target.value))}
            style={{
              width: '100%',
              accentColor: 'var(--cova-gold)',
              cursor: 'pointer',
            }}
          />
        </div>

        {/* Quick-action: Add Something */}
        <button
          onClick={handleAddSomething}
          style={{
            marginTop: 12,
            background: 'transparent',
            border: '1px solid var(--cova-border)',
            borderRadius: 24,
            padding: '6px 14px',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-xs)',
            color: 'var(--cova-muted)',
            cursor: 'pointer',
            transition: 'border-color var(--transition-base)',
          }}
        >
          + Add something
        </button>

        {/* Primary: Refine My Design */}
        <button
          onClick={handleRefine}
          disabled={isRefineDisabled}
          style={{
            marginTop: 20,
            width: '100%',
            background: isRefineDisabled ? '#8A6E2E' : 'var(--cova-gold)',
            color: 'var(--cova-bg)',
            border: 'none',
            borderRadius: 12,
            padding: '14px 28px',
            fontSize: 15,
            fontWeight: 600,
            cursor: isRefineDisabled ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-sans)',
            opacity: isRefineDisabled ? 0.6 : 1,
            transition: 'opacity var(--transition-base)',
          }}
        >
          Refine My Design
        </button>

        {/* Secondary: Try Again */}
        <button
          onClick={handleTryAgain}
          style={{
            marginTop: 10,
            width: '100%',
            background: 'transparent',
            color: 'var(--cova-muted)',
            border: '1px solid var(--cova-border)',
            borderRadius: 12,
            padding: '14px 28px',
            fontSize: 15,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            transition: 'border-color var(--transition-base)',
          }}
        >
          Try Again
        </button>

        {/* Secondary: Shop This Look */}
        <button
          onClick={handleShopThisLook}
          style={{
            marginTop: 10,
            width: '100%',
            background: 'transparent',
            color: 'var(--cova-gold)',
            border: '1px solid var(--cova-gold)',
            borderRadius: 12,
            padding: '14px 28px',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            transition: 'border-color var(--transition-base)',
          }}
        >
          Shop This Look →
        </button>

        {/* Tertiary: Start Over */}
        <button
          onClick={handleStartOver}
          style={{
            marginTop: 8,
            width: '100%',
            background: 'transparent',
            color: 'var(--cova-muted)',
            border: 'none',
            padding: '10px',
            fontSize: 13,
            fontWeight: 400,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            textDecoration: 'underline',
            opacity: 0.7,
          }}
        >
          Start Over
        </button>
      </div>
    </motion.div>
  )
}
