"use client";

import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { AnimatedCheckmark } from "@/components/ui/AnimatedCheckmark";

export default function VerifyEmailSuccess() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.href = "/design/step-1";
    }, 3000);
    return () => window.clearTimeout(timer);
  }, []);

  const fadeBase =
    "transition-all duration-[400ms] ease-out motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100";
  const fadeState = mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2";

  return (
    <main className="relative min-h-screen w-full bg-cova-navy flex justify-center items-center overflow-hidden">
      <Wordmark />
      <div className="flex flex-col items-center text-center px-6">
        <div className="w-14 h-14 md:w-16 md:h-16 flex items-center justify-center" aria-label="Verified" role="img">
          <AnimatedCheckmark />
        </div>
        <div className="h-8" aria-hidden="true" />
        <div className={`font-sans text-[10px] tracking-[0.3em] uppercase text-cova-gold/60 ${fadeBase} ${fadeState}`}>
          ACCOUNT — VERIFIED
        </div>
        <div className="h-3" aria-hidden="true" />
        <h1 className={`font-serif italic font-normal text-[28px] md:text-[32px] leading-[1.2] text-cova-ivory ${fadeBase} ${fadeState}`}>
          You&rsquo;re in
        </h1>
        <div className="h-2" aria-hidden="true" />
        <p
          aria-live="polite"
          className={`font-serif italic text-[14px] leading-snug text-cova-ivory/50 ${fadeBase} ${fadeState}`}
        >
          Redirecting you to set up your style...
        </p>
        <div className="h-6" aria-hidden="true" />
        <div aria-hidden="true" className={`w-8 h-px bg-cova-gold/40 ${fadeBase} ${fadeState}`} />
      </div>
    </main>
  );
}
