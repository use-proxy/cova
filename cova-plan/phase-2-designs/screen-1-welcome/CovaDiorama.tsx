/**
 * CovaDiorama.tsx — v3 (Phase 1 Alignment)
 *
 * DESIGN SYSTEM: "The Salon" — Gilded Modernism
 * bg: #0A1628 | gold: #C9A84C | ivory: #F8F6F1
 * EB Garamond (display) + Inter (functional)
 *
 * PHASE 1 CHANGES:
 * - Frame: continuous 1px gold border rgba(201,168,76,0.20), no corner brackets
 *   outer glow: box-shadow 0 0 32px rgba(201,168,76,0.08)
 * - Cards: Phase 1 surface treatment — rgba(255,255,255,0.04) bg, 1px gold-dim border
 *   "PHOTO PLACEHOLDER" label in Inter 10px tracked uppercase ivory 40%
 * - Progress arc: moved INSIDE the diorama frame, bottom-center, 24px above bottom edge
 * - Particles: confined INSIDE the diorama frame only (overflow:hidden on frame)
 * - 3-layer particle depth preserved (bg/mid/fg)
 * - All sans-serif text uses Inter
 * - Diorama height: 380px desktop / 280px mobile
 *
 * ANIMATION LOOP (8s cycle):
 * 1. Cursor enters from edge
 * 2. Cursor travels to target card
 * 3. Card tilts rotateY(±6deg) rotateX(3deg) scale(1.04), frame lifts
 * 4. Cursor pulses
 * 5. Selected card lifts + fades + 3-particle gold trail
 * 6. Other card recedes
 * 7. New cards fly in from upper corners with spring overshoot
 * 8. Settle into breathing, repeat
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Card definitions (8 photographic room images) ──────────────────────────
// Paired across 4 cycles. See cova-plan/phase-2-designs/screen-1-welcome/notes.md
// for the canonical style→file mapping. Card IDs reference the 8 files at
// /welcome-demo-cards/01..08-*.webp (filenames identify the style).

interface CardDef {
  id: string;
  photo: string;  // CDN URL
}

const ALL_CARDS: CardDef[] = [
  { id: "card-1", photo: "/manus-storage/01-modern-coastal_c9891b36.webp" },
  { id: "card-2", photo: "/manus-storage/02-warm-japandi_63c1271b.webp" },
  { id: "card-3", photo: "/manus-storage/03-industrial_22a6e79e.webp" },
  { id: "card-4", photo: "/manus-storage/04-biophilic_8d762b55.webp" },
  { id: "card-5", photo: "/manus-storage/05-mid-century_f06c202c.webp" },
  { id: "card-6", photo: "/manus-storage/06-modern-farmhouse_72c7f241.webp" },
  { id: "card-7", photo: "/manus-storage/07-bohemian_51ddcf0c.webp" },
  { id: "card-8", photo: "/manus-storage/08-mediterranean_4c3d6047.webp" },
];

const CARD_PAIRS: [number, number][] = [
  [0, 1], [2, 3], [4, 5], [6, 7],
];

// ─── 3-layer particle system ──────────────────────────────────────────────────
// Particles are CONFINED inside the diorama frame (overflow:hidden handles clipping)
// Layer 0 (bg):  large blurred, slow, low opacity
// Layer 1 (mid): medium, normal speed, medium opacity
// Layer 2 (fg):  small crisp, fast, high opacity

interface Particle {
  id: number;
  layer: 0 | 1 | 2;
  x: number;
  size: number;
  duration: number;
  delay: number;
  swayAmp: number;
  opacity: number;
  blur: number;
}

function generateParticles(totalCount: number): Particle[] {
  const rng = (seed: number) => {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  const layers: Array<{
    count: number; layer: 0 | 1 | 2;
    sizeRange: [number, number]; opacityRange: [number, number];
    blur: number; speedMult: number;
  }> = [
    { count: Math.round(totalCount * 0.30), layer: 0, sizeRange: [4, 6],  opacityRange: [0.15, 0.25], blur: 2.0, speedMult: 1.6 },
    { count: Math.round(totalCount * 0.45), layer: 1, sizeRange: [2, 3],  opacityRange: [0.30, 0.50], blur: 0.8, speedMult: 1.0 },
    { count: Math.round(totalCount * 0.25), layer: 2, sizeRange: [1, 2],  opacityRange: [0.50, 0.70], blur: 0.0, speedMult: 0.65 },
  ];

  const particles: Particle[] = [];
  let idx = 0;

  for (const layer of layers) {
    for (let i = 0; i < layer.count; i++) {
      const r = (n: number) => rng(idx * 17.3 + n);
      const [sMin, sMax] = layer.sizeRange;
      const [oMin, oMax] = layer.opacityRange;
      particles.push({
        id: idx,
        layer: layer.layer,
        x: 3 + r(1) * 94,
        size: sMin + r(2) * (sMax - sMin),
        duration: (8 + r(3) * 10) * layer.speedMult,
        delay: r(4) * 12,
        swayAmp: (layer.layer === 0 ? 6 : layer.layer === 1 ? 12 : 18) + r(5) * 10,
        opacity: oMin + r(6) * (oMax - oMin),
        blur: layer.blur,
      });
      idx++;
    }
  }
  return particles;
}

// ─── Progress arc (now inside the diorama) ────────────────────────────────────
// 160px wide, very lightweight, positioned at bottom-center of frame

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const sx = cx + r * Math.cos(rad(startAngle));
  const sy = cy + r * Math.sin(rad(startAngle));
  const ex = cx + r * Math.cos(rad(endAngle));
  const ey = cy + r * Math.sin(rad(endAngle));
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`;
}

function dotOnArc(cx: number, cy: number, r: number, angle: number) {
  const rad = (angle * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function ProgressArcInset({ step, total }: { step: number; total: number }) {
  const cx = 80, cy = 38, r = 30;
  const startAngle = 210;
  const endAngle = 330;
  const arcSpan = endAngle - startAngle;
  const dotAngle = startAngle + (step / Math.max(total - 1, 1)) * arcSpan;
  const dot = dotOnArc(cx, cy, r, dotAngle);
  const trackPath = describeArc(cx, cy, r, startAngle, endAngle);
  const activePath = describeArc(cx, cy, r, startAngle, dotAngle);

  return (
    <div style={{
      position: "absolute",
      bottom: 18,
      left: "50%",
      transform: "translateX(-50%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 0,
      pointerEvents: "none",
      zIndex: 10,
    }}>
      <svg width="160" height="48" viewBox="0 0 160 48">
        {/* Track */}
        <path d={trackPath} fill="none" stroke="rgba(201,168,76,0.14)" strokeWidth="0.75" strokeLinecap="round" />
        {/* Active */}
        <motion.path
          d={activePath}
          fill="none"
          stroke="rgba(201,168,76,0.55)"
          strokeWidth="0.75"
          strokeLinecap="round"
          animate={{ d: activePath }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        />
        {/* Dot */}
        <motion.circle
          r={2.5}
          fill="#C9A84C"
          cx={dot.x}
          cy={dot.y}
          style={{ filter: "drop-shadow(0 0 3px rgba(201,168,76,0.80))" }}
          animate={{ cx: dot.x, cy: dot.y }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        />
        {/* End caps */}
        {[startAngle, endAngle].map((a, i) => {
          const p = dotOnArc(cx, cy, r, a);
          return <circle key={i} cx={p.x} cy={p.y} r={1} fill="rgba(201,168,76,0.25)" />;
        })}
      </svg>
      {/* "X OF 12" label */}
      <div style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 9,
        fontWeight: 400,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "rgba(248,246,241,0.38)",
        marginTop: -8,
      }}>
        {step + 1} of {total}
      </div>
    </div>
  );
}

