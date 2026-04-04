'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChatBubble } from '@/components/chat/ChatBubble'
import { ChatPanel } from '@/components/chat/ChatPanel'

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
  perspective_render_url: string | null
  room_products: RoomProduct[]
  plus_upgrade_ready: boolean
}

export default function RoomOverlay({ roomId }: { roomId: string }) {
  const router = useRouter()
  const [roomData, setRoomData] = useState<RoomStatus | null>(null)
  const [selectedHotspot, setSelectedHotspot] = useState<RoomProduct | null>(null)
  const [showPlusNotification, setShowPlusNotification] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    const res = await fetch(`/api/rooms/status?roomId=${roomId}`)
    if (!res.ok) return
    const data: RoomStatus = await res.json()
    setRoomData(data)
    if (data.plus_upgrade_ready) {
      setShowPlusNotification(true)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [roomId])

  useEffect(() => {
    fetchStatus()
    intervalRef.current = setInterval(fetchStatus, 15000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchStatus])

  if (!roomData || !roomData.perspective_render_url) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0A1628',
          color: '#F8F6F1',
          fontFamily: 'Inter, sans-serif',
          fontSize: 15,
        }}
      >
        Loading room...
      </div>
    )
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Background perspective render */}
      <img
        src={roomData.perspective_render_url}
        alt="Room view"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {/* Hotspot dots */}
      {roomData.room_products.map((hotspot) => (
        <button
          key={hotspot.id}
          onClick={() => setSelectedHotspot(hotspot)}
          aria-label={hotspot.furniture_label}
          style={{
            position: 'absolute',
            left: `${hotspot.hotspot_x}%`,
            top: `${hotspot.hotspot_y}%`,
            transform: 'translate(-50%, -50%)',
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: '#C9A84C',
            border: '2px solid #F8F6F1',
            cursor: 'pointer',
            padding: 0,
          }}
        />
      ))}

      {/* Product panel */}
      {selectedHotspot && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#0F1F3D',
            borderTop: '1px solid #1E3A5F',
            padding: '16px',
            maxHeight: '50vh',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: '#F8F6F1', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 15 }}>
              {selectedHotspot.furniture_label}
            </span>
            <button
              onClick={() => setSelectedHotspot(null)}
              style={{ color: '#8BA3C0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 0 }}
            >
              ×
            </button>
          </div>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {selectedHotspot.matches.map((match, i) => (
              <a
                key={i}
                href={match.affiliate_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: '0 0 160px',
                  background: '#0A1628',
                  borderRadius: 12,
                  overflow: 'hidden',
                  textDecoration: 'none',
                  border: '1px solid #1E3A5F',
                  display: 'block',
                }}
              >
                <img
                  src={match.image_url}
                  alt={match.product_name}
                  style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }}
                />
                <div style={{ padding: '8px' }}>
                  <div style={{ color: '#F8F6F1', fontFamily: 'Inter, sans-serif', fontSize: 12, marginBottom: 4, lineHeight: 1.3 }}>
                    {match.product_name}
                  </div>
                  <div style={{ color: '#C9A84C', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                    ${match.price}
                  </div>
                  <div style={{ color: '#8BA3C0', fontFamily: 'Inter, sans-serif', fontSize: 11 }}>
                    {match.retailer}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Plus upgrade notification */}
      {showPlusNotification && (
        <button
          onClick={() => router.push(`/room/${roomId}/3d`)}
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#C9A84C',
            color: '#0A1628',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600,
            fontSize: 14,
            padding: '10px 20px',
            borderRadius: 24,
            border: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Your room is ready in 3D →
        </button>
      )}

      {/* Chat bubble (visible when panel closed) */}
      {!chatOpen && (
        <ChatBubble onClick={() => setChatOpen(true)} hasUnread={false} />
      )}

      {/* Chat panel */}
      <ChatPanel
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        onMinimize={() => setChatOpen(false)}
        context={{
          styleFingerprint: { primary: null, secondary: null, tertiary: null },
          budgetTier: 0,
          budgetRange: '',
          roomType: 'room',
          furniture: roomData?.room_products.map((p) => p.furniture_label) ?? [],
          totalCost: roomData?.room_products.reduce((sum, p) => sum + (p.matches[0]?.price ?? 0), 0) ?? 0,
        }}
      />
    </div>
  )
}
