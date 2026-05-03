"use client";

import React, { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";

// ─────────────────────────────────────────────────────────────────────────────
// PLACEHOLDER PROSE
// Used when no htmlContent prop is supplied (preview / storybook mode).
// dangerouslySetInnerHTML is safe here ONLY because htmlContent originates from
// Termly — a trusted, sanitised legal-document source. Do not pass arbitrary
// user-generated HTML to this prop.
// ─────────────────────────────────────────────────────────────────────────────
const PLACEHOLDER_PROSE = `
<h2 id="acceptance">1. Acceptance of Terms</h2>
<p>By accessing or using the Cova platform, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree, you may not use our services.</p>
<p>These terms apply to all users, including registered account holders and visitors. We reserve the right to update these terms at any time, and continued use after changes constitutes acceptance.</p>

<h2 id="account">2. Account Registration</h2>
<p>To use certain features, you must create an account. You agree to:</p>
<ul>
  <li>Provide accurate and complete information during registration</li>
  <li>Maintain the confidentiality of your password</li>
  <li>Accept responsibility for all activities under your account</li>
  <li>Be at least 16 years of age</li>
</ul>

<h3>2.1 Age Requirement</h3>
<p>Cova is not intended for users under the age of 16. By creating an account, you represent that you meet this minimum age requirement. If we discover that a user is under 16, their account will be terminated.</p>

<h2 id="services">3. Use of Services</h2>
<p>Cova provides AI-powered interior design services. You may use our services for personal, non-commercial purposes. Commercial use requires separate written agreement.</p>
<p>For more information, see our <a href="/privacy">Privacy Policy</a> and the <a href="https://www.ftc.gov" target="_blank" rel="noopener noreferrer">FTC affiliate disclosure</a>.</p>

<h2 id="content">4. User Content</h2>
<p>You retain ownership of photos and content you upload. By uploading, you grant Cova a non-exclusive license to process, store, and use this content to provide our services.</p>
<p><strong>You are responsible for ensuring you have the right to upload all content.</strong> Cova is not liable for user-uploaded content that infringes third-party rights.</p>

<h2 id="termination">5. Termination</h2>
<p>You may delete your account at any time via account settings. Upon deletion, all your data will be permanently removed within 30 days. We may also suspend or terminate accounts that violate these terms.</p>

<h2 id="contact">6. Contact</h2>
<p>For questions about these terms, contact us at <a href="mailto:hi@covainterior.com">hi@covainterior.com</a>.</p>
`;

// ─────────────────────────────────────────────────────────────────────────────
// DATE HELPER
// Parses an ISO date string ("2026-05-02") and returns "2 MAY 2026".
// ─────────────────────────────────────────────────────────────────────────────
const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
] as const;

