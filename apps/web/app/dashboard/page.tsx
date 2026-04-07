import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getUserRooms, getUserFingerprint, getSavedProducts } from '@/lib/dashboard/queries'
import { generateSwatchesFromFingerprint } from '@/lib/dashboard/colorUtils'
import { GoldDivider } from '@/components/cova/GoldDivider'
import { CovaCard } from '@/components/cova/CovaCard'
import { CovaButton } from '@/components/cova/CovaButton'
import { RoomsGrid } from '@/components/dashboard/RoomsGrid'
import { SavedProductCard } from '@/components/dashboard/SavedProductCard'
import { DesignDnaShare } from '@/components/dashboard/DesignDnaShare'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  const [rooms, fingerprint, savedProducts] = await Promise.all([
    getUserRooms(user.id),
    getUserFingerprint(user.id),
    getSavedProducts(user.id),
  ])

  // Determine rooms with multiple renders (for Room Replay section)
  const roomsWithMultipleRenders = rooms.filter(
    (r) => r.latest_render_url && r.render_url && r.latest_render_url !== r.render_url
  )

  const swatches = fingerprint
    ? generateSwatchesFromFingerprint(fingerprint.dimensions)
    : []

  const styleTags = fingerprint?.style_tags?.slice(0, 4) ?? []

  return (
    <>
      {/* ── Section 1: My Rooms ─────────────────────────────────────── */}
      <section aria-labelledby="rooms-heading">
        <h1
          id="rooms-heading"
          className="mb-6 font-serif text-3xl text-cova-ivory"
        >
          My Rooms
        </h1>
        <RoomsGrid initialRooms={rooms} />
      </section>

      {/* ── Section 2: Design DNA ─────────────────────────────────────── */}
      {fingerprint && (
        <section aria-labelledby="dna-heading">
          <GoldDivider label="Your Design DNA" className="my-10" />

          <CovaCard variant="elevated" className="max-w-md">
            <div className="flex items-center justify-between">
              {fingerprint.style_name ? (
                <p className="font-serif text-2xl text-cova-gold">
                  {fingerprint.style_name}
                </p>
              ) : (
                <p className="font-serif text-2xl text-cova-gold">Your Style</p>
              )}
              <Link
                href="/design/step-3"
                className="text-sm text-cova-muted transition-colors hover:text-cova-ivory"
              >
                Retake Quiz
              </Link>
            </div>

            {/* Color swatches */}
            {swatches.length > 0 && (
              <div className="mt-4 flex gap-2">
                {swatches.map((hex, i) => (
                  <div
                    key={i}
                    className="h-10 w-10 rounded-lg border border-cova-border"
                    style={{ backgroundColor: hex }}
                    aria-label={`Swatch ${i + 1}: ${hex}`}
                  />
                ))}
              </div>
            )}

            {/* Descriptor chips */}
            {styleTags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {styleTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-cova-border px-3 py-1 text-xs text-cova-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4">
              <DesignDnaShare styleName={fingerprint.style_name} />
            </div>
          </CovaCard>
        </section>
      )}

      {/* ── Section 3: Saved Items ────────────────────────────────────── */}
      {savedProducts.length > 0 && (
        <section aria-labelledby="saved-heading">
          <GoldDivider label="Saved Items" className="my-10" />

          <div className="mb-4 flex items-center justify-between">
            <h2
              id="saved-heading"
              className="font-serif text-xl text-cova-ivory"
            >
              Saved Items
            </h2>
            <Link
              href="/dashboard/saved"
              className="text-sm text-cova-muted transition-colors hover:text-cova-ivory"
            >
              View all
            </Link>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
            {savedProducts.slice(0, 8).map((product) => (
              <SavedProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {/* ── Section 4: Room Replay ────────────────────────────────────── */}
      {roomsWithMultipleRenders.length > 0 && (
        <section aria-labelledby="replay-heading">
          <GoldDivider label="Room Replay" className="my-10" />

          <div className="space-y-4">
            {roomsWithMultipleRenders.map((room) => {
              const images = [room.original_photo_url, room.render_url, room.latest_render_url].filter(
                Boolean
              ) as string[]

              const dateRange = new Intl.DateTimeFormat('en-US', {
                month: 'short',
                year: 'numeric',
              }).format(new Date(room.created_at))

              return (
                <CovaCard key={room.id} variant="default" className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium capitalize text-cova-ivory-dim">
                      {room.room_type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-cova-muted">{dateRange}</p>
                  </div>

                  {/* Thumbnail strip */}
                  <div className="flex gap-1.5">
                    {images.slice(0, 3).map((url, i) => (
                      <div
                        key={i}
                        className="relative h-10 w-16 flex-shrink-0 overflow-hidden rounded"
                      >
                        <Image
                          src={url}
                          alt={`Render ${i + 1}`}
                          fill
                          className="object-cover"
                          sizes="64px"
                        />
                      </div>
                    ))}
                  </div>

                  <CovaButton
                    variant="ghost"
                    size="sm"
                    onClick={undefined}
                  >
                    Generate Time-Lapse
                  </CovaButton>
                </CovaCard>
              )
            })}
          </div>
        </section>
      )}
    </>
  )
}
