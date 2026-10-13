"use client";

import { useEffect, useRef, useState } from "react";
import s from "./landing.module.css";

type Word = { text: string; accent?: boolean };

/**
 * Manifesto line that fills in word by word as it scrolls through the
 * viewport. With reduced motion every word is shown at once (CSS handles it).
 */
export function ManifestoReveal({ words }: { words: Word[] }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [lit, setLit] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
      setLit(Math.round(p * words.length));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [words.length]);

  return (
    <p ref={ref} className={s.manifestoText}>
      {words.map((w, i) => (
        <span key={i}>
          <span
            className={[s.word, w.accent ? s.wordAccent : "", i < lit ? s.wordOn : ""].join(" ")}
          >
            {w.text}
          </span>{" "}
        </span>
      ))}
    </p>
  );
}
