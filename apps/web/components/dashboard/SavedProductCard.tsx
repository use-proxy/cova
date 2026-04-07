'use client'

import Image from 'next/image'
import { CovaCard } from '@/components/cova/CovaCard'
import { CovaButton } from '@/components/cova/CovaButton'
import type { SavedProduct } from '@/lib/dashboard/queries'

interface SavedProductCardProps {
  product: SavedProduct
  large?: boolean
}

export function SavedProductCard({ product, large = false }: SavedProductCardProps) {
  return (
    <CovaCard
      variant="interactive"
      className={`overflow-hidden p-0 flex-shrink-0 ${large ? 'w-full' : 'w-44'}`}
    >
      <div className={`relative bg-cova-surface-2 ${large ? 'aspect-square' : 'aspect-square'}`}>
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            className="object-cover"
            sizes={large ? '(max-width: 640px) 100vw, 25vw' : '176px'}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 rounded bg-cova-border" />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm leading-tight text-cova-ivory">{product.name}</p>
        <p className="mt-1 text-sm font-medium text-cova-gold">
          ${product.price.toFixed(2)}
        </p>
        <p className="text-xs capitalize text-cova-muted">{product.retailer}</p>
        <CovaButton
          variant="primary"
          size="sm"
          className="mt-2 w-full"
          onClick={() => window.open(product.affiliate_url, '_blank')}
        >
          Buy →
        </CovaButton>
      </div>
    </CovaCard>
  )
}
