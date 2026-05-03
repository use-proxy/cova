"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Wordmark } from "@/components/brand/Wordmark";
import { Toast } from "@/components/ui/Toast";
import { createBrowserClient } from "@/lib/supabase/client";

/**
 * Cova — /auth/signin
 *
 * Sibling to /auth/signup. Same design system: editorial luxury, sharp corners,
 * navy ground, ivory body, gold used exactly four times (eyebrow, brand
 * em-dash, hairline rule, focus ring).
 *
 * Self-contained: React + TypeScript + Tailwind only. lucide-react for the
 * dismiss icon. No framer-motion, no other dependencies.
 */

type TopBannerError = string | null;

const EMAIL_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full bg-cova-navy" />}>
      <SignIn />
    </Suspense>
  );
}

function SignIn() {
  const [emailValue, setEmailValue] = useState<string>("");
  const [passwordValue, setPasswordValue] = useState<string>("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [topBannerError, setTopBannerError] = useState<TopBannerError>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  // Mount animation — managed without framer-motion. We toggle a class on the
  // form column on first paint so Tailwind transitions handle the rest.
  const [mounted, setMounted] = useState<boolean>(false);
  const prefersReducedMotion = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      prefersReducedMotion.current = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
    }
    // Defer one frame so the initial styles can paint, then transition in.
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // OAuth-error toast on /auth/signin?error=oauth (P01b 1B.4) and
  // ?error=email_exists (B-12a identity merge collision).
  useEffect(() => {
    const error = searchParams.get("error");
    if (error === "oauth") {
      setTopBannerError("Couldn't sign in with Google. Try email instead.");
    } else if (error === "email_exists") {
      setTopBannerError("An account already exists for that email. Sign in with your password instead.");
    }
  }, [searchParams]);

  const isValidEmailFormat = EMAIL_RE.test(emailValue.trim());
  const canSubmit =
    isValidEmailFormat && passwordValue.length > 0 && !isLoading;

  function handleEmailBlur() {
    if (emailValue.length === 0) {
      setEmailError(null);
      return;
    }
    if (!EMAIL_RE.test(emailValue.trim())) {
      setEmailError("Enter a valid email address");
    } else {
      setEmailError(null);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    setTopBannerError(null);
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailValue, password: passwordValue }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        redirectTo?: string;
        user_message?: string;
      };
      if (res.ok && json.ok) {
        router.push(json.redirectTo ?? "/dashboard");
        return;
      }
      setTopBannerError(json.user_message ?? "Couldn't reach our servers. Try again.");
    } catch {
      setTopBannerError("Couldn't reach our servers. Try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleOAuthClick() {
    if (isLoading) return;
    setTopBannerError(null);
    try {
      const supabase = createBrowserClient();
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
    } catch {
      setTopBannerError("Couldn't sign in with Google. Try email instead.");
    }
  }

  function handleFormKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    // Escape does not dismiss anything — explicit per spec.
    if (e.key === "Escape") {
      e.stopPropagation();
    }
  }

  return (
    <div className="min-h-screen w-full bg-cova-navy relative overflow-hidden">
      <Wordmark />

      {/* FORM COLUMN — centered both axes */}
      <div className="min-h-screen w-full flex justify-center items-center">
        <main
          className={[
            "w-[calc(100%-48px)] max-w-[360px] md:w-[360px]",
            "transform-gpu will-change-transform",
            "transition-[opacity,transform] ease-out",
            prefersReducedMotion.current
              ? "duration-0"
              : "duration-[400ms]",
            mounted
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-2",
          ].join(" ")}
        >
          <form
            noValidate
            onSubmit={handleSubmit}
            onKeyDown={handleFormKeyDown}
            aria-labelledby="cova-signin-headline"
            className="block"
          >
            {/* Hairline-bracketed region — the vertical rule runs from the
                top of the eyebrow (or top banner, when present) to the bottom
                of the primary button. The footer link is OUTSIDE this. */}
            <div className="border-l border-cova-ivory/[0.12] pl-6">
              {/* TOP ERROR BANNER */}
              {topBannerError && (
                <Toast
                  message={topBannerError}
                  onDismiss={() => setTopBannerError(null)}
                />
              )}

              {/* EYEBROW */}
              <div className="font-sans text-[10px] tracking-[0.3em] uppercase text-cova-gold/60">
                ACCOUNT — RETURNING
              </div>

              {/* 12px gap */}
              <div className="h-3" aria-hidden="true" />

              {/* HEADLINE */}
              <h1
                id="cova-signin-headline"
                className="font-serif italic font-normal text-cova-ivory text-[24px] md:text-[28px] leading-[1.2]"
              >
                Sign in
              </h1>

              {/* 12px gap */}
              <div className="h-3" aria-hidden="true" />

              {/* GOLD HAIRLINE RULE — left-aligned, 32px wide */}
              <div
                className="w-8 h-px bg-cova-gold/40"
                aria-hidden="true"
              />

              {/* 24px gap */}
              <div className="h-6" aria-hidden="true" />

              {/* GOOGLE OAUTH BUTTON */}
              <button
                type="button"
                onClick={handleOAuthClick}
                disabled={isLoading}
                className={[
                  "w-full h-12",
                  "bg-transparent border border-cova-ivory/20",
                  "text-cova-ivory font-sans text-[12px] tracking-[0.2em] uppercase font-medium",
                  "transition-colors duration-200 ease-out",
                  "hover:bg-cova-ivory/[0.08] hover:border-cova-ivory/40",
                  "focus:outline-none focus-visible:border-cova-gold/60",
                  "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-cova-ivory/20",
                ].join(" ")}
              >
                CONTINUE WITH GOOGLE
              </button>

              {/* 24px gap */}
              <div className="h-6" aria-hidden="true" />

              {/* OR-EMAIL MICROTYPE LABEL */}
              <div className="font-sans text-[10px] tracking-[0.3em] uppercase text-cova-ivory/[0.35]">
                OR CONTINUE WITH EMAIL
              </div>

              {/* 24px gap */}
              <div className="h-6" aria-hidden="true" />

              {/* EMAIL FIELD */}
              <FieldLabel htmlFor="cova-email">EMAIL</FieldLabel>
              <div className="h-[10px]" aria-hidden="true" />
              <input
                id="cova-email"
                name="email"
                type="email"
                value={emailValue}
                onChange={(e) => {
                  setEmailValue(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                onBlur={handleEmailBlur}
                disabled={isLoading}
                placeholder="you@example.com"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="email"
                aria-invalid={!!emailError}
                aria-describedby={emailError ? "cova-email-error" : undefined}
                className={[
                  "block w-full bg-transparent",
                  "border-0 border-b rounded-none",
                  "py-2 px-0",
                  "font-serif italic text-[16px] text-cova-ivory",
                  "placeholder:text-cova-ivory/25 placeholder:italic",
                  "focus:outline-none",
                  "transition-colors duration-200 ease-out",
                  emailError
                    ? "border-cova-warm-error focus:border-cova-warm-error"
                    : "border-cova-ivory/15 focus:border-cova-gold/60",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                ].join(" ")}
              />
              <div
                id="cova-email-error"
                aria-live="polite"
                className="min-h-0"
              >
                {emailError && (
                  <p className="mt-[6px] font-sans italic text-[12px] text-cova-warm-error">
                    {emailError}
                  </p>
                )}
              </div>

              {/* 12px gap */}
              <div className="h-3" aria-hidden="true" />

              {/* PASSWORD FIELD */}
              <FieldLabel htmlFor="cova-password">PASSWORD</FieldLabel>
              <div className="h-[10px]" aria-hidden="true" />
              <input
                id="cova-password"
                name="password"
                type="password"
                value={passwordValue}
                onChange={(e) => {
                  setPasswordValue(e.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                disabled={isLoading}
                placeholder="your password"
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={!!passwordError}
                aria-describedby={
                  passwordError ? "cova-password-error" : undefined
                }
                className={[
                  "block w-full bg-transparent",
                  "border-0 border-b rounded-none",
                  "py-2 px-0",
                  "font-serif italic text-[16px] text-cova-ivory",
                  "placeholder:text-cova-ivory/25 placeholder:italic",
                  "focus:outline-none",
                  "transition-colors duration-200 ease-out",
                  passwordError
                    ? "border-cova-warm-error focus:border-cova-warm-error"
                    : "border-cova-ivory/15 focus:border-cova-gold/60",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                ].join(" ")}
              />
              <div
                id="cova-password-error"
                aria-live="polite"
                className="min-h-0"
              >
                {passwordError && (
                  <p className="mt-[6px] font-sans italic text-[12px] text-cova-warm-error">
                    {passwordError}
                  </p>
                )}
              </div>

              {/* 12px gap */}
              <div className="h-3" aria-hidden="true" />

              {/* FORGOT PASSWORD LINK — right-aligned within content area */}
              <div className="flex justify-end">
                <a
                  href="/auth/forgot-password"
                  className={[
                    "font-sans text-[10px] tracking-[0.2em] uppercase",
                    "text-cova-ivory/40 hover:text-cova-ivory",
                    "transition-colors duration-200 ease-out",
                    "focus:outline-none focus-visible:text-cova-ivory",
                  ].join(" ")}
                >
                  FORGOT PASSWORD — RESET
                </a>
              </div>

              {/* 24px gap */}
              <div className="h-6" aria-hidden="true" />

              {/* PRIMARY BUTTON — 200x44, centered horizontally in content area */}
              <div className="flex justify-center">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className={[
                    "group relative",
                    "w-[200px] h-11",
                    "bg-transparent border border-cova-ivory/30",
                    "text-cova-ivory font-sans text-[11px] tracking-[0.3em] uppercase font-medium",
                    "transition-colors duration-200 ease-out",
                    "focus:outline-none focus-visible:border-cova-gold/60",
                    canSubmit
                      ? "hover:bg-cova-ivory hover:text-cova-navy hover:border-cova-ivory cursor-pointer"
                      : "opacity-50 cursor-not-allowed",
                  ].join(" ")}
                  aria-busy={isLoading}
                >
                  {isLoading ? (
                    <span
                      className="inline-block align-middle"
                      aria-label="Signing in"
                      role="status"
                    >
                      <Spinner />
                    </span>
                  ) : (
                    "SIGN IN"
                  )}
                </button>
              </div>
            </div>
          </form>
        </main>
      </div>

      {/* FOOTER LINK — fixed, OUTSIDE the form column */}
      <a
        href="/auth/signup"
        className={[
          "fixed z-10",
          "bottom-6 right-6 md:bottom-8 md:right-10",
          "font-sans text-[10px] tracking-[0.25em] uppercase",
          "text-cova-ivory/40 hover:text-cova-ivory",
          "transition-colors duration-200 ease-out",
          "focus:outline-none focus-visible:text-cova-ivory",
        ].join(" ")}
      >
        NEW TO COVA — CREATE ACCOUNT
      </a>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Internal pieces                                                          */
/* ----------------------------------------------------------------------- */

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block font-sans text-[10px] tracking-[0.2em] uppercase text-cova-ivory/[0.35]"
    >
      {children}
    </label>
  );
}

function Spinner() {
  // 14px circular spinner. Ivory by default, navy when the button hover
  // state inverts the background — handled via group-hover.
  return (
    <span
      className="inline-block w-[14px] h-[14px] rounded-full border border-current border-t-transparent animate-spin text-cova-ivory group-hover:text-cova-navy align-middle"
    />
  );
}
