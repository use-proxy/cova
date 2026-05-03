/**
 * Cova — /auth/reset-password
 * ─────────────────────────────────────────────────────────
 * Sibling to /auth/signin, /auth/signup, /auth/forgot-password.
 * Same design system: EB Garamond italic display, DM Sans tracked
 * uppercase microtype, em-dash separators, sharp corners (0px),
 * no shadows / glows / cards. Form floats on cova-navy ground
 * inside a single ivory/12 left hairline. Gold appears EXACTLY
 * 4 times: eyebrow, brand em-dash, hairline rule, focus ring.
 *
 * Self-contained: React + TypeScript + Tailwind only.
 * lucide-react allowed for the X dismiss icon. No framer-motion.
 *
 * NOTE: Real zxcvbn strength check happens during executor wiring;
 * here the 8-char minimum gates the submit button. The strength
 * meter mount div is reserved by id for that wiring.
 */

import { useEffect, useRef, useState } from "react";
import type {
  ChangeEvent,
  FocusEvent,
  FormEvent,
  KeyboardEvent,
} from "react";
import { X } from "lucide-react";

type ScreenState = "validating" | "valid" | "invalid" | "submitted";
type InvalidReason = "expired" | "used" | null;

const EM_DASH = "—";

export default function ResetPassword() {
  // ── State ──────────────────────────────────────────────
  const [screenState, setScreenState] = useState<ScreenState>("validating");
  const [invalidReason, setInvalidReason] = useState<InvalidReason>(null);

  const [passwordValue, setPasswordValue] = useState("");
  const [confirmValue, setConfirmValue] = useState("");

  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [topBannerError, setTopBannerError] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  // For the crossfade — render `displayedState` which lags the
  // real `screenState` by 200ms (150ms outgoing fade + 50ms gap).
  const [displayedState, setDisplayedState] =
    useState<ScreenState>("validating");
  const [isOutgoing, setIsOutgoing] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  // ── On mount: simulate token validation ────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const simulate = params.get("simulateState");

    if (simulate === "expired") {
      setScreenState("invalid");
      setInvalidReason("expired");
      return;
    }
    if (simulate === "used") {
      setScreenState("invalid");
      setInvalidReason("used");
      return;
    }
    if (simulate === "submitted") {
      setScreenState("submitted");
      return;
    }
    if (simulate === "valid") {
      setScreenState("valid");
      return;
    }
    if (!token) {
      setScreenState("invalid");
      setInvalidReason("expired");
      return;
    }
    const t = window.setTimeout(() => {
      setScreenState("valid");
    }, 800);
    return () => window.clearTimeout(t);
  }, []);

  // ── Crossfade orchestration ────────────────────────────
  useEffect(() => {
    if (screenState === displayedState) return;
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReduced) {
      setDisplayedState(screenState);
      setIsOutgoing(false);
      return;
    }

    setIsOutgoing(true);
    const swap = window.setTimeout(() => {
      setDisplayedState(screenState);
      setIsOutgoing(false);
    }, 200); // 150ms outgoing + 50ms gap

    return () => window.clearTimeout(swap);
  }, [screenState, displayedState]);

  // ── On entering VALID: focus the new password input ────
  useEffect(() => {
    if (displayedState === "valid" && !isOutgoing) {
      // Defer to after the fade-in starts, so the field is mounted.
      const t = window.setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 50);
      return () => window.clearTimeout(t);
    }
  }, [displayedState, isOutgoing]);

  // ── On entering SUBMITTED: 2s auto-redirect ────────────
  useEffect(() => {
    if (screenState !== "submitted") return;
    const t = window.setTimeout(() => {
      window.location.href = "/auth/signin";
    }, 2000);
    return () => window.clearTimeout(t);
  }, [screenState]);

  // ── Handlers ───────────────────────────────────────────
  const onPasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPasswordValue(e.target.value);
    if (passwordError) setPasswordError("");
    if (confirmError) setConfirmError("");
  };

  const onConfirmChange = (e: ChangeEvent<HTMLInputElement>) => {
    setConfirmValue(e.target.value);
    if (confirmError) setConfirmError("");
  };

  const onConfirmBlur = (_e: FocusEvent<HTMLInputElement>) => {
    if (confirmValue && confirmValue !== passwordValue) {
      setConfirmError("Passwords don't match");
    }
  };

  const submitDisabled =
    !passwordValue ||
    !confirmValue ||
    passwordValue !== confirmValue ||
    passwordValue.length < 8 ||
    isLoading;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitDisabled) return;
    // eslint-disable-next-line no-console
    console.log("[Cova] reset-password submit", {
      passwordLength: passwordValue.length,
    });
    setIsLoading(true);
    window.setTimeout(() => {
      setIsLoading(false);
      setScreenState("submitted");
    }, 800);
  };

  const requestNewLink = () => {
    window.location.href = "/auth/forgot-password";
  };

  // ── Render ─────────────────────────────────────────────
  return (
    <div
      className="min-h-screen w-full bg-cova-navy text-cova-ivory"
      style={{ fontFamily: "var(--font-sans)" }}>
      {/* ── Wordmark (fixed top-left) ───────────────────── */}
      <div
        className="fixed left-6 top-6 md:left-10 md:top-8 select-none"
        aria-label="Cova">
        <div
          className="font-serif text-cova-ivory text-[12px] md:text-[16px]"
          style={{ letterSpacing: "0.4em", fontStyle: "normal" }}>
          COVA
        </div>
        <div
          className="font-sans text-[14px] text-cova-gold/50 mt-2"
          style={{ letterSpacing: 0 }}
          aria-hidden="true">
          {EM_DASH}
        </div>
      </div>

      {/* ── Centered form column ───────────────────────── */}
      <div className="min-h-screen w-full flex justify-center items-center px-0">
        <div className="w-[calc(100%-48px)] max-w-[360px] md:w-[360px] cova-mount">
          {/* Outgoing layer (current displayedState fading out) */}
          {isOutgoing ? (
            <div
              className="transition-opacity duration-150 ease-out opacity-0"
              aria-hidden="true">
              <StateBlock
                state={displayedState}
                invalidReason={invalidReason}
                passwordValue={passwordValue}
                confirmValue={confirmValue}
                passwordError={passwordError}
                confirmError={confirmError}
                topBannerError={topBannerError}
                isLoading={isLoading}
                submitDisabled={submitDisabled}
                onPasswordChange={onPasswordChange}
                onConfirmChange={onConfirmChange}
                onConfirmBlur={onConfirmBlur}
                onSubmit={handleSubmit}
                onDismissBanner={() => setTopBannerError("")}
                onRequestNewLink={requestNewLink}
                passwordInputRef={passwordInputRef}
              />
            </div>
          ) : (
            <div className="cova-state-enter" key={displayedState}>
              <StateBlock
                state={displayedState}
                invalidReason={invalidReason}
                passwordValue={passwordValue}
                confirmValue={confirmValue}
                passwordError={passwordError}
                confirmError={confirmError}
                topBannerError={topBannerError}
                isLoading={isLoading}
                submitDisabled={submitDisabled}
                onPasswordChange={onPasswordChange}
                onConfirmChange={onConfirmChange}
                onConfirmBlur={onConfirmBlur}
                onSubmit={handleSubmit}
                onDismissBanner={() => setTopBannerError("")}
                onRequestNewLink={requestNewLink}
                passwordInputRef={passwordInputRef}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Footer link (fixed bottom-right) ─────────────
           Hidden in VALIDATING and SUBMITTED states.        */}
      {(displayedState === "valid" || displayedState === "invalid") && (
        <a
          href="/auth/signin"
          className="fixed right-6 bottom-6 md:right-10 md:bottom-8 font-sans text-[10px] text-cova-ivory/40 hover:text-cova-ivory transition-colors duration-200 ease-out"
          style={{ letterSpacing: "0.25em", textTransform: "uppercase" }}>
          {displayedState === "valid"
            ? `REMEMBER YOUR PASSWORD ${EM_DASH} SIGN IN`
            : "BACK TO SIGN IN"}
        </a>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   StateBlock — inner content wrapped in the bracketed
   `border-l border-cova-ivory/12 pl-6` hairline column.
   ───────────────────────────────────────────────────────── */
type StateBlockProps = {
  state: ScreenState;
  invalidReason: InvalidReason;
  passwordValue: string;
  confirmValue: string;
  passwordError: string;
  confirmError: string;
  topBannerError: string;
  isLoading: boolean;
  submitDisabled: boolean;
  onPasswordChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onConfirmChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onConfirmBlur: (e: FocusEvent<HTMLInputElement>) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onDismissBanner: () => void;
  onRequestNewLink: () => void;
  passwordInputRef: React.RefObject<HTMLInputElement | null>;
};

function StateBlock(props: StateBlockProps) {
  const {
    state,
    invalidReason,
    passwordValue,
    confirmValue,
    passwordError,
    confirmError,
    topBannerError,
    isLoading,
    submitDisabled,
    onPasswordChange,
    onConfirmChange,
    onConfirmBlur,
    onSubmit,
    onDismissBanner,
    onRequestNewLink,
    passwordInputRef,
  } = props;

  // Top error banner only renders inside VALID.
  return (
    <div className="border-l border-cova-ivory/12 pl-6">
      {state === "valid" && topBannerError ? (
        <div className="cova-banner-enter mb-6">
          <div
            role="alert"
            className="flex items-start justify-between gap-3 bg-cova-warm-error/12 px-3 py-2.5"
            style={{ borderRadius: 0 }}>
            <p
              className="font-sans italic text-[12px] text-cova-warm-error leading-snug"
              style={{ fontFamily: "var(--font-sans)" }}>
              {topBannerError}
            </p>
            <button
              type="button"
              onClick={onDismissBanner}
              aria-label="Dismiss"
              className="shrink-0 text-cova-warm-error/70 hover:text-cova-warm-error transition-colors duration-200 ease-out">
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      ) : null}

      {state === "validating" && <ValidatingBlock />}

      {state === "valid" && (
        <ValidBlock
          passwordValue={passwordValue}
          confirmValue={confirmValue}
          passwordError={passwordError}
          confirmError={confirmError}
          isLoading={isLoading}
          submitDisabled={submitDisabled}
          onPasswordChange={onPasswordChange}
          onConfirmChange={onConfirmChange}
          onConfirmBlur={onConfirmBlur}
          onSubmit={onSubmit}
          passwordInputRef={passwordInputRef}
        />
      )}

      {state === "invalid" && (
        <InvalidBlock
          invalidReason={invalidReason}
          onRequestNewLink={onRequestNewLink}
        />
      )}

      {state === "submitted" && <SubmittedBlock />}
    </div>
  );
}

/* ─── Shared atoms ─────────────────────────────────────── */

function Eyebrow({ children }: { children: string }) {
  return (
    <div
      className="font-sans text-[10px] text-cova-gold/60"
      style={{
        letterSpacing: "0.3em",
        textTransform: "uppercase",
      }}>
      {children}
    </div>
  );
}

function Headline({ children }: { children: string }) {
  return (
    <h1
      className="font-serif italic text-cova-ivory text-[24px] md:text-[28px] font-normal"
      style={{ lineHeight: 1.2, fontFamily: "var(--font-serif)" }}>
      {children}
    </h1>
  );
}

function Helper({ children }: { children: string }) {
  return (
    <p
      className="font-serif italic text-[14px] text-cova-ivory/50 leading-snug"
      style={{ fontFamily: "var(--font-serif)" }}>
      {children}
    </p>
  );
}

function GoldHairline() {
  return (
    <div
      className="bg-cova-gold/40"
      style={{ width: 32, height: 1 }}
      aria-hidden="true"
    />
  );
}

function MicroLabel({ children, htmlFor }: { children: string; htmlFor: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block font-sans text-[10px] text-cova-ivory/35"
      style={{
        letterSpacing: "0.2em",
        textTransform: "uppercase",
      }}>
      {children}
    </label>
  );
}

/* ─── State 1 — VALIDATING ─────────────────────────────── */
function ValidatingBlock() {
  return (
    <div>
      <Eyebrow>{`ACCOUNT ${EM_DASH} VERIFYING`}</Eyebrow>
      <div style={{ height: 12 }} />
      <Headline>Verifying your reset link</Headline>
      <div style={{ height: 16 }} />
      <GoldHairline />
      <div style={{ height: 32 }} />
      <div className="flex justify-center">
        <div
          className="border border-cova-ivory/30 border-t-cova-ivory rounded-full animate-spin"
          style={{ width: 16, height: 16 }}
          role="status"
          aria-label="Verifying"
        />
      </div>
    </div>
  );
}

/* ─── State 2 — VALID ──────────────────────────────────── */
function ValidBlock(props: {
  passwordValue: string;
  confirmValue: string;
  passwordError: string;
  confirmError: string;
  isLoading: boolean;
  submitDisabled: boolean;
  onPasswordChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onConfirmChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onConfirmBlur: (e: FocusEvent<HTMLInputElement>) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  passwordInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const {
    passwordValue,
    confirmValue,
    passwordError,
    confirmError,
    isLoading,
    submitDisabled,
    onPasswordChange,
    onConfirmChange,
    onConfirmBlur,
    onSubmit,
    passwordInputRef,
  } = props;

  const onFormKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter" && !submitDisabled) {
      // Native submit is sufficient; left here for clarity.
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      onKeyDown={onFormKeyDown}
      noValidate
      autoComplete="off">
      <Eyebrow>{`ACCOUNT ${EM_DASH} RESET PASSWORD`}</Eyebrow>
      <div style={{ height: 12 }} />
      <Headline>Set a new password</Headline>
      <div style={{ height: 8 }} />
      <Helper>Choose a strong password you&apos;ll remember.</Helper>
      <div style={{ height: 16 }} />
      <GoldHairline />
      <div style={{ height: 32 }} />

      {/* New password */}
      <MicroLabel htmlFor="cova-new-password">NEW PASSWORD</MicroLabel>
      <div style={{ height: 10 }} />
      <input
        ref={passwordInputRef}
        id="cova-new-password"
        name="new-password"
        type="password"
        value={passwordValue}
        onChange={onPasswordChange}
        disabled={isLoading}
        autoComplete="new-password"
        aria-invalid={Boolean(passwordError)}
        aria-describedby={passwordError ? "cova-new-password-error" : undefined}
        placeholder="minimum 8 characters"
        className={[
          "w-full bg-transparent border-0 border-b font-serif italic text-[16px] text-cova-ivory",
          "placeholder:text-cova-ivory/25 placeholder:italic",
          "focus:outline-none focus:ring-0 transition-colors duration-200 ease-out",
          passwordError
            ? "border-b-cova-warm-error focus:border-b-cova-warm-error"
            : "border-b-cova-ivory/15 focus:border-b-cova-gold/60",
          isLoading ? "opacity-50 cursor-not-allowed" : "",
        ].join(" ")}
        style={{
          padding: "8px 0",
          borderRadius: 0,
          fontFamily: "var(--font-serif)",
        }}
      />
      <div
        id="cova-new-password-error"
        aria-live="polite"
        className="font-sans italic text-[12px] text-cova-warm-error"
        style={{ minHeight: 18, marginTop: 6 }}>
        {passwordError || " "}
      </div>

      <div style={{ height: 12 }} />

      {/* Strength meter mount — FV component imported here during executor wiring (reused from signup) */}
      <div id="password-strength-meter-mount" className="h-12" />

      <div style={{ height: 12 }} />

      {/* Confirm password */}
      <MicroLabel htmlFor="cova-confirm-password">CONFIRM PASSWORD</MicroLabel>
      <div style={{ height: 10 }} />
      <input
        id="cova-confirm-password"
        name="confirm-password"
        type="password"
        value={confirmValue}
        onChange={onConfirmChange}
        onBlur={onConfirmBlur}
        disabled={isLoading}
        autoComplete="new-password"
        aria-invalid={Boolean(confirmError)}
        aria-describedby={
          confirmError ? "cova-confirm-password-error" : undefined
        }
        placeholder="type it again"
        className={[
          "w-full bg-transparent border-0 border-b font-serif italic text-[16px] text-cova-ivory",
          "placeholder:text-cova-ivory/25 placeholder:italic",
          "focus:outline-none focus:ring-0 transition-colors duration-200 ease-out",
          confirmError
            ? "border-b-cova-warm-error focus:border-b-cova-warm-error"
            : "border-b-cova-ivory/15 focus:border-b-cova-gold/60",
          isLoading ? "opacity-50 cursor-not-allowed" : "",
        ].join(" ")}
        style={{
          padding: "8px 0",
          borderRadius: 0,
          fontFamily: "var(--font-serif)",
        }}
      />
      <div
        id="cova-confirm-password-error"
        aria-live="polite"
        className="font-sans italic text-[12px] text-cova-warm-error"
        style={{ minHeight: 18, marginTop: 6 }}>
        {confirmError || " "}
      </div>

      <div style={{ height: 32 }} />

      {/* Primary button */}
      <div className="flex justify-center">
        <button
          type="submit"
          disabled={submitDisabled}
          className={[
            "font-sans font-medium",
            "border bg-transparent text-cova-ivory",
            "transition-colors duration-200 ease-out",
            "focus:outline-none focus-visible:border-cova-gold/60",
            submitDisabled
              ? "border-cova-ivory/15 text-cova-ivory/40 cursor-not-allowed"
              : "border-cova-ivory/30 hover:bg-cova-ivory hover:text-cova-navy hover:border-cova-ivory",
          ].join(" ")}
          style={{
            width: 200,
            height: 44,
            borderRadius: 0,
            fontSize: 11,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
          }}>
          {isLoading ? (
            <span className="inline-flex items-center justify-center">
              <span
                className="border border-cova-ivory/30 border-t-cova-ivory rounded-full animate-spin"
                style={{ width: 14, height: 14 }}
                aria-label="Submitting"
                role="status"
              />
            </span>
          ) : (
            "RESET PASSWORD"
          )}
        </button>
      </div>
    </form>
  );
}

/* ─── State 3 — INVALID ────────────────────────────────── */
function InvalidBlock(props: {
  invalidReason: InvalidReason;
  onRequestNewLink: () => void;
}) {
  const { invalidReason, onRequestNewLink } = props;
  const expired = invalidReason === "expired";

  return (
    <div>
      <Eyebrow>
        {expired
          ? `ACCOUNT ${EM_DASH} LINK EXPIRED`
          : `ACCOUNT ${EM_DASH} LINK USED`}
      </Eyebrow>
      <div style={{ height: 12 }} />
      <Headline>
        {expired ? "This link has expired" : "This link has already been used"}
      </Headline>
      <div style={{ height: 8 }} />
      <Helper>Request a new password reset link to continue.</Helper>
      <div style={{ height: 16 }} />
      <GoldHairline />
      <div style={{ height: 32 }} />
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onRequestNewLink}
          className="font-sans font-medium border border-cova-ivory/30 bg-transparent text-cova-ivory hover:bg-cova-ivory hover:text-cova-navy hover:border-cova-ivory transition-colors duration-200 ease-out focus:outline-none focus-visible:border-cova-gold/60"
          style={{
            width: 200,
            height: 44,
            borderRadius: 0,
            fontSize: 11,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
          }}>
          REQUEST NEW LINK
        </button>
      </div>
    </div>
  );
}

/* ─── State 4 — SUBMITTED ──────────────────────────────── */
function SubmittedBlock() {
  return (
    <div>
      <Eyebrow>{`ACCOUNT ${EM_DASH} PASSWORD UPDATED`}</Eyebrow>
      <div style={{ height: 12 }} />
      <Headline>Your password has been reset</Headline>
      <div style={{ height: 8 }} />
      <p
        aria-live="polite"
        className="font-serif italic text-[14px] text-cova-ivory/50 leading-snug"
        style={{ fontFamily: "var(--font-serif)" }}>
        Redirecting you to sign in&hellip;
      </p>
      <div style={{ height: 16 }} />
      <GoldHairline />
    </div>
  );
}
