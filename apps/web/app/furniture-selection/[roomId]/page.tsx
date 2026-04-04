'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import dynamic from 'next/dynamic'

// ─── Rule 2: always dynamic-import SplatViewer with ssr: false ────────────────
const SplatViewer = dynamic(() => import('@/components/SplatViewer'), {
  ssr: false,
  loading: () => null,
})

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_FURNITURE = [
  { id: '1', label: 'Sofa' },
  { id: '2', label: 'Coffee Table' },
  { id: '3', label: 'Floor Lamp' },
  { id: '4', label: 'Armchair' },
  { id: '5', label: 'Area Rug' },
  { id: '6', label: 'Side Table' },
  { id: '7', label: 'Bookshelf' },
  { id: '8', label: 'Desk Chair' },
]

// ─── Icons ────────────────────────────────────────────────────────────────────

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="2" y="6" width="10" height="7" rx="1.5" stroke="#091829" strokeWidth="1.5" />
      <path d="M5 6V4a2 2 0 0 1 4 0v2" stroke="#091829" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function SpinnerIcon({ color = '#091829' }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"
      style={{ animation: 'spin 700ms linear infinite', flexShrink: 0 }}>
      <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="2" strokeOpacity="0.3" />
      <path d="M8 2a6 6 0 0 1 6 6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// ─── Loading overlay ───────────────────────────────────────────────────────────

function LoadingOverlay() {
  const [dots, setDots] = useState('')
  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#091829',
      zIndex: 2,
      pointerEvents: 'none',
    }}>
      <svg width="64" height="48" viewBox="0 0 64 48" fill="none" aria-hidden="true"
        style={{ marginBottom: 20 }}>
        <path d="M4 44Q32 4 60 44" stroke="#C9A84C" strokeWidth="3.5" strokeLinecap="round" fill="none"
          strokeDasharray="90" strokeDashoffset="0"
          style={{ animation: 'arcPulse 1.8s ease-in-out infinite' }} />
      </svg>
      <p style={{
        fontFamily: 'Inter, sans-serif',
        fontSize: 11,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: '#C9A84C',
        opacity: 0.8,
        margin: 0,
      }}>
        Loading your room{dots}
      </p>
    </div>
  )
}

// ─── Furniture row ────────────────────────────────────────────────────────────

interface RowProps {
  label: string
  fixed: boolean
  onToggle: () => void
  isLast: boolean
}

