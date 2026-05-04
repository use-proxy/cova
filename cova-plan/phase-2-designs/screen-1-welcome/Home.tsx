/**
 * Home.tsx — Cova Welcome Screen v5 (Centered Composition)
 *
 * DESIGN SYSTEM: "The Salon" — Phase 1 Canonical
 * bg: #0A1628 deep navy | gold: #C9A84C | ivory: #F8F6F1
 * EB Garamond (display serif) + Inter (functional sans)
 *
 * COMPOSITION: Fully centered, single vertical stack.
 * No right-anchoring. No vertical rule. Lots of negative space.
 *
 * VERTICAL RHYTHM:
 *   Wordmark:    top-left, 32px from edges (absolute)
 *   ↓ 80-120px
 *   Eyebrow:     centered, uppercase tracked, ivory 50%
 *   ↓ 32px
 *   Headline:    centered, 72px, two-line split
 *   ↓ 48px
 *   Subhead:     centered, italic serif 22px, ivory 70%
 *   ↓ 96px
 *   Diorama:     centered, 1100×560 (desktop)
 *   ↓ 80px
 *   CTA:         centered, "BEGIN →" text + gold underline
 *   ↓ 24px
 *   Microcopy:   centered, ivory 50%
 *   ↓ 96px+
 *   Footer:      bottom-right, 32px from edges (fixed)
 *
 * GOLD AUDIT (outside diorama): headline line 2 (gold) + CTA underline (gold) = 2 ✓
 */

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { CovaDiorama } from "@/components/CovaDiorama";

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = "#C9A84C";
const IVORY = "#F8F6F1";
const NAVY = "#0A1628";

// ─── Mobile hook ──────────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 900 : false
  );
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

// ─── Wordmark — top-left, 32px padding ────────────────────────────────────────
// "C O V A" EB Garamond Light tracked uppercase, ivory
// Horizontal rule 40px, 1px, ivory 30%

function CovaWordmark() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.70, ease: [0.4, 0, 0.2, 1] }}
      style={{
        position: "fixed",
        top: 32,
        left: 32,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 8,
      }}
    >
      <span style={{
        fontFamily: "'EB Garamond', Georgia, serif",
        fontSize: 15,
        fontWeight: 300,
        fontStyle: "normal",
        letterSpacing: "0.30em",
        textTransform: "uppercase",
        color: IVORY,
        lineHeight: 1,
      }}>
        COVA
      </span>
      <div style={{ width: 40, height: 1, background: "rgba(248,246,241,0.30)" }} />
    </motion.div>
  );
}

// ─── Eyebrow ──────────────────────────────────────────────────────────────────
// "ONBOARDING — STEP ONE" Inter 12px tracked 0.18em uppercase, ivory 50%

function Eyebrow() {
  return (
    <motion.p
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, delay: 0.08, ease: [0.4, 0, 0.2, 1] }}
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 12,
        fontWeight: 400,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "rgba(248,246,241,0.50)",
        margin: 0,
        lineHeight: 1,
        textAlign: "center",
      }}
    >
      Onboarding <span style={{ margin: "0 3px" }}>—</span> Step One
    </motion.p>
  );
}

// ─── Headline ─────────────────────────────────────────────────────────────────
// Line 1: "Discover the space" — ivory, EB Garamond Light 300, 72px
// Line 2: "that speaks to you." — gold #C9A84C, EB Garamond Italic 300, 72px
// Centered. Max-width 900px so it never clips.

function Headline({ isMobile }: { isMobile: boolean }) {
  const size = isMobile ? 42 : 72;
  return (
    <motion.h1
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.95, delay: 0.14, ease: [0.4, 0, 0.2, 1] }}
      style={{
        fontFamily: "'EB Garamond', Georgia, serif",
        fontSize: size,
        fontWeight: 300,
        lineHeight: 1.12,
        margin: 0,
        letterSpacing: "-0.01em",
        textAlign: "center",
        maxWidth: isMobile ? 380 : 900,
      }}
    >
      <span style={{ color: IVORY, display: "block", fontStyle: "normal" }}>
        Discover the space
      </span>
      <em style={{ color: GOLD, fontStyle: "italic", fontWeight: 300, display: "block" }}>
        that speaks to you.
      </em>
    </motion.h1>
  );
}

// ─── Subhead ──────────────────────────────────────────────────────────────────
// "Pick the rooms that feel like you."
// EB Garamond italic 22px, ivory 70%, centered

function Subhead({ isMobile }: { isMobile: boolean }) {
  return (
    <motion.p
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.80, delay: 0.22, ease: [0.4, 0, 0.2, 1] }}
      style={{
        fontFamily: "'EB Garamond', Georgia, serif",
        fontSize: isMobile ? 18 : 22,
        fontWeight: 400,
        fontStyle: "italic",
        lineHeight: 1.5,
        color: "rgba(248,246,241,0.70)",
        margin: 0,
        letterSpacing: "0.005em",
        textAlign: "center",
      }}
    >
      Pick the rooms that feel like you.
    </motion.p>
  );
}

