import { useEffect, useState } from "react";

/**
 * /account-deleted — Cova
 *
 * Sibling to /auth/signup, /auth/signin, /auth/forgot-password,
 * /auth/reset-password, /auth/verify-email-sent, /auth/verify-email-success.
 *
 * Tone: matter-of-fact, dignified, brief. The user has just permanently
 * deleted their account; the brand acknowledges it without ceremony.
 *
 * Gold appears exactly 3 times on this screen:
 *   1. Wordmark em-dash (text-cova-gold/50)
 *   2. Eyebrow label (text-cova-gold/60)
 *   3. Hairline rule (bg-cova-gold/40)
 */
export default function AccountDeleted() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Trigger the standard mount fade on first paint.
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <main className="relative min-h-screen w-full bg-cova-navy flex justify-center items-center overflow-hidden">
      {/* Wordmark — fixed top-left, decorative (not clickable) */}
      <div
        aria-hidden="true"
        className="fixed top-6 left-6 md:top-8 md:left-10 select-none"
      >
        <div className="font-serif text-cova-ivory text-[12px] md:text-[16px] tracking-[0.4em] uppercase leading-none">
          COVA
        </div>
        <div className="mt-2 font-sans text-cova-gold/50 text-[14px] leading-none">
          —
        </div>
      </div>

      {/* Form column */}
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
        {/* Hairline-bracketed region: from eyebrow top down to the gold rule */}
        <div className="border-l border-cova-ivory/[0.12] pl-6">
          {/* 1. Eyebrow */}
          <p className="font-sans text-[10px] tracking-[0.3em] uppercase text-cova-gold/60">
            Account — Removed
          </p>

          {/* 2. 12px gap */}
          <div className="h-3" aria-hidden="true" />

          {/* 3. Headline */}
          <h1 className="font-serif italic font-normal text-cova-ivory text-[24px] md:text-[28px] leading-[1.2]">
            Your account has been deleted.
          </h1>

          {/* 4. 8px gap */}
          <div className="h-2" aria-hidden="true" />

          {/* 5. Helper line — two sentences, one paragraph */}
          <p
            aria-live="polite"
            className="font-serif italic text-[14px] text-cova-ivory/50 leading-snug"
          >
            All your data has been permanently removed. You&rsquo;re free to start a new account at any time.
          </p>

          {/* 6. 16px gap */}
          <div className="h-4" aria-hidden="true" />

          {/* 7. Gold hairline rule — 32px wide, 1px tall, left-aligned */}
          <div
            aria-hidden="true"
            className="w-8 h-px bg-cova-gold/40"
          />
        </div>

        {/* 8. 32px gap — outside the border-l wrapper */}
        <div className="h-8" aria-hidden="true" />

        {/* 9. Return Home link — centered, outside the hairline bracket */}
        <div className="text-center">
          <a
            href="/"
            className="font-sans text-[10px] tracking-[0.25em] uppercase text-cova-ivory/40 hover:text-cova-ivory focus-visible:text-cova-ivory focus:outline-none transition-colors duration-200 ease-out"
          >
            Return Home — covainterior.com
          </a>
        </div>
      </section>
    </main>
  );
}