function formatISODate(iso: string): string {
  // Parse as UTC to avoid timezone-shift surprises.
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────────
export interface LegalPageProps {
  /** Determines the eyebrow label and document metadata copy. */
  documentType: "terms" | "privacy";
  /** Rendered as the page <h1> and in the sticky header. */
  documentTitle: string;
  /**
   * Raw HTML from Termly. Rendered via dangerouslySetInnerHTML.
   * MUST come from a trusted source — do NOT pass user-generated HTML.
   */
  htmlContent: string;
  /** ISO date string, e.g. "2026-05-02". Formatted internally. */
  lastUpdatedISO: string;
  /** ISO date string, e.g. "2026-05-02". Formatted internally. */
  effectiveDateISO: string;
  /** Document version number as a string, e.g. "1". */
  version: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT PROPS (preview / storybook)
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_PROPS: LegalPageProps = {
  documentType: "terms",
  documentTitle: "Terms of Service",
  htmlContent: PLACEHOLDER_PROSE,
  lastUpdatedISO: "2026-05-02",
  effectiveDateISO: "2026-05-02",
  version: "1",
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const LegalPage: React.FC<Partial<LegalPageProps>> = (userProps) => {
  // Merge user-supplied props with defaults so the component is previewable
  // without any props passed.
  const props: LegalPageProps = { ...DEFAULT_PROPS, ...userProps };
  const {
    documentType,
    documentTitle,
    htmlContent,
    lastUpdatedISO,
    effectiveDateISO,
    version,
  } = props;

  // ── Mount fade ──────────────────────────────────────────────────────────────
  // opacity 0 → 1, 400 ms ease-out. Disabled under prefers-reduced-motion via
  // the CSS media query on the .legal-page-root class (see <style> block below).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // rAF ensures the initial opacity:0 frame is painted before we flip.
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // ── Derived values ──────────────────────────────────────────────────────────
  const formattedLastUpdated = formatISODate(lastUpdatedISO);
  const formattedEffectiveDate = formatISODate(effectiveDateISO);

  const eyebrow =
    documentType === "terms"
      ? "LEGAL — TERMS OF SERVICE"
      : "LEGAL — PRIVACY POLICY";

  const metadataLine1 =
    documentType === "terms"
      ? `TERMS OF SERVICE — VERSION ${version}`
      : `PRIVACY POLICY — VERSION ${version}`;

  const proseContent = htmlContent.trim()
    ? htmlContent
    : "<p>Document loading...</p>";

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Scoped styles ─────────────────────────────────────────────────── */}
      {/*
        .cova-prose styles are injected here so they travel with the component
        and do not depend on a global stylesheet. They scope to any element
        rendered inside a .cova-prose wrapper.

        --font-serif / --font-sans are expected to be set by the project's
        Tailwind config (EB Garamond and DM Sans respectively).
      */}
      <style>{`
        /* ── Mount fade ──────────────────────────────────────────────────── */
        .legal-page-root {
          opacity: 0;
          transition: opacity 400ms ease-out;
        }
        .legal-page-root.is-mounted {
          opacity: 1;
        }
        @media (prefers-reduced-motion: reduce) {
          .legal-page-root,
          .legal-page-root.is-mounted {
            opacity: 1;
            transition: none;
          }
        }

        /* ── Prose typography ────────────────────────────────────────────── */
        .cova-prose h2 {
          font-family: var(--font-serif);
          font-style: normal;
          font-weight: 400;
          font-size: 24px;
          color: #F5F0E8;
          margin-top: 48px;
          margin-bottom: 16px;
          line-height: 1.3;
        }
        .cova-prose h2:first-child {
          margin-top: 0;
        }
        .cova-prose h3 {
          font-family: var(--font-serif);
          font-style: normal;
          font-weight: 400;
          font-size: 18px;
          color: #F5F0E8;
          margin-top: 32px;
          margin-bottom: 12px;
          line-height: 1.3;
        }
        .cova-prose p {
          font-family: var(--font-sans);
          font-size: 16px;
          color: rgb(245 240 232 / 0.8);
          line-height: 1.7;
          margin-bottom: 16px;
        }
        .cova-prose strong {
          font-weight: 500;
          color: #F5F0E8;
        }
        .cova-prose a {
          color: rgb(201 168 76 / 0.85);
          text-decoration: underline;
          text-underline-offset: 4px;
          text-decoration-color: rgb(201 168 76 / 0.3);
          transition: text-decoration-color 200ms ease-out;
        }
        .cova-prose a:hover {
          text-decoration-color: rgb(201 168 76 / 1);
        }
        .cova-prose ul,
        .cova-prose ol {
          font-family: var(--font-sans);
          font-size: 16px;
          color: rgb(245 240 232 / 0.8);
          line-height: 1.7;
          padding-left: 24px;
          margin-bottom: 16px;
        }
        .cova-prose ul {
          list-style-type: disc;
        }
        .cova-prose ol {
          list-style-type: decimal;
        }
        .cova-prose li {
          margin-bottom: 8px;
        }
        .cova-prose blockquote {
          border-left: 2px solid rgb(201 168 76 / 0.4);
          padding-left: 24px;
          font-family: var(--font-serif);
          font-style: italic;
          color: rgb(245 240 232 / 0.7);
          margin: 16px 0;
        }
      `}</style>

      {/* ── Page root ─────────────────────────────────────────────────────── */}
      {/*
        Full-viewport navy background. Vertical scroll. The mount-fade class
        is applied after the first rAF so the browser paints the opacity:0
        frame first.
      */}
      <div
        className={`legal-page-root bg-cova-navy min-h-screen${mounted ? " is-mounted" : ""}`}
      >
        <Wordmark />

        {/* ── Sticky header ───────────────────────────────────────────────── */}
        {/*
          Sticks to the top of the viewport on scroll. Opaque navy background
          cleanly hides prose scrolling behind it. role="banner" is implicit
          on <header>.
        */}
        <header
          className="sticky top-0 z-10 bg-cova-navy border-b border-cova-ivory/10 py-4 px-6 md:px-10 w-full"
        >
          <div className="max-w-[720px] mx-auto flex flex-col gap-1 md:flex-row md:justify-between md:items-baseline">
            {/* Document title */}
            <span
              className="font-serif text-cova-ivory"
              style={{
                fontSize: "18px",
                fontStyle: "normal",
                fontWeight: 400,
              }}
            >
              {documentTitle}
            </span>

            {/* Last-updated label */}
            <span
              className="font-sans text-cova-ivory/50 uppercase"
              style={{
                fontSize: "10px",
                letterSpacing: "0.25em",
              }}
            >
              LAST UPDATED — {formattedLastUpdated}
            </span>
          </div>
        </header>

        {/* ── Page body ───────────────────────────────────────────────────── */}
        <main>
          <div className="max-w-[720px] mx-auto px-6 md:px-10 pt-16 md:pt-24 pb-32 md:pb-40">

            {/* 1. Eyebrow */}
            <p
              className="font-sans uppercase text-cova-gold/60"
              style={{
                fontSize: "10px",
                letterSpacing: "0.3em",
              }}
            >
              {eyebrow}
            </p>

            {/* 2. 12px gap */}
            <div style={{ height: "12px" }} aria-hidden="true" />

            {/* 3. Document headline */}
            <h1
              className="font-serif text-cova-ivory"
              style={{
                fontSize: "clamp(28px, 5vw, 36px)",
                fontStyle: "normal",
                fontWeight: 400,
                lineHeight: 1.2,
              }}
            >
              {documentTitle}
            </h1>

            {/* 4. 24px gap */}
            <div style={{ height: "24px" }} aria-hidden="true" />

            {/* 5. Gold hairline rule — left-aligned */}
            <div
              className="bg-cova-gold/40"
              style={{ width: "32px", height: "1px" }}
              aria-hidden="true"
            />

            {/* 6. 64px gap (48px on mobile) */}
            <div
              className="hidden md:block"
              style={{ height: "64px" }}
              aria-hidden="true"
            />
            <div
              className="block md:hidden"
              style={{ height: "48px" }}
              aria-hidden="true"
            />

            {/* 7. Prose wrapper */}
            {/*
              dangerouslySetInnerHTML is intentional and safe here because
              htmlContent is sourced exclusively from Termly, a trusted
              legal-document platform. Never pass user-generated HTML to
              this prop.
            */}
            <div
              className="cova-prose"
              dangerouslySetInnerHTML={{ __html: proseContent }}
            />

            {/* 8. 48px gap after prose */}
            <div style={{ height: "48px" }} aria-hidden="true" />

            {/* 9. Closing gold hairline rule — centered */}
            <div className="flex justify-center" aria-hidden="true">
              <div
                className="bg-cova-gold/40"
                style={{ width: "32px", height: "1px" }}
              />
            </div>

            {/* 10. 24px gap */}
            <div style={{ height: "24px" }} aria-hidden="true" />

            {/* 11. Document metadata — centered */}
            <div className="flex flex-col items-center gap-[8px]">
              <p
                className="font-sans text-cova-ivory/40 uppercase text-center"
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.25em",
                }}
              >
                {metadataLine1}
              </p>
              <p
                className="font-sans text-cova-ivory/40 uppercase text-center"
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.25em",
                }}
              >
                EFFECTIVE {formattedEffectiveDate}
              </p>
            </div>

            {/* 12. 48px gap */}
            <div style={{ height: "48px" }} aria-hidden="true" />

            {/* 13. Return home link — centered */}
            <div className="flex justify-center">
              <a
                href="/"
                className="font-sans uppercase text-cova-ivory/40 transition-colors duration-200 ease-out hover:text-cova-ivory focus-visible:text-cova-ivory focus-visible:outline-none"
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.25em",
                }}
              >
                RETURN HOME — COVAINTERIOR.COM
              </a>
            </div>

          </div>
        </main>
      </div>
    </>
  );
};

export default LegalPage;
