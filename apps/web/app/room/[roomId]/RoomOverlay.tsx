'use client'

import { useState } from 'react'
import FurnitureHotspots from '@/components/FurnitureHotspots'
import ProductPanel from '@/components/ProductPanel'

export default function RoomOverlay({ roomId }: { roomId: string }) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)

  return (
    <>
      <FurnitureHotspots
        roomId={roomId}
        onProductSelect={(label) => setSelectedLabel(label)}
      />
      <ProductPanel
        roomId={roomId}
        furnitureLabel={selectedLabel}
        onClose={() => setSelectedLabel(null)}
      />
    </>
  )
}
