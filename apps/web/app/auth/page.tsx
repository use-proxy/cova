"use client"
import { Cormorant_Garamond, Manrope } from "next/font/google";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { flowLog } from "@/lib/debug/flow-logger";

const displayFont = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const bodyFont = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export default function CovaLoginPage() {
  useEffect(() => { flowLog("page:mount", { page: "auth" }); }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isBusy = isEmailLoading || isGoogleLoading;

  const continueLabel = useMemo(() => {
    if (isEmailLoading) return "Signing in...";
    if (isGoogleLoading) return "Opening Google...";
    return "Continue";
  }, [isEmailLoading, isGoogleLoading]);

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsEmailLoading(true);

    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setErrorMessage(error.message);
        setIsEmailLoading(false);
        return;
      }
      window.location.assign("/design/step-1");
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Sign-in failed. Please try again.",
      );
      setIsEmailLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setErrorMessage(null);
    setIsGoogleLoading(true);

    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setErrorMessage(error.message);
        setIsGoogleLoading(false);
      }
      // On success the browser is navigated to Google's consent screen, so
      // we intentionally leave isGoogleLoading=true.
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Google sign-in failed.",
      );
      setIsGoogleLoading(false);
    }
  }

  function handleForgotPassword() {
    // Forgot-password flow not yet implemented.
  }

  function handleRequestAccess() {
    // Sign-up flow not yet implemented on this page.
  }

  return (
    <div className={`${bodyFont.className} cova-shell`}>
      <div className="cova-background" />
      <div className="cova-grid" />
      <div className="cova-orb cova-orb-teal" />
      <div className="cova-orb cova-orb-coral" />
      <div className="cova-orb cova-orb-gold" />

      <main className="cova-stage">
        <section className="cova-card" aria-label="Sign in to Cova">
          <div className="cova-card-inner" />

          <header className="cova-header">
            <span className={`${displayFont.className} cova-brand`}>Cova</span>
            <p className="cova-kicker">CURATED AI DESIGN</p>
            <h1 className={`${displayFont.className} cova-title`}>
              Sign in and continue.
            </h1>
            <p className="cova-copy">
              Access your saved spaces, design direction, and a more intentional
              workflow.
            </p>
          </header>

          <div className="cova-actions">
            {errorMessage && (
              <div className="cova-error" role="alert">
                {errorMessage}
              </div>
            )}
            <button
              type="button"
              className="cova-google"
              onClick={handleGoogleSignIn}
              disabled={isBusy}
            >
              <span className="cova-google-left">
                <span className="cova-google-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="cova-google-svg">
                    <path
                      fill="#E5C37A"
                      d="M21.6 12.23c0-.71-.06-1.24-.19-1.79H12v3.37h5.52c-.11.84-.73 2.1-2.1 2.95l-.02.11 3.06 2.37.21.02c1.91-1.76 2.93-4.34 2.93-7.03Z"
                    />
                    <path
                      fill="#F4EFE7"
                      d="M12 22c2.7 0 4.97-.89 6.63-2.41l-3.25-2.5c-.87.61-2.03 1.03-3.38 1.03-2.64 0-4.88-1.74-5.68-4.15l-.1.01-3.17 2.46-.03.09A9.99 9.99 0 0 0 12 22Z"
                    />
                    <path
                      fill="#C98973"
                      d="M6.32 13.97A5.99 5.99 0 0 1 6 12c0-.68.12-1.34.31-1.97l-.01-.13-3.2-2.5-.1.05A9.98 9.98 0 0 0 2 12c0 1.61.39 3.13 1.09 4.45l3.23-2.48Z"
                    />
                    <path
                      fill="#7CB5B1"
                      d="M12 5.88c1.7 0 2.84.73 3.49 1.35l2.55-2.48C16.96 3.72 14.7 3 12 3A9.99 9.99 0 0 0 3 7.45l3.31 2.58C7.12 7.62 9.36 5.88 12 5.88Z"
                    />
                  </svg>
                </span>
                <span>
                  <strong className="cova-google-title">
                    Continue with Google
                  </strong>
                  <span className="cova-google-subtitle">Quick access</span>
                </span>
              </span>
              <span className="cova-arrow" aria-hidden="true">
                →
              </span>
            </button>

            <div className="cova-divider" aria-hidden="true">
              <span />
              <em>or</em>
              <span />
            </div>

            <form className="cova-form" onSubmit={handleEmailSubmit}>
              <label className="cova-field">
                <span className="cova-label">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter your email"
                  autoComplete="email"
                  disabled={isBusy}
                />
              </label>

              <label className="cova-field">
                <span className="cova-label">Password</span>
                <div className="cova-password-wrap">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    disabled={isBusy}
                  />
                  <button
                    type="button"
                    className="cova-password-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              <div className="cova-meta-row">
                <button
                  type="button"
                  className="cova-text-button"
                  onClick={handleForgotPassword}
                >
                  Forgot password
                </button>
              </div>

              <button type="submit" className="cova-submit" disabled={isBusy}>
                <span className="cova-submit-sheen" />
                <span className="cova-submit-label">{continueLabel}</span>
              </button>
            </form>
          </div>

          <footer className="cova-footer">
            <span>New to Cova?</span>
            <button
              type="button"
              className="cova-footer-link"
              onClick={handleRequestAccess}
            >
              Request access
            </button>
          </footer>
        </section>
      </main>

      <style jsx>{`
        .cova-shell {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          background:
            radial-gradient(
              circle at top left,
              rgba(124, 181, 177, 0.08),
              transparent 28%
            ),
            radial-gradient(
              circle at bottom right,
              rgba(201, 137, 115, 0.08),
              transparent 24%
            ),
            linear-gradient(180deg, #0b1320 0%, #0e1626 100%);
          color: #f4efe7;
        }

        .cova-background {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(
              180deg,
              rgba(11, 19, 32, 0.5),
              rgba(11, 19, 32, 0.92)
            ),
            radial-gradient(
              circle at 50% 0%,
              rgba(229, 195, 122, 0.06),
              transparent 24%
            );
        }

        .cova-grid {
          position: absolute;
          inset: 0;
          opacity: 0.045;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px),
            linear-gradient(
              90deg,
              rgba(255, 255, 255, 0.06) 1px,
              transparent 1px
            );
          background-size: 120px 120px;
          mask-image: radial-gradient(
            circle at center,
            black 34%,
            transparent 92%
          );
        }

        .cova-orb {
          position: absolute;
          border-radius: 999px;
          filter: blur(90px);
          pointer-events: none;
        }

        .cova-orb-teal {
          top: -5rem;
          left: -4rem;
          width: 20rem;
          height: 20rem;
          background: rgba(124, 181, 177, 0.12);
        }

        .cova-orb-coral {
          right: -5rem;
          bottom: -6rem;
          width: 18rem;
          height: 18rem;
          background: rgba(201, 137, 115, 0.1);
        }

        .cova-orb-gold {
          top: 14%;
          right: 16%;
          width: 11rem;
          height: 11rem;
          background: rgba(229, 195, 122, 0.06);
        }

        .cova-stage {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1.25rem;
        }

        .cova-card {
          position: relative;
          width: 100%;
          max-width: 31rem;
          overflow: hidden;
          border-radius: 2rem;
          border: 1px solid rgba(229, 195, 122, 0.14);
          background: linear-gradient(
            180deg,
            rgba(17, 27, 43, 0.84),
            rgba(11, 19, 32, 0.95)
          );
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.42);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
        }

        .cova-card-inner {
          position: absolute;
          inset: 1px;
          border-radius: calc(2rem - 1px);
          background:
            radial-gradient(
              circle at top left,
              rgba(124, 181, 177, 0.08),
              transparent 24%
            ),
            radial-gradient(
              circle at bottom right,
              rgba(201, 137, 115, 0.08),
              transparent 20%
            ),
            linear-gradient(
              180deg,
              rgba(255, 255, 255, 0.03),
              rgba(255, 255, 255, 0.012)
            );
          pointer-events: none;
        }

        .cova-header,
        .cova-actions,
        .cova-footer {
          position: relative;
          z-index: 1;
        }

        .cova-header {
          padding: 2.25rem 2rem 0;
          text-align: center;
        }

        .cova-brand {
          display: block;
          color: #e5c37a;
          font-size: clamp(2.6rem, 5vw, 3.25rem);
          line-height: 0.95;
          letter-spacing: 0.04em;
          font-style: italic;
        }

        .cova-kicker {
          margin: 1rem 0 0;
          color: rgba(244, 239, 231, 0.38);
          font-size: 0.68rem;
          letter-spacing: 0.42em;
        }

        .cova-title {
          margin: 2rem auto 0;
          max-width: 10ch;
          font-size: clamp(3rem, 7vw, 4.35rem);
          line-height: 0.92;
          font-style: italic;
          font-weight: 600;
          letter-spacing: -0.02em;
        }

        .cova-copy {
          margin: 1.2rem auto 0;
          max-width: 24rem;
          color: rgba(244, 239, 231, 0.62);
          font-size: 0.98rem;
          line-height: 1.9;
        }

        .cova-actions {
          padding: 2rem;
        }

        .cova-error {
          margin-bottom: 1rem;
          padding: 0.85rem 1rem;
          border-radius: 0.85rem;
          border: 1px solid rgba(192, 80, 74, 0.38);
          background: rgba(192, 80, 74, 0.12);
          color: #f4c2bd;
          font-size: 0.85rem;
          line-height: 1.5;
        }

        .cova-google {
          width: 100%;
          height: 3.6rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0 1rem;
          border-radius: 999px;
          border: 1px solid rgba(229, 195, 122, 0.18);
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.06),
            rgba(255, 255, 255, 0.03)
          );
          color: #f4efe7;
          transition:
            transform 180ms ease,
            border-color 180ms ease,
            background 180ms ease,
            box-shadow 180ms ease;
          cursor: pointer;
        }

        .cova-google:hover {
          transform: translateY(-1px);
          border-color: rgba(124, 181, 177, 0.34);
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18);
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.08),
            rgba(255, 255, 255, 0.04)
          );
        }

        .cova-google:disabled,
        .cova-submit:disabled,
        .cova-field input:disabled {
          cursor: not-allowed;
          opacity: 0.72;
        }

        .cova-google-left {
          display: flex;
          align-items: center;
          gap: 0.95rem;
          min-width: 0;
        }

        .cova-google-icon {
          width: 2.55rem;
          height: 2.55rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid rgba(229, 195, 122, 0.14);
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.06),
            rgba(255, 255, 255, 0.02)
          );
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.16);
        }

        .cova-google-svg {
          width: 1.15rem;
          height: 1.15rem;
        }

        .cova-google-title {
          display: block;
          font-size: 0.98rem;
          font-weight: 500;
          letter-spacing: 0.02em;
        }

        .cova-google-subtitle {
          display: block;
          margin-top: 0.16rem;
          color: rgba(124, 181, 177, 0.78);
          font-size: 0.64rem;
          letter-spacing: 0.3em;
          text-transform: uppercase;
        }

        .cova-arrow {
          color: #c98973;
          font-size: 1rem;
          transition:
            transform 180ms ease,
            color 180ms ease;
        }

        .cova-google:hover .cova-arrow {
          transform: translateX(3px);
          color: #e5c37a;
        }

        .cova-divider {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin: 1.6rem 0;
        }

        .cova-divider span {
          flex: 1;
          height: 1px;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(229, 195, 122, 0.22),
            transparent
          );
        }

        .cova-divider em {
          color: rgba(244, 239, 231, 0.3);
          font-size: 0.64rem;
          font-style: normal;
          text-transform: uppercase;
          letter-spacing: 0.34em;
        }

        .cova-form {
          display: grid;
          gap: 1.15rem;
        }

        .cova-field {
          display: block;
        }

        .cova-label {
          display: block;
          margin-bottom: 0.75rem;
          color: rgba(244, 239, 231, 0.5);
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.34em;
        }

        .cova-field input {
          width: 100%;
          height: 3.6rem;
          border-radius: 1.15rem;
          border: 1px solid rgba(229, 195, 122, 0.12);
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.055),
            rgba(255, 255, 255, 0.03)
          );
          padding: 0 1rem 0 1.1rem;
          color: #f4efe7;
          font-size: 0.98rem;
          outline: none;
          transition:
            border-color 180ms ease,
            box-shadow 180ms ease,
            background 180ms ease;
        }

        .cova-field input::placeholder {
          color: rgba(244, 239, 231, 0.24);
        }

        .cova-field input:hover {
          border-color: rgba(201, 137, 115, 0.24);
        }

        .cova-field input:focus {
          border-color: rgba(124, 181, 177, 0.52);
          background: rgba(255, 255, 255, 0.075);
          box-shadow: 0 0 0 4px rgba(124, 181, 177, 0.1);
        }

        .cova-password-wrap {
          position: relative;
        }

        .cova-password-wrap input {
          padding-right: 4.75rem;
        }

        .cova-password-toggle {
          position: absolute;
          right: 0.85rem;
          top: 50%;
          transform: translateY(-50%);
          border: 0;
          background: transparent;
          color: rgba(229, 195, 122, 0.88);
          font-size: 0.76rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          transition: color 180ms ease;
        }

        .cova-password-toggle:hover {
          color: #7cb5b1;
        }

        .cova-meta-row {
          display: flex;
          justify-content: flex-end;
          margin-top: -0.15rem;
        }

        .cova-text-button,
        .cova-footer-link {
          border: 0;
          background: transparent;
          padding: 0;
          color: rgba(244, 239, 231, 0.56);
          cursor: pointer;
          transition: color 180ms ease;
        }

        .cova-text-button {
          font-size: 0.83rem;
          letter-spacing: 0.05em;
        }

        .cova-text-button:hover,
        .cova-footer-link:hover {
          color: #7cb5b1;
        }

        .cova-submit {
          position: relative;
          overflow: hidden;
          width: 100%;
          height: 3.65rem;
          border: 1px solid #e5c37a;
          border-radius: 999px;
          background: linear-gradient(
            135deg,
            #e5c37a 0%,
            #d59b7d 46%,
            #7cb5b1 100%
          );
          color: #0b1320;
          font-size: 0.84rem;
          font-weight: 700;
          letter-spacing: 0.34em;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: 0 18px 42px rgba(124, 181, 177, 0.16);
          transition:
            transform 180ms ease,
            box-shadow 180ms ease;
        }

        .cova-submit:hover {
          transform: translateY(-1px);
          box-shadow: 0 22px 44px rgba(201, 137, 115, 0.18);
        }

        .cova-submit-sheen {
          position: absolute;
          inset: 0 auto 0 -30%;
          width: 30%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.54),
            transparent
          );
          transform: skewX(-20deg);
          transition: transform 650ms ease;
        }

        .cova-submit:hover .cova-submit-sheen {
          transform: translateX(430%) skewX(-20deg);
        }

        .cova-submit-label {
          position: relative;
          z-index: 1;
        }

        .cova-footer {
          position: relative;
          z-index: 1;
          display: flex;
          justify-content: center;
          gap: 0.45rem;
          padding: 0 2rem 2rem;
          border-top: 1px solid rgba(229, 195, 122, 0.12);
          margin-top: 0.35rem;
          padding-top: 1.45rem;
          color: rgba(244, 239, 231, 0.56);
          font-size: 0.84rem;
          line-height: 1.8;
        }

        .cova-footer-link {
          color: #e5c37a;
          font-weight: 500;
        }

        @media (max-width: 640px) {
          .cova-stage {
            padding: 1rem;
          }

          .cova-card {
            border-radius: 1.6rem;
          }

          .cova-header {
            padding: 1.6rem 1.25rem 0;
          }

          .cova-actions {
            padding: 1.4rem 1.25rem 1.25rem;
          }

          .cova-footer {
            padding-left: 1.25rem;
            padding-right: 1.25rem;
            flex-wrap: wrap;
          }
        }
      `}</style>
    </div>
  );
}
