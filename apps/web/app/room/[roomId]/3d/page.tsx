'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'

const SplatViewer = dynamic(() => import('@/components/SplatViewer'), {
  ssr: false,
  loading: () => <FullscreenLoader />,
})

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductMatch {
  product_name: string
  price: number
  retailer: string
  image_url: string
  affiliate_url: string
  similarity_score: number
}

interface RoomProduct {
  id: string
  hotspot_x: number
  hotspot_y: number
  furniture_label: string
  matches: ProductMatch[]
}

interface RoomStatus {
  marble_spz_url: string | null
  room_products: RoomProduct[]
  plus_upgrade_ready: boolean
}

// ─── Loading screen ───────────────────────────────────────────────────────────

function FullscreenLoader() {
  const [dots, setDots] = useState('')
  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d.length >= 3 ? '' : d + '.')), 500)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#091829',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
      }}
    >
      {/* Gold arc spinner */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: '3px solid transparent',
          borderTopColor: '#C9A84C',
          borderRightColor: '#C9A84C',
          animation: 'spin 1s linear infinite',
        }}
      />
      <span
        style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#C9A84C',
        }}
      >
        Entering your room{dots}
      </span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Hotspot dot ─────────────────────────────────────────────────────────────

function HotspotDot({
  hotspot,
  onClick,
  active,
}: {
  hotspot: RoomProduct
  onClick: () => void
  active: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-label={hotspot.furniture_label}
      style={{
        position: 'absolute',
        left: `${hotspot.hotspot_x}%`,
        top: `${hotspot.hotspot_y}%`,
        transform: 'translate(-50%, -50%)',
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: active ? '#C9A84C' : 'rgba(201,168,76,0.25)',
        border: `2px solid #C9A84C`,
        cursor: 'pointer',
        padding: 0,
        boxShadow: active
          ? '0 0 0 6px rgba(201,168,76,0.2), 0 0 0 12px rgba(201,168,76,0.08)'
          : '0 0 0 5px rgba(201,168,76,0.15)',
        transition: 'all 200ms ease-out',
      }}
    />
  )
}

// ─── Product panel (slides from right) ───────────────────────────────────────

function ProductPanel({
  hotspot,
  onClose,
}: {
  hotspot: RoomProduct
  onClose: () => void
}) {
  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ duration: 0.28, ease: [0.32, 0, 0.67, 0] }}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(340px, 90vw)',
        background: 'rgba(9,24,41,0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderLeft: '1px solid #1E3A5F',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        zIndex: 30,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 16px 12px',
          borderBottom: '1px solid #1E3A5F',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 14,
            fontWeight: 600,
            color: '#F5F0E8',
          }}
        >
          {hotspot.furniture_label}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#8BA3C0',
            cursor: 'pointer',
            fontSize: 22,
            lineHeight: 1,
            padding: 4,
          }}
        >
          ×
        </button>
      </div>

      {/* Products */}
      <div style={{ padding: '12px 12px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {hotspot.matches.map((match, i) => (
          <a
            key={i}
            href={match.affiliate_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              gap: 12,
              background: '#0F1F3D',
              borderRadius: 12,
              overflow: 'hidden',
              textDecoration: 'none',
              border: '1px solid #1E3A5F',
              transition: 'border-color 200ms ease-out',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={match.image_url}
              alt={match.product_name}
              style={{ width: 80, height: 80, objectFit: 'cover', flexShrink: 0 }}
            />
            <div style={{ padding: '10px 10px 10px 0', minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 12,
                  color: '#F5F0E8',
                  lineHeight: 1.4,
                  marginBottom: 6,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {match.product_name}
              </div>
              <div
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#C9A84C',
                }}
              >
                ${match.price}
              </div>
              <div
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 11,
                  color: '#8BA3C0',
                  marginTop: 2,
                }}
              >
                {match.retailer}
              </div>
            </div>
          </a>
        ))}
      </div>
    </motion.div>
  )
}

// ─── Chat panel (slides from left) ───────────────────────────────────────────

