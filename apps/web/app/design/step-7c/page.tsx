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
import { createBrowserClient } from '@/lib/supabase/client'
import { useArea2Store } from '@/lib/stores/area2Store'
import type { DetectedObject } from '@/lib/types/area2'

// ─── Tokens ────────────────────────────────────────────────────────────────

const bg = 'var(--cova-bg)'
const surface = 'var(--cova-surface)'
const border = 'var(--cova-border)'
const gold = 'var(--cova-gold)'
const goldDim = 'var(--cova-gold-dim)'
const ivory = 'var(--cova-ivory)'
const muted = 'var(--cova-muted)'
const keepColor = 'var(--cova-keep-bright)'
const keepBg = 'var(--cova-keep-bg)'
const removeColor = 'var(--cova-remove)'

// ─── Helpers ───────────────────────────────────────────────────────────────

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

// ─── Material extractor (fire-and-forget) ──────────────────────────────────

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

// ─── Page ──────────────────────────────────────────────────────────────────

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
  const [materialBusy, setMaterialBusy] = useState<Record<string, boolean>>(
    {}
  )

  const imgRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => setHydrated(true), [])

  // Poll the store when detection is still running (Screens A/B may have
  // navigated here before the pipeline finished).
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

    // Was REMOVE, becoming KEEP → fetch material
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

  // Long-press detection via pointerdown timer.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPress = (objId: string) => {
    pressTimer.current = setTimeout(() => handleLongPress(objId), 500)
  }
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = null
  }

  // Zone drawing handlers
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

  // ─── Layout ─────────────────────────────────────────────────────────────

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
          Step 3 of 4
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
            width: '75%',
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
            marginBottom: 'var(--space-1)',
          }}
        >
          What stays?
        </h1>
        <p
          style={{
            color: ivory,
            fontSize: 'var(--text-lg)',
            marginBottom: 'var(--space-1)',
            fontWeight: 500,
          }}
        >
          Tap anything to keep
        </p>
        <p
          style={{
            color: muted,
            fontSize: 'var(--text-sm)',
            marginBottom: 'var(--space-5)',
          }}
        >
          Everything starts fresh. Protect what matters.
        </p>

        {/* ─── Room photo with dot overlay ─── */}
        <div
          ref={imgRef}
          onPointerDown={onPhotoPointerDown}
          onPointerMove={onPhotoPointerMove}
          onPointerUp={onPhotoPointerUp}
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '4 / 3',
            background: surface,
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            border: `1px solid ${border}`,
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
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            />
          ) : null}

          {/* Loading skeleton if detection still running */}
          {detectionStatus === 'running' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(10, 22, 40, 0.70)',
                color: ivory,
                fontSize: 'var(--text-sm)',
              }}
            >
              Analyzing your room…
            </div>
          )}

          {/* Existing zone of interest */}
          {keepMask?.zoneOfInterest && (
            <div
              style={{
                position: 'absolute',
                left: `${keepMask.zoneOfInterest.x * 100}%`,
                top: `${keepMask.zoneOfInterest.y * 100}%`,
                width: `${keepMask.zoneOfInterest.w * 100}%`,
                height: `${keepMask.zoneOfInterest.h * 100}%`,
                border: `2px dashed ${gold}`,
                borderRadius: 'var(--radius-md)',
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Live drag rectangle */}
          {zoneDraft && (
            <div
              style={{
                position: 'absolute',
                left: `${zoneDraft.x * 100}%`,
                top: `${zoneDraft.y * 100}%`,
                width: `${zoneDraft.w * 100}%`,
                height: `${zoneDraft.h * 100}%`,
                border: `2px dashed ${gold}`,
                background: goldDim,
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Object dots */}
          {objects.map((obj) => {
            const { cx, cy } = bboxCenter(obj.bbox)
            const isKeep = obj.keep
            const isLowConf = obj.confidenceTier === 'low-use-internally'
            const dotSize = isLowConf ? 10 : 18
            const hitSize = 44 // WCAG
            return (
              <button
                key={obj.id}
                type="button"
                aria-label={obj.type}
                onClick={(e) => handleDotTap(obj, e)}
                onPointerDown={() => startPress(obj.id)}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                style={{
                  position: 'absolute',
                  left: `${cx * 100}%`,
                  top: `${cy * 100}%`,
                  width: hitSize,
                  height: hitSize,
                  transform: 'translate(-50%, -50%)',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* Highlight overlay when keeping — tinted bbox */}
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: dotSize,
                    height: dotSize,
                    borderRadius: '50%',
                    background: isLowConf
                      ? muted
                      : isKeep
                        ? keepBg
                        : 'rgba(231, 76, 60, 0.25)',
                    border: `2px solid ${
                      isLowConf ? muted : isKeep ? keepColor : removeColor
                    }`,
                    color: ivory,
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: isKeep
                      ? `0 0 0 3px ${goldDim}`
                      : isLowConf
                        ? 'none'
                        : `0 0 0 2px rgba(231, 76, 60, 0.25)`,
                    animation: isLowConf || isKeep ? 'none' : 'covaPulse 2s ease-in-out infinite',
                  }}
                >
                  {isLowConf ? '' : isKeep ? '✓' : '×'}
                </div>
              </button>
            )
          })}

          {/* Bbox highlight when an object is in the action sheet */}
          {actionSheetFor &&
            (() => {
              const obj = objects.find((o) => o.id === actionSheetFor)
              if (!obj) return null
              const pct = bboxPct(obj.bbox)
              return (
                <div
                  style={{
                    position: 'absolute',
                    ...pct,
                    border: `2px solid ${obj.keep ? keepColor : removeColor}`,
                    background: obj.keep ? keepBg : 'rgba(231, 76, 60, 0.15)',
                    pointerEvents: 'none',
                    borderRadius: 'var(--radius-sm)',
                  }}
                />
              )
            })()}
        </div>

        {/* Keyframes for pulse */}
        <style>{`
          @keyframes covaPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.55; }
          }
        `}</style>

        {/* Tooltip */}
        {tooltip && (
          <div
            style={{
              position: 'fixed',
              left: tooltip.x + 12,
              top: tooltip.y - 8,
              background: 'var(--cova-surface-3)',
              color: ivory,
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-xs)',
              border: `1px solid ${border}`,
              pointerEvents: 'none',
              zIndex: 1000,
            }}
          >
            {tooltip.label}
          </div>
        )}

        {/* Hint bar */}
        <div
          style={{
            marginTop: 'var(--space-3)',
            color: muted,
            fontSize: 'var(--text-xs)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
          }}
        >
          <span>
            <span style={{ color: keepColor }}>●</span> Keeping
          </span>
          <span>
            <span style={{ color: removeColor }}>●</span> Redesigning
          </span>
          <span>
            <span style={{ color: muted }}>●</span> Low confidence
          </span>
        </div>

        {/* Zone toggle */}
        <button
          type="button"
          onClick={() => {
            setZoneMode((z) => !z)
            setZoneDraft(null)
          }}
          style={{
            marginTop: 'var(--space-4)',
            background: zoneMode ? goldDim : 'transparent',
            border: `1px solid ${zoneMode ? gold : border}`,
            color: zoneMode ? gold : ivory,
            padding: '10px 16px',
            borderRadius: 'var(--radius-pill)',
            cursor: 'pointer',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {zoneMode
            ? 'Drag on the photo to draw…'
            : keepMask?.zoneOfInterest
              ? 'Redraw focus area'
              : 'Focus on a specific area'}
        </button>
        {keepMask?.zoneOfInterest && !zoneMode && (
          <p
            style={{
              color: muted,
              fontSize: 'var(--text-xs)',
              marginTop: 'var(--space-2)',
            }}
          >
            AI will prioritize redesigning this zone.
          </p>
        )}

        {/* Detection list */}
        <section
          style={{
            marginTop: 'var(--space-6)',
            background: surface,
            border: `1px solid ${border}`,
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-3)',
              color: ivory,
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
            }}
          >
            <span>
              Keeping {keptCount} · Redesigning {removedCount}
            </span>
          </div>

          {visibleObjects.length === 0 ? (
            <p style={{ color: muted, fontSize: 'var(--text-sm)' }}>
              We couldn&rsquo;t identify specific items in this photo. You
              can continue — the AI will redesign the full room.
            </p>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
              }}
            >
              {visibleObjects.map((obj) => {
                const isLow = obj.confidenceTier === 'low-use-internally'
                return (
                  <li
                    key={obj.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      background: bg,
                      border: `1px solid ${border}`,
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                          color: ivory,
                          fontSize: 'var(--text-sm)',
                          fontWeight: 500,
                        }}
                      >
                        <span>{obj.type}</span>
                        <span style={{ color: muted, fontSize: 'var(--text-xs)' }}>
                          {(obj.confidence * 100).toFixed(0)}%
                          {isLow ? ' (lower confidence)' : ''}
                        </span>
                        {materialBusy[obj.id] && (
                          <span
                            style={{
                              color: gold,
                              fontSize: 'var(--text-xs)',
                            }}
                          >
                            reading…
                          </span>
                        )}
                      </div>
                      {obj.userNote && (
                        <div
                          style={{
                            color: muted,
                            fontSize: 'var(--text-xs)',
                            marginTop: 2,
                          }}
                        >
                          Note: {obj.userNote}
                        </div>
                      )}
                      {obj.material && (
                        <div
                          style={{
                            color: muted,
                            fontSize: 'var(--text-xs)',
                            marginTop: 2,
                          }}
                        >
                          {obj.material}
                          {obj.dominantColor ? ` · ${obj.dominantColor}` : ''}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (obj.keep) toggleObjectKeep(obj.id)
                        }}
                        style={{
                          background: !obj.keep ? 'rgba(231,76,60,0.15)' : 'transparent',
                          border: `1px solid ${!obj.keep ? removeColor : border}`,
                          color: !obj.keep ? removeColor : muted,
                          padding: '6px 12px',
                          borderRadius: 'var(--radius-pill)',
                          fontSize: 'var(--text-xs)',
                          cursor: 'pointer',
                        }}
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!obj.keep) toggleObjectKeep(obj.id)
                        }}
                        style={{
                          background: obj.keep ? keepBg : 'transparent',
                          border: `1px solid ${obj.keep ? keepColor : border}`,
                          color: obj.keep ? keepColor : muted,
                          padding: '6px 12px',
                          borderRadius: 'var(--radius-pill)',
                          fontSize: 'var(--text-xs)',
                          cursor: 'pointer',
                        }}
                      >
                        Keep
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Action sheet */}
        {actionSheetFor && (() => {
          const obj = objects.find((o) => o.id === actionSheetFor)
          if (!obj) return null
          return (
            <div
              onClick={() => setActionSheetFor(null)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(10,22,40,0.70)',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                zIndex: 500,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  maxWidth: 480,
                  background: surface,
                  borderTopLeftRadius: 'var(--radius-xl)',
                  borderTopRightRadius: 'var(--radius-xl)',
                  padding: 'var(--space-5)',
                  border: `1px solid ${border}`,
                }}
              >
                <div
                  style={{
                    color: ivory,
                    fontSize: 'var(--text-base)',
                    fontWeight: 600,
                    marginBottom: 'var(--space-3)',
                  }}
                >
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
                                o.id === obj.id
                                  ? { ...o, immovable: !o.immovable }
                                  : o
                              ),
                            })
                          }
                        }
                        if (action === 'Add a note') {
                          setNoteInputFor(obj.id)
                        }
                        setActionSheetFor(null)
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: `1px solid ${border}`,
                        color: ivory,
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: 'var(--space-2)',
                        cursor: 'pointer',
                        fontSize: 'var(--text-sm)',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      {action}
                    </button>
                  )
                )}
              </div>
            </div>
          )
        })()}

        {/* Inline note input */}
        {noteInputFor && (() => {
          const obj = objects.find((o) => o.id === noteInputFor)
          if (!obj) return null
          return (
            <div
              style={{
                marginTop: 'var(--space-4)',
                background: surface,
                border: `1px solid ${border}`,
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)',
              }}
            >
              <div
                style={{
                  color: muted,
                  fontSize: 'var(--text-xs)',
                  marginBottom: 'var(--space-2)',
                }}
              >
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
                    setObjectNote(
                      obj.id,
                      (e.target as HTMLInputElement).value
                    )
                    setNoteInputFor(null)
                  }
                }}
                style={{
                  width: '100%',
                  background: bg,
                  border: `1px solid ${border}`,
                  borderRadius: 'var(--radius-md)',
                  color: ivory,
                  padding: '10px 12px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--text-sm)',
                  outline: 'none',
                }}
                placeholder="e.g. this is my grandmother's armchair"
              />
            </div>
          )
        })()}

        {/* Bottom actions */}
        <div style={{ marginTop: 'var(--space-6)' }}>
          <button
            type="button"
            onClick={handleContinue}
            disabled={saving}
            style={{
              width: '100%',
              background: gold,
              color: 'var(--cova-bg)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '16px 20px',
              fontSize: 'var(--text-lg)',
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'all var(--transition-base)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {saving ? 'Saving…' : 'Continue →'}
          </button>
          <button
            type="button"
            onClick={() => setFreshStartOpen(true)}
            style={{
              width: '100%',
              background: 'transparent',
              color: muted,
              border: 'none',
              padding: '12px 20px',
              marginTop: 'var(--space-2)',
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              textDecoration: 'underline',
            }}
          >
            Start completely fresh
          </button>
        </div>

        {freshStartOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(10,22,40,0.70)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 600,
            }}
            onClick={() => setFreshStartOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: surface,
                border: `1px solid ${border}`,
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-5)',
                maxWidth: 360,
                width: '90%',
              }}
            >
              <div
                style={{
                  color: ivory,
                  fontSize: 'var(--text-lg)',
                  fontWeight: 600,
                  marginBottom: 'var(--space-2)',
                }}
              >
                Remove everything and start fresh?
              </div>
              <p
                style={{
                  color: muted,
                  fontSize: 'var(--text-sm)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                All kept items and focus zones will be cleared.
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <button
                  type="button"
                  onClick={() => setFreshStartOpen(false)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: `1px solid ${border}`,
                    color: ivory,
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleFreshStart}
                  style={{
                    flex: 1,
                    background: gold,
                    color: 'var(--cova-bg)',
                    border: 'none',
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  Start fresh
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
