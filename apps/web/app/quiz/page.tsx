"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@/lib/supabase/client"
import { ChevronLeft, Heart, X } from "lucide-react"
import { ConfidenceBar } from "@/components/quiz/ConfidenceBar"
import { CardStack } from "@/components/quiz/CardStack"
import { ReturningUserStrip } from "@/components/quiz/ReturningUserStrip"

function QuizInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const captureSessionId = searchParams.get("session")

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [confidence, setConfidence] = useState(0)
  const [complete, setComplete] = useState(false)
  const [previousStyleActive, setPreviousStyleActive] = useState(false)
  const [previousStyleDimmed, setPreviousStyleDimmed] = useState(false)

  // Create style session on mount
  useEffect(() => {
    const createSession = async () => {
      const supabase = createBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/"); return }

      const { data, error } = await supabase.from("style_sessions").insert({
        user_id: user.id,
        capture_session_id: captureSessionId,
        swipes: [],
        confidence: 0,
        completed: false,
      }).select("id").single()

      if (error) { console.error("Session create error:", error); return }
      if (data) setSessionId(data.id)
    }
    createSession()
  }, [captureSessionId, router])

  const handleComplete = useCallback(() => {
    setComplete(true)
    setConfidence(100)
    // Navigate after animations
    setTimeout(() => {
      router.push(`/budget?session=${sessionId}`)
    }, 1200)
  }, [router, sessionId])

  const handlePreviousSelect = useCallback(async (prevSessionId: string) => {
    setPreviousStyleActive(true)
    setPreviousStyleDimmed(true)

    // Clone the style fingerprint to a new session
    const supabase = createBrowserClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: prevSession } = await supabase
      .from("style_sessions")
      .select("style_fingerprint")
      .eq("id", prevSessionId)
      .single()

    if (!prevSession) return

    const { data: newSession } = await supabase.from("style_sessions").insert({
      user_id: user.id,
      capture_session_id: captureSessionId,
      style_fingerprint: prevSession.style_fingerprint,
      confidence: 100,
      completed: true,
      swipes: [],
    }).select("id").single()

    if (newSession) {
      setTimeout(() => {
        router.push(`/budget?session=${newSession.id}`)
      }, 800)
    }
  }, [captureSessionId, router])

  const handlePreviousDismiss = useCallback(() => {
    setPreviousStyleActive(false)
    setPreviousStyleDimmed(false)
  }, [])

  // Keyboard support
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "l" || e.key === "L") {
        document.dispatchEvent(new CustomEvent("quiz-swipe", { detail: "right" }))
      }
      if (e.key === "ArrowLeft" || e.key === "j" || e.key === "J") {
        document.dispatchEvent(new CustomEvent("quiz-swipe", { detail: "left" }))
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [])

  if (!sessionId) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0a1628]">
        <div className="w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-[#0a1628] flex flex-col overflow-hidden">
      {/* Gold shimmer overlay on complete */}
      {complete && (
        <div className="fixed inset-0 z-50 pointer-events-none animate-[shimmerSweep_400ms_ease-out_forwards]"
          style={{
            background: "linear-gradient(135deg, rgba(201,168,76,0) 0%, rgba(201,168,76,0.15) 50%, rgba(201,168,76,0) 100%)",
          }}
        />
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 h-[60px] flex-shrink-0">
        <button onClick={() => router.back()} className="text-white/40 hover:text-white/60 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-xs font-sans uppercase tracking-[0.15em] text-white/50">Your Style</span>
        <div className="w-5" />
      </div>

      {/* Confidence bar */}
      <ConfidenceBar confidence={confidence} complete={complete} />

      {/* Returning user strip */}
      <ReturningUserStrip onSelect={handlePreviousSelect} onDismiss={handlePreviousDismiss} />

      {/* Card stack */}
      <div className={`flex-1 flex items-center justify-center transition-opacity duration-300 ${previousStyleDimmed ? "opacity-40" : "opacity-100"}`}>
        {previousStyleActive && (
          <div className="absolute z-10">
            <p className="text-sm font-sans text-white/50">Using this style</p>
          </div>
        )}
        {!complete && (
          <CardStack sessionId={sessionId} onComplete={handleComplete} onConfidenceUpdate={setConfidence} />
        )}
      </div>

      {/* Tap buttons */}
      {!complete && !previousStyleActive && (
        <div className="flex items-center justify-center gap-8 pb-8 flex-shrink-0">
          <button
            onClick={() => document.dispatchEvent(new CustomEvent("quiz-swipe", { detail: "left" }))}
            className="w-[52px] h-[52px] rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
            style={{ border: "1.5px solid rgba(239,68,68,0.5)" }}
          >
            <X className="w-5 h-5 text-red-400" />
          </button>
          <button
            onClick={() => document.dispatchEvent(new CustomEvent("quiz-swipe", { detail: "right" }))}
            className="w-[52px] h-[52px] rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
            style={{ border: "1.5px solid rgba(201,168,76,0.5)" }}
          >
            <Heart className="w-5 h-5 text-[#C9A84C]" />
          </button>
        </div>
      )}
    </div>
  )
}

export default function QuizPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 flex items-center justify-center bg-[#0a1628]">
        <div className="w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <QuizInner />
    </Suspense>
  )
}
