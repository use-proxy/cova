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

  const roomCount = rooms.length
  const savedCount = savedProducts.length
  const styleMatchCount = 3

  const rawName = user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'there'
  const firstName = (rawName as string).split(' ')[0]

  return (
    <div className="bg-cova-bg min-h-screen font-dm-sans">
      {/* layout.tsx already provides the frosted glass top bar — no top bar added here */}

      <div className="max-w-[1200px] mx-auto px-6 pt-12 pb-20">
        {/* Greeting */}
        <h1 className="font-playfair text-[40px] text-cova-ivory mb-10 font-normal">
          Good evening, {firstName}
        </h1>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-12">
          {[
            { label: 'Rooms Designed', value: roomCount },
            { label: 'Products Saved', value: savedCount },
            { label: 'Style Matches', value: styleMatchCount },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="bg-[rgba(255,255,255,0.04)] rounded-xl px-6 py-5"
              style={{ border: '1px solid rgba(201,168,76,0.15)' }}
            >
              <p className="font-dm-sans font-bold text-4xl text-cova-gold m-0 leading-none">
                {value}
              </p>
              <p className="font-dm-sans text-[13px] text-cova-muted mt-1 mb-0">
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* ── Section 1: Your Rooms ─────────────────────────────────────── */}
        <section aria-labelledby="rooms-heading">
          <div className="flex items-center justify-between mb-6">
            <h2
              id="rooms-heading"
              className="font-playfair text-[28px] text-cova-ivory m-0 font-normal"
            >
              Your Rooms
            </h2>
            <Link
              href="/design/step-1"
              className="font-dm-sans text-sm text-cova-ivory rounded-lg px-4 py-2 no-underline"
              style={{ border: '1px solid rgba(201,168,76,0.35)' }}
            >
              New Room +
            </Link>
          </div>

          {/* Empty state */}
          {rooms.length === 0 && (
            <div className="text-center px-6 py-20">
              <svg
                width="80"
                height="80"
                viewBox="0 0 80 80"
                className="mb-6 opacity-50"
              >
                <rect
                  x="8"
                  y="20"
                  width="64"
                  height="44"
                  rx="4"
                  fill="none"
                  stroke="#C9A84C"
                  strokeWidth="1.5"
                />
                <path d="M8 32 L40 52 L72 32" fill="none" stroke="#C9A84C" strokeWidth="1.5" />
              </svg>
              <h3 className="font-playfair text-[28px] text-cova-ivory mb-3">
                Design your first room
              </h3>
              <p className="font-dm-sans text-[15px] text-cova-muted mb-8">
                It only takes a few minutes.
              </p>
              <Link
                href="/design/step-1"
                className="inline-block bg-cova-gold text-[#091829] font-dm-sans font-semibold text-[15px] rounded-lg px-6 py-3 no-underline"
              >
                Begin Now →
              </Link>
            </div>
          )}

          {rooms.length > 0 && <RoomsGrid initialRooms={rooms} />}
        </section>

        {/* ── Section 2: Design DNA ─────────────────────────────────────── */}
        {fingerprint && (
          <section aria-labelledby="dna-heading" className="mt-12">
            <GoldDivider label="Your Design DNA" className="my-10" />

            <CovaCard variant="elevated" className="max-w-md">
              <div className="flex items-center justify-between">
                {fingerprint.style_name ? (
                  <p className="font-playfair text-2xl text-cova-gold">
                    Your Style
                  </p>
                ) : (
                  <p className="font-playfair text-2xl text-cova-gold">
                    Your Style
                  </p>
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
          <section aria-labelledby="saved-heading" className="mt-12">
            <GoldDivider label="Saved Items" className="my-10" />

            <div className="mb-4 flex items-center justify-between">
              <h2
                id="saved-heading"
                className="font-playfair text-xl text-cova-ivory"
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
          <section aria-labelledby="replay-heading" className="mt-12">
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
      </div>
    </div>
  )
}
