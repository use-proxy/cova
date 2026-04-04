"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@/lib/supabase/client"
import { RoomCard, Room } from "@/components/dashboard/RoomCard"
import { StyleProfile } from "@/components/dashboard/StyleProfile"
import { NewRoomCTA } from "@/components/dashboard/NewRoomCTA"

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoomRow {
  id: string
  created_at: string
  pipeline_status: string | null
  perspective_render_url: string | null
  style_blend: Record<string, number> | null
  budget_tier: string | null
  plus_upgrade_ready: boolean | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTimeGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function toRoom(r: RoomRow): Room {
  const d = new Date(r.created_at)
  const month = d.toLocaleString("default", { month: "long" })
  const year = d.getFullYear()
  const styleBlend = r.style_blend
    ? Object.entries(r.style_blend)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([k]) => k.toUpperCase())
        .join(" · ")
    : ""
  return {
    id: r.id,
    name: "Room",
    date: `${month} ${year}`,
    styleBlend,
    totalCost: 0,
    thumbnail: r.perspective_render_url ?? "",
    sessionId: r.id,
  }
}

function aggregateStyles(rooms: RoomRow[]): { name: string; percentage: number }[] {
  const totals: Record<string, number> = {}
  const counts: Record<string, number> = {}
  for (const room of rooms) {
    if (!room.style_blend || typeof room.style_blend !== "object") continue
    for (const [key, val] of Object.entries(room.style_blend)) {
      totals[key] = (totals[key] ?? 0) + val
      counts[key] = (counts[key] ?? 0) + 1
    }
  }
  return Object.entries(totals)
    .map(([name, total]) => ({ name, percentage: Math.round((total / counts[name]) * 100) }))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 3)
}

