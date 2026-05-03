import { useEffect, useId, useState, type FormEvent } from "react";
import { X } from "lucide-react";

/**
 * Cova — /auth/signup
 *
 * Refinement pass on the luxury redesign. Centered 360px form column with
 * a faint vertical hairline on the left edge that doubles as compositional
 * structure. OAuth collapsed to a single Google button. The "EXISTING
 * ACCOUNT — SIGN IN" link is pinned to the bottom-right of the viewport
 * to mirror the COVA wordmark in the top-left.
 *
 * Self-contained: React + TypeScript + Tailwind, plus lucide-react for
 * the X dismiss icon. Submit handler is a console.log placeholder.
 *
 * Tailwind tokens (already configured):
 *   bg-cova-navy / text-cova-navy        #091829
 *   bg-cova-gold / text-cova-gold        #C9A84C
 *   bg-cova-ivory / text-cova-ivory      #F5F0E8
 *   text-cova-warm-error                 #A8443B
 */

type SignUpProps = {
  /**
   * Reserved. The Apple OAuth path was removed in the refinement pass —
   * Google is now the sole OAuth provider on this screen — but the prop
   * is preserved so callers don't break.
   */
  appleEnabled?: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUp(_props: SignUpProps = {}) {
  // ---- form state ---------------------------------------------------------
  const [emailValue, setEmailValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [emailError, setEmailError] = useState<string>("");
  const [passwordError, setPasswordError] = useState<string>("");
  const [topBannerError, setTopBannerError] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // ---- a11y ids -----------------------------------------------------------
  const emailId = useId();
  const passwordId = useId();
  const emailErrorId = `${emailId}-error`;
  const passwordErrorId = `${passwordId}-error`;

  // ---- reduced-motion-aware mount animation -------------------------------
  const [mounted, setMounted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener?.("change", onChange);
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => {
      cancelAnimationFrame(raf);
      mq.removeEventListener?.("change", onChange);
    };
  }, []);

  // ---- handlers -----------------------------------------------------------
  const validateEmail = () => {
    if (emailValue && !EMAIL_RE.test(emailValue)) {
      setEmailError("Enter a valid email address");
    } else {
      setEmailError("");
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLoading) return;
    if (!emailValue || !passwordValue) return;
    if (!EMAIL_RE.test(emailValue)) {
      setEmailError("Enter a valid email address");
      return;
    }
    // eslint-disable-next-line no-console
    console.log("submit", { email: emailValue, password: passwordValue });
  };

  const submitDisabled =
    isLoading ||
    emailValue.length === 0 ||
    passwordValue.length === 0 ||
    !EMAIL_RE.test(emailValue);

  // ---- styling helpers ----------------------------------------------------
  const mountStyle: React.CSSProperties = reduceMotion
    ? { opacity: 1, transform: "none", transition: "none" }
    : {
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(8px)",
        transition: "opacity 400ms ease-out, transform 400ms ease-out",
      };

  const inputBase =
    "w-full bg-transparent border-0 border-b font-serif italic text-[16px] " +
    "text-cova-ivory placeholder:text-cova-ivory/25 placeholder:italic " +
    "px-0 py-2 outline-none focus:ring-0 " +
    "transition-colors duration-200 ease-out " +
    "disabled:opacity-50 disabled:cursor-not-allowed";

  const emailBorder = emailError
    ? "border-b-cova-warm-error focus:border-b-cova-warm-error"
    : "border-b-cova-ivory/15 focus:border-b-cova-gold/60";

  const passwordBorder = passwordError
    ? "border-b-cova-warm-error focus:border-b-cova-warm-error"
    : "border-b-cova-ivory/15 focus:border-b-cova-gold/60";

  // Microtype label class — slightly more recessed (ivory/35).
  const microLabel =
    "block font-sans text-[10px] tracking-[0.2em] uppercase text-cova-ivory/35";
  const microSection =
    "font-sans text-[10px] tracking-[0.3em] uppercase text-cova-ivory/35";

  return (
    <div className="relative min-h-screen w-full bg-cova-navy overflow-x-hidden">
      {/* --- WORDMARK (top-left) --------------------------------------- */}
      <div
        className="fixed z-10 select-none top-8 left-10 max-md:top-6 max-md:left-6"
        aria-hidden="false"
      >
        <div className="font-serif text-cova-ivory text-[16px] max-md:text-[12px] tracking-[0.4em] leading-none">
          COVA
        </div>
        <div
          className="font-sans text-cova-gold/50 text-[14px] leading-none mt-2"
          aria-hidden="true"
        >
          —
        </div>
      </div>

      {/* --- FOOTER LINK (bottom-right, mirrors wordmark) -------------- */}
      <a
        href="/auth/signin"
        className="fixed z-10 bottom-8 right-10 max-md:bottom-6 max-md:right-6 font-sans text-[10px] tracking-[0.25em] uppercase text-cova-ivory/40 hover:text-cova-ivory transition-colors duration-200 ease-out"
      >
        EXISTING ACCOUNT — SIGN IN
      </a>

      {/* --- FORM COLUMN (centered, 360px wide) ------------------------ */}
      {/*
        A full-viewport flex container handles both axes of centering so the
        form column truly sits at the horizontal middle of the viewport, not
        offset by absolute-position arithmetic.
      */}
      <div className="min-h-screen w-full flex items-center justify-center">
      <div
        className="w-[360px] max-md:w-[calc(100%-48px)] max-w-[360px]"
        style={mountStyle}
      >
        <form
          onSubmit={handleSubmit}
          noValidate
          aria-describedby={topBannerError ? "signup-top-error" : undefined}
        >
          {/* Top error banner sits above the eyebrow. */}
          {topBannerError && (
            <>
              <ErrorBanner
                id="signup-top-error"
                message={topBannerError}
                onDismiss={() => setTopBannerError("")}
                reduceMotion={reduceMotion}
              />
              <div className="h-6" aria-hidden="true" />
            </>
          )}

          {/*
            Hairline-bracketed region:
            A faint vertical 1px ivory/8 rule on the left of the column,
            running from the eyebrow top to the bottom of the primary
            button. Achieved with `border-l` on the wrapper. Content is
            indented 24px to the right of that hairline. The footer link
            is intentionally outside this wrapper so the rule does not
            extend to it.
          */}
          <div className="border-l border-cova-ivory/12 pl-6">
            {/* 1. EYEBROW */}
            <div className="font-sans text-[10px] tracking-[0.3em] uppercase text-cova-gold/60">
              ACCOUNT — NEW
            </div>

            {/* 12px gap */}
            <div className="h-3" aria-hidden="true" />

            {/* 2. HEADLINE */}
            <h1 className="font-serif italic text-cova-ivory text-[28px] max-md:text-[24px] font-normal leading-[1.2]">
              Create an account
            </h1>

            {/* 8px gap to tagline */}
            <div className="h-2" aria-hidden="true" />

            {/* 3. TAGLINE */}
            <p className="font-serif italic text-[14px] text-cova-ivory/50 leading-snug">
              Your room, redesigned in seconds.
            </p>

            {/* 16px gap to hairline */}
            <div className="h-4" aria-hidden="true" />

            {/* 4. GOLD HAIRLINE RULE — left-aligned */}
            <div className="w-8 h-px bg-cova-gold/40" aria-hidden="true" />

            {/* 24px gap (tightened from 40px) */}
            <div className="h-6" aria-hidden="true" />

            {/* 5. SINGLE GOOGLE OAUTH BUTTON */}
            <button
              type="button"
              onClick={() => console.log("oauth", "google")}
              disabled={isLoading}
              className="
                w-full h-12 bg-transparent
                border border-cova-ivory/20
                text-cova-ivory font-sans font-medium
                text-[12px] tracking-[0.2em] uppercase
                transition-colors duration-200 ease-out
                hover:bg-cova-ivory/8 hover:border-cova-ivory/40
                focus:outline-none focus-visible:border-cova-gold/60
                disabled:opacity-50 disabled:cursor-not-allowed
                disabled:hover:bg-transparent disabled:hover:border-cova-ivory/20
              "
            >
              CONTINUE WITH GOOGLE
            </button>

            {/* 24px gap */}
            <div className="h-6" aria-hidden="true" />

            {/* 6. OR-EMAIL MICROTYPE LABEL */}
            <div className={microSection}>OR CONTINUE WITH EMAIL</div>

            {/* 24px gap (tightened from 32) */}
            <div className="h-6" aria-hidden="true" />

            {/* 7. EMAIL FIELD */}
            <label htmlFor={emailId} className={microLabel}>
              EMAIL
            </label>
            <div className="h-[10px]" aria-hidden="true" />
            <input
              id={emailId}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="you@example.com"
              value={emailValue}
              onChange={(e) => {
                setEmailValue(e.target.value);
                if (emailError) setEmailError("");
              }}
              onBlur={validateEmail}
              disabled={isLoading}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? emailErrorId : undefined}
              className={`${inputBase} ${emailBorder}`}
            />
            <div id={emailErrorId} aria-live="polite">
              {emailError && (
                <p className="mt-[6px] font-sans italic text-[12px] text-cova-warm-error">
                  {emailError}
                </p>
              )}
            </div>

            {/* 12px gap (tightened from 24/16) */}
            <div className="h-3" aria-hidden="true" />

            {/* 8. PASSWORD FIELD */}
            <label htmlFor={passwordId} className={microLabel}>
              PASSWORD
            </label>
            <div className="h-[10px]" aria-hidden="true" />
            <input
              id={passwordId}
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="minimum 8 characters"
              value={passwordValue}
              onChange={(e) => {
                setPasswordValue(e.target.value);
                if (passwordError) setPasswordError("");
              }}
              disabled={isLoading}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? passwordErrorId : undefined}
              className={`${inputBase} ${passwordBorder}`}
            />
            <div id={passwordErrorId} aria-live="polite">
              {passwordError && (
                <p className="mt-[6px] font-sans italic text-[12px] text-cova-warm-error">
                  {passwordError}
                </p>
              )}
            </div>

            {/* 12px gap, then strength meter mount */}
            <div className="h-3" aria-hidden="true" />
            {/* FV component will be imported here */}
            <div id="password-strength-meter-mount" className="h-12" />

            {/* 24px gap (tightened from 32) */}
            <div className="h-6" aria-hidden="true" />

            {/* 9. PRIMARY BUTTON — 200px wide, centered in the column */}
            <div className="flex justify-center">
              <button
                type="submit"
                disabled={submitDisabled}
                aria-busy={isLoading || undefined}
                className={
                  "group h-11 w-[200px] whitespace-nowrap " +
                  "bg-transparent border border-cova-ivory/30 text-cova-ivory " +
                  "font-sans font-medium text-[11px] tracking-[0.3em] uppercase " +
                  "transition-colors duration-200 ease-out " +
                  "hover:bg-cova-ivory hover:text-cova-navy hover:border-cova-ivory " +
                  "focus:outline-none focus-visible:border-cova-gold/60 " +
                  "disabled:opacity-50 disabled:cursor-not-allowed " +
                  "disabled:hover:bg-transparent disabled:hover:text-cova-ivory disabled:hover:border-cova-ivory/30 " +
                  "flex items-center justify-center"
                }
              >
                {isLoading ? <Spinner /> : "CREATE ACCOUNT"}
              </button>
            </div>
          </div>
          {/* /hairline-bracketed region */}
        </form>
      </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Top error banner — italic, warm-error tinted
 * ------------------------------------------------------------------------ */

function ErrorBanner({
  id,
  message,
  onDismiss,
  reduceMotion,
}: {
  id: string;
  message: string;
  onDismiss: () => void;
  reduceMotion: boolean;
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (reduceMotion) {
      setShown(true);
      return;
    }
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion]);

  const style: React.CSSProperties = reduceMotion
    ? { opacity: 1, transform: "none" }
    : {
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(-4px)",
        transition: "opacity 150ms ease-out, transform 150ms ease-out",
      };

  return (
    <div
      id={id}
      role="alert"
      aria-live="polite"
      style={style}
      className="flex items-start justify-between gap-3 bg-cova-warm-error/12 text-cova-warm-error font-sans italic text-[12px] p-3"
    >
      <span className="flex-1 leading-snug">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="shrink-0 not-italic text-cova-warm-error/80 hover:text-cova-warm-error transition-colors duration-200 ease-out"
      >
        <X size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Spinner — 14px circular ring; ivory by default, navy on hover background
 * ------------------------------------------------------------------------ */

function Spinner() {
  return (
    <span
      role="status"
      aria-label="Loading"
      className="
        inline-block h-[14px] w-[14px] rounded-full
        border border-cova-ivory/30 border-t-cova-ivory
        group-hover:border-cova-navy/30 group-hover:border-t-cova-navy
        animate-spin
      "
    />
  );
}
