'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useRoomStore } from '@/lib/store/room'
import { useSessionStore } from '@/lib/store/session'
import { useRefineStore } from '@/lib/store/refine'
import { StepIndicator } from '@/components/cova/StepIndicator'

// ─── Cycling placeholder texts ───────────────────────────────────────────────

const PLACEHOLDERS = [
  'Add more natural light...',
  'Include a statement rug...',
  'Change the palette to warmer tones...',
  'Replace the sofa with something more modern...',
  'Make it feel more cozy and inviting...',
]

// ─── Slider transform labels ─────────────────────────────────────────────────

function getTransformLabel(value: number): { label: string; description: string } {
  if (value <= 25)
    return {
      label: 'Subtle touch-up',
      description: 'Adjust colors, lighting, and small details. Furniture stays the same.',
    }
  if (value <= 50)
    return {
      label: 'Moderate refresh',
      description: 'New palette and accessories. Main furniture pieces are replaced.',
    }
  if (value <= 75)
    return {
      label: 'Significant redesign',
      description: 'New furniture, new palette, new layout. Same room structure.',
    }
  return {
    label: 'Complete reimagination',
    description: 'Everything changes. Only the walls and floor stay.',
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Step9Page() {
  const router = useRouter()

  const { renderUrl, renderSessions, addRenderSession } = useRoomStore()
  const { setStep } = useSessionStore()
  const { setRefinement, clearRefinement } = useRefineStore()

  const [inputValue, setInputValue] = useState('')
  const [sliderValue, setSliderValue] = useState(70)
  const [isFocused, setIsFocused] = useState(false)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Guard — redirect if no render URL
  useEffect(() => {
    if (!renderUrl) {
      router.replace('/design/step-8')
    }
  }, [renderUrl, router])

  // Cycle placeholder every 3s when unfocused and textarea is empty
  useEffect(() => {
    if (isFocused || inputValue.trim()) return
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDERS.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [isFocused, inputValue])

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
      previewUrl: null,
      parallaxVideoUrl: null,
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
    setInputValue('Include a ')
    setTimeout(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }, 0)
  }

  const transformInfo = getTransformLabel(sliderValue)

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ backgroundColor: '#091829' }}
    >
      <StepIndicator currentStep={9} totalSteps={10} />
      {/* ── Zone 1: Render image ──────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={renderUrl}
          alt="Your redesigned room"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Progress bar overlay */}
        <div className="absolute top-5 left-5 right-5">
          <div className="flex items-center justify-between mb-2">
            <span className="font-sans text-[11px]" style={{ color: '#8A9BB5' }}>
              9 of 10
            </span>
          </div>
          <div
            className="h-[2px] rounded-full overflow-hidden"
            style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${(9 / 10) * 100}%`, backgroundColor: '#C9A84C' }}
            />
          </div>
        </div>

        {/* Version badge — hidden on first render */}
        {showVersionBadge && (
          <p
            className="absolute top-4 right-5 font-sans text-[11px]"
            style={{ color: '#8A9BB5' }}
          >
            Version {versionNumber}
          </p>
        )}
      </div>

      {/* ── Zone 2: Panel ────────────────────────────────────────────────── */}
      <div
        className="relative flex-shrink-0 w-full overflow-y-auto"
        style={{
          backgroundColor: '#0D2035',
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          marginTop: '-24px',
          maxHeight: 'min(68vh, 680px)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-8 h-1 rounded-full" style={{ backgroundColor: '#1E3A5F' }} />
        </div>

        <div className="px-5 pb-8 pt-3">
          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-[22px] font-normal" style={{ color: '#F8F6F1' }}>
              How does it look?
            </h2>
            <button
              onClick={handleShopThisLook}
              className="font-sans text-[14px] transition-colors hover:underline"
              style={{
                color: '#C9A84C',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Shop This Look →
            </button>
          </div>

          {/* Textarea card */}
          <div
            className="rounded-xl p-3 mb-3 transition-colors"
            style={{
              backgroundColor: '#091829',
              border: `1px solid ${isFocused ? '#C9A84C' : '#1E3A5F'}`,
            }}
          >
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={PLACEHOLDERS[placeholderIndex]}
              rows={3}
              className="w-full bg-transparent font-sans text-[14px] leading-relaxed resize-none outline-none"
              style={{ color: '#F8F6F1', caretColor: '#C9A84C' }}
            />
            <div className="flex justify-end mt-1">
              <button
                onClick={handleAddSomething}
                className="font-sans text-[12px] px-3 py-1 rounded-full transition-colors"
                style={{
                  color: '#8A9BB5',
                  backgroundColor: '#0D2035',
                  border: '1px solid #1E3A5F',
                  cursor: 'pointer',
                }}
              >
                + Add something
              </button>
            </div>
          </div>

          {/* Slider section */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-sans text-[12px]" style={{ color: '#8A9BB5' }}>
                Design transformation
              </span>
            </div>

            {/* Live transform label */}
            <div>
              <p
                className="font-sans text-[13px] font-medium mb-1"
                style={{ color: '#C9A84C' }}
              >
                {transformInfo.label}
              </p>
              <p
                className="font-sans text-[12px] mb-3 leading-relaxed"
                style={{ color: '#8A9BB5', minHeight: '32px' }}
              >
                {transformInfo.description}
              </p>
            </div>

            {/* Custom slider track */}
            <div className="relative h-8 flex items-center">
              {/* Track background */}
              <div
                className="absolute left-0 right-0 h-1 rounded-full overflow-hidden"
                style={{ backgroundColor: '#1E3A5F' }}
              >
                {/* Filled portion */}
                <div
                  className="h-full rounded-full"
                  style={{ width: `${sliderValue}%`, backgroundColor: '#C9A84C' }}
                />
              </div>
              {/* Visual thumb */}
              <div
                className="absolute w-5 h-5 rounded-full pointer-events-none"
                style={{
                  left: `calc(${sliderValue}% - 10px)`,
                  backgroundColor: '#C9A84C',
                  border: '2px solid #091829',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                }}
              />
              {/* Invisible native input */}
              <input
                type="range"
                min={0}
                max={100}
                value={sliderValue}
                onChange={(e) => setSliderValue(Number(e.target.value))}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
              />
            </div>

            {/* Rail labels */}
            <div className="flex justify-between mt-1">
              <span className="font-sans text-[11px]" style={{ color: '#3A5272' }}>
                Subtle
              </span>
              <span className="font-sans text-[11px]" style={{ color: '#3A5272' }}>
                Complete
              </span>
            </div>
          </div>

          {/* Primary: Refine My Design */}
          <button
            onClick={handleRefine}
            disabled={isRefineDisabled}
            className="w-full font-sans text-[15px] font-semibold py-[14px] transition-opacity"
            style={{
              backgroundColor: isRefineDisabled ? '#8A6E2E' : '#C9A84C',
              color: '#091829',
              borderRadius: '14px',
              border: 'none',
              opacity: isRefineDisabled ? 0.6 : 1,
              cursor: isRefineDisabled ? 'not-allowed' : 'pointer',
            }}
          >
            Refine My Design
          </button>

          {/* Secondary row: Try Again + Start Over */}
          <div className="flex gap-3 mt-3">
            <button
              onClick={handleTryAgain}
              className="flex-1 font-sans text-[14px] font-medium py-[12px] rounded-xl transition-colors"
              style={{
                backgroundColor: 'transparent',
                color: '#8A9BB5',
                border: '1px solid #1E3A5F',
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
            <button
              onClick={handleStartOver}
              className="flex-1 font-sans text-[14px] font-medium py-[12px] rounded-xl transition-colors"
              style={{
                backgroundColor: 'transparent',
                color: '#8A9BB5',
                border: '1px solid #1E3A5F',
                cursor: 'pointer',
              }}
            >
              Start Over
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