function ChatPanel({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ x: '-100%' }}
      animate={{ x: 0 }}
      exit={{ x: '-100%' }}
      transition={{ duration: 0.28, ease: [0.32, 0, 0.67, 0] }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: 'min(340px, 90vw)',
        background: 'rgba(9,24,41,0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRight: '1px solid #1E3A5F',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 30,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 16px 12px',
          borderBottom: '1px solid #1E3A5F',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 14,
            fontWeight: 600,
            color: '#F5F0E8',
          }}
        >
          Ask Cova
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#8BA3C0',
            cursor: 'pointer',
            fontSize: 22,
            lineHeight: 1,
            padding: 4,
          }}
        >
          ×
        </button>
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8BA3C0',
          fontFamily: 'Inter, sans-serif',
          fontSize: 13,
          padding: 24,
          textAlign: 'center',
        }}
      >
        Chat assistant coming soon
      </div>
    </motion.div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Room3DPage() {
  const params = useParams()
  const router = useRouter()
  const roomId = params?.roomId as string

  const [roomData, setRoomData] = useState<RoomStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedHotspot, setSelectedHotspot] = useState<RoomProduct | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/status?roomId=${roomId}`)
      if (!res.ok) return
      const data: RoomStatus = await res.json()
      setRoomData(data)
    } finally {
      setLoading(false)
    }
  }, [roomId])

  useEffect(() => {
    fetchStatus()
    pollRef.current = setInterval(fetchStatus, 20000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchStatus])

  const spzUrl = roomData?.marble_spz_url ?? null

  // ── No SPZ yet ─────────────────────────────────────────────────────────────
  if (!loading && !spzUrl) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#091829',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          padding: 24,
        }}
      >
        <span
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 15,
            color: '#F5F0E8',
            textAlign: 'center',
          }}
        >
          Your 3D room is still being prepared
        </span>
        <button
          onClick={() => router.push(`/room/${roomId}`)}
          style={{
            background: 'none',
            border: '1px solid #C9A84C',
            borderRadius: 24,
            color: '#C9A84C',
            fontFamily: 'Inter, sans-serif',
            fontSize: 13,
            fontWeight: 500,
            padding: '10px 22px',
            cursor: 'pointer',
          }}
        >
          ← Back to 2D View
        </button>
      </div>
    )
  }

  // ── Page ───────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      style={{ position: 'fixed', inset: 0, background: '#091829', overflow: 'hidden' }}
    >
      {/* SparkJS canvas — fills screen */}
      {loading || !spzUrl ? (
        <FullscreenLoader />
      ) : (
        <div style={{ position: 'absolute', inset: 0 }}>
          <SplatViewer url={spzUrl} roomId={roomId} />
        </div>
      )}

      {/* Hotspot dots — absolute over canvas */}
      {roomData?.room_products.map((hotspot) => (
        <HotspotDot
          key={hotspot.id}
          hotspot={hotspot}
          active={selectedHotspot?.id === hotspot.id}
          onClick={() =>
            setSelectedHotspot((prev) => (prev?.id === hotspot.id ? null : hotspot))
          }
        />
      ))}

      {/* ── Top overlay ────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 16px',
          zIndex: 20,
          pointerEvents: 'none',
        }}
      >
        {/* Back button */}
        <button
          onClick={() => router.push(`/room/${roomId}`)}
          style={{
            pointerEvents: 'auto',
            background: 'rgba(9,24,41,0.7)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid #C9A84C',
            borderRadius: 24,
            color: '#F5F0E8',
            fontFamily: 'Inter, sans-serif',
            fontSize: 13,
            fontWeight: 500,
            padding: '8px 16px',
            cursor: 'pointer',
          }}
        >
          ← 2D View
        </button>

        {/* Center badge */}
        <span
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 10,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#C9A84C',
            background: 'rgba(9,24,41,0.7)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            padding: '6px 12px',
            borderRadius: 24,
            border: '1px solid rgba(201,168,76,0.3)',
          }}
        >
          3D
        </span>

        {/* Chat bubble */}
        <button
          onClick={() => {
            setChatOpen((o) => !o)
            setSelectedHotspot(null)
          }}
          aria-label="Open chat"
          style={{
            pointerEvents: 'auto',
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'rgba(9,24,41,0.7)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid #C9A84C',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
              stroke="#C9A84C"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* ── Bottom overlay ──────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 16px 24px',
          zIndex: 20,
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(201,168,76,0.6)',
          }}
        >
          Exploring your room in 3D
        </span>

        <button
          onClick={() => router.push('/browse')}
          style={{
            pointerEvents: 'auto',
            background: 'rgba(9,24,41,0.7)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid rgba(201,168,76,0.4)',
            borderRadius: 24,
            color: '#C9A84C',
            fontFamily: 'Inter, sans-serif',
            fontSize: 12,
            fontWeight: 500,
            padding: '8px 16px',
            cursor: 'pointer',
          }}
        >
          Shop All →
        </button>
      </div>

      {/* ── Slide-in panels ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedHotspot && (
          <ProductPanel
            key="product-panel"
            hotspot={selectedHotspot}
            onClose={() => setSelectedHotspot(null)}
          />
        )}
        {chatOpen && (
          <ChatPanel key="chat-panel" onClose={() => setChatOpen(false)} />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