// ─── CTA — Phase 1 text-with-underline ────────────────────────────────────────
// "BEGIN →" uppercase tracked Inter, ivory
// Gold underline 1px. Hover: 2px, brightens. Centered.

function TextCTA() {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.70, delay: 0.30, ease: [0.4, 0, 0.2, 1] }}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}
    >
      <button
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          outline: "none",
        }}
      >
        <span style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: hovered ? IVORY : "rgba(248,246,241,0.90)",
          lineHeight: 1,
          transition: "color 0.22s ease",
          display: "flex",
          alignItems: "center",
          gap: 9,
        }}>
          Begin
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
            <path
              d="M1 5h12M8 1l4 4-4 4"
              stroke={hovered ? IVORY : "rgba(248,246,241,0.90)"}
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transition: "stroke 0.22s ease" }}
            />
          </svg>
        </span>
        {/* Gold underline */}
        <div style={{
          width: "100%",
          height: hovered ? 2 : 1,
          background: hovered ? "#E2C06A" : GOLD,
          transition: "height 0.22s ease, background 0.22s ease",
        }} />
      </button>
    </motion.div>
  );
}

// ─── Microcopy ────────────────────────────────────────────────────────────────
// "Twelve picks. About 90 seconds." — centered, ivory 50%, Inter 12px

function Microcopy() {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.65, delay: 0.38 }}
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 12,
        fontWeight: 300,
        letterSpacing: "0.06em",
        color: "rgba(248,246,241,0.50)",
        margin: 0,
        textAlign: "center",
      }}
    >
      Twelve picks. About 90 seconds.
    </motion.p>
  );
}

// ─── Footer corner ────────────────────────────────────────────────────────────
// "STEP 1 — STYLE QUIZ" bottom-right, 32px padding, Inter 11px tracked

function FooterCorner() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, delay: 0.55 }}
      style={{
        position: "fixed",
        bottom: 32,
        right: 32,
        zIndex: 20,
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 11,
        fontWeight: 400,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "rgba(248,246,241,0.50)",
        lineHeight: 1,
        // Prevent overflow on narrow screens
        maxWidth: "calc(100vw - 64px)",
        textAlign: "right",
      }}
    >
      Step 1 <span style={{ margin: "0 2px" }}>—</span> Style Quiz
    </motion.div>
  );
}

// ─── Background ───────────────────────────────────────────────────────────────

function Background() {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      // Very faint centered warm glow — barely perceptible, adds depth
      background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(201,168,76,0.04) 0%, transparent 65%)",
      pointerEvents: "none",
      zIndex: 0,
    }} />
  );
}

// ─── Welcome screen ───────────────────────────────────────────────────────────

export default function Home() {
  const isMobile = useIsMobile();

  return (
    <div style={{
      minHeight: "100dvh",
      backgroundColor: NAVY,
      position: "relative",
      overflowX: "hidden",
    }}>
      <Background />

      {/* Wordmark — fixed top-left */}
      <CovaWordmark />

      {/* Footer — fixed bottom-right */}
      <FooterCorner />

      {/* ── CENTERED CONTENT STACK ─────────────────────────────────────────── */}
      <div style={{
        position: "relative",
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        // Top: 32px wordmark + 8px rule + gap to eyebrow = ~120px total
        paddingTop: isMobile ? 100 : 120,
        // Bottom: 96px+ before footer
        paddingBottom: isMobile ? 80 : 120,
        paddingLeft: isMobile ? 20 : 40,
        paddingRight: isMobile ? 20 : 40,
      }}>

        {/* Eyebrow */}
        <Eyebrow />

        {/* ↓ 32px */}
        <div style={{ height: isMobile ? 24 : 32 }} />

        {/* Headline */}
        <Headline isMobile={isMobile} />

        {/* ↓ 48px */}
        <div style={{ height: isMobile ? 28 : 48 }} />

        {/* Subhead */}
        <Subhead isMobile={isMobile} />

        {/* ↓ 96px */}
        <div style={{ height: isMobile ? 48 : 96 }} />

        {/* Diorama */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, delay: 0.26, ease: [0.4, 0, 0.2, 1] }}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <CovaDiorama isMobile={isMobile} />
        </motion.div>

        {/* ↓ 80px */}
        <div style={{ height: isMobile ? 40 : 80 }} />

        {/* CTA */}
        <TextCTA />

        {/* ↓ 24px */}
        <div style={{ height: 24 }} />

        {/* Microcopy */}
        <Microcopy />

      </div>
    </div>
  );
}
