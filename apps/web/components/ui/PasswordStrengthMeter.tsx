// PasswordStrengthMeter.tsx
// Consumed by /auth/signup and /auth/reset-password
// No runtime dependencies beyond React. Zero framer-motion, zero react-spring.

"use client";

import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Score = 0 | 1 | 2 | 3 | 4;

interface PasswordStrengthMeterProps {
  score: Score;
  isVisible: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_SEGMENTS = 5;

/** How many segments are lit per score value. Score 4 intentionally fills all 5. */
const LIT_COUNT: Record<Score, number> = {
  0: 0,
  1: 1,
  2: 2,
  3: 3,
  4: 5,
};

const LABEL_TEXT: Record<Score, string> = {
  0: "TOO SHORT",
  1: "WEAK",
  2: "FAIR",
  3: "GOOD",
  4: "EXCELLENT",
};

/** Aria-label uses human-readable (sentence-case) form, not the uppercased tracking string. */
const LABEL_ARIA: Record<Score, string> = {
  0: "Too short",
  1: "Weak",
  2: "Fair",
  3: "Good",
  4: "Excellent",
};

// ─── Tailwind class maps ──────────────────────────────────────────────────────
// These must be complete strings so Tailwind's static scanner retains them.

const SEGMENT_LIT_CLASS: Record<Score, string> = {
  0: "", // never used — 0 segments are lit
  1: "bg-cova-warm-error",
  2: "bg-cova-warm-error/70",
  3: "bg-cova-gold/60",
  4: "bg-cova-gold/60",
};

const LABEL_COLOR_CLASS: Record<Score, string> = {
  0: "text-cova-ivory/50",
  1: "text-cova-warm-error",
  2: "text-cova-warm-error/70",
  3: "text-cova-gold/60",
  4: "text-cova-gold/60",
};

const SEGMENT_UNLIT_CLASS = "bg-cova-ivory/[.08]";

// ─── Keyframe injection ───────────────────────────────────────────────────────
// Tailwind 3 cannot express scaleX(0.6→1) with transform-origin: left.
// We inject a minimal <style> block once at mount.

const KEYFRAME_ID = "cova-psm-keyframes";

function ensureKeyframes() {
  if (typeof document === "undefined") return;
  if (document.getElementById(KEYFRAME_ID)) return;
  const style = document.createElement("style");
  style.id = KEYFRAME_ID;
  style.textContent = `
    @keyframes cova-seg-fill {
      from { opacity: 0; transform: scaleX(0.6); }
      to   { opacity: 1; transform: scaleX(1); }
    }
    @keyframes cova-label-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes cova-meter-in {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes cova-meter-out {
      from { opacity: 1; transform: translateY(0); }
      to   { opacity: 0; transform: translateY(-4px); }
    }
  `;
  document.head.appendChild(style);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PasswordStrengthMeter({
  score,
  isVisible,
}: PasswordStrengthMeterProps) {
  // shouldRender stays true until the exit animation completes.
  const [shouldRender, setShouldRender] = useState(isVisible);
  const [animatingOut, setAnimatingOut] = useState(false);

  // Track previous score so we can identify newly-lit segments for stagger.
  const prevScoreRef = useRef<Score>(score);
  const [prevScore, setPrevScore] = useState<Score>(score);

  // Reduced-motion detection — evaluated once on mount.
  const reducedMotion = useRef(false);

  useEffect(() => {
    ensureKeyframes();
    if (typeof window !== "undefined") {
      reducedMotion.current =
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
  }, []);

  // Visibility toggle with exit-animation gate.
  useEffect(() => {
    if (isVisible) {
      setAnimatingOut(false);
      setShouldRender(true);
    } else {
      setAnimatingOut(true);
      if (reducedMotion.current) {
        setShouldRender(false);
        setAnimatingOut(false);
        return;
      }
      const timer = setTimeout(() => {
        setShouldRender(false);
        setAnimatingOut(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  // Track score changes for stagger logic.
  useEffect(() => {
    setPrevScore(prevScoreRef.current);
    prevScoreRef.current = score;
  }, [score]);

  if (!shouldRender) return null;

  const litCount = LIT_COUNT[score];
  const prevLitCount = LIT_COUNT[prevScore];
  const rm = reducedMotion.current;

  // ── Container animation ──────────────────────────────────────────────────
  let containerAnimation: React.CSSProperties = {};
  if (!rm) {
    if (animatingOut) {
      containerAnimation = {
        animation: "cova-meter-out 200ms ease-in forwards",
      };
    } else if (isVisible) {
      containerAnimation = {
        animation: "cova-meter-in 250ms ease-out forwards",
      };
    }
  }

  return (
    <div
      aria-label={`Password strength: ${LABEL_ARIA[score]}`}
      style={containerAnimation}
    >
      {/* Segment row */}
      <div
        className="flex w-full"
        style={{ gap: "4px" }}
        role="presentation"
        aria-hidden="true"
      >
        {Array.from({ length: TOTAL_SEGMENTS }, (_, i) => {
          const isLit = i < litCount;
          const wasLit = i < prevLitCount;
          const isNewlyLit = isLit && !wasLit;

          // Already-lit segments that change color get a background-color transition.
          // Newly-lit segments get the fill-in keyframe animation with stagger.
          let segStyle: React.CSSProperties = {
            height: "2px",
            flex: "1 1 0%",
            borderRadius: "9999px",
            transformOrigin: "left",
          };

          if (!rm && isNewlyLit) {
            segStyle = {
              ...segStyle,
              animation: `cova-seg-fill 200ms ease-out ${i * 80}ms both`,
            };
          } else if (!rm && isLit) {
            segStyle = {
              ...segStyle,
              transition: "background-color 200ms ease-out",
            };
          }

          const colorClass = isLit
            ? (SEGMENT_LIT_CLASS[score] ?? SEGMENT_UNLIT_CLASS)
            : SEGMENT_UNLIT_CLASS;

          return (
            <div
              key={i}
              className={colorClass}
              style={segStyle}
            />
          );
        })}
      </div>

      {/* Label — 10px gap below segments */}
      <div style={{ height: "10px" }} aria-hidden="true" />

      {/*
        Key by label text so React remounts the element on every score
        change, triggering the crossfade keyframe from scratch.
      */}
      <p
        key={LABEL_TEXT[score]}
        aria-live="polite"
        aria-atomic="true"
        className={[
          "font-sans",
          "text-[10px]",
          "tracking-[0.3em]",
          "uppercase",
          "leading-none",
          LABEL_COLOR_CLASS[score],
        ].join(" ")}
        style={
          !rm
            ? { animation: "cova-label-in 150ms ease-out forwards" }
            : undefined
        }
      >
        {LABEL_TEXT[score]}
      </p>
    </div>
  );
}

export default PasswordStrengthMeter;
