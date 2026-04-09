'use client'

/**
 * Screen A — Room Read.
 *
 * Shows the Claude Vision-extracted room context and lets the user
 * confirm or correct each field. Target 15–30s to complete.
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Box, Sun, Layers, Camera, Sparkles, Palette, Info } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/client'
import { useArea2Store } from '@/lib/stores/area2Store'
import { useRoomStore } from '@/lib/store/room'
import type { RoomContext } from '@/lib/types/area2'

// ─── Design tokens (kept for JS-driven style values only) ────────────────────

const GOLD = '#C9A84C'
const BORDER = 'rgba(201,168,76,0.15)'
const BORDER_ACTIVE = 'rgba(201,168,76,0.6)'

// ─── Option tables ────────────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

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
      className="bg-[rgba(255,255,255,0.04)] border border-[rgba(201,168,76,0.15)] rounded-xl p-4 mb-4"
      style={{ padding: '16px 20px' }}
    >
      {children}
    </motion.div>
  )
}

function SectionHeader({
  icon,
  label,
}: {
  icon: React.ReactNode
  label: string
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <span className="font-dm-sans text-[11px] font-medium text-cova-muted uppercase tracking-[0.12em]">
        {label}
      </span>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-cova-muted text-[11px] font-dm-sans font-medium uppercase tracking-[0.12em] mb-2 mt-3">
      {children}
    </label>
  )
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

// ─── Page ─────────────────────────────────────────────────────────────────────

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
      <div className="min-h-screen bg-cova-bg pt-20 px-6 flex flex-col gap-4 max-w-[720px] mx-auto font-dm-sans">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-14 rounded-xl"
            style={{
              background: 'linear-gradient(90deg, rgba(201,168,76,0.08) 0%, rgba(201,168,76,0.15) 50%, rgba(201,168,76,0.08) 100%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite ease-in-out',
              opacity: 1 - i * 0.15,
            }}
          />
        ))}
        <style>{`
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
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

  const inputClassName = 'bg-cova-bg border border-[rgba(201,168,76,0.15)] rounded-lg text-cova-ivory px-3 py-[10px] font-dm-sans text-sm w-full outline-none'

  return (
    <div className="min-h-screen bg-cova-bg font-dm-sans">
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

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
        <span className="font-dm-sans font-semibold text-[15px] text-cova-ivory">Room Analysis</span>
        <span className="font-dm-sans text-[13px] text-cova-muted">Step 6 of 7</span>
      </nav>

      {/* Main content */}
      <main className="max-w-[800px] mx-auto px-6 pt-20 pb-[120px]">
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="font-playfair text-[36px] text-cova-ivory mb-8 font-normal"
        >
          Here&rsquo;s what we found.
        </motion.h1>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {/* Room Structure */}
          <SectionCard>
            <SectionHeader icon={<Box size={16} color={GOLD} />} label="Room Structure" />
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
              className={inputClassName}
              value={workingCtx.ceilingDetail}
              onChange={(e) => update('ceilingDetail', e.target.value)}
              placeholder="e.g. coffered with painted wood beams"
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = BORDER_ACTIVE }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = BORDER }}
            />
            <FieldLabel>Estimated dimensions</FieldLabel>
            <input
              className={inputClassName}
              value={workingCtx.estimatedDimensions}
              onChange={(e) => update('estimatedDimensions', e.target.value)}
              placeholder="approximately 15×18ft"
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = BORDER_ACTIVE }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = BORDER }}
            />
          </SectionCard>

          {/* Natural Light */}
          <SectionCard>
            <SectionHeader icon={<Sun size={16} color={GOLD} />} label="Natural Light" />
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
              className={inputClassName}
              value={workingCtx.windowCount}
              onChange={(e) =>
                update(
                  'windowCount',
                  Math.max(0, parseInt(e.target.value, 10) || 0)
                )
              }
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = BORDER_ACTIVE }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = BORDER }}
            />
            <FieldLabel>Window size</FieldLabel>
            <ChipGroup
              options={WINDOW_SIZE}
              selected={workingCtx.windowSize}
              onSelect={(v) => update('windowSize', v)}
            />
          </SectionCard>

          {/* Materials */}
          <SectionCard>
            <SectionHeader icon={<Layers size={16} color={GOLD} />} label="Materials" />
            <FieldLabel>Floor material</FieldLabel>
            <input
              className={inputClassName}
              value={workingCtx.floorMaterial}
              onChange={(e) => update('floorMaterial', e.target.value)}
              placeholder="e.g. light oak hardwood"
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = BORDER_ACTIVE }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = BORDER }}
            />
            <FieldLabel>Floor color</FieldLabel>
            <input
              className={inputClassName}
              value={workingCtx.floorColor}
              onChange={(e) => update('floorColor', e.target.value)}
              placeholder="e.g. warm honey"
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = BORDER_ACTIVE }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = BORDER }}
            />
            <FieldLabel>Wall color</FieldLabel>
            <input
              className={inputClassName}
              value={workingCtx.wallColor}
              onChange={(e) => update('wallColor', e.target.value)}
              placeholder="e.g. warm greige — be specific"
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = BORDER_ACTIVE }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = BORDER }}
            />
            <div className="flex items-center gap-3 mt-3">
              <input
                id="accentWall"
                type="checkbox"
                checked={workingCtx.hasAccentWall}
                onChange={(e) => update('hasAccentWall', e.target.checked)}
                style={{ accentColor: GOLD }}
              />
              <label htmlFor="accentWall" className="text-cova-muted font-dm-sans text-sm">
                Has an accent wall
              </label>
            </div>
            {workingCtx.hasAccentWall && (
              <>
                <FieldLabel>Accent wall color</FieldLabel>
                <input
                  className={inputClassName}
                  value={workingCtx.accentWallColor ?? ''}
                  onChange={(e) => update('accentWallColor', e.target.value)}
                  placeholder="e.g. deep forest green"
                  onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = BORDER_ACTIVE }}
                  onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = BORDER }}
                />
              </>
            )}
            <FieldLabel>Wall texture</FieldLabel>
            <ChipGroup
              options={WALL_TEXTURE}
              selected={workingCtx.wallTexture}
              onSelect={(v) => update('wallTexture', v)}
            />
          </SectionCard>

          {/* Camera & perspective */}
          <SectionCard>
            <SectionHeader icon={<Camera size={16} color={GOLD} />} label="Camera" />
            <FieldLabel>Camera angle</FieldLabel>
            <ChipGroup
              options={CAMERA_ANGLE}
              selected={workingCtx.cameraAngle}
              onSelect={(v) => update('cameraAngle', v)}
            />
          </SectionCard>

          {/* Architectural features */}
          <SectionCard>
            <SectionHeader icon={<Sparkles size={16} color={GOLD} />} label="Features" />
            <div className="flex flex-wrap gap-2">
              {FEATURE_CHIPS.map((feature) => {
                const isActive = featureSet.has(feature)
                return (
                  <button
                    key={feature}
                    type="button"
                    onClick={() => toggleFeature(feature)}
                    className={[
                      'rounded-full px-[14px] py-2 text-[13px] font-dm-sans cursor-pointer transition-all duration-200 ease-out capitalize',
                      isActive
                        ? 'bg-[rgba(201,168,76,0.12)] border border-cova-gold text-cova-gold'
                        : 'bg-transparent border border-[rgba(201,168,76,0.15)] text-cova-ivory',
                    ].join(' ')}
                  >
                    {feature}
                  </button>
                )
              })}
            </div>
          </SectionCard>

          {/* Color palette */}
          <SectionCard>
            <SectionHeader icon={<Palette size={16} color={GOLD} />} label="Color Palette" />
            {workingCtx.dominantColors.length > 0 ? (
              <div className="flex gap-2 flex-wrap mb-3">
                {workingCtx.dominantColors.map((c) => (
                  <span
                    key={c}
                    className="bg-cova-bg border border-[rgba(201,168,76,0.15)] rounded-lg px-[10px] py-[6px] text-cova-muted text-[13px] font-dm-sans"
                  >
                    {c}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-cova-muted text-[13px] font-dm-sans mb-3">
                No palette extracted.
              </p>
            )}
            <FieldLabel>Existing style description</FieldLabel>
            <input
              className={inputClassName}
              value={workingCtx.existingStyleFingerprint}
              onChange={(e) => update('existingStyleFingerprint', e.target.value)}
              placeholder="one sentence describing the current feel"
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = BORDER_ACTIVE }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = BORDER }}
            />
          </SectionCard>

          {/* User notes */}
          <SectionCard>
            <SectionHeader icon={<Info size={16} color={GOLD} />} label="Anything we missed?" />
            <textarea
              className={`${inputClassName} min-h-[100px] resize-y`}
              value={workingCtx.userNotes}
              onChange={(e) => update('userNotes', e.target.value)}
              placeholder="e.g. there's a sloped ceiling on the left side, or a structural column near the window…"
              onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = BORDER_ACTIVE }}
              onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = BORDER }}
            />
          </SectionCard>
        </motion.div>

        {/* CTA */}
        <div className="text-center mt-4">
          <motion.button
            type="button"
            disabled={saving}
            onClick={handleContinue}
            whileHover={{ scale: 1.02, backgroundColor: '#D4B460' }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="bg-cova-gold text-cova-bg border-none rounded-lg px-10 py-[14px] text-base font-semibold font-dm-sans"
            style={{ cursor: saving ? 'wait' : 'pointer' }}
          >
            {saving ? 'Saving…' : 'These look right →'}
          </motion.button>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="bg-transparent border-none text-cova-muted font-dm-sans text-sm cursor-pointer underline"
            >
              Something looks off — retake ↩
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
