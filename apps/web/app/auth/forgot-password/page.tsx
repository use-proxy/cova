"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { Toast } from "@/components/ui/Toast";

/**
 * /auth/forgot-password — Cova
 *
 * Sibling screen to /auth/signin and /auth/signup. Same design system:
 * EB Garamond italic editorial headlines, DM Sans tracked microtype,
 * sharp corners, no shadows, gold used exactly four times
 * (eyebrow / brand mark em-dash / hairline rule / focus ring).
 *
 * Self-contained. No business logic. Submit handler is a console.log
 * placeholder; actual API call happens during executor wiring.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type TopBannerError =
  | "Too many requests. Try again in 15 minutes."
  | "Couldn't reach our servers. Try again."
  | "Couldn't send the email. Try again in a moment."
  | null;

function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setPrefers(e.matches);
    mql.addEventListener?.("change", handler);
    return () => mql.removeEventListener?.("change", handler);
  }, []);

  return prefers;
}

export default function ForgotPassword() {
  const [emailValue, setEmailValue] = useState<string>("");
  const [emailError, setEmailError] = useState<string>("");
  const [topBannerError, setTopBannerError] = useState<TopBannerError>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [resendCountdown, setResendCountdown] = useState<number>(0);

  // Crossfade orchestration
  const [renderPostSubmit, setRenderPostSubmit] = useState<boolean>(false);
  const [preVisible, setPreVisible] = useState<boolean>(true);
  const [postVisible, setPostVisible] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  const resendButtonRef = useRef<HTMLButtonElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reducedMotion = usePrefersReducedMotion();

  // First-paint mount animation
  useEffect(() => {
    if (reducedMotion) {
      setMounted(true);
      return;
    }
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [reducedMotion]);

  // Countdown lifecycle
  useEffect(() => {
    if (resendCountdown <= 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      setResendCountdown((n) => (n <= 1 ? 0 : n - 1));
    }, 1000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [resendCountdown]);

  // Move focus to resend button when POST_SUBMIT becomes visible
  useEffect(() => {
    if (renderPostSubmit && postVisible) {
      resendButtonRef.current?.focus();
    }
  }, [renderPostSubmit, postVisible]);

  const isEmailValid = EMAIL_REGEX.test(emailValue.trim());
  const primaryDisabled = !isEmailValid || isLoading;

  function handleEmailBlur() {
    if (emailValue.length === 0) {
      setEmailError("");
      return;
    }
    if (!EMAIL_REGEX.test(emailValue.trim())) {
      setEmailError("Enter a valid email address.");
    } else {
      setEmailError("");
    }
  }

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    setEmailValue(e.target.value);
    if (emailError) setEmailError("");
  }

  function transitionToPostSubmit() {
    if (reducedMotion) {
      setPreVisible(false);
      setIsSubmitted(true);
      setRenderPostSubmit(true);
      setPostVisible(true);
      return;
    }
    // PRE fades out 150ms, 50ms gap, POST fades in 200ms
    setPreVisible(false);
    window.setTimeout(() => {
      setIsSubmitted(true);
      setRenderPostSubmit(true);
      window.setTimeout(() => {
        setPostVisible(true);
      }, 50);
    }, 150);
  }

  async function performSubmit() {
    setIsLoading(true);
    setTopBannerError(null);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailValue.trim() }),
      });
    } catch {
      // anti-enumeration: same UX whether or not the call succeeded
    }
    setIsLoading(false);
    if (!isSubmitted) {
      transitionToPostSubmit();
    }
    setResendCountdown(60);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!EMAIL_REGEX.test(emailValue.trim())) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError("");
    void performSubmit();
  }

  function handleResend() {
    if (resendCountdown > 0 || isLoading) return;
    void performSubmit();
  }

  // ─────────────────────────────────────────────────────────────
  // Shared atoms
  // ─────────────────────────────────────────────────────────────

  const eyebrowClass =
    "font-sans text-[10px] tracking-[0.3em] uppercase text-cova-gold/60";
  const headlineClass =
    "font-serif italic text-[24px] md:text-[28px] font-normal leading-[1.2] text-cova-ivory";
  const helperClass =
    "font-serif italic text-[14px] leading-snug text-cova-ivory/50";

  const buttonBaseClass =
    "h-[44px] inline-flex items-center justify-center bg-transparent border border-cova-ivory/30 text-cova-ivory font-sans text-[11px] tracking-[0.3em] uppercase font-medium rounded-none transition-colors duration-200 ease-out focus:outline-none focus-visible:border-cova-gold/60";
  const buttonHoverClass =
    "hover:bg-cova-ivory hover:text-cova-navy hover:border-cova-ivory";
  const buttonDisabledClass = "opacity-50 cursor-not-allowed";

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  const mountTransition = reducedMotion
    ? ""
    : "transition-[opacity,transform] duration-[400ms] ease-out";
  const mountStyle: React.CSSProperties = reducedMotion
    ? {}
    : {
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0px)" : "translateY(8px)",
      };

  const preCrossfade = reducedMotion
    ? ""
    : "transition-opacity duration-150 ease-out";
  const postCrossfade = reducedMotion
    ? ""
    : "transition-[opacity,transform] duration-200 ease-out";

  return (
    <main className="min-h-screen w-full bg-cova-navy flex justify-center items-center relative overflow-hidden">
      <Wordmark />

      {/* FORM COLUMN */}
      <div
        className={`w-[calc(100%-48px)] max-w-[360px] md:w-[360px] ${mountTransition}`}
        style={mountStyle}
      >
        {/* PRE_SUBMIT */}
        {!renderPostSubmit && (
          <div
            className={preCrossfade}
            style={
              reducedMotion ? undefined : { opacity: preVisible ? 1 : 0 }
            }
          >
            <PreSubmit
              emailValue={emailValue}
              emailError={emailError}
              topBannerError={topBannerError}
              isLoading={isLoading}
              primaryDisabled={primaryDisabled}
              onEmailChange={handleEmailChange}
              onEmailBlur={handleEmailBlur}
              onDismissBanner={() => setTopBannerError(null)}
              onSubmit={handleSubmit}
              eyebrowClass={eyebrowClass}
              headlineClass={headlineClass}
              helperClass={helperClass}
              buttonBaseClass={buttonBaseClass}
              buttonHoverClass={buttonHoverClass}
              buttonDisabledClass={buttonDisabledClass}
            />
          </div>
        )}

        {/* POST_SUBMIT */}
        {renderPostSubmit && (
          <div
            className={postCrossfade}
            style={
              reducedMotion
                ? undefined
                : {
                    opacity: postVisible ? 1 : 0,
                    transform: postVisible
                      ? "translateY(0px)"
                      : "translateY(4px)",
                  }
            }
          >
            <PostSubmit
              topBannerError={topBannerError}
              resendCountdown={resendCountdown}
              isLoading={isLoading}
              onDismissBanner={() => setTopBannerError(null)}
              onResend={handleResend}
              resendButtonRef={resendButtonRef}
              eyebrowClass={eyebrowClass}
              headlineClass={headlineClass}
              helperClass={helperClass}
              buttonBaseClass={buttonBaseClass}
              buttonHoverClass={buttonHoverClass}
              buttonDisabledClass={buttonDisabledClass}
            />
          </div>
        )}
      </div>

      {/* FOOTER LINK — fixed-position, OUTSIDE form column */}
      <a
        href="/auth/signin"
        className="fixed bottom-6 right-6 md:bottom-8 md:right-10 font-sans text-[10px] tracking-[0.25em] uppercase text-cova-ivory/40 hover:text-cova-ivory transition-colors duration-200 ease-out focus:outline-none focus-visible:text-cova-ivory"
      >
        {isSubmitted
          ? "BACK TO SIGN IN"
          : "REMEMBER YOUR PASSWORD — SIGN IN"}
      </a>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// PRE_SUBMIT subview
