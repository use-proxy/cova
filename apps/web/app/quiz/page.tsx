'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { createBrowserClient } from '@/lib/supabase/client'
import { useUserStore } from '@/lib/stores/userStore'

interface SwipeCard {
  id: string
  image_url: string
  style_weights: Record<string, number>
  discriminability_score: number
  style: string | null
  phase: string | null
}

const STYLE_KEYS = ['coastal', 'japandi', 'bohemian', 'minimalist', 'mid_century']
const TOTAL_CARDS = 25
const SWIPE_THRESHOLD = 100
const MIN_STYLE_VALUE = 0.02

export default function QuizPage() {
  const router = useRouter()
  const supabase = createBrowserClient()
  const { setStyleVector } = useUserStore()

  const [cards, setCards] = useState<SwipeCard[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const styleVector = useRef<Record<string, number>>(
    Object.fromEntries(STYLE_KEYS.map((k) => [k, 0.2]))
  )
  const phase2Fetched = useRef(false)
  const phase3Fetched = useRef(false)
  const userIdRef = useRef<string | null>(null)
  const sessionPositionRef = useRef(0)

  // ---------------------------------------------------------------------------
  // Helpers: top styles + shuffle
  // ---------------------------------------------------------------------------
  function getTopStyles(vec: Record<string, number>, n: number): string[] {
    return [...STYLE_KEYS].sort((a, b) => vec[b] - vec[a]).slice(0, n)
  }

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  const CARD_FIELDS = 'id, image_url, style_weights, discriminability_score, style, phase'

  // ---------------------------------------------------------------------------
  // Phase 1 — Baseline (cards 1-15): 3 per style, shuffled
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function init() {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        router.push('/auth')
        return
      }
      userIdRef.current = userData.user.id

      // Create room
      const { data: room, error: roomCreateError } = await supabase
        .from('rooms')
        .insert({ user_id: userData.user.id, status: 'active' })
        .select('id')
        .single()

      if (roomCreateError) console.error('Room create failed:', roomCreateError)
      if (room) setRoomId(room.id)

      // Fetch 3 baseline cards per style (15 total)
      const baselineCards: SwipeCard[] = []
      for (const style of STYLE_KEYS) {
        const { data } = await supabase
          .from('swipe_cards')
          .select(CARD_FIELDS)
          .eq('active', true)
          .eq('phase', 'baseline')
          .contains('style_weights', { [style]: 1.0 })
          .limit(3)

        if (data) baselineCards.push(...data)
      }

      // If not enough baseline cards, fill from any baseline cards
      if (baselineCards.length < 15) {
        const existingIds = baselineCards.map((c) => c.id)
        const { data: fill } = await supabase
          .from('swipe_cards')
          .select(CARD_FIELDS)
          .eq('active', true)
          .eq('phase', 'baseline')
          .not('id', 'in', `(${existingIds.join(',')})`)
          .limit(15 - baselineCards.length)

        if (fill) baselineCards.push(...fill)
      }

      setCards(shuffle(baselineCards))
      setLoading(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Phase 2 — Pure confirmation (cards 16-20): prefetch at card 14
  // ---------------------------------------------------------------------------
  const fetchPhase2 = useCallback(async () => {
    if (phase2Fetched.current) return
    phase2Fetched.current = true

    const [top1, top2] = getTopStyles(styleVector.current, 2)

    // 3 pure cards from top style + 2 from 2nd style
    const { data: top1Cards } = await supabase
      .from('swipe_cards')
      .select(CARD_FIELDS)
      .eq('active', true)
      .eq('phase', 'pure')
      .contains('style_weights', { [top1]: 1.0 })
      .limit(3)

    const { data: top2Cards } = await supabase
      .from('swipe_cards')
      .select(CARD_FIELDS)
      .eq('active', true)
      .eq('phase', 'pure')
      .contains('style_weights', { [top2]: 1.0 })
      .limit(2)

    const phase2: SwipeCard[] = [
      ...(top1Cards || []),
      ...(top2Cards || []),
    ]

    setCards((prev) => [...prev, ...shuffle(phase2)])
  }, [supabase])

  // ---------------------------------------------------------------------------
  // Phase 3 — Refinement (cards 21-25): prefetch at card 19
  // ---------------------------------------------------------------------------
  const fetchPhase3 = useCallback(async () => {
    if (phase3Fetched.current) return
    phase3Fetched.current = true

    const [top1, top2] = getTopStyles(styleVector.current, 2)

    // Try refinement cards for this style pair (both orderings)
    const pairA = `${top1}_${top2}`
    const pairB = `${top2}_${top1}`

    const { data: refinementCards } = await supabase
      .from('swipe_cards')
      .select(CARD_FIELDS)
      .eq('active', true)
      .eq('phase', 'refinement')
      .or(`style.eq.${pairA},style.eq.${pairB}`)
      .limit(5)

    if (refinementCards && refinementCards.length >= 3) {
      setCards((prev) => [...prev, ...shuffle(refinementCards)])
      return
    }

    // Fallback: blend cards weighted toward top 2 styles
    const { data: blendCards } = await supabase
      .from('swipe_cards')
      .select(CARD_FIELDS)
      .eq('active', true)
      .eq('phase', 'blend')
      .limit(5)

    setCards((prev) => [...prev, ...shuffle(blendCards || [])])
  }, [supabase])

  // ---------------------------------------------------------------------------
  // Bayesian swipe handler
  // ---------------------------------------------------------------------------
  const handleSwipe = useCallback(
    async (liked: boolean) => {
      const card = cards[currentIndex]
      if (!card) return

      // Snapshot style vector BEFORE Bayesian update
      const styleVectorBefore = { ...styleVector.current }

      // Bayesian update
      const weights = card.style_weights || {}
      const disc = card.discriminability_score ?? 0.5
      const vec = styleVector.current

      for (const key of STYLE_KEYS) {
        const likelihood = (weights[key] || 0) * disc
        if (liked) {
          vec[key] *= 1 + likelihood
        } else {
          vec[key] *= 1 - likelihood * 0.5
        }
      }

      // Normalize
      let total = STYLE_KEYS.reduce((sum, k) => sum + vec[k], 0)
      if (total > 0) {
        for (const key of STYLE_KEYS) vec[key] /= total
      }

      // Smoothing — prevent any style from reaching 0
      let needsRenorm = false
      for (const key of STYLE_KEYS) {
        if (vec[key] < MIN_STYLE_VALUE) {
          vec[key] = MIN_STYLE_VALUE
          needsRenorm = true
        }
      }
      if (needsRenorm) {
        total = STYLE_KEYS.reduce((sum, k) => sum + vec[k], 0)
        for (const key of STYLE_KEYS) vec[key] /= total
      }

      // Snapshot style vector AFTER Bayesian update
      const styleVectorAfter = { ...vec }

      // Track session position (1-based)
      sessionPositionRef.current += 1

      // Fire-and-forget: write enriched swipe event to swipe_history
      if (userIdRef.current) {
        supabase
          .from('swipe_history')
          .insert({
            user_id: userIdRef.current,
            card_id: card.id,
            direction: liked ? 'right' : 'left',
            dwell_time_ms: null,
            score_awarded: disc,
            card_style: card.style,
            card_phase: card.phase,
            style_vector_before: styleVectorBefore,
            style_vector_after: styleVectorAfter,
            session_position: sessionPositionRef.current,
            card_image_url: card.image_url,
          })
          .then(({ error }) => {
            if (error) console.error('swipe_history insert failed:', error)
          })
      }

      // Save style_blend after every swipe (partial profile survives early exit)
      const snapshot = { ...vec }
      if (roomId) {
        supabase
          .from('rooms')
          .update({ style_blend: snapshot })
          .eq('id', roomId)
          .then(({ error }) => {
            if (error) console.error('rooms style_blend update failed:', error)
          })
      }

      const nextIndex = currentIndex + 1

      // Prefetch next phase before user runs out of cards
      if (nextIndex === 14) fetchPhase2()
      if (nextIndex === 19) fetchPhase3()

      // Quiz complete (25 cards)
      if (nextIndex >= TOTAL_CARDS || nextIndex >= cards.length) {
        setStyleVector(Object.values(snapshot))

        // Also save to users table on completion
        const { data: userData } = await supabase.auth.getUser()
        if (userData.user) {
          const { error: userError } = await supabase
            .from('users')
            .update({ style_blend: snapshot })
            .eq('id', userData.user.id)
          if (userError) console.error('users style_blend update failed:', userError)
        }

        router.push(`/capture/${roomId}`)
        return
      }

      setCurrentIndex(nextIndex)
    },
    [cards, currentIndex, roomId, supabase, router, setStyleVector, fetchPhase2, fetchPhase3]
  )

  if (loading) {
    return (
      <div style={styles.container}>
        <p style={{ color: '#8BA3C0' }}>Loading...</p>
      </div>
    )
  }

  const visibleCards = cards.slice(currentIndex, currentIndex + 3)

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <p style={{ color: '#8BA3C0', fontSize: 14, margin: 0 }}>
          {Math.min(currentIndex + 1, TOTAL_CARDS)} / {TOTAL_CARDS}
        </p>
      </div>

      <div style={styles.cardStack}>
        {visibleCards
          .map((card, i) => (
            <SwipeableCard
              key={card.id}
              card={card}
              stackIndex={i}
              onSwipe={i === 0 ? handleSwipe : undefined}
            />
          ))
          .reverse()}
      </div>

      <div style={styles.hints}>
        <span style={{ color: '#C0504A' }}>← Not my style</span>
        <span style={{ color: '#4A9B7F' }}>Love it →</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Swipeable Card Component
// ---------------------------------------------------------------------------

function SwipeableCard({
  card,
  stackIndex,
  onSwipe,
}: {
  card: SwipeCard
  stackIndex: number
  onSwipe?: (liked: boolean) => void
}) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 200], [-15, 15])
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0.5, 1, 1, 1, 0.5])

  const scale = 1 - stackIndex * 0.04
  const translateY = stackIndex * 8
  const brightness = 1 - stackIndex * 0.2

  return (
    <motion.div
      style={{
        ...styles.card,
        x: stackIndex === 0 ? x : 0,
        rotate: stackIndex === 0 ? rotate : 0,
        opacity: stackIndex === 0 ? opacity : 1,
        scale,
        y: translateY,
        filter: `brightness(${brightness})`,
        zIndex: 3 - stackIndex,
        cursor: stackIndex === 0 ? 'grab' : 'default',
      }}
      drag={stackIndex === 0 ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={(_, info) => {
        if (Math.abs(info.offset.x) > SWIPE_THRESHOLD) {
          const liked = info.offset.x > 0
          animate(x, liked ? 500 : -500, {
            duration: 0.3,
            onComplete: () => onSwipe?.(liked),
          })
        } else {
          animate(x, 0, { duration: 0.3 })
        }
      }}
    >
      <img
        src={card.image_url}
        alt=""
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          borderRadius: 12,
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: '#0A1628',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Inter, sans-serif',
    position: 'relative',
  },
  header: {
    position: 'absolute',
    top: 24,
    right: 24,
  },
  cardStack: {
    position: 'relative',
    width: 340,
    height: 460,
  },
  card: {
    position: 'absolute',
    width: 340,
    height: 460,
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  hints: {
    display: 'flex',
    justifyContent: 'space-between',
    width: 340,
    marginTop: 24,
    fontSize: 13,
  },
}
