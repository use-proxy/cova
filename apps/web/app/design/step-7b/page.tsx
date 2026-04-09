'use client'

/**
 * Screen B — Constraints.
 *
 * Fast chip-based inputs for context the AI can't see. Target <60s
 * to complete. Wall permanence + best light time are required; all
 * other sections optional.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import { useArea2Store } from '@/lib/stores/area2Store'
import type { RoomConstraints } from '@/lib/types/area2'

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
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-sm)',
  width: '100%',
  outline: 'none',
}

const WALL_OPTIONS: {
  id: RoomConstraints['wallPermanence']
  label: string
}[] = [
  { id: 'own-anything-goes', label: 'Yes, do anything' },
  { id: 'renting-no-paint', label: 'Renting — no painting or drilling' },
  { id: 'some-walls-only', label: 'Some walls only' },
]

const PHYSICAL_OPTIONS = [
  { id: 'radiator', label: 'Radiator' },
  { id: 'column', label: 'Exposed column or beam' },
  { id: 'sloped-ceiling', label: 'Sloped ceiling' },
  { id: 'awkward-alcove', label: 'Awkward alcove' },
  { id: 'structural-wall', label: "Structural wall I can't remove" },
  { id: 'none', label: 'None' },
]

const LIGHT_TIMES: {
  id: RoomConstraints['bestLightTime']
  label: string
}[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
  { id: 'always-dim', label: 'Always dim' },
]

const WHO_USES = [
  { id: 'just-me', label: 'Just me' },
  { id: 'couple', label: 'Couple' },
  { id: 'family-kids', label: 'Family with kids' },
  { id: 'frequent-guests', label: 'Frequent guests' },
]

const FUNCTIONS = [
  { id: 'relaxing', label: 'Relaxing' },
  { id: 'entertaining', label: 'Entertaining' },
  { id: 'wfh', label: 'Working from home' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'sleeping', label: 'Sleeping' },
  { id: 'multi-use', label: 'Multi-use' },
]

const STORAGE_OPTIONS: {
  id: RoomConstraints['storagePriority']
  label: string
}[] = [
  { id: 'low', label: 'Not important' },
  { id: 'medium', label: 'Some' },
  { id: 'high', label: 'A lot — I need storage everywhere' },
]

const ROOM_SIZE: { id: RoomConstraints['roomSize']; label: string }[] = [
  { id: 'small', label: 'Small (under 150 sqft)' },
  { id: 'medium', label: 'Medium (150–300)' },
  { id: 'large', label: 'Large (300+)' },
  { id: 'unknown', label: 'Not sure' },
]

const INITIAL: RoomConstraints = {
  wallPermanence: 'own-anything-goes',
  physicalConstraints: [],
  bestLightTime: 'afternoon',
  roomSize: 'unknown',
  whoUsesRoom: [],
  primaryFunction: [],
  hasPetsOrKids: false,
  storagePriority: 'medium',
  offScreenPieces: '',
  styleDirectionDelta: {
    coziness: 0,
    colorBoldness: 0,
    traditionality: 0,
  },
}

function SectionTitle({
  children,
  required,
}: {
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--space-3)',
      }}
    >
      <h2
        style={{
          color: ivory,
          fontSize: 'var(--text-lg)',
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
        }}
      >
        {children}
      </h2>
      {required && (
        <span
          style={{
            color: gold,
            fontSize: 'var(--text-xs)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Required
        </span>
      )}
    </div>
  )
}

function Chips<T extends string>({
  options,
  selected,
  onSelect,
  multi = false,
  multiSelected,
}: {
  options: { id: T; label: string }[]
  selected?: T | null
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

function Slider({
  value,
  onChange,
  leftLabel,
  rightLabel,
}: {
  value: number
  onChange: (v: number) => void
  leftLabel: string
  rightLabel: string
}) {
  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          color: muted,
          fontSize: 'var(--text-xs)',
          marginBottom: 6,
        }}
      >
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      <input
        type="range"
        min={-2}
        max={2}
        step={1}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        style={{ width: '100%', accentColor: gold }}
      />
    </div>
  )
}

export default function Step7BPage() {
  const router = useRouter()
  const {
    roomId,
    roomConstraints,
    setRoomConstraints,
  } = useArea2Store()

  const [state, setState] = useState<RoomConstraints>(
    roomConstraints ?? INITIAL
  )
  const [wallTouched, setWallTouched] = useState(Boolean(roomConstraints))
  const [lightTouched, setLightTouched] = useState(
    Boolean(roomConstraints)
  )
  const [saving, setSaving] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  const canContinue = wallTouched && lightTouched

  const togglePhysical = (id: string) => {
    const next = state.physicalConstraints.includes(id)
      ? state.physicalConstraints.filter((p) => p !== id)
      : [...state.physicalConstraints, id]
    setState({ ...state, physicalConstraints: next })
  }
  const toggleWho = (id: string) => {
    const next = state.whoUsesRoom.includes(id)
      ? state.whoUsesRoom.filter((p) => p !== id)
      : [...state.whoUsesRoom, id]
    setState({ ...state, whoUsesRoom: next })
  }
  const toggleFn = (id: string) => {
    const next = state.primaryFunction.includes(id)
      ? state.primaryFunction.filter((p) => p !== id)
      : [...state.primaryFunction, id]
    setState({ ...state, primaryFunction: next })
  }

  const handleContinue = async () => {
    if (!canContinue) return
    setSaving(true)
    try {
      setRoomConstraints(state)
      if (roomId) {
        const supabase = createBrowserClient()
        const { data: { session } } = await supabase.auth.getSession()
        const userId = session?.user?.id
        if (!userId) return
        await supabase
          .from('rooms')
          .update({ room_constraints: state, design_step: 2 })
          .eq('id', roomId)
          .eq('user_id', userId)
      }
      router.push('/design/step-7c')
    } finally {
      setSaving(false)
    }
  }

  if (!hydrated) return null

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
          Step 2 of 4
        </div>
      </header>

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
            width: '50%',
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
          A few more things
        </h1>
        <p
          style={{
            color: muted,
            fontSize: 'var(--text-base)',
            marginBottom: 'var(--space-5)',
          }}
        >
          Context the AI can&rsquo;t see. Quick picks — most take one tap.
        </p>

        <section style={sectionStyle}>
          <SectionTitle required>Can we touch the walls?</SectionTitle>
          <Chips
            options={WALL_OPTIONS}
            selected={state.wallPermanence}
            onSelect={(id) => {
              setState({ ...state, wallPermanence: id })
              setWallTouched(true)
            }}
          />
        </section>

        <section style={sectionStyle}>
          <SectionTitle>Physical constraints</SectionTitle>
          <Chips
            options={PHYSICAL_OPTIONS}
            multi
            multiSelected={state.physicalConstraints}
            onSelect={togglePhysical}
          />
        </section>

        <section style={sectionStyle}>
          <SectionTitle required>When&rsquo;s the light best?</SectionTitle>
          <Chips
            options={LIGHT_TIMES}
            selected={state.bestLightTime}
            onSelect={(id) => {
              setState({ ...state, bestLightTime: id })
              setLightTouched(true)
            }}
          />
        </section>

        <section style={sectionStyle}>
          <SectionTitle>Who uses this room?</SectionTitle>
          <Chips
            options={WHO_USES}
            multi
            multiSelected={state.whoUsesRoom}
            onSelect={toggleWho}
          />
        </section>

        <section style={sectionStyle}>
          <SectionTitle>Main purpose?</SectionTitle>
          <Chips
            options={FUNCTIONS}
            multi
            multiSelected={state.primaryFunction}
            onSelect={toggleFn}
          />
        </section>

        <section style={sectionStyle}>
          <SectionTitle>Pets or young kids?</SectionTitle>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            {(['Yes', 'No'] as const).map((label) => {
              const isYes = label === 'Yes'
              const isActive = state.hasPetsOrKids === isYes
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() =>
                    setState({ ...state, hasPetsOrKids: isYes })
                  }
                  style={{
                    background: isActive
                      ? 'var(--cova-gold-dim)'
                      : 'transparent',
                    border: `1px solid ${isActive ? gold : border}`,
                    color: isActive ? gold : ivory,
                    borderRadius: 'var(--radius-pill)',
                    padding: '8px 20px',
                    fontSize: 'var(--text-sm)',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
          {state.hasPetsOrKids && (
            <p
              style={{
                color: muted,
                fontSize: 'var(--text-xs)',
                marginTop: 'var(--space-2)',
              }}
            >
              We&rsquo;ll avoid delicate materials like bouclé and glass tables.
            </p>
          )}
        </section>

        <section style={sectionStyle}>
          <SectionTitle>Storage priority</SectionTitle>
          <Chips
            options={STORAGE_OPTIONS}
            selected={state.storagePriority}
            onSelect={(id) => setState({ ...state, storagePriority: id })}
          />
        </section>

        <section style={sectionStyle}>
          <SectionTitle>
            Anything coming that&rsquo;s not in the photo?
          </SectionTitle>
          <textarea
            style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
            value={state.offScreenPieces}
            onChange={(e) =>
              setState({ ...state, offScreenPieces: e.target.value })
            }
            placeholder="e.g. dark green velvet sofa arriving next month, or a piano I'm keeping"
          />
        </section>

        <section style={sectionStyle}>
          <SectionTitle>Style direction</SectionTitle>
          <p
            style={{
              color: muted,
              fontSize: 'var(--text-sm)',
              marginBottom: 'var(--space-3)',
            }}
          >
            Compared to how it looks now, you want it to feel…
          </p>
          <Slider
            value={state.styleDirectionDelta.coziness}
            onChange={(v) =>
              setState({
                ...state,
                styleDirectionDelta: {
                  ...state.styleDirectionDelta,
                  coziness: v,
                },
              })
            }
            leftLabel="More minimal"
            rightLabel="More cozy"
          />
          <Slider
            value={state.styleDirectionDelta.colorBoldness}
            onChange={(v) =>
              setState({
                ...state,
                styleDirectionDelta: {
                  ...state.styleDirectionDelta,
                  colorBoldness: v,
                },
              })
            }
            leftLabel="More neutral colors"
            rightLabel="Bolder colors"
          />
          <Slider
            value={state.styleDirectionDelta.traditionality}
            onChange={(v) =>
              setState({
                ...state,
                styleDirectionDelta: {
                  ...state.styleDirectionDelta,
                  traditionality: v,
                },
              })
            }
            leftLabel="More contemporary"
            rightLabel="More traditional"
          />
        </section>

        <section style={sectionStyle}>
          <SectionTitle>Room size</SectionTitle>
          <Chips
            options={ROOM_SIZE}
            selected={state.roomSize}
            onSelect={(id) => setState({ ...state, roomSize: id })}
          />
        </section>

        <button
          type="button"
          disabled={!canContinue || saving}
          onClick={handleContinue}
          style={{
            width: '100%',
            background: canContinue ? gold : border,
            color: canContinue ? 'var(--cova-bg)' : muted,
            border: 'none',
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px',
            fontSize: 'var(--text-lg)',
            fontWeight: 600,
            cursor: canContinue && !saving ? 'pointer' : 'not-allowed',
            marginTop: 'var(--space-4)',
            transition: 'all var(--transition-base)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {saving ? 'Saving…' : 'Continue →'}
        </button>
      </main>
    </div>
  )
}
