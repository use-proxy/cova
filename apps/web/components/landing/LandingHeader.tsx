"use client";

import { useEffect, useState, type ReactNode } from "react";
import s from "./landing.module.css";

/**
 * Fixed top bar: transparent over the hero photo, frosted navy once the page
 * has scrolled so the wordmark never sits on top of other content.
 */
export function LandingHeader({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header className={[s.header, scrolled ? s.headerScrolled : ""].join(" ")}>{children}</header>
  );
}
