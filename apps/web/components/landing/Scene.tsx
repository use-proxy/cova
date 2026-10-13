"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import s from "./landing.module.css";

/**
 * Full-viewport scene. Adds the "in view" class once, which settles the
 * slow Ken Burns push on the background image.
 */
export function Scene({
  align = "left",
  media,
  children,
}: {
  align?: "left" | "right";
  media: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  return (
    <section
      ref={ref}
      data-landing-scene
      className={[s.scene, align === "right" ? s.sceneRight : "", inView ? s.sceneIn : ""].join(" ")}
    >
      <div className={s.sceneMedia}>{media}</div>
      <div className={s.card}>{children}</div>
    </section>
  );
}
