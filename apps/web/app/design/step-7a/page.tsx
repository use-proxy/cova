'use client'

/**
 * Screen A — Room Read.
 *
 * Shows the Claude Vision-extracted room context and lets the user
 * confirm or correct each field. Target 15–30s to complete.
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import { useArea2Store } from '@/lib/stores/area2Store'
import { useRoomStore } from '@/lib/store/room'
import type { RoomContext } from '@/lib/types/area2'

// ─── Option tables ──────────────────────────────────────────────────────────

const ROOM_SHAPE: { id: RoomContext['roomShape']; label: string }[] = [
  { id: 'rectangular', label: 'Rectangular' },
  { id: 'l-shaped', label: 'L-shaped' },
  { id: 'open-plan', label: 'Open plan' },
  { id: 'irregular', label: 'Irregular' },
]

const CEILING_HEIGHT: {
  id: RoomContext['ceilingHeight']
  label: string
}[] = [
  { id: 'low', label: 'Low' },
  { id: 'standard-8ft', label: 'Standard' },
  { id: 'high', label: 'High' },
  { id: 'vaulted', label: 'Vaulted' },
  { id: 'coffered', label: 'Coffered' },
]

const LIGHT_DIRECTION: {
  id: RoomContext['naturalLightDirection']
  label: string
}[] = [
  { id: 'left', label: 'From left' },
  { id: 'right', label: 'From right' },
  { id: 'front', label: 'From front' },
  { id: 'back', label: 'From back' },
  { id: 'overhead', label: 'Overhead' },
  { id: 'multiple', label: 'Multiple' },
  { id: 'minimal', label: 'Minimal' },
]

const LIGHT_QUALITY: {
  id: RoomContext['naturalLightQuality']
  label: string
}[] = [
  { id: 'strong-direct', label: 'Strong direct' },
  { id: 'soft-diffused', label: 'Soft diffused' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'none', label: 'None' },
]

const WINDOW_SIZE: { id: RoomContext['windowSize']; label: string }[] = [
  { id: 'small-single', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
  { id: 'floor-to-ceiling', label: 'Floor to ceiling' },
  { id: 'multiple-mixed', label: 'Mixed sizes' },
]

const WALL_TEXTURE: { id: RoomContext['wallTexture']; label: string }[] = [
  { id: 'smooth-matte', label: 'Smooth matte' },
  { id: 'smooth-glossy', label: 'Smooth glossy' },
  { id: 'textured', label: 'Textured' },
  { id: 'wallpapered', label: 'Wallpapered' },
  { id: 'exposed-brick', label: 'Exposed brick' },
  { id: 'paneled', label: 'Paneled' },
]

const CAMERA_ANGLE: { id: RoomContext['cameraAngle']; label: string }[] = [
  { id: 'eye-level', label: 'Eye level' },
  { id: 'slightly-elevated', label: 'Slightly elevated' },
  { id: 'corner-wide', label: 'Corner wide' },
  { id: 'straight-on', label: 'Straight on' },
]

const FEATURE_CHIPS = [
  'fireplace',
  'exposed brick',
  'skylight',
  'wainscoting',
  'built-ins',
  'arch doorway',
  'coffered ceiling',
  'herringbone floor',
  'subway tile',
  'crown molding',
  'bay window',
  'columns',
]

// ─── Styling helpers (all values reference tokens.css vars) ─────────────────

const bg = 'var(--cova-bg)'
const surface = 'var(--cova-surface)'
const border = 'var(--cova-border)'
const gold = 'var(--cova-gold)'
const ivory = 'var(--cova-ivory)'
const muted = 'var(--cova-muted)'

const sectionStyle: React.CSSProperties = {
  background: surface,
  border: `1px solid ${border}`,
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-5)',
  marginBottom: 'var(--space-4)',
}

const inputStyle: React.CSSProperties = {
  background: bg,
  border: `1px solid ${border}`,
  borderRadius: 'var(--radius-md)',
  color: ivory,
  padding: '10px 12px',
  fontFamily: 'var(--cova-font, var(--font-sans))',
  fontSize: 'var(--text-sm)',
  width: '100%',
  outline: 'none',
}

function ChipGroup<T extends string>({
  options,
  selected,
  onSelect,
  multi = false,
  multiSelected,
}: {
  options: { id: T; label: string }[]
  selected?: T
  onSelect: (id: T) => void
  multi?: boolean
  multiSelected?: T[]
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-2)',
      }}
    >
      {options.map((opt) => {
        const isActive = multi
          ? (multiSelected ?? []).includes(opt.id)
          : selected === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            style={{
              background: isActive ? 'var(--cova-gold-dim)' : 'transparent',
              border: `1px solid ${isActive ? gold : border}`,
              color: isActive ? gold : ivory,
              borderRadius: 'var(--radius-pill)',
              padding: '8px 14px',
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
              transition: 'all var(--transition-base)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        color: ivory,
        fontSize: 'var(--text-lg)',
        fontFamily: 'var(--font-sans)',
        marginBottom: 'var(--space-3)',
        fontWeight: 600,
      }}
    >
      {children}
    </h2>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: 'block',
        color: muted,
        fontSize: 'var(--text-xs)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: 'var(--space-2)',
        marginTop: 'var(--space-3)',
      }}
    >
      {children}
    </label>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function Step7APage() {
  const router = useRouter()
  const {
    roomId,
    roomContext: storeCtx,
    setRoomContext,
    updateRoomContextField,
  } = useArea2Store()

  const [saving, setSaving] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [bridging, setBridging] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  // Bridge from legacy roomStore → area2Store on mount.
  useEffect(() => {
    const { roomId: legacyRoomId, originalPhotoUrl } = useRoomStore.getState()
    const area2 = useArea2Store.getState()
    if (legacyRoomId && !area2.roomId) {
      area2.setRoom(legacyRoomId, originalPhotoUrl ?? '')
      setBridging(true)
      const supabase = createBrowserClient()
      void (async () => {
        try {
          const { data } = await supabase
            .from('rooms')
            .select('room_context, keep_mask, detection_status')
            .eq('id', legacyRoomId)
            .single()
          if (data?.room_context) {
            area2.setRoomContext(data.room_context as RoomContext)
          }
          if (data?.keep_mask) {
            area2.setKeepMask(data.keep_mask)
          }
          if (data?.detection_status) {
            const statusMap: Record<string, string> = {
              pending: 'pending', running: 'running',
              complete: 'complete', failed: 'failed',
            }
            useArea2Store.setState({
              detectionStatus: (statusMap[data.detection_status] ?? 'pending') as
                'pending' | 'running' | 'complete' | 'failed',
            })
          }
        } finally {
          setBridging(false)
        }
      })()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Local editable copy — flushed on "Looks right".
  const [ctx, setCtx] = useState<RoomContext | null>(storeCtx)

  useEffect(() => {
    if (storeCtx && !ctx) setCtx(storeCtx)
  }, [storeCtx, ctx])

  const featureSet = useMemo(
    () => new Set(ctx?.architecturalFeatures ?? []),
    [ctx?.architecturalFeatures]
  )

  if (!hydrated) return null

  if (bridging) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: bg,
          padding: 'var(--space-8) var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          maxWidth: 720,
          margin: '0 auto',
        }}
      >
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 56,
              background: 'var(--cova-surface)',
              borderRadius: 'var(--radius-md)',
              animation: 'covaSkeleton 1.4s ease-in-out infinite',
              opacity: 1 - i * 0.15,
            }}
          />
        ))}
        <style>{`
          @keyframes covaSkeleton {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
          }
        `}</style>
      </div>
    )
  }

  // Manual-entry fallback if detection failed / hasn't run.
  const workingCtx: RoomContext = ctx ?? {
    roomShape: 'rectangular',
    estimatedDimensions: '',
    ceilingHeight: 'standard-8ft',
    ceilingDetail: '',
    naturalLightDirection: 'multiple',
    naturalLightQuality: 'soft-diffused',
    windowCount: 1,
    windowSize: 'medium',
    floorMaterial: '',
    floorColor: '',
    wallColor: '',
    hasAccentWall: false,
    wallTexture: 'smooth-matte',
    cameraAngle: 'eye-level',
    focalLength: 'wide-angle',
    architecturalFeatures: [],
    dominantColors: [],
    colorTemperature: 'neutral',
    existingStyleFingerprint: '',
    surfaceTextures: '',
    userNotes: '',
    aiConfidence: 0,
  }

  const update = <K extends keyof RoomContext>(
    key: K,
    value: RoomContext[K]
  ) => {
    const next: RoomContext = { ...workingCtx, [key]: value }
    setCtx(next)
    updateRoomContextField(key, value)
  }

  const toggleFeature = (feature: string) => {
    const next = featureSet.has(feature)
      ? workingCtx.architecturalFeatures.filter((f) => f !== feature)
      : [...workingCtx.architecturalFeatures, feature]
    update('architecturalFeatures', next)
  }

  const handleContinue = async () => {
    if (!ctx || !roomId) {
      // No context + no room id — the user is out of flow, skip save and move on.
      router.push('/design/step-7b')
      return
    }
    setSaving(true)
    try {
      setRoomContext(ctx)
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) return
      await supabase
        .from('rooms')
        .update({ room_context: ctx, design_step: 1 })
        .eq('id', roomId)
        .eq('user_id', userId)
      router.push('/design/step-7b')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: bg,
        color: ivory,
        fontFamily: 'var(--font-sans)',
        paddingBottom: 'var(--space-16)',
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: 'var(--space-5) var(--space-5) var(--space-3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            background: 'transparent',
            border: `1px solid ${border}`,
            color: muted,
            borderRadius: 'var(--radius-md)',
            padding: '6px 12px',
            cursor: 'pointer',
            fontSize: 'var(--text-sm)',
          }}
        >
          ← Back
        </button>
        <div style={{ color: muted, fontSize: 'var(--text-xs)' }}>
          Step 1 of 4
        </div>
      </header>

      {/* Progress bar */}
      <div
        style={{
          margin: '0 var(--space-5) var(--space-5)',
          height: 3,
          background: border,
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: '25%',
            height: '100%',
            background: gold,
            transition: 'width var(--transition-base)',
          }}
        />
      </div>

      <main
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '0 var(--space-5)',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--text-3xl)',
            marginBottom: 'var(--space-2)',
          }}
        >
          Does this look right?
        </h1>
        <p
          style={{
            color: muted,
            fontSize: 'var(--text-base)',
            marginBottom: 'var(--space-5)',
          }}
        >
          We analyzed your room — confirm anything that looks off.
        </p>

        {/* AI badge banner */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            background: 'var(--cova-gold-dim)',
            border: `1px solid var(--cova-gold-border)`,
            color: gold,
            borderRadius: 'var(--radius-pill)',
            padding: '4px 12px',
            fontSize: 'var(--text-xs)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 'var(--space-5)',
          }}
        >
          AI auto
        </div>

        {/* Room Structure */}
        <section style={sectionStyle}>
          <SectionTitle>Room structure</SectionTitle>
          <FieldLabel>Shape</FieldLabel>
          <ChipGroup
            options={ROOM_SHAPE}
            selected={workingCtx.roomShape}
            onSelect={(v) => update('roomShape', v)}
          />
          <FieldLabel>Ceiling height</FieldLabel>
          <ChipGroup
            options={CEILING_HEIGHT}
            selected={workingCtx.ceilingHeight}
            onSelect={(v) => update('ceilingHeight', v)}
          />
          <FieldLabel>Ceiling detail</FieldLabel>
          <input
            style={inputStyle}
            value={workingCtx.ceilingDetail}
            onChange={(e) => update('ceilingDetail', e.target.value)}
            placeholder="e.g. coffered with painted wood beams"
          />
          <FieldLabel>Estimated dimensions</FieldLabel>
          <input
            style={inputStyle}
            value={workingCtx.estimatedDimensions}
            onChange={(e) => update('estimatedDimensions', e.target.value)}
            placeholder="approximately 15×18ft"
          />
        </section>

        {/* Natural Light */}
        <section style={sectionStyle}>
          <SectionTitle>Natural light</SectionTitle>
          <FieldLabel>Direction</FieldLabel>
          <ChipGroup
            options={LIGHT_DIRECTION}
            selected={workingCtx.naturalLightDirection}
            onSelect={(v) => update('naturalLightDirection', v)}
          />
          <FieldLabel>Quality</FieldLabel>
          <ChipGroup
            options={LIGHT_QUALITY}
            selected={workingCtx.naturalLightQuality}
            onSelect={(v) => update('naturalLightQuality', v)}
          />
          <FieldLabel>Window count</FieldLabel>
          <input
            type="number"
            min={0}
            style={inputStyle}
            value={workingCtx.windowCount}
            onChange={(e) =>
              update(
                'windowCount',
                Math.max(0, parseInt(e.target.value, 10) || 0)
              )
            }
          />
          <FieldLabel>Window size</FieldLabel>
          <ChipGroup
            options={WINDOW_SIZE}
            selected={workingCtx.windowSize}
            onSelect={(v) => update('windowSize', v)}
          />
        </section>

        {/* Materials */}
        <section style={sectionStyle}>
          <SectionTitle>Materials</SectionTitle>
          <FieldLabel>Floor material</FieldLabel>
          <input
            style={inputStyle}
            value={workingCtx.floorMaterial}
            onChange={(e) => update('floorMaterial', e.target.value)}
            placeholder="e.g. light oak hardwood"
          />
          <FieldLabel>Floor color</FieldLabel>
          <input
            style={inputStyle}
            value={workingCtx.floorColor}
            onChange={(e) => update('floorColor', e.target.value)}
            placeholder="e.g. warm honey"
          />
          <FieldLabel>Wall color</FieldLabel>
          <input
            style={inputStyle}
            value={workingCtx.wallColor}
            onChange={(e) => update('wallColor', e.target.value)}
            placeholder="e.g. warm greige — be specific"
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              marginTop: 'var(--space-3)',
            }}
          >
            <input
              id="accentWall"
              type="checkbox"
              checked={workingCtx.hasAccentWall}
              onChange={(e) => update('hasAccentWall', e.target.checked)}
              style={{ accentColor: gold }}
            />
            <label htmlFor="accentWall" style={{ color: muted }}>
              Has an accent wall
            </label>
          </div>
          {workingCtx.hasAccentWall && (
            <>
              <FieldLabel>Accent wall color</FieldLabel>
              <input
                style={inputStyle}
                value={workingCtx.accentWallColor ?? ''}
                onChange={(e) => update('accentWallColor', e.target.value)}
                placeholder="e.g. deep forest green"
              />
            </>
          )}
          <FieldLabel>Wall texture</FieldLabel>
          <ChipGroup
            options={WALL_TEXTURE}
            selected={workingCtx.wallTexture}
            onSelect={(v) => update('wallTexture', v)}
          />
        </section>

        {/* Camera & perspective */}
        <section style={sectionStyle}>
          <SectionTitle>Camera &amp; perspective</SectionTitle>
          <FieldLabel>Camera angle</FieldLabel>
          <ChipGroup
            options={CAMERA_ANGLE}
            selected={workingCtx.cameraAngle}
            onSelect={(v) => update('cameraAngle', v)}
          />
        </section>

        {/* Architectural features */}
        <section style={sectionStyle}>
          <SectionTitle>Architectural features</SectionTitle>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-2)',
            }}
          >
            {FEATURE_CHIPS.map((feature) => {
              const isActive = featureSet.has(feature)
              return (
                <button
                  key={feature}
                  type="button"
                  onClick={() => toggleFeature(feature)}
                  style={{
                    background: isActive
                      ? 'var(--cova-gold-dim)'
                      : 'transparent',
                    border: `1px solid ${isActive ? gold : border}`,
                    color: isActive ? gold : ivory,
                    borderRadius: 'var(--radius-pill)',
                    padding: '8px 14px',
                    fontSize: 'var(--text-sm)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-base)',
                    textTransform: 'capitalize',
                  }}
                >
                  {feature}
                </button>
              )
            })}
          </div>
        </section>

        {/* Palette & fingerprint */}
        <section style={sectionStyle}>
          <SectionTitle>Color palette</SectionTitle>
          {workingCtx.dominantColors.length > 0 ? (
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-2)',
                flexWrap: 'wrap',
                marginBottom: 'var(--space-3)',
              }}
            >
              {workingCtx.dominantColors.map((c) => (
                <span
                  key={c}
                  style={{
                    background: bg,
                    border: `1px solid ${border}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '6px 10px',
                    color: muted,
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
          ) : (
            <p
              style={{
                color: muted,
                fontSize: 'var(--text-sm)',
                marginBottom: 'var(--space-3)',
              }}
            >
              No palette extracted.
            </p>
          )}
          <FieldLabel>Existing style fingerprint</FieldLabel>
          <input
            style={inputStyle}
            value={workingCtx.existingStyleFingerprint}
            onChange={(e) =>
              update('existingStyleFingerprint', e.target.value)
            }
            placeholder="one sentence describing the current feel"
          />
        </section>

        {/* User notes */}
        <section style={sectionStyle}>
          <SectionTitle>Anything we missed?</SectionTitle>
          <textarea
            style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
            value={workingCtx.userNotes}
            onChange={(e) => update('userNotes', e.target.value)}
            placeholder="e.g. there's a sloped ceiling on the left side, or a structural column near the window…"
          />
        </section>

        {/* CTA */}
        <button
          type="button"
          disabled={saving}
          onClick={handleContinue}
          style={{
            width: '100%',
            background: gold,
            color: 'var(--cova-bg)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px',
            fontSize: 'var(--text-lg)',
            fontWeight: 600,
            cursor: saving ? 'wait' : 'pointer',
            marginTop: 'var(--space-4)',
            transition: 'transform var(--transition-fast)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {saving ? 'Saving…' : 'Looks right →'}
        </button>
      </main>
    </div>
  )
}
