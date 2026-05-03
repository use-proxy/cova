"use client";

// Consumed by /auth/verify-email-success only.
// The 600ms draw + 200ms default delay are tuned to feel considered against the
// surrounding italic serif copy — do not shorten without reviewing visual cadence.

import { useEffect, useRef, useState } from "react";

interface AnimatedCheckmarkProps {
  size?: number;
  delay?: number;
}

export function AnimatedCheckmark({
  size = 64,
  delay = 200,
}: AnimatedCheckmarkProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const [pathLength, setPathLength] = useState(0);
  const [hasMounted, setHasMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setReducedMotion(
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    }

    if (pathRef.current) {
      setPathLength(pathRef.current.getTotalLength());
    }

    const id = requestAnimationFrame(() => setHasMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const drawn = reducedMotion || hasMounted;

  const strokeStyle: React.CSSProperties = {
    strokeDasharray: pathLength || undefined,
    strokeDashoffset: drawn ? 0 : pathLength,
    transition: reducedMotion
      ? "none"
      : `stroke-dashoffset 600ms ease-out ${delay}ms`,
  };

  return (
    <div
      role="img"
      aria-label="Verified"
      className="text-cova-gold"
      style={{ width: size, height: size }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 64 64"
        width={size}
        height={size}
        fill="none"
      >
        <path
          ref={pathRef}
          d="M 14 32 L 28 46 L 50 22"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={strokeStyle}
        />
      </svg>
    </div>
  );
}

export default AnimatedCheckmark;
