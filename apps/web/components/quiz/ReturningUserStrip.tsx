"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@/lib/supabase/client"
import { Check, X } from "lucide-react"

interface PreviousSession {
  id: string
  style_fingerprint: Record<string, unknown>
  thumbnail_url?: string
  blend_label: string
}

interface ReturningUserStripProps {
  onSelect: (sessionId: string) => void
  onDismiss: () => void
}

export function ReturningUserStrip({ onSelect, onDismiss }: ReturningUserStripProps) {
  const [sessions, setSessions] = useState<PreviousSession[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const fetchSessions = async () => {
      const supabase = createBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from("style_sessions")
        .select("id, style_fingerprint, created_at")
        .eq("user_id", user.id)
        .eq("completed", true)
        .order("created_at", { ascending: false })
        .limit(10)

      if (data?.length) {
        setSessions(data.map((s) => {
          const fp = s.style_fingerprint as Record<string, unknown> | null
          const primary = (fp?.primary as string) ?? ""
          const secondary = (fp?.secondary as string) ?? ""
          const label = [primary, secondary].filter(Boolean).join(" \u00B7 ").toUpperCase()
          return { id: s.id, style_fingerprint: fp ?? {}, blend_label: label || "CUSTOM STYLE" }
        }))
      }
    }
    fetchSessions()
  }, [])

  if (sessions.length === 0 || dismissed) return null

  const handleSelect = (id: string) => {
    setSelected(id)
    onSelect(id)
  }

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss()
  }

  return (
    <div className="px-5 animate-[slideDown_300ms_ease-out]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-sans uppercase tracking-[0.15em] text-white/40">Your past styles</span>
        <button onClick={handleDismiss} className="flex items-center gap-1 text-[10px] font-sans uppercase tracking-[0.1em] text-white/40 hover:text-white/60">
          <X className="w-3 h-3" />
          Start Fresh
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => handleSelect(session.id)}
            className="flex-shrink-0 relative rounded-xl overflow-hidden transition-all duration-200"
            style={{
              width: 120,
              aspectRatio: "3/2",
              border: selected === session.id ? "2px solid #C9A84C" : "1px solid rgba(201,168,76,0.4)",
              transform: selected === session.id ? "scale(1.03)" : "scale(1)",
              background: "#0d1f3c",
            }}
          >
            {selected === session.id && (
              <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#C9A84C] flex items-center justify-center z-10">
                <Check className="w-3 h-3 text-[#0a1628]" />
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/70 to-transparent">
              <span className="text-[10px] font-sans uppercase tracking-[0.08em] text-[#C9A84C]/70">{session.blend_label}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
