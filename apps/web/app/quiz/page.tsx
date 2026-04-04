"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@/lib/supabase/client"
import { ChevronLeft, Heart, X } from "lucide-react"
import { ConfidenceBar } from "@/components/quiz/ConfidenceBar"
import { CardStack, type CardStackHandle } from "@/components/quiz/CardStack"
import { ReturningUserStrip } from "@/components/quiz/ReturningUserStrip"

function QuizInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const captureSessionId = searchParams.get("session")
  const roomId = searchParams.get("roomId")
  const skipQuiz = searchParams.get("skipQuiz") === "true"

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [confidence, setConfidence] = useState(0)
  const [complete, setComplete] = useState(false)
  const [previousStyleActive, setPreviousStyleActive] = useState(false)
  const [previousStyleDimmed, setPreviousStyleDimmed] = useState(false)
  const cardStackRef = useRef<CardStackHandle>(null)
  const styleScoresRef = useRef<Record<string, number>>({})

  // Skip quiz: navigate immediately
  useEffect(() => {
    if (skipQuiz && roomId) {
      router.push(`/budget?roomId=${roomId}`)
    }
  }, [skipQuiz, roomId, router])

  // Safety timeout — always render after 2s no matter what
  useEffect(() => {
    const timeout = setTimeout(() => {
      setSessionId((prev) => prev ?? crypto.randomUUID())
    }, 2000)
    return () => clearTimeout(timeout)
  }, [])

  // Create style session on mount
  useEffect(() => {
    const createSession = async () => {
      const supabase = createBrowserClient()
      let userId: string

      try {
        const { data: { user } } = await supabase.auth.getUser()
        userId = user?.id ?? "dev-test-user"
      } catch {
        userId = "dev-test-user"
      }

      try {
        const { data } = await supabase.from("style_sessions").insert({
          user_id: userId,
          capture_session_id: captureSessionId,
          swipes: [],
          confidence: 0,
          completed: false,
        }).select("id").single()

        if (data) { setSessionId(data.id); return }
      } catch (e) {
        console.error("Session create error:", e)
      }

      // Fallback: generate local session ID so UI always renders
      setSessionId(crypto.randomUUID())
    }
    createSession()
  }, [captureSessionId])

  const handleSwipeScore = useCallback((direction: "left" | "right", styleTags: string[]) => {
    const delta = direction === "right" ? 1.0 : -0.3
    const scores = { ...styleScoresRef.current }
    for (const tag of styleTags) {
      scores[tag] = Math.max(0, (scores[tag] ?? 0) + delta)
    }
    const total = Object.values(scores).reduce((a, b) => a + b, 0)
    if (total > 0) {
      for (const k of Object.keys(scores)) {
        scores[k] = Math.round((scores[k] / total) * 10000) / 10000
      }
    }
    styleScoresRef.current = scores
  }, [])

  const handleComplete = useCallback(async () => {
    setComplete(true)
    setConfidence(100)
    if (roomId) {
      try {
        await fetch(`/api/rooms/${roomId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ style_blend: styleScoresRef.current }),
        })
      } catch (e) {
        console.error("Failed to save style blend:", e)
      }
    }
    setTimeout(() => {
      router.push(roomId ? `/budget?roomId=${roomId}` : `/budget?session=${sessionId}`)
    }, 1200)
  }, [router, roomId, sessionId])

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

  // Keyboard support — calls the same swipe path as drag and buttons
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "j", "J", "l", "L"].includes(e.key)) {
        e.preventDefault()
      }
      if (e.key === "ArrowRight" || e.key === "l" || e.key === "L") {
        cardStackRef.current?.swipe("right")
      }
      if (e.key === "ArrowLeft" || e.key === "j" || e.key === "J") {
        cardStackRef.current?.swipe("left")
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
      <div className={`flex-1 flex items-center justify-center pb-6 transition-opacity duration-300 ${previousStyleDimmed ? "opacity-40" : "opacity-100"}`}>
        {previousStyleActive && (
          <div className="absolute z-10">
            <p className="text-sm font-sans text-white/50">Using this style</p>
          </div>
        )}
        {!complete && (
          <CardStack ref={cardStackRef} sessionId={sessionId} onComplete={handleComplete} onConfidenceUpdate={setConfidence} onSwipe={handleSwipeScore} />
        )}
      </div>

      {/* Tap buttons */}
      {!complete && !previousStyleActive && (
        <div className="flex items-center justify-center gap-8 pb-8 mb-safe flex-shrink-0">
          <button
            onClick={() => cardStackRef.current?.swipe("left")}
            className="w-[52px] h-[52px] rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
            style={{ border: "1.5px solid rgba(239,68,68,0.5)" }}
          >
            <X className="w-5 h-5 text-red-400" />
          </button>
          <button
            onClick={() => cardStackRef.current?.swipe("right")}
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
