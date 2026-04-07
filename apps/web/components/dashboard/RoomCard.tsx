'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Home, MoreHorizontal } from 'lucide-react'
import { CovaCard } from '@/components/cova/CovaCard'
import { CovaButton } from '@/components/cova/CovaButton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { DashboardRoom } from '@/lib/dashboard/queries'

interface RoomCardProps {
  room: DashboardRoom
  onDelete: (roomId: string) => void
}

export function RoomCard({ room, onDelete }: RoomCardProps) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const imageUrl = room.latest_render_url ?? room.render_url ?? room.original_photo_url

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(room.created_at))

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/rooms/${room.id}`, { method: 'DELETE' })
      if (res.ok) {
        onDelete(room.id)
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <CovaCard variant="interactive" className="overflow-hidden p-0">
      {/* Image area */}
      <div className="relative aspect-[4/3] bg-cova-surface-2">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={`${room.room_type} design`}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Home size={40} className="text-cova-subtle" />
          </div>
        )}

        {/* Room type badge */}
        <div className="absolute right-2 top-2 rounded-full bg-cova-bg/80 px-2 py-1 backdrop-blur-sm">
          <span className="text-xs capitalize text-cova-ivory-dim">
            {room.room_type.replace(/_/g, ' ')}
          </span>
        </div>

        {/* Three-dot menu */}
        <div className="absolute left-2 top-2">
          <AlertDialog>
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuOpen(!menuOpen)
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-cova-bg/80 text-cova-ivory-dim backdrop-blur-sm transition-colors hover:text-cova-ivory"
                aria-label="Room options"
              >
                <MoreHorizontal size={14} />
              </button>

              {menuOpen && (
                <div
                  className="absolute left-0 top-8 z-10 rounded-lg border border-cova-border bg-cova-surface py-1 shadow-lg"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <AlertDialogTrigger asChild>
                    <button
                      className="flex w-full px-4 py-2 text-left text-sm text-cova-error transition-colors hover:bg-cova-surface-3"
                      onClick={() => setMenuOpen(false)}
                    >
                      Delete
                    </button>
                  </AlertDialogTrigger>
                </div>
              )}
            </div>

            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this room?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete your room and all its renders. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <p className="text-xs text-cova-muted">{formattedDate}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <CovaButton
            variant="primary"
            size="sm"
            onClick={() => router.push(`/design/step-9?roomId=${room.id}`)}
          >
            Shop This Look
          </CovaButton>
          <CovaButton
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/design/step-6?roomId=${room.id}`)}
          >
            Redesign
          </CovaButton>
          <CovaButton
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/design/step-8?roomId=${room.id}`)}
          >
            Edit Style
          </CovaButton>
        </div>
      </div>
    </CovaCard>
  )
}
