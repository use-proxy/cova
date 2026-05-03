import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * Cova — /auth/verify-email-sent
 *
 * Sibling to /auth/signup, /auth/signin, /auth/forgot-password, /auth/reset-password.
 * Same design system: editorial typography, navy ground, gold used exactly 4x
 * (eyebrow / brand mark em-dash / hairline rule / focus ring), sharp corners,
 * no shadows, no cards.
 *
 * Self-contained. No business logic — Resend is a console.log placeholder.
 *
 * Tailwind tokens assumed already configured:
 *   cova-navy        #091829
 *   cova-gold        #C9A84C
 *   cova-ivory       #F5F0E8
 *   cova-warm-error  #A8443B
 * Fonts: font-serif = EB Garamond, font-sans = DM Sans.
 */
export default function VerifyEmailSent() {
  const [emailValue, setEmailValue] = useState<string>("you@example.com");
  const [hasEmailParam, setHasEmailParam] = useState<boolean>(false);
  const [isResending, setIsResending] = useState<boolean>(false);
  const [resendCountdown, setResendCountdown] = useState<number>(0);
  const [showResendConfirmation, setShowResendConfirmation] =
    useState<boolean>(false);
  const [topBannerError, setTopBannerError] = useState<string>("");
  const [mounted, setMounted] = useState<boolean>(false);

  const resendButtonRef = useRef<HTMLButtonElement | null>(null);
  const countdownRef = useRef<number | null>(null);
  const confirmationTimeoutRef = useRef<number | null>(null);

  // Read ?email= from URL on mount.
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        const emailParam = params.get("email");
        if (emailParam && emailParam.trim().length > 0) {
          setEmailValue(emailParam);
          setHasEmailParam(true);
        }
      } catch {
        // Swallow — fall back to default placeholder.
      }
    }
    // Trigger mount animation on next paint.
    const raf = window.requestAnimationFrame(() => setMounted(true));

    // Focus the resend button as the first focusable element.
    if (resendButtonRef.current) {
      resendButtonRef.current.focus();
    }

    return () => {
      window.cancelAnimationFrame(raf);
      if (countdownRef.current !== null) {
        window.clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      if (confirmationTimeoutRef.current !== null) {
        window.clearTimeout(confirmationTimeoutRef.current);
        confirmationTimeoutRef.current = null;
      }
    };
  }, []);

  const startCountdown = (seconds: number) => {
    setResendCountdown(seconds);
    if (countdownRef.current !== null) {
      window.clearInterval(countdownRef.current);
    }
    countdownRef.current = window.setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current !== null) {
            window.clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResend = () => {
    if (isResending || resendCountdown > 0) return;

    setIsResending(true);

    window.setTimeout(() => {
      setIsResending(false);
      // Show confirmation microtype.
      setShowResendConfirmation(true);
      if (confirmationTimeoutRef.current !== null) {
        window.clearTimeout(confirmationTimeoutRef.current);
      }
      confirmationTimeoutRef.current = window.setTimeout(() => {
        setShowResendConfirmation(false);
        confirmationTimeoutRef.current = null;
      }, 5000);

      startCountdown(60);
      // eslint-disable-next-line no-console
      console.log("[Cova] resend verification email", emailValue);
    }, 800);
  };

  const dismissBanner = () => setTopBannerError("");

  const resendDisabled = resendCountdown > 0 || isResending;

  let resendLabel: React.ReactNode;
  if (isResending) {
    resendLabel = (
      <span
        aria-hidden="true"
        className="inline-block h-[14px] w-[14px] animate-spin rounded-full border border-cova-ivory/30 border-t-cova-ivory"
      />
    );
  } else if (resendCountdown > 0) {
    resendLabel = `RESEND IN ${resendCountdown}S`;
  } else {
    resendLabel = "RESEND LINK";
  }

  return (
    <div className="relative min-h-screen w-full bg-cova-navy text-cova-ivory antialiased">
      {/* WORDMARK — fixed top-left */}
      <div className="fixed left-6 top-6 md:left-10 md:top-8 select-none">
        <div className="font-serif text-[12px] md:text-[16px] tracking-[0.4em] text-cova-ivory uppercase">
          COVA
        </div>
        <div className="mt-2 font-sans text-[14px] leading-none text-cova-gold/50">
          —
        </div>
      </div>

      {/* FORM COLUMN — centered both axes */}
      <div className="flex min-h-screen w-full items-center justify-center px-6">
        <div
          className={[
            "w-[calc(100%-48px)] max-w-[360px] md:w-[360px]",
            "transition-all duration-[400ms] ease-out motion-reduce:transition-none",
            mounted
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-2 motion-reduce:translate-y-0 motion-reduce:opacity-100",
          ].join(" ")}
        >
          <div className="border-l border-cova-ivory/12 pl-6">
            {/* TOP ERROR BANNER */}
            {topBannerError ? (
              <div
                role="alert"
                className="mb-6 flex items-start justify-between gap-3 bg-cova-warm-error/12 px-3 py-3 transition-all duration-150 ease-out motion-reduce:transition-none"
              >
                <p className="font-sans italic text-[12px] leading-snug text-cova-warm-error">
                  {topBannerError}
                </p>
                <button
                  type="button"
                  onClick={dismissBanner}
                  aria-label="Dismiss error"
                  className="shrink-0 text-cova-warm-error/80 hover:text-cova-warm-error transition-colors duration-200 ease-out focus:outline-none focus-visible:border focus-visible:border-cova-gold/60"
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            ) : null}

            {/* EYEBROW */}
            <div className="font-sans text-[10px] tracking-[0.3em] uppercase text-cova-gold/60">
              INBOX — VERIFY YOUR EMAIL
            </div>

            {/* 12px gap */}
            <div className="h-3" />

            {/* HEADLINE */}
            <h1 className="font-serif italic font-normal text-[24px] md:text-[28px] leading-[1.2] text-cova-ivory">
              Check your inbox
            </h1>

            {/* 8px gap */}
            <div className="h-2" />

            {/* HELPER LINE */}
            <p
              aria-live="polite"
              className="font-serif italic text-[14px] leading-snug"
            >
              {hasEmailParam ? (
                <>
                  <span className="text-cova-ivory/50">
                    We sent a verification link to{" "}
                  </span>
                  <span className="text-cova-ivory">{emailValue}</span>
                  <span className="text-cova-ivory/50">
                    . Click it to activate your account.
                  </span>
                </>
              ) : (
                <span className="text-cova-ivory/50">
                  We sent a verification link to your email. Click it to
                  activate your account.
                </span>
              )}
            </p>

            {/* 16px gap */}
            <div className="h-4" />

            {/* GOLD HAIRLINE RULE */}
            <div aria-hidden="true" className="h-px w-8 bg-cova-gold/40" />

            {/* 32px gap */}
            <div className="h-8" />

            {/* RESEND BUTTON — centered horizontally inside the form column */}
            <div className="flex justify-center">
              <button
                ref={resendButtonRef}
                type="button"
                onClick={handleResend}
                disabled={resendDisabled}
                aria-disabled={resendDisabled}
                aria-label={
                  isResending
                    ? "Resending verification link"
                    : resendCountdown > 0
                    ? `Resend available in ${resendCountdown} seconds`
                    : "Resend verification link"
                }
                className={[
                  "flex h-11 w-[200px] items-center justify-center",
                  "border border-cova-ivory/30 bg-transparent rounded-none",
                  "font-sans text-[11px] font-medium tracking-[0.3em] uppercase text-cova-ivory",
                  "transition-colors duration-200 ease-out motion-reduce:transition-none",
                  "focus:outline-none focus-visible:border-cova-gold/60",
                  resendDisabled
                    ? "cursor-not-allowed opacity-50"
                    : "hover:bg-cova-ivory hover:text-cova-navy hover:border-cova-ivory cursor-pointer",
                ].join(" ")}
              >
                {resendLabel}
              </button>
            </div>

            {/* 12px gap */}
            <div className="h-3" />

            {/* CONFIRMATION / WRONG-EMAIL — crossfade in same slot */}
            <div className="relative flex h-4 items-center justify-center">
              {/* Confirmation */}
              <div
                aria-live="polite"
                className={[
                  "absolute inset-0 flex items-center justify-center text-center",
                  "font-sans text-[10px] tracking-[0.2em] uppercase text-cova-gold/60",
                  "motion-reduce:transition-none",
                  showResendConfirmation
                    ? "opacity-100 transition-opacity duration-150 ease-out"
                    : "opacity-0 pointer-events-none transition-opacity duration-200 ease-out",
                ].join(" ")}
              >
                {showResendConfirmation ? "EMAIL SENT — CHECK YOUR INBOX" : ""}
              </div>

              {/* Wrong email — start over */}
              <a
                href="/auth/signup"
                className={[
                  "absolute inset-0 flex items-center justify-center text-center",
                  "font-sans text-[10px] tracking-[0.2em] uppercase text-cova-ivory/40",
                  "transition-all duration-200 ease-out motion-reduce:transition-none",
                  "hover:text-cova-ivory focus:outline-none focus-visible:underline focus-visible:text-cova-ivory",
                  showResendConfirmation
                    ? "opacity-0 pointer-events-none"
                    : "opacity-100",
                ].join(" ")}
              >
                WRONG EMAIL — START OVER
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER LINK — fixed bottom-right, OUTSIDE form column */}
      <a
        href="/auth/signin"
        className={[
          "fixed bottom-6 right-6 md:bottom-8 md:right-10",
          "font-sans text-[10px] tracking-[0.25em] uppercase text-cova-ivory/40",
          "transition-colors duration-200 ease-out motion-reduce:transition-none",
          "hover:text-cova-ivory focus:outline-none focus-visible:underline focus-visible:text-cova-ivory",
        ].join(" ")}
      >
        ALREADY VERIFIED — SIGN IN
      </a>
    </div>
  );
}