function FurnitureRow({ label, fixed, onToggle, isLast }: RowProps) {
  return (
    <button
      onClick={onToggle}
      aria-label={`${label} — ${fixed ? 'fixed' : 'movable'}. Tap to toggle.`}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        minHeight: 52,
        background: 'transparent',
        border: 'none',
        borderBottom: isLast ? 'none' : '1px solid rgba(201,168,76,0.1)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 150ms ease-out',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Left: icon + label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          color: '#C9A84C',
          fontSize: 16,
          lineHeight: 1,
          flexShrink: 0,
          userSelect: 'none',
        }}>◈</span>
        <span style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 15,
          color: '#F5F0E8',
          userSelect: 'none',
        }}>
          {label}
        </span>
      </div>

      {/* Right: toggle pill */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 13px',
        borderRadius: 999,
        background: fixed ? '#C9A84C' : 'transparent',
        border: fixed ? 'none' : '1.5px solid #C9A84C',
        color: fixed ? '#091829' : '#F5F0E8',
        fontFamily: 'Inter, sans-serif',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        transition: 'all 150ms ease-out',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        userSelect: 'none',
      }}>
        {fixed && <LockIcon />}
        {fixed ? 'Fixed' : 'Movable'}
      </div>
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FurnitureSelectionPage() {
  const router = useRouter()
  const params = useParams()
  const roomId = params?.roomId as string

  const [fixedItems, setFixedItems] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading]   = useState(false)

  // spzUrl is empty — shows loading overlay (wired later)
  const spzUrl = ''

  const toggleFixed = (id: string) => {
    setFixedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const fixedCount   = fixedItems.size
  const movableCount = MOCK_FURNITURE.length - fixedCount

  const handleRedesign = () => {
    if (isLoading) return
    setIsLoading(true)
    console.log('Fixed items:', Array.from(fixedItems))
    setTimeout(() => router.push(`/processing/${roomId}`), 1000)
  }

  return (
    <>
      {/* ── Keyframe animations ── */}
      <style>{`
        @keyframes arcPulse {
          0%, 100% { stroke-dashoffset: 0; opacity: 1; }
          50%       { stroke-dashoffset: 45; opacity: 0.5; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{
        position: 'fixed', inset: 0,
        background: '#091829',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'Inter, sans-serif',
      }}>

        {/* ── Top bar ── */}
        <header style={{
          position: 'relative',
          height: 60,
          flexShrink: 0,
          background: '#091829',
          borderBottom: '1px solid rgba(201,168,76,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px',
          zIndex: 20,
        }}>
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            style={{
              width: 44, height: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#F5F0E8',
              fontSize: 22,
              transition: 'opacity 200ms ease-out',
              borderRadius: 8,
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.6')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            ←
          </button>

          <h1 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 18,
            color: '#F5F0E8',
            letterSpacing: '0.06em',
            margin: 0,
            userSelect: 'none',
          }}>
            Select Furniture
          </h1>

          {/* Spacer to balance back button */}
          <div style={{ width: 44 }} />
        </header>

        {/* ── Top zone: 3D viewer (60% of remaining height) ── */}
        <div style={{
          flex: '0 0 60%',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {spzUrl ? (
            <SplatViewer url={spzUrl} />
          ) : (
            <LoadingOverlay />
          )}
        </div>

        {/* ── Bottom zone: furniture list (40% of remaining height) ── */}
        <div style={{
          flex: '0 0 40%',
          background: '#091829',
          borderTop: '1px solid rgba(201,168,76,0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>

          {/* Header row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 20px 8px',
            flexShrink: 0,
          }}>
            <span style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#C9A84C',
              userSelect: 'none',
            }}>
              Your Furniture
            </span>
            <button
              onClick={() => setFixedItems(new Set())}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
                fontSize: 12,
                color: 'rgba(245,240,232,0.55)',
                padding: '4px 0',
                transition: 'color 150ms ease-out',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#F5F0E8')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(245,240,232,0.55)')}
            >
              All Movable
            </button>
          </div>

          {/* Scrollable list */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}>
            {MOCK_FURNITURE.map((item, i) => (
              <FurnitureRow
                key={item.id}
                label={item.label}
                fixed={fixedItems.has(item.id)}
                onToggle={() => toggleFixed(item.id)}
                isLast={i === MOCK_FURNITURE.length - 1}
              />
            ))}
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <footer style={{
          flexShrink: 0,
          height: 72,
          background: '#091829',
          borderTop: '1px solid rgba(201,168,76,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px',
        }}>
          <p style={{
            margin: 0,
            fontFamily: 'Inter, sans-serif',
            fontSize: 13,
            color: '#F5F0E8',
          }}>
            <strong style={{ color: '#C9A84C' }}>{fixedCount} fixed</strong>
            <span style={{ color: 'rgba(245,240,232,0.55)', marginLeft: 6 }}>
              · {movableCount} movable
            </span>
          </p>

          <button
            onClick={handleRedesign}
            disabled={isLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '11px 20px',
              borderRadius: 24,
              border: 'none',
              background: '#C9A84C',
              color: '#091829',
              fontFamily: 'Inter, sans-serif',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
              transition: 'opacity 200ms ease-out, transform 200ms ease-out',
              minHeight: 44,
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
              if (!isLoading) e.currentTarget.style.transform = 'scale(1.03)'
            }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            {isLoading ? (
              <>
                <SpinnerIcon color="#091829" />
                Starting...
              </>
            ) : (
              'Redesign My Room →'
            )}
          </button>
        </footer>
      </div>
    </>
  )
}
