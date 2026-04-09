'use client'

/**
 * Screen C — Keep / Remove.
 *
 * Default state: every detected object is REMOVE. Tap a dot (or a
 * list row) to flip it to KEEP. Gold = keeping, red = redesigning,
 * small gray dot = low confidence.
 *
 * On first KEEP we fire a background material+color extraction so
 * the eventual FLUX prompt knows the exact constraint.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createBrowserClient } from '@/lib/supabase/client'
import { useArea2Store } from '@/lib/stores/area2Store'
import type { DetectedObject } from '@/lib/types/area2'

// ─── Design tokens (kept for JS-driven style values only) ────────────────────

const GOLD = '#C9A84C'
const BORDER = 'rgba(201,168,76,0.15)'
const BORDER_ACTIVE = 'rgba(201,168,76,0.6)'
const ERROR = '#E87070'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bboxCenter(bbox: [number, number, number, number]): {
  cx: number
  cy: number
} {
  const [x, y, w, h] = bbox
  return { cx: x + w / 2, cy: y + h / 2 }
}

function bboxPct(bbox: [number, number, number, number]): {
  left: string
  top: string
  width: string
  height: string
} {
  const [x, y, w, h] = bbox
  return {
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    width: `${w * 100}%`,
    height: `${h * 100}%`,
  }
}

type ConfidenceTier = DetectedObject['confidenceTier']

function tierOrder(tier: ConfidenceTier): number {
  if (tier === 'show-user') return 0
  if (tier === 'use-internally') return 1
  return 2
}

// ─── Material extractor (fire-and-forget) ────────────────────────────────────

async function fetchObjectMaterial(
  imageUrl: string,
  bbox: [number, number, number, number],
  label: string
): Promise<{ material: string; dominantColor: string; dominantColorHex: string } | null> {
  try {
    const res = await fetch('/api/detect/material', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl, bbox, label }),
    })
    if (!res.ok) return null
    return (await res.json()) as {
      material: string
      dominantColor: string
      dominantColorHex: string
    }
  } catch {
    return null
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Step7CPage() {
  const router = useRouter()
  const {
    roomId,
    imageUrl,
    keepMask,
    detectionStatus,
    setKeepMask,
    toggleObjectKeep,
    setObjectNote,
    setZoneOfInterest,
  } = useArea2Store()

  const [hydrated, setHydrated] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tooltip, setTooltip] = useState<{
    id: string
    label: string
    x: number
    y: number
  } | null>(null)
  const [actionSheetFor, setActionSheetFor] = useState<string | null>(null)
  const [noteInputFor, setNoteInputFor] = useState<string | null>(null)
  const [freshStartOpen, setFreshStartOpen] = useState(false)
  const [zoneMode, setZoneMode] = useState(false)
  const [zoneDraft, setZoneDraft] = useState<
    { x: number; y: number; w: number; h: number } | null
  >(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null
  )
  const [materialBusy, setMaterialBusy] = useState<Record<string, boolean>>({})

  const imgRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => setHydrated(true), [])

  // Poll the store when detection is still running.
  useEffect(() => {
    if (detectionStatus !== 'running' || !roomId) return
    const supabase = createBrowserClient()
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('rooms')
        .select('keep_mask, detection_status')
        .eq('id', roomId)
        .maybeSingle()
      if (data?.detection_status === 'complete' && data.keep_mask) {
        setKeepMask(data.keep_mask)
        clearInterval(interval)
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [detectionStatus, roomId, setKeepMask])

  const objects = useMemo(() => keepMask?.objects ?? [], [keepMask])
  const visibleObjects = useMemo(
    () =>
      objects
        .filter((o) => o.confidenceTier !== 'low-use-internally' || o.keep)
        .slice()
        .sort((a, b) => tierOrder(a.confidenceTier) - tierOrder(b.confidenceTier)),
    [objects]
  )
  const keptCount = objects.filter((o) => o.keep).length
  const removedCount = objects.length - keptCount
  const hasAnyDecision = objects.some((o) => o.keep)

  const handleDotTap = async (obj: DetectedObject, evt: React.MouseEvent) => {
    evt.stopPropagation()
    toggleObjectKeep(obj.id)
    setTooltip({
      id: obj.id,
      label: obj.type,
      x: evt.clientX,
      y: evt.clientY,
    })
    setTimeout(() => {
      setTooltip((t) => (t?.id === obj.id ? null : t))
    }, 1500)

    const becomingKeep = !obj.keep
    if (becomingKeep && imageUrl && !obj.material) {
      setMaterialBusy((prev) => ({ ...prev, [obj.id]: true }))
      const mat = await fetchObjectMaterial(imageUrl, obj.bbox, obj.type)
      setMaterialBusy((prev) => {
        const next = { ...prev }
        delete next[obj.id]
        return next
      })
      if (mat && keepMask) {
        const merged = {
          ...keepMask,
          objects: keepMask.objects.map((o) =>
            o.id === obj.id
              ? {
                  ...o,
                  material: mat.material,
                  dominantColor: mat.dominantColor,
                  dominantColorHex: mat.dominantColorHex,
                }
              : o
          ),
        }
        setKeepMask(merged)
      }
    }
  }

  const handleLongPress = (objId: string) => {
    setActionSheetFor(objId)
  }

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPress = (objId: string) => {
    pressTimer.current = setTimeout(() => handleLongPress(objId), 500)
  }
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = null
  }

  const onPhotoPointerDown = (evt: React.PointerEvent<HTMLDivElement>) => {
    if (!zoneMode || !imgRef.current) return
    const rect = imgRef.current.getBoundingClientRect()
    const x = (evt.clientX - rect.left) / rect.width
    const y = (evt.clientY - rect.top) / rect.height
    setDragStart({ x, y })
    setZoneDraft({ x, y, w: 0, h: 0 })
  }
  const onPhotoPointerMove = (evt: React.PointerEvent<HTMLDivElement>) => {
    if (!zoneMode || !dragStart || !imgRef.current) return
    const rect = imgRef.current.getBoundingClientRect()
    const x = (evt.clientX - rect.left) / rect.width
    const y = (evt.clientY - rect.top) / rect.height
    const nx = Math.min(dragStart.x, x)
    const ny = Math.min(dragStart.y, y)
    const nw = Math.abs(x - dragStart.x)
    const nh = Math.abs(y - dragStart.y)
    setZoneDraft({ x: nx, y: ny, w: nw, h: nh })
  }
  const onPhotoPointerUp = () => {
    if (!zoneMode || !zoneDraft) return
    setDragStart(null)
    if (zoneDraft.w > 0.02 && zoneDraft.h > 0.02) {
      setZoneOfInterest(zoneDraft)
    }
    setZoneMode(false)
  }

  const handleFreshStart = () => {
    if (!keepMask) return
    setKeepMask({
      ...keepMask,
      objects: keepMask.objects.map((o) => ({ ...o, keep: false })),
      ...(keepMask.zoneOfInterest ? { zoneOfInterest: undefined } : {}),
    })
    setFreshStartOpen(false)
  }

  const handleContinue = async () => {
    if (!roomId) {
      router.push('/design/step-7d')
      return
    }
    setSaving(true)
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) return
      await supabase
        .from('rooms')
        .update({ keep_mask: keepMask, design_step: 3 })
        .eq('id', roomId)
        .eq('user_id', userId)
      router.push('/design/step-7d')
    } finally {
      setSaving(false)
    }
  }

  if (!hydrated) return null

  // Group visible objects by type category
  const furniture = visibleObjects.filter((o) =>
    ['sofa', 'chair', 'table', 'desk', 'bed', 'wardrobe', 'shelving', 'bookcase', 'cabinet', 'dresser'].some(
      (kw) => o.type.toLowerCase().includes(kw)
    )
  )
  const lighting = visibleObjects.filter((o) =>
    ['lamp', 'light', 'chandelier', 'sconce', 'pendant'].some(
      (kw) => o.type.toLowerCase().includes(kw)
    )
  )
  const decor = visibleObjects.filter(
    (o) => !furniture.includes(o) && !lighting.includes(o)
  )

  const groups: { label: string; items: typeof visibleObjects }[] = [
    { label: 'Furniture', items: furniture },
    { label: 'Lighting', items: lighting },
    { label: 'Decor', items: decor },
  ].filter((g) => g.items.length > 0)

  if (groups.length === 0 && visibleObjects.length > 0) {
    groups.push({ label: 'Items', items: visibleObjects })
  }

  return (
    <div className="min-h-screen bg-cova-bg font-dm-sans flex flex-col">
      <style>{`
        @keyframes covaPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
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
        <span className="font-dm-sans font-semibold text-[15px] text-cova-ivory">What stays?</span>
        <span className="font-dm-sans text-[13px] text-cova-muted">Step 6 of 7</span>
      </nav>

      {/* Split layout below top bar */}
      <div className="flex flex-1" style={{ height: 'calc(100vh - 56px)' }}>

        {/* LEFT PANEL — 60%: room photo with overlays */}
        <div
          ref={imgRef}
          onPointerDown={onPhotoPointerDown}
          onPointerMove={onPhotoPointerMove}
          onPointerUp={onPhotoPointerUp}
          className="relative overflow-hidden bg-cova-bg"
          style={{
            width: '60%',
            cursor: zoneMode ? 'crosshair' : 'default',
            touchAction: zoneMode ? 'none' : 'auto',
          }}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="Your room"
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(90deg, rgba(201,168,76,0.08) 0%, rgba(201,168,76,0.15) 50%, rgba(201,168,76,0.08) 100%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s infinite ease-in-out',
              }}
            />
          )}

          {/* Detection running overlay */}
          {detectionStatus === 'running' && (
            <div
              className="absolute inset-0 flex items-center justify-center text-cova-ivory text-[15px] font-dm-sans"
              style={{ background: 'rgba(9,24,41,0.70)' }}
            >
              Analyzing your room…
            </div>
          )}

          {/* Bounding boxes — positions are computed percentages, kept as inline style */}
          {visibleObjects.map((obj) => {
            const pct = bboxPct(obj.bbox)
            const isKeep = obj.keep
            const isUnreviewed = obj.confidenceTier === 'show-user' && !isKeep
            return (
              <div
                key={`bbox-${obj.id}`}
                className="absolute pointer-events-none transition-all duration-200 ease-out"
                style={{
                  ...pct,
                  border: isKeep
                    ? `2px solid ${GOLD}`
                    : isUnreviewed
                    ? '2px dashed rgba(255,255,255,0.5)'
                    : 'none',
                  background: !isKeep && !isUnreviewed ? 'rgba(232,112,112,0.3)' : 'transparent',
                  boxShadow: isKeep ? '0 0 12px rgba(201,168,76,0.4)' : 'none',
                }}
              />
            )
          })}

          {/* Zone of interest — computed percentage position, kept as inline style */}
          {keepMask?.zoneOfInterest && (
            <div
              className="absolute rounded-lg pointer-events-none"
              style={{
                left: `${keepMask.zoneOfInterest.x * 100}%`,
                top: `${keepMask.zoneOfInterest.y * 100}%`,
                width: `${keepMask.zoneOfInterest.w * 100}%`,
                height: `${keepMask.zoneOfInterest.h * 100}%`,
                border: `2px dashed ${GOLD}`,
              }}
            />
          )}

          {/* Live drag rectangle — computed percentage position, kept as inline style */}
          {zoneDraft && (
            <div
              className="absolute pointer-events-none bg-[rgba(201,168,76,0.12)]"
              style={{
                left: `${zoneDraft.x * 100}%`,
                top: `${zoneDraft.y * 100}%`,
                width: `${zoneDraft.w * 100}%`,
                height: `${zoneDraft.h * 100}%`,
                border: `2px dashed ${GOLD}`,
              }}
            />
          )}

          {/* Object dots — computed cx/cy positions, kept as inline style */}
          {objects.map((obj) => {
            const { cx, cy } = bboxCenter(obj.bbox)
            const isKeep = obj.keep
            const isLowConf = obj.confidenceTier === 'low-use-internally'
            const dotSize = isLowConf ? 10 : 18
            const hitSize = 44
            return (
              <button
                key={obj.id}
                type="button"
                aria-label={obj.type}
                onClick={(e) => handleDotTap(obj, e)}
                onPointerDown={() => startPress(obj.id)}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                className="absolute bg-transparent border-none p-0 cursor-pointer flex items-center justify-center"
                style={{
                  left: `${cx * 100}%`,
                  top: `${cy * 100}%`,
                  width: hitSize,
                  height: hitSize,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div
                  className="absolute flex items-center justify-center text-cova-ivory text-[11px] font-bold"
                  style={{
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: dotSize,
                    height: dotSize,
                    borderRadius: '50%',
                    background: isLowConf
                      ? 'rgba(245,240,232,0.45)'
                      : isKeep
                        ? 'rgba(201,168,76,0.12)'
                        : 'rgba(231,76,60,0.25)',
                    border: `2px solid ${isLowConf ? 'rgba(245,240,232,0.45)' : isKeep ? GOLD : ERROR}`,
                    boxShadow: isKeep
                      ? `0 0 0 3px rgba(201,168,76,0.12)`
                      : isLowConf
                        ? 'none'
                        : `0 0 0 2px rgba(231,76,60,0.25)`,
                    animation: isLowConf || isKeep ? 'none' : 'covaPulse 2s ease-in-out infinite',
                  }}
                >
                  {isLowConf ? '' : isKeep ? '✓' : '×'}
                </div>
              </button>
            )
          })}

          {/* Tooltip — computed mouse position, kept as inline style */}
          {tooltip && (
            <div
              className="fixed bg-[rgba(255,255,255,0.04)] text-cova-ivory px-[10px] py-[6px] rounded-lg text-[12px] font-dm-sans border border-[rgba(201,168,76,0.15)] pointer-events-none z-[1000]"
              style={{
                left: tooltip.x + 12,
                top: tooltip.y - 8,
              }}
            >
              {tooltip.label}
            </div>
          )}

          {/* Zone toggle */}
          <button
            type="button"
            onClick={() => {
              setZoneMode((z) => !z)
              setZoneDraft(null)
            }}
            className="absolute bottom-4 left-4 px-[14px] py-2 rounded-full cursor-pointer text-[12px] font-dm-sans backdrop-blur-[8px]"
            style={{
              background: zoneMode ? 'rgba(201,168,76,0.12)' : 'rgba(9,24,41,0.8)',
              border: `1px solid ${zoneMode ? GOLD : BORDER}`,
              color: zoneMode ? GOLD : '#F5F0E8',
            }}
          >
            {zoneMode
              ? 'Drag to draw focus zone…'
              : keepMask?.zoneOfInterest
                ? 'Redraw focus area'
                : 'Focus on an area'}
          </button>
        </div>

        {/* RIGHT PANEL — 40%: scrollable item list */}
        <div
          className="overflow-y-auto p-6 bg-cova-bg border-l border-[rgba(201,168,76,0.1)] flex flex-col"
          style={{ width: '40%' }}
        >
          {/* Summary */}
          <div className="mb-5">
            <p className="text-cova-muted text-[12px] font-dm-sans mb-1">
              Keeping {keptCount} · Redesigning {removedCount}
            </p>
          </div>

          {/* Grouped items */}
          {visibleObjects.length === 0 ? (
            <p className="text-cova-muted text-sm font-dm-sans">
              No items detected. The AI will redesign the full room.
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="mb-6">
                <div className="text-cova-muted text-[11px] font-dm-sans font-medium uppercase tracking-[0.12em] mb-[10px]">
                  {group.label}
                </div>
                {group.items.map((obj) => (
                  <div
                    key={obj.id}
                    className="flex items-center justify-between px-3 py-[10px] bg-[rgba(255,255,255,0.04)] border border-[rgba(201,168,76,0.15)] rounded-lg mb-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-cova-ivory text-sm font-dm-sans font-normal">
                        {obj.type}
                      </div>
                      {materialBusy[obj.id] && (
                        <span className="text-cova-gold text-[11px] font-dm-sans">
                          reading…
                        </span>
                      )}
                      {obj.userNote && (
                        <div className="text-cova-muted text-[12px] font-dm-sans mt-[2px]">
                          Note: {obj.userNote}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 ml-3">
                      {/* Keep badge */}
                      {obj.keep ? (
                        <span className="bg-[rgba(201,168,76,0.12)] text-cova-gold text-[11px] font-dm-sans font-medium rounded-full px-[10px] py-1">
                          Keep
                        </span>
                      ) : (
                        <span className="bg-[rgba(232,112,112,0.12)] text-[#E87070] text-[11px] font-dm-sans font-medium rounded-full px-[10px] py-1">
                          Remove
                        </span>
                      )}
                      {/* Toggle button */}
                      <button
                        type="button"
                        onClick={() => toggleObjectKeep(obj.id)}
                        className="bg-transparent border border-[rgba(201,168,76,0.15)] text-cova-muted px-[10px] py-1 rounded-full text-[11px] font-dm-sans cursor-pointer transition-all duration-200 ease-out"
                      >
                        {obj.keep ? 'Remove' : 'Keep'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}

          {/* Fresh start */}
          <button
            type="button"
            onClick={() => setFreshStartOpen(true)}
            className="bg-transparent text-cova-muted border-none py-2 px-0 text-[13px] font-dm-sans cursor-pointer underline text-left mt-2 mb-6"
          >
            Start completely fresh
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* CTA */}
          <motion.button
            type="button"
            onClick={handleContinue}
            disabled={!hasAnyDecision || saving}
            whileHover={hasAnyDecision && !saving ? { scale: 1.02, backgroundColor: '#D4B460' } : {}}
            whileTap={hasAnyDecision && !saving ? { scale: 0.97 } : {}}
            transition={{ duration: 0.15 }}
            className="w-full bg-cova-gold text-cova-bg border-none rounded-lg px-5 py-[14px] text-[15px] font-semibold font-dm-sans mt-4"
            style={{
              cursor: hasAnyDecision && !saving ? 'pointer' : 'not-allowed',
              opacity: hasAnyDecision && !saving ? 1 : 0.4,
              pointerEvents: hasAnyDecision && !saving ? 'auto' : 'none',
            }}
          >
            {saving ? 'Saving…' : 'Continue →'}
          </motion.button>
        </div>
      </div>

      {/* Action sheet */}
      {actionSheetFor && (() => {
        const obj = objects.find((o) => o.id === actionSheetFor)
        if (!obj) return null
        return (
          <div
            onClick={() => setActionSheetFor(null)}
            className="fixed inset-0 bg-black/60 flex items-end justify-center z-[500]"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[480px] border border-[rgba(201,168,76,0.15)] p-6"
              style={{
                background: 'rgba(9,24,41,0.95)',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
              }}
            >
              <div className="text-cova-ivory text-base font-semibold font-dm-sans mb-4">
                {obj.type}
              </div>
              {(['Keep', 'Remove', 'Mark as immovable', 'Add a note'] as const).map(
                (action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => {
                      if (action === 'Keep' && !obj.keep) toggleObjectKeep(obj.id)
                      if (action === 'Remove' && obj.keep) toggleObjectKeep(obj.id)
                      if (action === 'Mark as immovable') {
                        const m = keepMask
                        if (m) {
                          setKeepMask({
                            ...m,
                            objects: m.objects.map((o) =>
                              o.id === obj.id ? { ...o, immovable: !o.immovable } : o
                            ),
                          })
                        }
                      }
                      if (action === 'Add a note') {
                        setNoteInputFor(obj.id)
                      }
                      setActionSheetFor(null)
                    }}
                    className="block w-full text-left bg-transparent border border-[rgba(201,168,76,0.15)] text-cova-ivory px-[14px] py-3 rounded-lg mb-2 cursor-pointer text-sm font-dm-sans"
                  >
                    {action}
                  </button>
                )
              )}
            </div>
          </div>
        )
      })()}

      {/* Inline note input — computed position, kept as inline style */}
      {noteInputFor && (() => {
        const obj = objects.find((o) => o.id === noteInputFor)
        if (!obj) return null
        return (
          <div
            className="fixed w-[90%] max-w-[480px] border border-[rgba(201,168,76,0.15)] rounded-xl p-4 z-[600]"
            style={{
              bottom: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(9,24,41,0.95)',
            }}
          >
            <div className="text-cova-muted text-[12px] font-dm-sans mb-2">
              Note on {obj.type}
            </div>
            <input
              autoFocus
              defaultValue={obj.userNote ?? ''}
              onBlur={(e) => {
                setObjectNote(obj.id, e.target.value)
                setNoteInputFor(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setObjectNote(obj.id, (e.target as HTMLInputElement).value)
                  setNoteInputFor(null)
                }
              }}
              className="w-full bg-cova-bg border border-[rgba(201,168,76,0.15)] rounded-lg text-cova-ivory px-3 py-[10px] font-dm-sans text-sm outline-none"
              placeholder="e.g. this is my grandmother's armchair"
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = BORDER_ACTIVE }}
            />
          </div>
        )
      })()}

      {/* Fresh start confirm */}
      {freshStartOpen && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[600]"
          onClick={() => setFreshStartOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[rgba(255,255,255,0.04)] border border-[rgba(201,168,76,0.15)] rounded-xl p-6 max-w-[360px] w-[90%]"
          >
            <div className="text-cova-ivory text-base font-semibold font-dm-sans mb-2">
              Remove everything and start fresh?
            </div>
            <p className="text-cova-muted text-sm font-dm-sans mb-5">
              All kept items and focus zones will be cleared.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setFreshStartOpen(false)}
                className="flex-1 bg-transparent border border-[rgba(201,168,76,0.15)] text-cova-ivory p-3 rounded-lg cursor-pointer font-dm-sans text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFreshStart}
                className="flex-1 bg-cova-gold text-cova-bg border-none p-3 rounded-lg cursor-pointer font-semibold font-dm-sans text-sm"
              >
                Start fresh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