function SectionDivider() {
  return (
    <div
      className="w-full h-px my-8"
      style={{
        background:
          "linear-gradient(to right, transparent, rgba(201,168,76,0.15), transparent)",
      }}
    />
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)
  const [userName, setUserName] = useState("")
  const [userInitials, setUserInitials] = useState("")
  const [greeting, setGreeting] = useState("")
  const [rooms, setRooms] = useState<RoomRow[]>([])
  const router = useRouter()

  useEffect(() => {
    setGreeting(getTimeGreeting())

    const supabase = createBrowserClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return

      const rawName =
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        user.email?.split("@")[0] ??
        ""
      const display = rawName.charAt(0).toUpperCase() + rawName.slice(1)
      setUserName(display)
      setUserInitials(display.charAt(0).toUpperCase())

      const { data } = await supabase
        .from("rooms")
        .select(
          "id, created_at, pipeline_status, perspective_render_url, style_blend, budget_tier, plus_upgrade_ready"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (data) setRooms(data as RoomRow[])
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignOut = async () => {
    setAvatarMenuOpen(false)
    const supabase = createBrowserClient()
    await supabase.auth.signOut()
    router.push("/")
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const transformedRooms: Room[] = rooms.map(toRoom)
  const aggregatedStyles = aggregateStyles(rooms)
  const primaryStyle = aggregatedStyles[0]?.name ?? "—"

  const stats = [
    { value: String(rooms.length), label: "ROOMS DESIGNED" },
    { value: "$0", label: "FURNITURE VALUE" },
    { value: primaryStyle, label: "PRIMARY STYLE" },
    { value: "94%", label: "AVG MATCH SCORE" },
  ]

  return (
    <div
      className="min-h-screen relative overflow-x-hidden"
      style={{
        background: `
          radial-gradient(ellipse 80% 40% at 50% 0%,   rgba(201,168,76,0.08)  0%, transparent 60%),
          radial-gradient(ellipse 60% 50% at 20% 80%,  rgba(20,80,80,0.10)    0%, transparent 60%),
          radial-gradient(ellipse 50% 40% at 80% 60%,  rgba(100,60,20,0.08)   0%, transparent 60%),
          #0a1628
        `,
      }}
    >
      {/* Noise texture overlay */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`,
          zIndex: 1,
        }}
      />

      {/* ── Header — full viewport width, inner max-w ── */}
      <header
        className="sticky top-0"
        style={{
          background: "rgba(10,22,40,0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(201,168,76,0.08)",
          zIndex: 20,
        }}
      >
        <div
          className="max-w-7xl mx-auto w-full px-6 md:px-12 lg:px-16 flex items-center justify-between"
          style={{ height: 72 }}
        >
          {/* Logo mark + wordmark */}
          <div className="flex items-center gap-2.5">
            <svg width="28" height="20" viewBox="0 0 32 20" fill="none" aria-hidden="true">
              <path d="M2 18Q16 2 30 18" stroke="#C9A84C" strokeWidth="3" strokeLinecap="round" fill="none" />
            </svg>
            <span
              className="text-lg text-white"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Cova
            </span>
          </div>

          {/* Avatar + dropdown */}
          <div className="relative">
            <button
              className="flex items-center justify-center rounded-full text-sm font-semibold cursor-pointer hover:opacity-80 transition-opacity duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]"
              style={{
                width: 36,
                height: 36,
                minWidth: 44,
                minHeight: 44,
                background: "#0d1f3c",
                border: "1.5px solid #C9A84C",
                color: "#C9A84C",
                fontFamily: "Inter, sans-serif",
              }}
              onClick={() => setAvatarMenuOpen((o) => !o)}
              aria-label="Open account menu"
              aria-expanded={avatarMenuOpen}
              aria-haspopup="menu"
            >
              {userInitials}
            </button>

            {avatarMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setAvatarMenuOpen(false)}
                  aria-hidden="true"
                />
                <div
                  className="absolute right-0 rounded-xl overflow-hidden z-40"
                  style={{
                    top: "calc(100% + 8px)",
                    background: "#0d1f3c",
                    border: "1px solid rgba(201,168,76,0.2)",
                    boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
                    minWidth: 148,
                    animation: "slideDown 150ms ease-out both",
                  }}
                  role="menu"
                  aria-label="Account options"
                >
                  <button
                    className="w-full px-4 py-3 text-sm text-left cursor-pointer hover:bg-white/5 transition-colors duration-150 focus:outline-none focus-visible:bg-white/5"
                    style={{ color: "#F8F6F1", fontFamily: "Inter, sans-serif" }}
                    onClick={handleSignOut}
                    role="menuitem"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <div
        className="relative max-w-7xl mx-auto w-full px-6 md:px-12 lg:px-16"
        style={{ zIndex: 2 }}
      >
        <main>
          {/* Hero greeting */}
          <section
            className="pt-8 pb-2"
            style={{
              opacity: 0,
              animation: "slideUp 400ms ease-out 100ms forwards",
            }}
          >
            <h1
              className="text-3xl text-white leading-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {greeting},{" "}
              <em style={{ fontStyle: "italic", color: "#C9A84C" }}>
                {userName}.
              </em>
            </h1>
            <p
              className="text-sm mt-2"
              style={{
                color: "rgba(255,255,255,0.55)",
                fontFamily: "Inter, sans-serif",
                lineHeight: 1.65,
              }}
            >
              {rooms.length} rooms designed. Your style is evolving.
            </p>
          </section>

          <SectionDivider />

          {/* Stats — 4 cards full width on desktop */}
          <div
            className="grid grid-cols-2 md:grid-cols-4 gap-4"
            role="list"
            aria-label="Design statistics"
          >
            {stats.map((stat, i) => (
              <div
                key={stat.label}
                role="listitem"
                className="rounded-2xl p-4"
                style={{
                  background: "rgba(13,31,60,0.8)",
                  border: "1px solid rgba(201,168,76,0.15)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  opacity: 0,
                  animation: `slideUp 400ms ease-out ${200 + i * 80}ms forwards`,
                }}
              >
                <p
                  className="text-2xl text-white leading-none"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {stat.value}
                </p>
                <p
                  className="mt-2 text-[10px] uppercase tracking-[0.12em] leading-tight"
                  style={{ color: "rgba(201,168,76,0.7)", fontFamily: "Inter, sans-serif" }}
                >
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          <SectionDivider />

          {/* Two-column: Featured room card + Style DNA */}
          <div className="grid md:grid-cols-2 gap-8">
            <RoomCard rooms={transformedRooms} />
            <StyleProfile
              styles={aggregatedStyles}
              adjectives={[]}
            />
          </div>

          <SectionDivider />

          {/* New room CTA — full width */}
          <div className="[&>section]:mx-0 mb-12">
            <NewRoomCTA />
          </div>
        </main>
      </div>
    </div>
  )
}