// ─── Placeholder card (Phase 1 surface treatment) ─────────────────────────────
// bg: rgba(255,255,255,0.04), border: 1px rgba(201,168,76,0.18)
// "PHOTO PLACEHOLDER" label in Inter 10px tracked uppercase ivory 40%
// Gold frame lifts on hover via translateZ + box-shadow

interface CardProps {
  card: CardDef;
  w: number;
  h: number;
  isSelected?: boolean;
  isDimmed?: boolean;
  isTilted?: boolean;
  tiltDir?: number;
  isExiting?: boolean;
  isEntering?: boolean;
  enterFrom?: "left" | "right";
}

function PlaceholderCard({
  card, w, h,
  isSelected = false,
  isDimmed = false,
  isTilted = false,
  tiltDir = 1,
  isExiting = false,
  isEntering = false,
  enterFrom = "left",
}: CardProps) {
  return (
    <motion.div
      layout
      initial={
        isEntering
          ? {
              x: enterFrom === "left" ? -220 : 220,
              y: -140,
              opacity: 0,
              scale: 0.78,
              rotateY: enterFrom === "left" ? -20 : 20,
            }
          : { opacity: 0, scale: 0.94, y: 8 }
      }
      animate={
        isExiting
          ? {
              scale: isSelected ? 1.15 : 0.68,
              y: isSelected ? -32 : 14,
              opacity: 0,
              rotateY: isSelected ? 0 : tiltDir * 12,
            }
          : isEntering
          ? { x: 0, y: 0, opacity: 1, scale: 1, rotateY: 0 }
          : {
              opacity: isDimmed ? 0.50 : 1,
              scale: isDimmed ? 0.96 : isTilted ? 1.04 : 1,
              rotateY: isTilted ? tiltDir * -6 : 0,
              rotateX: isTilted ? 3 : 0,
              y: 0,
              x: 0,
            }
      }
      transition={
        isExiting
          ? { duration: 1.5, ease: [0.4, 0, 0.2, 1] }
          : isEntering
          ? { type: "spring", stiffness: 200, damping: 18, mass: 1.0 }
          : { duration: 0.48, ease: [0.4, 0, 0.2, 1] }
      }
      style={{
        perspective: 700,
        transformStyle: "preserve-3d",
        width: w,
        height: h,
        position: "relative",
      }}
    >
      {/* Card body — photographic image with vignette overlay */}
      <div style={{
        position: "absolute",
        inset: 0,
        borderRadius: 3,
        overflow: "hidden",
        // Drop shadow beneath card
        boxShadow: [
          "0 8px 40px rgba(0,0,0,0.65)",
          "0 2px 10px rgba(0,0,0,0.40)",
        ].join(", "),
      }}>
        {/* Room photograph — cover fill */}
        <img
          src={card.photo}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            display: "block",
            userSelect: "none",
          }}
        />
        {/* Dark vignette overlay — edges darken, center stays bright */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: [
            "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(0,0,0,0.55) 100%)",
            "linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.30) 100%)",
          ].join(", "),
          pointerEvents: "none",
        }} />
      </div>

      {/* Gold frame — Phase 1 dim border, lifts on hover */}
      <div style={{
        position: "absolute",
        inset: 0,
        borderRadius: 3,
        border: `1px solid ${isTilted ? "rgba(201,168,76,0.40)" : "rgba(201,168,76,0.20)"}`,
        boxShadow: isTilted
          ? [
              "0 0 0 1px rgba(201,168,76,0.08)",
              "0 0 16px rgba(201,168,76,0.35)",
              "0 0 36px rgba(201,168,76,0.14)",
              "0 6px 24px rgba(0,0,0,0.50)",
            ].join(", ")
          : "0 4px 16px rgba(0,0,0,0.40)",
        transition: "border-color 0.32s ease, box-shadow 0.32s ease",
        pointerEvents: "none",
        transform: isTilted ? "translateZ(8px)" : "translateZ(4px)",
      }} />
    </motion.div>
  );
}

