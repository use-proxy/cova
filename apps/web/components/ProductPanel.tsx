'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'

interface ProductMatch {
  id: string
  furniture_label: string
  similarity_score: number
  is_unlocked: boolean
  rank: number
  products: {
    id: string
    name: string
    price: number
    category: string
    retailer: string
    affiliate_url: string
    image_url: string
    style_tags: string[]
  }
}

interface ProductPanelProps {
  roomId: string
  furnitureLabel: string | null
  onClose: () => void
}

const RETAILER_COLORS: Record<string, { bg: string; text: string }> = {
  amazon: { bg: '#FFF7ED', text: '#9A3412' },
  ikea: { bg: '#EFF6FF', text: '#1E40AF' },
  overstock: { bg: '#F5F3FF', text: '#6D28D9' },
  etsy: { bg: '#FEFCE8', text: '#A16207' },
}

export default function ProductPanel({ roomId, furnitureLabel, onClose }: ProductPanelProps) {
  const [matches, setMatches] = useState<ProductMatch[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!furnitureLabel) return
    setLoading(true)
    const supabase = createBrowserClient()
    supabase
      .from('room_products')
      .select(
        'id, furniture_label, similarity_score, is_unlocked, rank, products (id, name, price, category, retailer, affiliate_url, image_url, style_tags)'
      )
      .eq('room_id', roomId)
      .eq('furniture_label', furnitureLabel)
      .order('rank')
      .limit(3)
      .then(({ data }) => {
        setMatches((data as unknown as ProductMatch[]) ?? [])
        setLoading(false)
      })
  }, [furnitureLabel, roomId])

  if (!furnitureLabel) return null

  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        height: '100%',
        width: 320,
        background: 'rgba(15, 31, 61, 0.95)',
        backdropFilter: 'blur(12px)',
        borderLeft: '1px solid #1E3A5F',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 30,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 16,
          borderBottom: '1px solid #1E3A5F',
        }}
      >
        <div>
          <h3
            style={{
              color: '#F8F6F1',
              fontSize: 16,
              fontWeight: 600,
              margin: 0,
              textTransform: 'capitalize',
            }}
          >
            {furnitureLabel}
          </h3>
          <p style={{ color: '#8BA3C0', fontSize: 12, margin: '4px 0 0' }}>
            {matches.length} matches
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#8BA3C0',
            cursor: 'pointer',
            padding: 8,
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          &times;
        </button>
      </div>

      {/* Products */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#8BA3C0' }}>Loading...</div>
        ) : matches.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#8BA3C0', fontSize: 13 }}>
            No products found
          </div>
        ) : (
          matches.map((match, idx) => {
            const product = match.products
            const retailerStyle = RETAILER_COLORS[product?.retailer?.toLowerCase() ?? ''] ?? {
              bg: '#F3F4F6',
              text: '#374151',
            }
            return (
              <div
                key={match.id}
                style={{
                  background: '#0F1F3D',
                  border: '1px solid #1E3A5F',
                  borderRadius: 12,
                  overflow: 'hidden',
                  marginBottom: 16,
                }}
              >
                {/* Image */}
                <div style={{ aspectRatio: '1', background: '#1E3A5F', position: 'relative' }}>
                  {product?.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#8BA3C0',
                        fontSize: 13,
                      }}
                    >
                      No image
                    </div>
                  )}
                  {idx === 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 8,
                        left: 8,
                        background: '#C9A84C',
                        color: '#0A1628',
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 12,
                      }}
                    >
                      Best match
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{ padding: 12 }}>
                  <p
                    style={{
                      color: '#F8F6F1',
                      fontSize: 13,
                      fontWeight: 500,
                      margin: 0,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {product?.name}
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 8,
                    }}
                  >
                    <span style={{ color: '#F8F6F1', fontSize: 18, fontWeight: 700 }}>
                      ${product?.price?.toFixed(2)}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: retailerStyle.bg,
                        color: retailerStyle.text,
                        fontWeight: 600,
                        textTransform: 'capitalize',
                      }}
                    >
                      {product?.retailer}
                    </span>
                  </div>

                  {match.is_unlocked ? (
                    <a
                      href={product?.affiliate_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'block',
                        marginTop: 12,
                        textAlign: 'center',
                        padding: '10px 16px',
                        background: '#C9A84C',
                        color: '#0A1628',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      Buy on {product?.retailer}
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => alert('Token unlock coming in M8')}
                      style={{
                        display: 'block',
                        width: '100%',
                        marginTop: 12,
                        padding: '10px 16px',
                        background: 'transparent',
                        border: '1px solid #C9A84C',
                        color: '#C9A84C',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Unlock to shop
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
