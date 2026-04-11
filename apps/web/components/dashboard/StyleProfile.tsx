"use client";

import { useEffect, useRef } from "react";

interface StyleBar {
  name: string;
  percentage: number;
}

interface StyleProfileProps {
  styles: StyleBar[];
  adjectives: string[];
}

export function StyleProfile({ styles, adjectives }: StyleProfileProps) {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    barsRef.current.forEach((bar, i) => {
      if (!bar || !styles[i]) return;
      const pct = `${styles[i].percentage}%`;
      if (prefersReduced) {
        bar.style.width = pct;
      } else {
        bar.style.setProperty("--pct", pct);
        bar.style.animation = `barFill 800ms cubic-bezier(0.34,1.56,0.64,1) ${800 + i * 150}ms forwards`;
      }
    });
  }, [styles]);

  return (
    <section
      className="px-6 mt-8"
      aria-label="Style DNA profile"
      style={{
        opacity: 0,
        animation: "slideUp 400ms ease-out 800ms forwards",
      }}
    >
      <h2
        className="text-xl text-white mb-4"
        style={{ fontFamily: "Playfair Display, Georgia, serif" }}
      >
        Your Style DNA
      </h2>

      <div
        className="rounded-2xl p-5"
        style={{
          background: "var(--cova-surface)",
          border: "1px solid rgba(201,168,76,0.15)",
        }}
      >
        <div className="flex flex-col gap-5">
          {styles.map((style, i) => (
            <div key={style.name}>
              <div className="flex justify-between items-center mb-2">
                <span
                  className="text-xs uppercase tracking-[0.12em]"
                  style={{
                    color: "rgba(255,255,255,0.85)",
                    fontFamily: "Inter, sans-serif",
                  }}
                >
                  {style.name}
                </span>
                <span
                  className="text-xs tabular-nums"
                  style={{
                    color: "var(--cova-gold)",
                    fontFamily: "Inter, sans-serif",
                  }}
                >
                  {style.percentage}%
                </span>
              </div>
              <div
                className="w-full rounded-full overflow-hidden"
                style={{ height: 3, background: "rgba(201,168,76,0.1)" }}
                role="progressbar"
                aria-valuenow={style.percentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${style.name}: ${style.percentage}%`}
              >
                <div
                  ref={(el) => {
                    barsRef.current[i] = el;
                  }}
                  className="h-full rounded-full"
                  style={{
                    width: 0,
                    background:
                      "linear-gradient(90deg, rgba(201,168,76,0.5) 0%, var(--cova-gold) 100%)",
                    willChange: "width",
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Adjective pills */}
        {adjectives.length > 0 && (
          <div
            className="flex flex-wrap gap-2 mt-5"
            role="list"
            aria-label="Style characteristics"
          >
            {adjectives.map((adj) => (
              <span
                key={adj}
                role="listitem"
                className="px-3 py-1 rounded-full text-[10px] uppercase tracking-wide"
                style={{
                  border: "1px solid rgba(201,168,76,0.25)",
                  color: "rgba(201,168,76,0.8)",
                  fontFamily: "Inter, sans-serif",
                }}
              >
                {adj}
              </span>
            ))}
          </div>
        )}

        <p
          className="text-[10px] italic text-center mt-5"
          style={{
            color: "rgba(255,255,255,0.35)",
            fontFamily: "Inter, sans-serif",
          }}
        >
          Style evolves with every room you design.
        </p>
      </div>
    </section>
  );
}
