"use client";

import { useEffect, useRef, useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { Toast } from "@/components/ui/Toast";

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

  const handleResend = async () => {
    if (isResending || resendCountdown > 0) return;
    setIsResending(true);
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailValue }),
      });
    } catch {
      // anti-enumeration: same UX whether or not the call succeeded
    }
    setIsResending(false);
    setShowResendConfirmation(true);
    if (confirmationTimeoutRef.current !== null) {
      window.clearTimeout(confirmationTimeoutRef.current);
    }
    confirmationTimeoutRef.current = window.setTimeout(() => {
      setShowResendConfirmation(false);
      confirmationTimeoutRef.current = null;
    }, 5000);
    startCountdown(60);
  };

  const dismissBanner = () => setTopBannerError("");

  const resendDisabled = resendCountdown > 0 || isResending;

  // Loading state α (phase doc §6 1B): italic-serif label change, no spinner.
  // Locked label per §6 1B "Resend verification: Resending…".
  let resendLabel: React.ReactNode;
  if (isResending) {
    resendLabel = (
      <span className="font-serif italic normal-case tracking-normal text-[14px] text-cova-ivory">
        Resending&hellip;
      </span>
    );
  } else if (resendCountdown > 0) {
    resendLabel = `RESEND IN ${resendCountdown}S`;
  } else {
    resendLabel = "RESEND LINK";
  }

  return (
    <div className="relative min-h-screen w-full bg-cova-navy text-cova-ivory antialiased">
      <Wordmark />

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
            {topBannerError ? (
              <Toast message={topBannerError} onDismiss={dismissBanner} />
            ) : null}

            {/* EYEBROW */}
            <div className="font-sans text-[10px] tracking-[0.3em] uppercase text-cova-gold/80">
              INBOX — VERIFY YOUR EMAIL
            </div>

            {/* 12px gap */}
            <div className="h-3" />

            {/* HEADLINE */}
            <h1 className="font-serif italic font-normal text-[24px] md:text-[28px] leading-[1.2] text-cova-gold">
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
            <div aria-hidden="true" className="h-px w-8 bg-cova-gold/60" />

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
                  "group relative flex h-11 w-[200px] items-center justify-center",
                  "border border-cova-ivory/30 bg-transparent rounded-none",
                  "font-sans text-[11px] font-medium tracking-[0.3em] uppercase text-cova-ivory",
                  "transition-colors duration-200 ease-out motion-reduce:transition-none",
                  "focus:outline-none focus-visible:border-cova-gold/60",
                  "overflow-hidden",
                  resendDisabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer",
                ].join(" ")}
              >
                {typeof resendLabel === "string" ? (
                  <>
                    <span className="relative z-10">{resendLabel}</span>
                    {/* Hover-gold-reveal underline — disabled gets no reveal */}
                    {!resendDisabled && (
                      <span
                        className="absolute bottom-[10px] left-1/2 -translate-x-1/2 h-[2px] bg-cova-gold w-0 group-hover:w-[calc(100%-32px)] transition-[width] duration-200 ease-out"
                        aria-hidden="true"
                      />
                    )}
                  </>
                ) : resendLabel}
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
          "font-sans text-[10px] tracking-[0.25em] uppercase text-cova-gold/60",
          "transition-colors duration-200 ease-out motion-reduce:transition-none",
          "hover:text-cova-gold focus:outline-none focus-visible:underline focus-visible:text-cova-gold",
        ].join(" ")}
      >
        ALREADY VERIFIED — SIGN IN
      </a>
    </div>
  );
}