// ─── Breathing wrapper ─────────────────────────────────────────────────────────

function BreathingCard({
  breatheOffset = 0,
  isExiting,
  isEntering,
  children,
}: {
  breatheOffset?: number;
  isExiting: boolean;
  isEntering: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      animate={
        !isExiting && !isEntering
          ? { y: [0, -6, 0, -6, 0] }
          : {}
      }
      transition={
        !isExiting && !isEntering
          ? {
              duration: 4,
              delay: breatheOffset * 2,
              repeat: Infinity,
              ease: "easeInOut",
              times: [0, 0.25, 0.5, 0.75, 1],
            }
          : {}
      }
    >
      {children}
    </motion.div>
  );
}

// ─── Ambient particle (confined inside frame) ──────────────────────────────────

function AmbientParticle({ p, frameH }: { p: Particle; frameH: number }) {
  return (
    <motion.div
      style={{
        position: "absolute",
        left: `${p.x}%`,
        bottom: 0,
        width: p.size,
        height: p.size,
        borderRadius: "50%",
        background: "#C9A84C",
        filter: p.blur > 0 ? `blur(${p.blur}px)` : "none",
        boxShadow: `0 0 ${p.size * (p.layer === 0 ? 5 : p.layer === 1 ? 4 : 3)}px rgba(201,168,76,${p.layer === 0 ? 0.4 : p.layer === 1 ? 0.5 : 0.65})`,
        pointerEvents: "none",
        zIndex: p.layer + 1,
      }}
      animate={{
        y: [0, -(frameH + 24)],
        x: [0, p.swayAmp, -p.swayAmp * 0.55, p.swayAmp * 0.35, 0],
        opacity: [0, p.opacity, p.opacity, p.opacity * 0.55, 0],
      }}
      transition={{
        duration: p.duration,
        delay: p.delay,
        repeat: Infinity,
        ease: "linear",
        times: [0, 0.07, 0.55, 0.88, 1],
      }}
    />
  );
}

