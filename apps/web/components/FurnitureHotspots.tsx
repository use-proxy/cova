'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'

interface FurnitureProduct {
  id: string
  name: string
  price: number
  category: string
  retailer: string
  affiliate_url: string
  image_url: string
  style_tags: string[]
}

interface FurnitureMatch {
  id: string
  furniture_label: string
  furniture_description: string
  azimuth_degrees: number
  rank: number
  is_unlocked: boolean
  similarity_score: number
  products: FurnitureProduct
}

interface FurnitureHotspotsProps {
  roomId: string
  onProductSelect: (label: string) => void
}

export default function FurnitureHotspots({ roomId, onProductSelect }: FurnitureHotspotsProps) {
  const [matches, setMatches] = useState<FurnitureMatch[]>([])

  useEffect(() => {
    const supabase = createBrowserClient()
    supabase
      .from('room_products')
      .select(
        'id, furniture_label, furniture_description, azimuth_degrees, rank, is_unlocked, similarity_score, products (id, name, price, category, retailer, affiliate_url, image_url, style_tags)'
      )
      .eq('room_id', roomId)
      .eq('rank', 1)
      .order('azimuth_degrees')
      .then(({ data }) => {
        setMatches((data as unknown as FurnitureMatch[]) ?? [])
      })
  }, [roomId])

  if (matches.length === 0) return null

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      {matches.map((match) => (
        <button
          key={match.id}
          type="button"
          onClick={() => onProductSelect(match.furniture_label)}
          style={{
            position: 'absolute',
            left: `${(match.azimuth_degrees / 360) * 100}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'auto',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <div style={{ position: 'relative' }}>
            {/* Pulse ring */}
            <div
              style={{
                position: 'absolute',
                inset: -4,
                borderRadius: '50%',
                background: 'rgba(201, 168, 76, 0.3)',
                animation: 'hotspot-pulse 2s ease-in-out infinite',
              }}
            />
            {/* Main dot */}
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.9)',
                border: '2px solid #C9A84C',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              {match.is_unlocked ? (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#0A1628' }}>
                  ${Math.round(match.products?.price ?? 0)}
                </span>
              ) : (
                <svg width="14" height="14" viewBox="0 0 20 20" fill="#0A1628">
                  <path
                    fillRule="evenodd"
                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                  />
                </svg>
              )}
            </div>
            {/* Label */}
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginTop: 4,
                padding: '2px 8px',
                background: 'rgba(0,0,0,0.75)',
                color: '#fff',
                fontSize: 11,
                borderRadius: 4,
                whiteSpace: 'nowrap',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              {match.furniture_label}
            </div>
          </div>
        </button>
      ))}
      <style>{`
        @keyframes hotspot-pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
