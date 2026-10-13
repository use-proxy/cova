"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import s from "./landing.module.css";

/**
 * Bottom "Begin" bar. Appears once the first scene reaches mid-viewport and
 * hides again when the closing section (#begin) comes into view, so it never
 * doubles up with the final CTA.
 */
export function PinnedBar({ href }: { href: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const first = document.querySelector("[data-landing-scene]");
      const end = document.getElementById("begin");
      if (!first || !end) return;
      const vh = window.innerHeight;
      setShow(
        first.getBoundingClientRect().top < vh * 0.5 &&
          end.getBoundingClientRect().top > vh * 0.6,
      );
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
  }, []);

  return (
    <div className={[s.pinbar, show ? s.pinbarShow : ""].join(" ")} aria-hidden={!show}>
      <span className={s.pinbarText}>See your own room, reimagined.</span>
      <Link href={href} className={`${s.cta} ${s.ctaSmall}`} tabIndex={show ? 0 : -1}>
        <span>Begin</span> →
      </Link>
    </div>
  );
}
