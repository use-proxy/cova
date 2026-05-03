"use client";

import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";

export default function AccountDeleted() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <main className="relative min-h-screen w-full bg-cova-navy flex justify-center items-center overflow-hidden">
      <Wordmark />
      <section
        className={[
          "w-[calc(100%-48px)] max-w-[360px] md:w-[360px]",
          "transform-gpu transition-all duration-[400ms] ease-out",
          "motion-reduce:transition-none motion-reduce:transform-none",
          mounted
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-2 motion-reduce:opacity-100 motion-reduce:translate-y-0",
        ].join(" ")}
      >
        <div className="border-l border-cova-ivory/[0.12] pl-6">
          <p className="font-sans text-[10px] tracking-[0.3em] uppercase text-cova-gold/80">
            Account — Removed
          </p>
          <div className="h-3" aria-hidden="true" />
          <h1 className="font-serif italic font-normal text-cova-gold text-[24px] md:text-[28px] leading-[1.2]">
            Your account has been deleted.
          </h1>
          <div className="h-2" aria-hidden="true" />
          <p
            aria-live="polite"
            className="font-serif italic text-[14px] text-cova-ivory/50 leading-snug"
          >
            All your data has been permanently removed. You&rsquo;re free to start a new account at any time.
          </p>
          <div className="h-4" aria-hidden="true" />
          <div aria-hidden="true" className="w-8 h-px bg-cova-gold/60" />
        </div>
        <div className="h-8" aria-hidden="true" />
        <div className="text-center">
          <a
            href="/"
            className="font-sans text-[10px] tracking-[0.25em] uppercase text-cova-gold/60 hover:text-cova-gold focus-visible:text-cova-gold focus:outline-none transition-colors duration-200 ease-out"
          >
            Return Home — covainterior.com
          </a>
        </div>
      </section>
    </main>
  );
}
