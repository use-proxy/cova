import { useEffect, useState } from "react";

/**
 * /auth/verify-email-success
 *
 * Cova — luxury auth celebration moment.
 * The user just verified their email and is being auto-redirected to onboarding.
 *
 * Intentional breaks from sibling auth screens:
 *  - No vertical hairline rule on the left of the form column
 *  - No 360px form column — the entire viewport is the composition, content centered
 *  - No fixed footer link bottom-right
 *  - The gold hairline rule is CENTERED (closing typographic punctuation)
 *
 * No business logic. The animated checkmark is rendered as a placeholder div;
 * the actual FV component will be imported during executor wiring.
 */
export default function VerifyEmailSuccess(): JSX.Element {
  const [mounted, setMounted] = useState<boolean>(false);

  // Stage 1 — text fade-in trigger on first paint.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Stage 3 — auto-redirect to /welcome after 3000ms.
  // Timer runs regardless of prefers-reduced-motion (only animations are affected).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.href = "/welcome";
    }, 3000);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  // Shared fade-in classes for the staged text elements.
  // Reduced-motion users get instant render at full opacity (motion-reduce: utilities).
  const fadeBase =
    "transition-all duration-[400ms] ease-out motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100";
  const fadeState = mounted
    ? "opacity-100 translate-y-0"
    : "opacity-0 translate-y-2"; // translate-y-2 = 8px

  return (
    <main className="relative min-h-screen w-full bg-cova-navy flex justify-center items-center overflow-hidden">
      {/* WORDMARK — fixed top-left */}
      <div
        className={`fixed top-6 left-6 md:top-8 md:left-10 z-10 ${fadeBase} ${fadeState}`}
      >
        <div className="font-serif font-normal text-[12px] md:text-[16px] tracking-[0.4em] uppercase text-cova-ivory">
          COVA
        </div>
        <div className="mt-2 font-sans font-normal text-[14px] tracking-normal text-cova-gold/50 leading-none">
          —
        </div>
      </div>

      {/* CENTERED COMPOSITION */}
      <div className="flex flex-col items-center text-center px-6">
        {/* 1. Animated checkmark mount point */}
        {/* FV component (animated gold checkmark) imported here during executor wiring */}
        <div
          id="animated-checkmark-mount"
          role="img"
          aria-label="Verified"
          className="w-14 h-14 md:w-16 md:h-16"
        />

        {/* 2. 32px gap */}
        <div className="h-8" aria-hidden="true" />

        {/* 3. Eyebrow */}
        <div
          className={`font-sans text-[10px] tracking-[0.3em] uppercase text-cova-gold/60 ${fadeBase} ${fadeState}`}
        >
          ACCOUNT — VERIFIED
        </div>

        {/* 4. 12px gap */}
        <div className="h-3" aria-hidden="true" />

        {/* 5. Headline */}
        <h1
          className={`font-serif italic font-normal text-[28px] md:text-[32px] leading-[1.2] text-cova-ivory ${fadeBase} ${fadeState}`}
        >
          You&rsquo;re in
        </h1>

        {/* 6. 8px gap */}
        <div className="h-2" aria-hidden="true" />

        {/* 7. Helper line */}
        <p
          aria-live="polite"
          className={`font-serif italic text-[14px] leading-snug text-cova-ivory/50 ${fadeBase} ${fadeState}`}
        >
          Redirecting you to set up your style...
        </p>

        {/* 8. 24px gap */}
        <div className="h-6" aria-hidden="true" />

        {/* 9. Gold hairline rule — centered (deliberate break from siblings) */}
        <div
          aria-hidden="true"
          className={`w-8 h-px bg-cova-gold/40 ${fadeBase} ${fadeState}`}
        />
      </div>
    </main>
  );
}
