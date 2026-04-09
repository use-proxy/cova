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
import { motion } from 'framer-motion'
import { createBrowserClient } from '@/lib/supabase/client'
import { useArea2Store } from '@/lib/stores/area2Store'
import type { RoomConstraints } from '@/lib/types/area2'

// ─── Design tokens (kept for JS-driven style values only) ────────────────────

const GOLD = '#C9A84C'
const BORDER = 'rgba(201,168,76,0.15)'
const BORDER_ACTIVE = 'rgba(201,168,76,0.6)'

// ─── Option tables ────────────────────────────────────────────────────────────

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

// ─── Sub-components ────────────────────────────────────────────────────────────

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
}

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={cardVariants}
      className="bg-[rgba(255,255,255,0.04)] border border-[rgba(201,168,76,0.15)] rounded-xl mb-4"
      style={{ padding: '16px 20px' }}
    >
      {children}
    </motion.div>
  )
}

function SectionTitle({
  children,
  required,
}: {
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-cova-ivory text-base font-dm-sans font-semibold m-0">
        {children}
      </h2>
      {required && (
        <span className="text-cova-gold text-[11px] font-dm-sans tracking-[0.08em] uppercase">
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
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isActive = multi
          ? (multiSelected ?? []).includes(opt.id)
          : selected === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            className={[
              'rounded-full px-[14px] py-2 text-[13px] font-dm-sans cursor-pointer transition-all duration-200 ease-out',
              isActive
                ? 'bg-[rgba(201,168,76,0.12)] border border-cova-gold text-cova-gold'
                : 'bg-transparent border border-[rgba(201,168,76,0.15)] text-cova-ivory',
            ].join(' ')}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function DeltaSlider({
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
    <div className="mb-5">
      <div className="flex justify-between text-cova-muted text-[12px] font-dm-sans mb-2">
        <span>{leftLabel}</span>
        <span style={{ color: value === 0 ? GOLD : undefined }} className="text-[11px]">
          {value === 0 ? '— balanced —' : value > 0 ? `+${value}` : `${value}`}
        </span>
        <span>{rightLabel}</span>
      </div>
      <input
        type="range"
        min={-2}
        max={2}
        step={1}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full"
        style={{ accentColor: GOLD }}
      />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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
  const [lightTouched, setLightTouched] = useState(Boolean(roomConstraints))
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

  const inputClassName = 'bg-cova-bg border border-[rgba(201,168,76,0.15)] rounded-lg text-cova-ivory px-3 py-[10px] font-dm-sans text-sm w-full outline-none'

  return (
    <div className="min-h-screen bg-cova-bg font-dm-sans">
      {/* Gold progress bar — fixed top */}
      <div className="fixed top-0 left-0 right-0 h-[3px] bg-[rgba(201,168,76,0.15)] z-[60]">
        <div className="h-full w-[86%] bg-cova-gold transition-[width] duration-[400ms] ease-out" />
      </div>

      {/* Frosted glass top bar */}
      <nav
        className="sticky top-0 z-50 h-14 flex items-center justify-between px-6 border-b border-[rgba(201,168,76,0.1)]"
        style={{ background: 'rgba(9,24,41,0.8)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      >
        <span className="font-playfair italic text-xl text-cova-gold tracking-[0.05em]">Cova</span>
        <span className="font-dm-sans font-semibold text-[15px] text-cova-ivory">Your Space</span>
        <span className="font-dm-sans text-[13px] text-cova-muted">Step 6 of 7</span>
      </nav>

      {/* Main content */}
      <main className="max-w-[680px] mx-auto px-6 pt-20 pb-[120px]">
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="font-playfair text-[36px] text-cova-ivory mb-8 font-normal"
        >
          Tell us about your constraints.
        </motion.h1>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          <SectionCard>
            <SectionTitle required>Can we touch the walls?</SectionTitle>
            <Chips
              options={WALL_OPTIONS}
              selected={state.wallPermanence}
              onSelect={(id) => {
                setState({ ...state, wallPermanence: id })
                setWallTouched(true)
              }}
            />
          </SectionCard>

          <SectionCard>
            <SectionTitle>Physical constraints</SectionTitle>
            <Chips
              options={PHYSICAL_OPTIONS}
              multi
              multiSelected={state.physicalConstraints}
              onSelect={togglePhysical}
            />
          </SectionCard>

          <SectionCard>
            <SectionTitle required>When&rsquo;s the light best?</SectionTitle>
            <Chips
              options={LIGHT_TIMES}
              selected={state.bestLightTime}
              onSelect={(id) => {
                setState({ ...state, bestLightTime: id })
                setLightTouched(true)
              }}
            />
          </SectionCard>

          <SectionCard>
            <SectionTitle>Who uses this room?</SectionTitle>
            <Chips
              options={WHO_USES}
              multi
              multiSelected={state.whoUsesRoom}
              onSelect={toggleWho}
            />
          </SectionCard>

          <SectionCard>
            <SectionTitle>Main purpose?</SectionTitle>
            <Chips
              options={FUNCTIONS}
              multi
              multiSelected={state.primaryFunction}
              onSelect={toggleFn}
            />
          </SectionCard>

          <SectionCard>
            <SectionTitle>Pets or young kids?</SectionTitle>
            <div className="flex gap-3">
              {(['Yes', 'No'] as const).map((label) => {
                const isYes = label === 'Yes'
                const isActive = state.hasPetsOrKids === isYes
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setState({ ...state, hasPetsOrKids: isYes })}
                    className={[
                      'rounded-full px-5 py-2 text-[13px] font-dm-sans cursor-pointer transition-all duration-200 ease-out',
                      isActive
                        ? 'bg-[rgba(201,168,76,0.12)] border border-cova-gold text-cova-gold'
                        : 'bg-transparent border border-[rgba(201,168,76,0.15)] text-cova-ivory',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            {state.hasPetsOrKids && (
              <p className="text-cova-muted text-[12px] font-dm-sans mt-2">
                We&rsquo;ll avoid delicate materials like bouclé and glass tables.
              </p>
            )}
          </SectionCard>

          <SectionCard>
            <SectionTitle>Storage priority</SectionTitle>
            <Chips
              options={STORAGE_OPTIONS}
              selected={state.storagePriority}
              onSelect={(id) => setState({ ...state, storagePriority: id })}
            />
          </SectionCard>

          <SectionCard>
            <SectionTitle>
              Anything coming that&rsquo;s not in the photo?
            </SectionTitle>
            <textarea
              className={`${inputClassName} min-h-[80px] resize-y`}
              value={state.offScreenPieces}
              onChange={(e) => setState({ ...state, offScreenPieces: e.target.value })}
              placeholder="e.g. dark green velvet sofa arriving next month, or a piano I'm keeping"
              onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = BORDER_ACTIVE }}
              onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = BORDER }}
            />
          </SectionCard>

          <SectionCard>
            <SectionTitle>Style direction</SectionTitle>
            <p className="text-cova-muted text-[13px] font-dm-sans mb-4">
              Compared to how it looks now, you want it to feel…
            </p>
            <DeltaSlider
              value={state.styleDirectionDelta.coziness}
              onChange={(v) =>
                setState({
                  ...state,
                  styleDirectionDelta: { ...state.styleDirectionDelta, coziness: v },
                })
              }
              leftLabel="Minimal ←"
              rightLabel="→ Cozy"
            />
            <DeltaSlider
              value={state.styleDirectionDelta.colorBoldness}
              onChange={(v) =>
                setState({
                  ...state,
                  styleDirectionDelta: { ...state.styleDirectionDelta, colorBoldness: v },
                })
              }
              leftLabel="Neutral ←"
              rightLabel="→ Bold"
            />
            <DeltaSlider
              value={state.styleDirectionDelta.traditionality}
              onChange={(v) =>
                setState({
                  ...state,
                  styleDirectionDelta: { ...state.styleDirectionDelta, traditionality: v },
                })
              }
              leftLabel="Modern ←"
              rightLabel="→ Traditional"
            />
          </SectionCard>

          <SectionCard>
            <SectionTitle>Room size</SectionTitle>
            <Chips
              options={ROOM_SIZE}
              selected={state.roomSize}
              onSelect={(id) => setState({ ...state, roomSize: id })}
            />
          </SectionCard>
        </motion.div>

        {/* CTA */}
        <div className="text-center mt-2">
          <motion.button
            type="button"
            disabled={!canContinue || saving}
            onClick={handleContinue}
            whileHover={canContinue ? { scale: 1.02, backgroundColor: '#D4B460' } : {}}
            whileTap={canContinue ? { scale: 0.97 } : {}}
            transition={{ duration: 0.15 }}
            className="border-none rounded-lg px-10 py-[14px] text-base font-semibold font-dm-sans transition-all duration-200 ease-out"
            style={{
              background: canContinue ? GOLD : BORDER,
              color: canContinue ? '#091829' : 'rgba(245,240,232,0.45)',
              cursor: canContinue && !saving ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Saving…' : 'Continue →'}
          </motion.button>
        </div>
      </main>
    </div>
  )
}
