/**
 * /auth/verify-email-invalid
 *
 * Design system: Cova luxury brand
 * - bg-cova-navy (#091829) full-viewport ground
 * - text-cova-ivory (#F5F0E8) primary text
 * - text-cova-gold (#C9A84C) — appears exactly 4 times:
 *     eyebrow / brand mark em-dash / hairline rule / focus ring on focused button
 * - text-cova-warm-error (#A8443B) error states
 * - font-serif: EB Garamond (italic headlines)
 * - font-sans: DM Sans (labels, buttons, microtype)
 * - Sharp corners (0px radius) everywhere
 * - No shadows, no glows, no decorative elements, no cards
 * - Editorial typography: italic serif headlines, uppercase tracked microtype
 *
 * Two substates via ?reason= URL param:
 *   "expired" (default) — resend CTA → /auth/verify-email-sent
 *   "used"              — sign in CTA → /auth/signin
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { Toast } from "@/components/ui/Toast";

type Reason = "expired" | "used";

export default function VerifyEmailInvalid() {
  const [reason, setReason] = useState<Reason>("expired");
  const [isResending, setIsResending] = useState(false);
  const [topBannerError, setTopBannerError] = useState<string>("");
  const [mounted, setMounted] = useState(false);

  const primaryButtonRef = useRef<HTMLButtonElement>(null);

  // Read ?reason= URL param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("reason");
    if (raw === "used") {
      setReason("used");
    } else {
      // "expired", anything else, or missing → default to "expired"
      setReason("expired");
    }
    // Trigger mount animation on next frame
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Focus primary button after mount animation begins
  useEffect(() => {
    if (mounted && primaryButtonRef.current) {
      primaryButtonRef.current.focus();
    }
  }, [mounted]);

  const handleResend = async () => {
    if (isResending) return;
    setIsResending(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const email = params.get("email") ?? "";
      if (email) {
        await fetch("/api/auth/resend-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
      }
    } catch {
      // anti-enumeration: same UX whether or not the call succeeded
    }
    setIsResending(false);
    window.location.href = "/auth/verify-email-sent";
  };

  const handleSignIn = () => {
    window.location.href = "/auth/signin";
  };

  const isExpired = reason === "expired";

  const eyebrowText = isExpired ? "ACCOUNT — LINK EXPIRED" : "ACCOUNT — LINK USED";
  const headlineText = isExpired
    ? "This link has expired"
    : "This link has already been used";
  const helperText = isExpired
    ? "Verification links expire after 24 hours. We can send you a new one."
    : "Looks like you've already verified. You can sign in below.";

  return (
    <>
      <style>{`
        /* ─── Cova design tokens ─────────────────────────────────────── */
        :root {
          --cova-navy:      #091829;
          --cova-gold:      #C9A84C;
          --cova-ivory:     #F5F0E8;
          --cova-warm-error:#A8443B;
        }

        /* ─── Typography ─────────────────────────────────────────────── */
        .cova-serif {
          font-family: 'EB Garamond', Georgia, serif;
        }
        .cova-sans {
          font-family: 'DM Sans', system-ui, sans-serif;
        }

        /* ─── Mount animation ─────────────────────────────────────────── */
        @keyframes covaFormMount {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        .cova-form-hidden {
          opacity: 0;
          transform: translateY(8px);
        }
        .cova-form-enter {
          animation: covaFormMount 400ms ease-out forwards;
        }

        /* ─── Error banner animation ──────────────────────────────────── */
        @keyframes covaBannerSlide {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        .cova-banner-enter {
          animation: covaBannerSlide 150ms ease-out forwards;
        }

        /* ─── Reduced motion ──────────────────────────────────────────── */
        @media (prefers-reduced-motion: reduce) {
          .cova-form-hidden { opacity: 1; transform: none; }
          .cova-form-enter  { animation: none; opacity: 1; transform: none; }
          .cova-banner-enter { animation: none; }
        }


        /* ─── Primary button ──────────────────────────────────────────── */
        .cova-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          position: relative;
          height: 44px;
          background-color: transparent;
          border: 1px solid rgba(245, 240, 232, 0.30);
          color: #F5F0E8;
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          border-radius: 0;
          cursor: pointer;
          transition: none;
          padding: 0 16px;
          overflow: hidden;
        }
        .cova-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        /* Gold focus ring */
        .cova-btn:focus-visible {
          outline: 1px solid rgba(201, 168, 76, 0.80);
          outline-offset: 2px;
        }
        /* Hover-gold-reveal underline via pseudo-element */
        .cova-btn::after {
          content: '';
          position: absolute;
          bottom: 10px;
          left: 50%;
          transform: translateX(-50%);
          height: 2px;
          background-color: #C9A84C;
          width: 0;
          transition: width 200ms ease-out;
        }
        .cova-btn:hover:not(:disabled)::after {
          width: calc(100% - 32px);
        }

        /* ─── Footer link ─────────────────────────────────────────────── */
        .cova-footer-link {
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 10px;
          font-weight: 400;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: rgba(201, 168, 76, 0.60);
          text-decoration: none;
          transition: color 200ms ease-out;
        }
        .cova-footer-link:hover {
          color: rgba(201, 168, 76, 1);
        }
        .cova-footer-link:focus-visible {
          outline: 1px solid rgba(201, 168, 76, 0.80);
          outline-offset: 2px;
        }
      `}</style>

      {/* ─── Full-viewport navy ground ──────────────────────────────────── */}
      <div
        style={{
          minHeight: "100vh",
          width: "100%",
          backgroundColor: "var(--cova-navy)",
          position: "relative",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Wordmark />

        {/* ─── FORM COLUMN ───────────────────────────────────────────── */}
        <div
          className={mounted ? "cova-form-enter" : "cova-form-hidden"}
          style={{
            width: "min(360px, calc(100% - 48px))",
            maxWidth: "360px",
          }}
        >
          {/* Border-left hairline */}
          <div
            style={{
              borderLeft: "1px solid rgba(245, 240, 232, 0.12)",
              paddingLeft: "24px",
            }}
          >
            {topBannerError && (
              <Toast message={topBannerError} onDismiss={() => setTopBannerError("")} />
            )}

            {/* ── EYEBROW — gold/80 ────────────────────────────────── */}
            <div
              className="cova-sans"
              style={{
                fontSize: "10px",
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color: "rgba(201, 168, 76, 0.80)",
                fontWeight: 400,
                lineHeight: 1,
              }}
            >
              {eyebrowText}
            </div>

            {/* 12px gap */}
            <div style={{ height: "12px" }} />

            {/* ── HEADLINE — gold at full opacity ──────────────────── */}
            <h1
              className="cova-serif"
              style={{
                fontSize: "clamp(24px, 4vw, 28px)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--cova-gold)",
                lineHeight: 1.2,
                margin: 0,
              }}
            >
              {headlineText}
            </h1>

            {/* 8px gap */}
            <div style={{ height: "8px" }} />

            {/* ── HELPER LINE ──────────────────────────────────────── */}
            <p
              className="cova-serif"
              aria-live="polite"
              style={{
                fontSize: "14px",
                fontStyle: "italic",
                fontWeight: 400,
                color: "rgba(245, 240, 232, 0.50)",
                lineHeight: 1.4,
                margin: 0,
              }}
            >
              {helperText}
            </p>

            {/* 16px gap */}
            <div style={{ height: "16px" }} />

            {/* ── GOLD HAIRLINE RULE — gold/60 ─────────────────────── */}
            <div
              style={{
                width: "32px",
                height: "1px",
                backgroundColor: "rgba(201, 168, 76, 0.60)",
              }}
            />

            {/* 32px gap */}
            <div style={{ height: "32px" }} />

            {/* ── PRIMARY BUTTON ───────────────────────────────────── */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              {isExpired ? (
                /* Expired variant — 240px wide to fit "RESEND VERIFICATION EMAIL" */
                <button
                  ref={primaryButtonRef}
                  className="cova-btn"
                  onClick={handleResend}
                  disabled={isResending}
                  aria-label={
                    isResending ? "Resending…" : "Resend verification email"
                  }
                  style={{ width: "240px" }}
                >
                  {isResending ? (
                    /* Loading state α (phase doc §6 1B): italic-serif
                       label change. NO spinner, NO dot-loader, NO keyframe
                       rotation. Locked label per §6 1B "Resend verification:
                       Resending…" (same lock as verify-email-sent). */
                    <span
                      className="cova-serif"
                      style={{
                        fontStyle: "italic",
                        fontSize: "14px",
                        fontWeight: 400,
                        letterSpacing: "normal",
                        textTransform: "none",
                        color: "var(--cova-ivory)",
                      }}
                    >
                      Resending…
                    </span>
                  ) : (
                    "RESEND VERIFICATION EMAIL"
                  )}
                </button>
              ) : (
                /* Used variant — 200px wide for "SIGN IN" */
                <button
                  ref={primaryButtonRef}
                  className="cova-btn"
                  onClick={handleSignIn}
                  aria-label="Sign in"
                  style={{ width: "200px" }}
                >
                  SIGN IN
                </button>
              )}
            </div>
          </div>
          {/* End border-l hairline region */}
        </div>

        {/* ─── FOOTER LINK — expired variant only, fixed bottom-right ── */}
        {isExpired && (
          <a
            href="/auth/signin"
            className="cova-footer-link"
            style={{
              position: "fixed",
              bottom: "clamp(24px, 3vw, 32px)",
              right: "clamp(24px, 3vw, 40px)",
            }}
          >
            ALREADY VERIFIED — SIGN IN
          </a>
        )}
      </div>
    </>
  );
}