// ─────────────────────────────────────────────────────────────

interface PreSubmitProps {
  emailValue: string;
  emailError: string;
  topBannerError: TopBannerError;
  isLoading: boolean;
  primaryDisabled: boolean;
  onEmailChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onEmailBlur: () => void;
  onDismissBanner: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  eyebrowClass: string;
  headlineClass: string;
  helperClass: string;
  buttonBaseClass: string;
  buttonHoverClass: string;
  buttonDisabledClass: string;
}

function PreSubmit(props: PreSubmitProps) {
  const {
    emailValue,
    emailError,
    topBannerError,
    isLoading,
    primaryDisabled,
    onEmailChange,
    onEmailBlur,
    onDismissBanner,
    onSubmit,
    eyebrowClass,
    headlineClass,
    helperClass,
    buttonBaseClass,
    buttonHoverClass,
    buttonDisabledClass,
  } = props;

  return (
    <form noValidate onSubmit={onSubmit} className="w-full">
      {topBannerError && (
        <div className="mb-6">
          <Toast
            message={topBannerError}
            onDismiss={onDismissBanner}
          />
        </div>
      )}

      <div className="border-l border-cova-ivory/12 pl-6">
        {/* EYEBROW */}
        <div className={eyebrowClass}>ACCOUNT — RECOVERY</div>

        {/* 12px gap */}
        <div className="h-3" />

        {/* HEADLINE */}
        <h1 className={headlineClass}>Reset your password</h1>

        {/* 8px gap */}
        <div className="h-2" />

        {/* HELPER LINE */}
        <p className={helperClass}>
          We&rsquo;ll email you a link to reset your password.
        </p>

        {/* 16px gap */}
        <div className="h-4" />

        {/* GOLD HAIRLINE RULE */}
        <div
          aria-hidden="true"
          className="w-8 h-px bg-cova-gold/40"
        />

        {/* 32px gap */}
        <div className="h-8" />

        {/* EMAIL FIELD */}
        <div>
          <label
            htmlFor="cova-forgot-email"
            className="block font-sans text-[10px] tracking-[0.2em] uppercase text-cova-ivory/35"
          >
            EMAIL
          </label>

          {/* 10px gap */}
          <div className="h-[10px]" />

          <input
            id="cova-forgot-email"
            name="email"
            type="email"
            value={emailValue}
            onChange={onEmailChange}
            onBlur={onEmailBlur}
            disabled={isLoading}
            placeholder="you@example.com"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="email"
            spellCheck={false}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? "cova-forgot-email-error" : undefined}
            className={[
              "w-full bg-transparent border-0 border-b rounded-none",
              "font-serif italic text-[16px] text-cova-ivory",
              "placeholder:italic placeholder:text-cova-ivory/25",
              "py-2 px-0",
              "focus:outline-none transition-colors duration-200 ease-out",
              emailError
                ? "border-b-cova-warm-error focus:border-b-cova-warm-error"
                : "border-b-cova-ivory/15 focus:border-b-cova-gold/60",
              isLoading ? "opacity-50 cursor-not-allowed" : "",
            ].join(" ")}
          />

          {/* 6px gap + error message */}
          <div
            id="cova-forgot-email-error"
            aria-live="polite"
            className="mt-[6px] min-h-[16px] font-sans italic text-[12px] text-cova-warm-error"
          >
            {emailError}
          </div>
        </div>

        {/* 32px gap (compensated for the reserved error line above) */}
        <div className="h-[26px]" />

        {/* PRIMARY BUTTON */}
        <div className="flex justify-center">
          <button
            type="submit"
            disabled={primaryDisabled}
            className={[
              buttonBaseClass,
              "w-[240px]",
              primaryDisabled ? buttonDisabledClass : buttonHoverClass,
            ].join(" ")}
          >
            {isLoading ? (
              /* Loading state α (phase doc §6 1B): italic-serif label
                 change. NO spinner, NO dot-loader.
                 Locked label per §6 1B "Forgot password: Sending reset link…". */
              <span className="font-serif italic normal-case tracking-normal text-[14px] text-cova-ivory">
                Sending reset link&hellip;
              </span>
            ) : (
              <span>SEND RESET LINK</span>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// POST_SUBMIT subview
// ─────────────────────────────────────────────────────────────

interface PostSubmitProps {
  topBannerError: TopBannerError;
  resendCountdown: number;
  isLoading: boolean;
  onDismissBanner: () => void;
  onResend: () => void;
  resendButtonRef: React.Ref<HTMLButtonElement>;
  eyebrowClass: string;
  headlineClass: string;
  helperClass: string;
  buttonBaseClass: string;
  buttonHoverClass: string;
  buttonDisabledClass: string;
}

function PostSubmit(props: PostSubmitProps) {
  const {
    topBannerError,
    resendCountdown,
    isLoading,
    onDismissBanner,
    onResend,
    resendButtonRef,
    eyebrowClass,
    headlineClass,
    helperClass,
    buttonBaseClass,
    buttonHoverClass,
    buttonDisabledClass,
  } = props;

  const resendDisabled = resendCountdown > 0 || isLoading;
  const resendCopy =
    resendCountdown > 0 ? `RESEND IN ${resendCountdown}s` : "RESEND LINK";

  return (
    <div className="w-full">
      {topBannerError && (
        <div className="mb-6">
          <Toast
            message={topBannerError}
            onDismiss={onDismissBanner}
          />
        </div>
      )}

      <div className="border-l border-cova-ivory/12 pl-6">
        {/* EYEBROW */}
        <div className={eyebrowClass}>INBOX — CHECK YOUR EMAIL</div>

        {/* 12px gap */}
        <div className="h-3" />

        {/* HEADLINE */}
        <h1 className={headlineClass}>Check your inbox</h1>

        {/* 8px gap */}
        <div className="h-2" />

        {/* HELPER LINE — anti-enumeration copy */}
        <p className={helperClass} aria-live="polite">
          If an account exists for that email, we sent a reset link.
        </p>

        {/* 16px gap */}
        <div className="h-4" />

        {/* GOLD HAIRLINE RULE */}
        <div aria-hidden="true" className="w-8 h-px bg-cova-gold/40" />

        {/* 32px gap */}
        <div className="h-8" />

        {/* RESEND BUTTON */}
        <div className="flex justify-center">
          <button
            ref={resendButtonRef}
            type="button"
            onClick={onResend}
            disabled={resendDisabled}
            className={[
              buttonBaseClass,
              "w-[200px]",
              resendDisabled ? buttonDisabledClass : buttonHoverClass,
            ].join(" ")}
          >
            {isLoading ? <Spinner /> : <span>{resendCopy}</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span
      role="status"
      aria-label="Loading"
      className="inline-block w-[14px] h-[14px] rounded-full border border-current border-t-transparent animate-spin"
    />
  );
}