// ─── Main diorama ──────────────────────────────────────────────────────────────

type DemoPhase =
  | "idle"
  | "cursor-enter"
  | "cursor-travel"
  | "card-hover"
  | "cursor-pulse"
  | "card-exit"
  | "cards-enter";

type EdgeSide = "left" | "right" | "top" | "bottom";

export function CovaDiorama({ isMobile = false }: { isMobile?: boolean }) {
  const prefersReducedMotion = useReducedMotion();

  // Desktop: 1100×560, cards 280×420, 120px gap
  // Mobile: full-width × 340px, cards 140×210, 32px gap
  const FRAME_H = isMobile ? 340 : 560;
  const CARD_W = isMobile ? 140 : 280;
  const CARD_H = isMobile ? 210 : 420;
  const GAP = isMobile ? 32 : 120;
  const PARTICLE_COUNT = isMobile ? 18 : 32;

  const [particles] = useState(() => generateParticles(PARTICLE_COUNT));
  const [cycleIndex, setCycleIndex] = useState(0);
  const [phase, setPhase] = useState<DemoPhase>("idle");
  const [selectedCard, setSelectedCard] = useState<0 | 1>(0);
  const [cursorEdge, setCursorEdge] = useState<EdgeSide>("left");
  const [progressStep, setProgressStep] = useState(0);
  const [trailParticles, setTrailParticles] = useState<{ id: number; dx: number }[]>([]);
  const [cursorPos, setCursorPos] = useState({ x: -40, y: FRAME_H / 2 });
  const [cursorVisible, setCursorVisible] = useState(false);
  const [cursorPulsing, setCursorPulsing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const FRAME_W_ACTUAL = isMobile ? Math.min(window.innerWidth * 0.9, 760) : 760;
  const EDGES: EdgeSide[] = ["left", "right", "top", "bottom"];

  const getCursorStart = useCallback((edge: EdgeSide) => {
    switch (edge) {
      case "left":   return { x: -28, y: FRAME_H * 0.50 };
      case "right":  return { x: FRAME_W_ACTUAL + 28, y: FRAME_H * 0.50 };
      case "top":    return { x: FRAME_W_ACTUAL * 0.50, y: -28 };
      case "bottom": return { x: FRAME_W_ACTUAL * 0.50, y: FRAME_H + 28 };
    }
  }, [FRAME_H, FRAME_W_ACTUAL]);

  const getCardCenter = useCallback((cardIdx: 0 | 1) => {
    const totalW = CARD_W * 2 + GAP;
    const startX = (FRAME_W_ACTUAL - totalW) / 2;
    return {
      x: startX + cardIdx * (CARD_W + GAP) + CARD_W / 2,
      y: FRAME_H * 0.44,
    };
  }, [FRAME_W_ACTUAL, CARD_W, GAP, FRAME_H]);

  const schedule = useCallback((fn: () => void, ms: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fn, ms);
  }, []);

  const runCycle = useCallback((cycle: number) => {
    const edge = EDGES[cycle % EDGES.length];
    const target = (cycle % 2) as 0 | 1;

    setCursorEdge(edge);
    setSelectedCard(target);
    setPhase("idle");
    setCursorVisible(false);
    setCursorPulsing(false);

    schedule(() => {
      const start = getCursorStart(edge);
      setCursorPos(start);
      setCursorVisible(true);
      setPhase("cursor-enter");

      schedule(() => {
        const dest = getCardCenter(target);
        setCursorPos(dest);
        setPhase("cursor-travel");

        schedule(() => {
          setPhase("card-hover");

          schedule(() => {
            setCursorPulsing(true);
            setPhase("cursor-pulse");

            schedule(() => {
              setCursorPulsing(false);
              setCursorVisible(false);
              setPhase("card-exit");
              setTrailParticles([
                { id: Date.now(),     dx: -20 },
                { id: Date.now() + 1, dx: 0   },
                { id: Date.now() + 2, dx: 20  },
              ]);

              schedule(() => {
                setTrailParticles([]);
                setProgressStep(s => (s + 1) % 12);
                setCycleIndex(c => c + 1);
                setPhase("cards-enter");

                schedule(() => {
                  setPhase("idle");
                  schedule(() => runCycle(cycle + 1), 900);
                }, 1100);
              }, 1600);
            }, 650);
          }, 600);
        }, 600);
      }, 1200);
    }, 500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getCursorStart, getCardCenter, schedule]);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const t = setTimeout(() => runCycle(0), 900);
    return () => {
      clearTimeout(t);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [prefersReducedMotion, runCycle]);

  const pairIndex = cycleIndex % CARD_PAIRS.length;
  const pair = CARD_PAIRS[pairIndex];
  const cardA = ALL_CARDS[pair[0]];
  const cardB = ALL_CARDS[pair[1]];

  const isExiting = phase === "card-exit";
  const isEntering = phase === "cards-enter";

  const cardAHovered = (phase === "card-hover" || phase === "cursor-pulse") && selectedCard === 0;
  const cardBHovered = (phase === "card-hover" || phase === "cursor-pulse") && selectedCard === 1;
  const cardADimmed = (phase === "card-hover" || phase === "cursor-pulse" || phase === "card-exit") && selectedCard !== 0;
  const cardBDimmed = (phase === "card-hover" || phase === "cursor-pulse" || phase === "card-exit") && selectedCard !== 1;
  const cardASelected = isExiting && selectedCard === 0;
  const cardBSelected = isExiting && selectedCard === 1;

  // ── Reduced motion static ────────────────────────────────────────────────────
  if (prefersReducedMotion) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{
          width: isMobile ? "min(95vw, 480px)" : "min(1100px, calc(100vw - 80px))",
          height: FRAME_H,
          border: "1px solid rgba(201,168,76,0.20)",
          borderRadius: 0,
          position: "relative",
          overflow: "hidden",
          background: "radial-gradient(ellipse at 50% 50%, rgba(201,168,76,0.05) 0%, #0A1628 70%)",
          boxShadow: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: GAP,
        }}>
          <div style={{ transform: "perspective(700px) rotateY(-6deg) rotateX(3deg) scale(1.04)" }}>
            <PlaceholderCard card={cardA} w={CARD_W} h={CARD_H} isTilted tiltDir={1} />
          </div>
          <PlaceholderCard card={cardB} w={CARD_W} h={CARD_H} isDimmed />
          {/* Static cursor */}
          <div style={{
            position: "absolute",
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "radial-gradient(circle, #F5E090 0%, #C9A84C 60%)",
            boxShadow: "0 0 12px rgba(201,168,76,0.9), 0 0 28px rgba(201,168,76,0.5)",
            left: "36%",
            top: "44%",
            transform: "translate(-50%, -50%)",
          }} />
          {/* Arc inside */}
          <ProgressArcInset step={0} total={12} />
        </div>
        <p style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 12,
          fontStyle: "italic",
          fontWeight: 300,
          color: "rgba(248,246,241,0.50)",
          textAlign: "center",
          maxWidth: 280,
          margin: "14px 0 0",
        }}>
          You'll pick between two rooms. Twelve times.
        </p>
      </div>
    );
  }

  // ── Full animated diorama ────────────────────────────────────────────────────
  const trailTarget = getCardCenter(selectedCard);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Frame — continuous 1px gold border, no corner brackets, overflow:hidden confines particles */}
      <div
        style={{
          // Desktop: 1100px wide (capped at 100vw - 80px for padding)
          // Mobile: 95vw
          width: isMobile ? "min(95vw, 480px)" : "min(1100px, calc(100vw - 80px))",
          height: FRAME_H,
          position: "relative",
          // Phase 1 hairline frame: sharp rectangle, no radius, no glow, no shadow
          border: "1px solid rgba(201,168,76,0.20)",
          borderRadius: 0,
          overflow: "hidden",
          // Warm radial interior — "warm air" effect (kept inside)
          background: [
            "radial-gradient(ellipse 55% 65% at 50% 46%, rgba(201,168,76,0.05) 0%, rgba(201,168,76,0.018) 38%, transparent 62%)",
            "linear-gradient(180deg, #0A1628 0%, #0C1A30 50%, #0A1628 100%)",
          ].join(", "),
          // No outer glow, no box-shadow
          boxShadow: "none",
        }}
      >
        {/* 3-layer particles — INSIDE frame, clipped by overflow:hidden */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {particles.map(p => (
            <AmbientParticle key={p.id} p={p} frameH={FRAME_H} />
          ))}
        </div>

        {/* Cards stage */}
        <div style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: GAP,
          perspective: 900,
          perspectiveOrigin: "50% 44%",
        }}>
          <AnimatePresence mode="popLayout">
            {!isExiting && (
              <BreathingCard key={`a-${pairIndex}`} breatheOffset={0} isExiting={false} isEntering={isEntering}>
                <PlaceholderCard
                  card={cardA} w={CARD_W} h={CARD_H}
                  isDimmed={cardADimmed} isTilted={cardAHovered} tiltDir={1}
                  isExiting={false} isEntering={isEntering} enterFrom="left"
                />
              </BreathingCard>
            )}
            {!isExiting && (
              <BreathingCard key={`b-${pairIndex}`} breatheOffset={1} isExiting={false} isEntering={isEntering}>
                <PlaceholderCard
                  card={cardB} w={CARD_W} h={CARD_H}
                  isDimmed={cardBDimmed} isTilted={cardBHovered} tiltDir={-1}
                  isExiting={false} isEntering={isEntering} enterFrom="right"
                />
              </BreathingCard>
            )}
            {isExiting && (
              <BreathingCard key={`a-exit-${pairIndex}`} breatheOffset={0} isExiting={true} isEntering={false}>
                <PlaceholderCard
                  card={cardA} w={CARD_W} h={CARD_H}
                  isSelected={cardASelected} isDimmed={cardADimmed} tiltDir={1}
                  isExiting={true} isEntering={false} enterFrom="left"
                />
              </BreathingCard>
            )}
            {isExiting && (
              <BreathingCard key={`b-exit-${pairIndex}`} breatheOffset={1} isExiting={true} isEntering={false}>
                <PlaceholderCard
                  card={cardB} w={CARD_W} h={CARD_H}
                  isSelected={cardBSelected} isDimmed={cardBDimmed} tiltDir={-1}
                  isExiting={true} isEntering={false} enterFrom="right"
                />
              </BreathingCard>
            )}
          </AnimatePresence>
        </div>

        {/* Gold trail particles */}
        <AnimatePresence>
          {trailParticles.map((tp, i) => (
            <motion.div
              key={tp.id}
              initial={{ x: trailTarget.x + tp.dx, y: trailTarget.y, opacity: 0.9, scale: 1 }}
              animate={{ x: trailTarget.x + tp.dx * 2.2, y: trailTarget.y - 80 - i * 20, opacity: 0, scale: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.95, delay: i * 0.07, ease: "easeOut" }}
              style={{
                position: "absolute",
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#C9A84C",
                boxShadow: "0 0 10px rgba(201,168,76,0.9), 0 0 20px rgba(201,168,76,0.5)",
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
                zIndex: 15,
              }}
            />
          ))}
        </AnimatePresence>

        {/* Gold cursor — 22px dot with glow halo */}
        <AnimatePresence>
          {cursorVisible && (
            <motion.div
              key="cursor"
              initial={{
                x: getCursorStart(cursorEdge).x,
                y: getCursorStart(cursorEdge).y,
                opacity: 0,
                scale: 0.4,
              }}
              animate={{
                x: cursorPos.x,
                y: cursorPos.y,
                opacity: 1,
                scale: cursorPulsing ? [1, 1.55, 1, 1.55, 1] : 1,
              }}
              exit={{ opacity: 0, scale: 0.3 }}
              transition={
                phase === "cursor-travel"
                  ? { duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }
                  : cursorPulsing
                  ? { duration: 0.6, times: [0, 0.25, 0.5, 0.75, 1] }
                  : { duration: 0.30 }
              }
              style={{
                position: "absolute",
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "radial-gradient(circle, #F5E090 0%, #D4B050 45%, rgba(201,168,76,0.7) 100%)",
                boxShadow: [
                  "0 0 0 5px rgba(201,168,76,0.14)",
                  "0 0 14px rgba(201,168,76,0.88)",
                  "0 0 32px rgba(201,168,76,0.55)",
                  "0 0 60px rgba(201,168,76,0.22)",
                ].join(", "),
                transform: "translate(-50%, -50%)",
                filter: phase === "cursor-travel" ? "blur(0.5px)" : "none",
                pointerEvents: "none",
                zIndex: 20,
              }}
            />
          )}
        </AnimatePresence>

        {/* Progress arc — inside frame, bottom-center, 24px above bottom */}
        <ProgressArcInset step={progressStep} total={12} />
      </div>
    </div>
  );
}

export default CovaDiorama;
