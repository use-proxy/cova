"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  motion,
  useScroll,
  useTransform,
  useInView,
  AnimatePresence,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { Playfair_Display, DM_Sans } from "next/font/google";

// ─── Fonts ────────────────────────────────────────────────────────────────────
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  style: ["normal", "italic"],
  variable: "--font-playfair",
  display: "swap",
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-dm",
  display: "swap",
});

// ─── Design tokens ────────────────────────────────────────────────────────────
const NAVY = "#091829";
const GOLD = "#C9A84C";
const IVORY = "#F5F0E8";
const MUTED = "rgba(245,240,232,0.5)";
const DIM = "rgba(245,240,232,0.28)";

// ─── Images ───────────────────────────────────────────────────────────────────
// Smart room: a dark, modern gaming/media room clearly showing a wall-mounted TV,
// soundbar, ambient/smart lighting, and a gaming desk setup
const SMART_ROOM_URL = "/smart-room.jpg";

// For the shoppable room we use a wide, beautiful luxury living room
const SHOP_ROOM_URL =
  "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1800&q=90";

const HERO_URL =
  "https://images.unsplash.com/photo-1600210492493-0946911123ea?w=2000&q=90";
const BEFORE_URL = "/before-room.jpg";
const AFTER_URL = "/after-room.jpg";
const FINAL_URL =
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=2000&q=90";
const STYLE1 =
  "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=900&q=80";
const STYLE2 =
  "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=900&q=80";
const STYLE3 =
  "https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=900&q=80";
const STYLE4 =
  "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=900&q=80";
const T1 =
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80";
const T2 =
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80";
const T3 =
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&q=80";

// ─── Shimmer blur placeholder ─────────────────────────────────────────────────
const toB64 = (s: string) =>
  typeof window === "undefined"
    ? Buffer.from(s).toString("base64")
    : window.btoa(unescape(encodeURIComponent(s)));
const blurSvg = (w = 8, h = 6) =>
  `data:image/svg+xml;base64,${toB64(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="#0d2137"/></svg>`)}`;

// ─── Shared helpers ───────────────────────────────────────────────────────────
function FadeUp({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 60 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-4 mb-8">
      <span className="w-12 h-px" style={{ backgroundColor: GOLD }} />
      <span
        className="text-sm tracking-[0.35em] uppercase"
        style={{ color: GOLD, fontFamily: "var(--font-dm)", fontWeight: 500 }}
      >
        {children}
      </span>
      <span className="w-12 h-px" style={{ backgroundColor: GOLD }} />
    </div>
  );
}

function SectionLabelLeft({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 mb-8">
      <span className="w-10 h-px" style={{ backgroundColor: GOLD }} />
      <span
        className="text-sm tracking-[0.3em] uppercase"
        style={{ color: GOLD, fontFamily: "var(--font-dm)", fontWeight: 500 }}
      >
        {children}
      </span>
    </div>
  );
}

function GoldRule({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ height: 1, backgroundColor: GOLD, transformOrigin: "left" }}
      initial={{ scaleX: 0 }}
      animate={inView ? { scaleX: 1 } : {}}
      transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}

function CTAButton({
  href,
  children,
  large = false,
  outline = false,
}: {
  href: string;
  children: React.ReactNode;
  large?: boolean;
  outline?: boolean;
}) {
  return (
    <Link href={href}>
      <motion.span
        className={`inline-flex items-center gap-3 cursor-pointer relative overflow-hidden ${large ? "px-14 py-6 text-lg" : "px-9 py-4 text-base"}`}
        style={{
          fontFamily: "var(--font-dm)",
          fontWeight: 500,
          letterSpacing: "0.1em",
          color: outline ? GOLD : NAVY,
          border: `1px solid ${GOLD}`,
          backgroundColor: outline ? "transparent" : GOLD,
        }}
        whileHover="hover"
        initial="rest"
      >
        <motion.span
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(105deg,transparent 35%,rgba(255,255,255,0.22) 50%,transparent 65%)`,
            x: "-120%",
          }}
          variants={{
            rest: { x: "-120%" },
            hover: {
              x: "220%",
              transition: { duration: 0.6, ease: "easeInOut" },
            },
          }}
        />
        <span className="relative z-10 tracking-widest uppercase">
          {children}
        </span>
        <motion.span
          className="relative z-10 text-lg"
          variants={{
            rest: { x: 0 },
            hover: { x: 7, transition: { duration: 0.3 } },
          }}
        >
          →
        </motion.span>
      </motion.span>
    </Link>
  );
}

// ─── Noise + Orbs + Cursor ────────────────────────────────────────────────────
function Noise() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 opacity-[0.02]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize: "160px 160px",
      }}
    />
  );
}

function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {[
        {
          w: 800,
          h: 800,
          top: "-18%",
          right: "-22%",
          color: "rgba(201,168,76,0.07)",
          dur: 10,
          delay: 0,
        },
        {
          w: 1000,
          h: 1000,
          bottom: "5%",
          left: "-28%",
          color: "rgba(201,168,76,0.04)",
          dur: 15,
          delay: 3,
        },
        {
          w: 600,
          h: 600,
          top: "38%",
          right: "8%",
          color: "rgba(201,168,76,0.05)",
          dur: 12,
          delay: 6,
        },
      ].map((o, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: o.w,
            height: o.h,
            top: o.top,
            right: o.right,
            bottom: o.bottom,
            left: o.left,
            background: `radial-gradient(circle,${o.color} 0%,transparent 70%)`,
          }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 1, 0.5] }}
          transition={{
            duration: o.dur,
            repeat: Infinity,
            ease: "easeInOut",
            delay: o.delay,
          }}
        />
      ))}
    </div>
  );
}

function CursorGlow() {
  const x = useMotionValue(-500);
  const y = useMotionValue(-500);
  const sx = useSpring(x, { stiffness: 55, damping: 20 });
  const sy = useSpring(y, { stiffness: 55, damping: 20 });
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      x.set(e.clientX - 300);
      y.set(e.clientY - 300);
    };
    window.addEventListener("mousemove", fn);
    return () => window.removeEventListener("mousemove", fn);
  }, [x, y]);
  return (
    <motion.div
      className="pointer-events-none fixed z-30 rounded-full hidden lg:block"
      style={{
        width: 600,
        height: 600,
        x: sx,
        y: sy,
        background: `radial-gradient(circle,rgba(201,168,76,0.05) 0%,transparent 70%)`,
      }}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NAVBAR
// ═══════════════════════════════════════════════════════════════════════════════
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);
  return (
    <motion.nav
      className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-8 md:px-16 py-6"
      style={{
        backgroundColor: scrolled ? "rgba(9,24,41,0.95)" : "transparent",
        backdropFilter: scrolled ? "blur(28px)" : "none",
        borderBottom: scrolled ? `1px solid rgba(201,168,76,0.1)` : "none",
        transition: "all 0.6s ease",
      }}
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
    >
      <div className="flex items-center gap-3">
        <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
          <path
            d="M17 2L32 10V24L17 32L2 24V10L17 2Z"
            stroke={GOLD}
            strokeWidth="1.5"
            fill="none"
          />
          <path
            d="M17 9L25 13.5V21L17 25.5L9 21V13.5L17 9Z"
            fill={GOLD}
            fillOpacity="0.2"
          />
          <circle cx="17" cy="17" r="3" fill={GOLD} />
        </svg>
        <span
          className="text-2xl tracking-[0.15em] uppercase"
          style={{
            fontFamily: "var(--font-playfair)",
            color: IVORY,
            fontWeight: 600,
          }}
        >
          Cova
        </span>
      </div>
      <div className="hidden md:flex items-center gap-10">
        {["How It Works", "Styles", "Smart", "Pricing"].map((item) => (
          <motion.a
            key={item}
            href="#"
            className="text-base tracking-wide"
            style={{ fontFamily: "var(--font-dm)", color: MUTED }}
            whileHover={{ color: IVORY, transition: { duration: 0.2 } }}
          >
            {item}
          </motion.a>
        ))}
      </div>
      <Link href="/auth">
        <motion.span
          className="hidden md:inline-flex items-center gap-2 text-sm tracking-[0.18em] uppercase px-7 py-3.5 cursor-pointer"
          style={{
            fontFamily: "var(--font-dm)",
            color: GOLD,
            border: `1px solid rgba(201,168,76,0.4)`,
            fontWeight: 500,
          }}
          whileHover={{
            borderColor: GOLD,
            backgroundColor: "rgba(201,168,76,0.1)",
            transition: { duration: 0.25 },
          }}
        >
          Start Free
        </motion.span>
      </Link>
    </motion.nav>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HERO
// ═══════════════════════════════════════════════════════════════════════════════
const WORDS = ["Instantly.", "Beautifully.", "Precisely.", "Effortlessly."];

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const imgY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const fade = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const [wi, setWi] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setWi((i) => (i + 1) % WORDS.length), 2800);
    return () => clearInterval(t);
  }, []);

  return (
    <section
      ref={ref}
      className="relative h-screen min-h-[820px] flex items-center overflow-hidden"
    >
      <motion.div className="absolute inset-0 z-0" style={{ y: imgY }}>
        <div className="absolute inset-0 scale-110">
          <Image
            src={HERO_URL}
            alt="Luxury interior"
            fill
            priority
            className="object-cover"
            placeholder="blur"
            blurDataURL={blurSvg(16, 9)}
          />
        </div>
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(105deg, rgba(9,24,41,0.92) 0%, rgba(9,24,41,0.72) 45%, rgba(9,24,41,0.3) 100%),
                       linear-gradient(to bottom, rgba(9,24,41,0.15) 0%, transparent 25%, rgba(9,24,41,0.7) 75%, rgba(9,24,41,1) 100%)`,
          }}
        />
      </motion.div>

      {/* Grid lines */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        {[20, 40, 60, 80].map((p) => (
          <motion.div
            key={p}
            className="absolute top-0 bottom-0 w-px"
            style={{ left: `${p}%`, backgroundColor: `rgba(201,168,76,0.03)` }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 2.5, delay: 0.8 + p / 120 }}
          />
        ))}
        <motion.div
          className="absolute w-px"
          style={{
            right: "22%",
            top: "18%",
            height: "45%",
            backgroundColor: `rgba(201,168,76,0.3)`,
            transformOrigin: "top",
          }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 1.6, delay: 2.2, ease: [0.22, 1, 0.36, 1] }}
        />
        <motion.div
          className="absolute h-px"
          style={{
            right: "22%",
            top: "18%",
            width: "8%",
            backgroundColor: `rgba(201,168,76,0.3)`,
            transformOrigin: "right",
          }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1.2, delay: 2.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      <motion.div
        className="relative z-20 w-full max-w-[1440px] mx-auto px-8 md:px-20"
        style={{ opacity: fade }}
      >
        <motion.div
          className="flex items-center gap-5 mb-12"
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="w-16 h-px" style={{ backgroundColor: GOLD }} />
          <span
            className="text-base tracking-[0.4em] uppercase"
            style={{
              color: GOLD,
              fontFamily: "var(--font-dm)",
              fontWeight: 500,
            }}
          >
            AI Interior Design Studio
          </span>
        </motion.div>

        <div className="overflow-visible">
          <motion.h1
            className="font-bold leading-[0.92]"
            style={{
              fontFamily: "var(--font-playfair)",
              color: IVORY,
              fontSize: "clamp(56px, 9vw, 128px)",
            }}
            initial={{ y: 140 }}
            animate={{ y: 0 }}
            transition={{ duration: 1.1, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            Design the
          </motion.h1>
        </div>
        <div className="overflow-visible mb-6">
          <motion.h1
            className="font-bold italic leading-[0.92]"
            style={{
              fontFamily: "var(--font-playfair)",
              color: GOLD,
              fontSize: "clamp(56px, 9vw, 128px)",
            }}
            initial={{ y: 140 }}
            animate={{ y: 0 }}
            transition={{
              duration: 1.1,
              delay: 0.55,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            Home You Deserve
          </motion.h1>
        </div>

        {/* Rotating word — fixed overflow */}
        <div
          className="mb-14"
          style={{ height: "clamp(44px, 6vw, 88px)", overflow: "visible" }}
        >
          <AnimatePresence mode="wait">
            <motion.p
              key={wi}
              style={{
                fontFamily: "var(--font-playfair)",
                color: `rgba(245,240,232,0.52)`,
                fontSize: "clamp(36px, 5vw, 72px)",
                fontWeight: 300,
              }}
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -80, opacity: 0 }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            >
              {WORDS[wi]}
            </motion.p>
          </AnimatePresence>
        </div>

        <motion.p
          className="mb-16 leading-relaxed max-w-3xl"
          style={{
            fontFamily: "var(--font-dm)",
            color: `rgba(245,240,232,0.72)`,
            fontWeight: 300,
            fontSize: "clamp(18px, 2vw, 26px)",
          }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.1, ease: [0.22, 1, 0.36, 1] }}
        >
          Upload a photo of your room. Choose your aesthetic. Receive a
          photorealistic AI redesign in 60 seconds — then shop every single item
          in the render.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row items-start gap-6"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <CTAButton href="/auth" large>
            Start Designing
          </CTAButton>
          <motion.a
            href="#how-it-works"
            className="flex items-center gap-3 mt-2"
            style={{ fontFamily: "var(--font-dm)", color: MUTED, fontSize: 18 }}
            whileHover={{ color: IVORY }}
          >
            <span>See how it works</span>
            <motion.span
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            >
              ↓
            </motion.span>
          </motion.a>
        </motion.div>
      </motion.div>

      <motion.div
        className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.5, duration: 1 }}
      >
        <span
          className="text-xs tracking-[0.3em] uppercase"
          style={{ color: DIM, fontFamily: "var(--font-dm)" }}
        >
          Scroll
        </span>
        <motion.div
          className="w-px h-20"
          style={{
            backgroundColor: `rgba(201,168,76,0.45)`,
            transformOrigin: "top",
          }}
          animate={{ scaleY: [0, 1, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATS BAR
// ═══════════════════════════════════════════════════════════════════════════════
function StatsBar() {
  const stats = [
    { value: "60s", label: "First Render" },
    { value: "40+", label: "Design Styles" },
    { value: "500+", label: "Retail Partners" },
    { value: "Free", label: "To Start" },
  ];
  return (
    <section
      className="relative z-10 py-12 border-y"
      style={{
        borderColor: `rgba(201,168,76,0.15)`,
        backgroundColor: "rgba(9,24,41,0.9)",
        backdropFilter: "blur(16px)",
      }}
    >
      <div className="max-w-[1440px] mx-auto px-8 md:px-20 grid grid-cols-2 md:grid-cols-4 gap-0">
        {stats.map((s, i) => (
          <FadeUp key={s.label} delay={i * 0.1}>
            <div
              className="text-center py-6 px-4"
              style={{
                borderRight: i < 3 ? `1px solid rgba(201,168,76,0.1)` : "none",
              }}
            >
              <div
                className="font-bold mb-2"
                style={{
                  fontFamily: "var(--font-playfair)",
                  color: GOLD,
                  fontSize: "clamp(40px, 4vw, 64px)",
                }}
              >
                {s.value}
              </div>
              <div
                className="text-base tracking-[0.2em] uppercase"
                style={{ fontFamily: "var(--font-dm)", color: MUTED }}
              >
                {s.label}
              </div>
            </div>
          </FadeUp>
        ))}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOW IT WORKS
// ═══════════════════════════════════════════════════════════════════════════════
function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Take the Style Quiz",
      desc: "Answer a few curated questions about your taste, lifestyle, and budget. Our AI builds a precise aesthetic profile unique to you — no design experience needed.",
      icon: (
        <svg viewBox="0 0 64 64" fill="none" className="w-16 h-16">
          <circle cx="32" cy="32" r="28" stroke={GOLD} strokeWidth="1.5" />
          <path
            d="M22 32h20M32 22v20"
            stroke={GOLD}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
    {
      num: "02",
      title: "AI Redesigns Your Room",
      desc: "Upload any photo of your space. In 60 seconds, receive a photorealistic render transformed to your exact aesthetic — walls, furniture, lighting, textures, all of it.",
      icon: (
        <svg viewBox="0 0 64 64" fill="none" className="w-16 h-16">
          <rect
            x="8"
            y="14"
            width="48"
            height="36"
            rx="3"
            stroke={GOLD}
            strokeWidth="1.5"
          />
          <path
            d="M8 40l14-14 10 10 12-12 14 16"
            stroke={GOLD}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="22" cy="26" r="5" stroke={GOLD} strokeWidth="1.5" />
        </svg>
      ),
    },
    {
      num: "03",
      title: "Shop the Entire Room",
      desc: "Every item in your render is shoppable. Tap any piece to see exact matches from West Elm, CB2, Restoration Hardware, and 500+ retailers at every price point.",
      icon: (
        <svg viewBox="0 0 64 64" fill="none" className="w-16 h-16">
          <path
            d="M14 18h8l8 24h28l8-18H28"
            stroke={GOLD}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="30" cy="48" r="4" fill={GOLD} />
          <circle cx="50" cy="48" r="4" fill={GOLD} />
        </svg>
      ),
    },
  ];

  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });
  const lineW = useTransform(scrollYProgress, [0.15, 0.75], ["0%", "100%"]);

  return (
    <section
      id="how-it-works"
      ref={containerRef}
      className="relative z-10 py-48 overflow-hidden"
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 50% 50%,rgba(201,168,76,0.05) 0%,transparent 65%)`,
        }}
      />
      <div className="max-w-[1440px] mx-auto px-8 md:px-20">
        <FadeUp className="mb-28 text-center">
          <SectionLabel>The Process</SectionLabel>
          <h2
            className="font-bold leading-tight"
            style={{
              fontFamily: "var(--font-playfair)",
              color: IVORY,
              fontSize: "clamp(44px, 6.5vw, 96px)",
            }}
          >
            Three steps to your
            <br />
            <span className="italic" style={{ color: GOLD }}>
              dream interior
            </span>
          </h2>
          <p
            className="mt-8 mx-auto leading-relaxed max-w-2xl"
            style={{
              fontFamily: "var(--font-dm)",
              color: MUTED,
              fontSize: "clamp(17px, 1.6vw, 22px)",
              fontWeight: 300,
            }}
          >
            From blank room to fully furnished, styled, and shoppable — in under
            a minute.
          </p>
        </FadeUp>

        <div className="hidden md:block relative mb-24">
          <div
            className="h-px w-full"
            style={{ backgroundColor: `rgba(201,168,76,0.1)` }}
          />
          <motion.div
            className="absolute top-0 left-0 h-px"
            style={{ backgroundColor: GOLD, width: lineW }}
          />
        </div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-10">
          {steps.map((step, i) => (
            <FadeUp key={step.num} delay={i * 0.15}>
              <motion.div
                className="group relative p-10 lg:p-14 h-full flex flex-col"
                style={{ border: `1px solid rgba(201,168,76,0.12)` }}
                whileHover={{
                  borderColor: `rgba(201,168,76,0.45)`,
                  backgroundColor: "rgba(201,168,76,0.03)",
                  y: -8,
                  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
                }}
              >
                <div
                  className="absolute -top-10 -left-3 select-none pointer-events-none font-bold leading-none"
                  style={{
                    fontFamily: "var(--font-playfair)",
                    color: `rgba(201,168,76,0.07)`,
                    fontSize: "clamp(80px, 10vw, 140px)",
                  }}
                >
                  {step.num}
                </div>
                <motion.div
                  className="mb-10"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ duration: 0.4 }}
                >
                  {step.icon}
                </motion.div>
                <h3
                  className="font-semibold mb-5"
                  style={{
                    fontFamily: "var(--font-playfair)",
                    color: IVORY,
                    fontSize: "clamp(22px, 2vw, 30px)",
                  }}
                >
                  {step.title}
                </h3>
                <p
                  className="leading-relaxed flex-1"
                  style={{
                    fontFamily: "var(--font-dm)",
                    color: MUTED,
                    fontSize: "clamp(15px, 1.2vw, 18px)",
                  }}
                >
                  {step.desc}
                </p>
                <motion.div
                  className="absolute bottom-0 right-0 w-12 h-12"
                  style={{
                    borderBottom: `1.5px solid ${GOLD}`,
                    borderRight: `1.5px solid ${GOLD}`,
                    opacity: 0,
                  }}
                  whileHover={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                />
              </motion.div>
            </FadeUp>
          ))}
        </div>

        <FadeUp delay={0.5} className="mt-24 text-center">
          <CTAButton href="/auth" large>
            Begin Your Redesign
          </CTAButton>
        </FadeUp>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BEFORE / AFTER
// ═══════════════════════════════════════════════════════════════════════════════
function BeforeAfter() {
  const [pct, setPct] = useState(50);
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const move = useCallback((cx: number) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPct(Math.min(100, Math.max(0, ((cx - r.left) / r.width) * 100)));
  }, []);

  return (
    <section className="relative z-10 py-48">
      <div className="max-w-[1440px] mx-auto px-8 md:px-20">
        <div className="grid lg:grid-cols-2 gap-16 items-end mb-20">
          <FadeUp>
            <SectionLabelLeft>Transformation</SectionLabelLeft>
            <h2
              className="font-bold leading-tight"
              style={{
                fontFamily: "var(--font-playfair)",
                color: IVORY,
                fontSize: "clamp(40px, 5.5vw, 80px)",
              }}
            >
              The same room.
              <br />
              <span className="italic" style={{ color: GOLD }}>
                Entirely reimagined.
              </span>
            </h2>
          </FadeUp>
          <FadeUp delay={0.15}>
            <p
              className="leading-relaxed"
              style={{
                fontFamily: "var(--font-dm)",
                color: MUTED,
                fontSize: "clamp(16px, 1.4vw, 21px)",
                fontWeight: 300,
              }}
            >
              Drag the slider to reveal your AI transformation. Every surface,
              every texture, every piece of furniture — redesigned to your taste
              in 60 seconds.
            </p>
          </FadeUp>
        </div>

        <FadeUp delay={0.2}>
          <div
            ref={ref}
            className="relative w-full overflow-hidden select-none cursor-col-resize"
            style={{
              aspectRatio: "21/9",
              border: `1px solid rgba(201,168,76,0.22)`,
              maxHeight: "72vh",
            }}
            onMouseDown={() => setDrag(true)}
            onMouseUp={() => setDrag(false)}
            onMouseLeave={() => setDrag(false)}
            onMouseMove={(e) => {
              if (drag) move(e.clientX);
            }}
            onTouchMove={(e) => move(e.touches[0].clientX)}
          >
            {/* AFTER */}
            <div className="absolute inset-0">
              <Image
                src={AFTER_URL}
                alt="After"
                fill
                className="object-cover"
                placeholder="blur"
                blurDataURL={blurSvg(16, 9)}
              />
              <div
                className="absolute bottom-8 right-8 px-5 py-2.5 text-sm tracking-[0.18em] uppercase"
                style={{
                  fontFamily: "var(--font-dm)",
                  color: IVORY,
                  backgroundColor: "rgba(9,24,41,0.8)",
                  border: `1px solid rgba(201,168,76,0.4)`,
                }}
              >
                After · AI Redesign
              </div>
            </div>
            {/* BEFORE */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${pct}%` }}
            >
              <div
                className="absolute inset-0"
                style={{ width: `${(100 / Math.max(pct, 0.1)) * 100}%` }}
              >
                <Image
                  src={BEFORE_URL}
                  alt="Before"
                  fill
                  className="object-cover"
                  placeholder="blur"
                  blurDataURL={blurSvg(16, 9)}
                />
              </div>
              <div
                className="absolute bottom-8 left-8 px-5 py-2.5 text-sm tracking-[0.18em] uppercase"
                style={{
                  fontFamily: "var(--font-dm)",
                  color: IVORY,
                  backgroundColor: "rgba(9,24,41,0.8)",
                  border: `1px solid rgba(201,168,76,0.4)`,
                }}
              >
                Before
              </div>
            </div>
            {/* Handle */}
            <div
              className="absolute top-0 bottom-0 z-20 flex items-center justify-center"
              style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
            >
              <div className="w-px h-full" style={{ backgroundColor: GOLD }} />
              <motion.div
                className="absolute flex items-center justify-center w-16 h-16 rounded-full"
                style={{
                  backgroundColor: NAVY,
                  border: `2px solid ${GOLD}`,
                  boxShadow: `0 0 40px rgba(201,168,76,0.5)`,
                }}
                animate={drag ? { scale: 1.2 } : { scale: 1 }}
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7">
                  <path
                    d="M8 12H16M8 12L5 9M8 12L5 15M16 12L19 9M16 12L19 15"
                    stroke={GOLD}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </motion.div>
            </div>
          </div>
        </FadeUp>

        <FadeUp
          delay={0.4}
          className="mt-8 flex items-center justify-center gap-4"
        >
          <motion.div
            animate={{ x: [-10, 10, -10] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
              <path
                d="M8 12H16M8 12L5 9M8 12L5 15M16 12L19 9M16 12L19 15"
                stroke={GOLD}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </motion.div>
          <span
            className="text-sm tracking-[0.22em] uppercase"
            style={{ fontFamily: "var(--font-dm)", color: MUTED }}
          >
            Drag to compare
          </span>
        </FadeUp>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHOPPABLE ROOM — full-bleed immersive
// ═══════════════════════════════════════════════════════════════════════════════
const HOTSPOTS = [
  {
    id: 1,
    x: 18,
    y: 62,
    label: "Linen Sofa",
    price: "$2,490",
    retailer: "West Elm",
    desc: "Deep-seat performance linen, natural oak legs",
  },
  {
    id: 2,
    x: 42,
    y: 76,
    label: "Marble Coffee Table",
    price: "$890",
    retailer: "CB2",
    desc: "Calacatta marble top, brushed brass frame",
  },
  {
    id: 3,
    x: 70,
    y: 42,
    label: "Arc Floor Lamp",
    price: "$340",
    retailer: "Rejuvenation",
    desc: "Matte black, dimmable warm LED",
  },
  {
    id: 4,
    x: 58,
    y: 26,
    label: "Abstract Art Print",
    price: "$195",
    retailer: "Society6",
    desc: "24×36 fine art print, museum-quality paper",
  },
  {
    id: 5,
    x: 30,
    y: 85,
    label: "Wool Area Rug",
    price: "$1,200",
    retailer: "Rugs USA",
    desc: "8×10 hand-tufted New Zealand wool",
  },
  {
    id: 6,
    x: 82,
    y: 68,
    label: "Accent Chair",
    price: "$680",
    retailer: "Article",
    desc: "Boucle upholstery, walnut base",
  },
];

function ShoppableRoom() {
  const [active, setActive] = useState<number | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const imgScale = useTransform(
    scrollYProgress,
    [0, 0.5, 1],
    [1.08, 1.02, 1.08],
  );

  return (
    <section
      ref={sectionRef}
      className="relative z-10 overflow-hidden"
      style={{ minHeight: "100vh" }}
    >
      {/* Full-bleed background image with parallax */}
      <motion.div className="absolute inset-0 z-0" style={{ scale: imgScale }}>
        <Image
          src={SHOP_ROOM_URL}
          alt="Shoppable room"
          fill
          className="object-cover"
          placeholder="blur"
          blurDataURL={blurSvg(16, 9)}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to right, rgba(9,24,41,0.95) 0%, rgba(9,24,41,0.6) 45%, rgba(9,24,41,0.15) 100%),
                       linear-gradient(to bottom, rgba(9,24,41,0.5) 0%, transparent 30%, transparent 70%, rgba(9,24,41,0.8) 100%)`,
          }}
        />
      </motion.div>

      <div className="relative z-10 max-w-[1440px] mx-auto px-8 md:px-20 py-48 grid lg:grid-cols-2 gap-20 items-center min-h-screen">
        {/* Left: text */}
        <FadeUp>
          <SectionLabelLeft>Shoppable Renders</SectionLabelLeft>
          <h2
            className="font-bold leading-tight mb-8"
            style={{
              fontFamily: "var(--font-playfair)",
              color: IVORY,
              fontSize: "clamp(40px, 5.5vw, 82px)",
            }}
          >
            Every item in your render is{" "}
            <span className="italic" style={{ color: GOLD }}>
              for sale.
            </span>
          </h2>
          <p
            className="leading-relaxed mb-12"
            style={{
              fontFamily: "var(--font-dm)",
              color: MUTED,
              fontSize: "clamp(16px, 1.4vw, 21px)",
              fontWeight: 300,
            }}
          >
            Tap any hotspot in your AI render to instantly see exact product
            matches, alternatives at every price point, and one-click links to
            500+ premium retailers.
          </p>

          {/* Active hotspot detail */}
          <AnimatePresence mode="wait">
            {active !== null ? (
              <motion.div
                key={active}
                className="p-8 mb-10"
                style={{
                  border: `1px solid rgba(201,168,76,0.4)`,
                  backgroundColor: "rgba(9,24,41,0.85)",
                  backdropFilter: "blur(20px)",
                }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
              >
                {(() => {
                  const h = HOTSPOTS.find((h) => h.id === active)!;
                  return (
                    <>
                      <p
                        className="text-sm tracking-[0.2em] uppercase mb-2"
                        style={{ fontFamily: "var(--font-dm)", color: GOLD }}
                      >
                        {h.retailer}
                      </p>
                      <p
                        className="font-semibold mb-2"
                        style={{
                          fontFamily: "var(--font-playfair)",
                          color: IVORY,
                          fontSize: 28,
                        }}
                      >
                        {h.label}
                      </p>
                      <p
                        className="mb-3"
                        style={{
                          fontFamily: "var(--font-dm)",
                          color: MUTED,
                          fontSize: 16,
                        }}
                      >
                        {h.desc}
                      </p>
                      <p
                        className="font-bold mb-6"
                        style={{
                          fontFamily: "var(--font-playfair)",
                          color: GOLD,
                          fontSize: 36,
                        }}
                      >
                        {h.price}
                      </p>
                      <motion.button
                        className="px-8 py-3.5 text-sm tracking-widest uppercase"
                        style={{
                          fontFamily: "var(--font-dm)",
                          color: NAVY,
                          backgroundColor: GOLD,
                          fontWeight: 600,
                        }}
                        whileHover={{ opacity: 0.88 }}
                      >
                        Shop Now →
                      </motion.button>
                    </>
                  );
                })()}
              </motion.div>
            ) : (
              <motion.div
                key="hint"
                className="p-8 mb-10"
                style={{
                  border: `1px solid rgba(201,168,76,0.15)`,
                  backgroundColor: "rgba(9,24,41,0.5)",
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <p
                  className="text-base"
                  style={{ fontFamily: "var(--font-dm)", color: MUTED }}
                >
                  ✦ Tap any glowing hotspot in the room to explore the product
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-wrap gap-3">
            {[
              "West Elm",
              "RH",
              "CB2",
              "Crate & Barrel",
              "Pottery Barn",
              "Article",
            ].map((r) => (
              <span
                key={r}
                className="px-4 py-2 text-sm tracking-wide"
                style={{
                  fontFamily: "var(--font-dm)",
                  color: MUTED,
                  border: `1px solid rgba(201,168,76,0.18)`,
                }}
              >
                {r}
              </span>
            ))}
          </div>
        </FadeUp>

        {/* Right: interactive room image */}
        <FadeUp delay={0.2}>
          <div className="relative" style={{ aspectRatio: "4/3" }}>
            {/* 3D tilt wrapper */}
            <motion.div
              className="absolute inset-0 overflow-hidden"
              style={{
                border: `1px solid rgba(201,168,76,0.25)`,
                transformStyle: "preserve-3d",
              }}
              whileHover={{
                rotateY: -3,
                rotateX: 2,
                scale: 1.015,
                transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
              }}
            >
              <Image
                src={SHOP_ROOM_URL}
                alt="Shoppable room"
                fill
                className="object-cover"
                placeholder="blur"
                blurDataURL={blurSvg(16, 12)}
              />
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(135deg,rgba(9,24,41,0.3) 0%,transparent 55%)`,
                }}
              />

              {/* Hotspots */}
              {HOTSPOTS.map((h) => (
                <div
                  key={h.id}
                  className="absolute z-10"
                  style={{
                    left: `${h.x}%`,
                    top: `${h.y}%`,
                    transform: "translate(-50%,-50%)",
                  }}
                >
                  <motion.button
                    className="relative flex items-center justify-center w-11 h-11 rounded-full cursor-pointer"
                    style={{
                      backgroundColor:
                        active === h.id ? GOLD : "rgba(9,24,41,0.9)",
                      border: `2px solid ${GOLD}`,
                      boxShadow:
                        active === h.id
                          ? `0 0 25px rgba(201,168,76,0.7)`
                          : "none",
                    }}
                    whileHover={{ scale: 1.3 }}
                    onClick={() => setActive(active === h.id ? null : h.id)}
                  >
                    <motion.span
                      className="absolute inset-0 rounded-full"
                      style={{ border: `1.5px solid ${GOLD}` }}
                      animate={{ scale: [1, 2.2], opacity: [0.9, 0] }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeOut",
                      }}
                    />
                    <span
                      style={{
                        color: active === h.id ? NAVY : GOLD,
                        fontSize: 20,
                        fontWeight: 700,
                        lineHeight: 1,
                      }}
                    >
                      +
                    </span>
                  </motion.button>
                </div>
              ))}

              {/* Corner accents */}
              {[
                ["top-3 left-3", "border-t border-l"],
                ["top-3 right-3", "border-t border-r"],
                ["bottom-3 left-3", "border-b border-l"],
                ["bottom-3 right-3", "border-b border-r"],
              ].map(([pos, cls]) => (
                <div
                  key={pos}
                  className={`absolute w-8 h-8 ${pos} ${cls}`}
                  style={{ borderColor: `rgba(201,168,76,0.5)` }}
                />
              ))}
            </motion.div>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART FEATURES — accurate hotspot highlights on a real room image
// ═══════════════════════════════════════════════════════════════════════════════
// Using: https://images.unsplash.com/photo-1593998066526-65fcab14bcc4
// Dark modern gaming/media room. Composition zones:
//   TV: large wall-mounted display, upper-center, roughly x:22-78%, y:10-52%
//   Soundbar: thin horizontal bar directly below TV, roughly x:26-74%, y:52-59%
//   Lighting: ambient LED strip / ceiling glow across the top, x:0-100%, y:0-11%
//   Gaming: desk + chair + monitor in lower-left, roughly x:4-46%, y:60-96%
const GOLD_GLOW = "rgba(201,168,76,0.5)";
const GOLD_BORDER = "rgba(201,168,76,0.95)";
const GOLD_SCAN = "rgba(201,168,76,0.8)";

const SMART_ITEMS = [
  {
    id: "tv",
    label: "Smart TV",
    sub: 'LG OLED · 77" · Wall-mounted',
    glowColor: GOLD_GLOW,
    borderColor: GOLD_BORDER,
    scanColor: GOLD_SCAN,
    // Dark screen centered on the wall
    zone: { left: "28%", top: "38%", width: "44%", height: "32%" },
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <rect
          x="3"
          y="5"
          width="34"
          height="24"
          rx="2.5"
          stroke={GOLD}
          strokeWidth="1.5"
        />
        <path
          d="M13 33h14M20 29v4"
          stroke={GOLD}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <rect
          x="7"
          y="9"
          width="26"
          height="16"
          rx="1"
          fill={GOLD}
          fillOpacity="0.12"
        />
      </svg>
    ),
    desc: "Cova integrates your preferred display size, brand, and mount style directly into the render — wall-recessed, floating, or gallery-framed. We match the bezel finish to your room palette.",
  },
  {
    id: "soundbar",
    label: "Smart Sound Bar",
    sub: "Sonos Arc · Dolby Atmos",
    glowColor: GOLD_GLOW,
    borderColor: GOLD_BORDER,
    scanColor: GOLD_SCAN,
    // Slim unit directly below the TV
    zone: { left: "30%", top: "70%", width: "40%", height: "6%" },
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <rect
          x="4"
          y="15"
          width="32"
          height="10"
          rx="5"
          stroke={GOLD}
          strokeWidth="1.5"
        />
        <circle cx="12" cy="20" r="2" fill={GOLD} />
        <circle cx="20" cy="20" r="2" fill={GOLD} />
        <circle cx="28" cy="20" r="2" fill={GOLD} />
        <path
          d="M8 11c3-3 21-3 24 0M6 29c3 3 25 3 28 0"
          stroke={GOLD}
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.45"
        />
      </svg>
    ),
    desc: "Sonos, Bose, or Samsung — your sound bar is placed, styled, and colour-matched to your room palette automatically. We render it at the exact correct scale relative to your TV.",
  },
  {
    id: "lighting",
    label: "Smart Lighting",
    sub: "Philips Hue · Scene-aware",
    glowColor: GOLD_GLOW,
    borderColor: GOLD_BORDER,
    scanColor: GOLD_SCAN,
    // Full amber LED ceiling strip across the top
    zone: { left: "0%", top: "0%", width: "100%", height: "18%" },
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <circle cx="20" cy="16" r="8" stroke={GOLD} strokeWidth="1.5" />
        <path
          d="M20 24v6M16 28h8"
          stroke={GOLD}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M20 4V2M20 30v2M4 16H2M38 16h-2M8 8L6 6M34 26l-2-2M8 24L6 26M34 8l-2 2"
          stroke={GOLD}
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>
    ),
    desc: "Philips Hue, Nanoleaf, and LIFX scenes are rendered into your space — warm, cool, or colour-shifting — exactly as they'd look at night. We simulate the actual light temperature and spread.",
  },
  {
    id: "gaming",
    label: "Gaming Setup",
    sub: "Custom desk · RGB · Dual monitors",
    glowColor: GOLD_GLOW,
    borderColor: GOLD_BORDER,
    scanColor: GOLD_SCAN,
    // Left-side: dual monitors, desk, and chair
    zone: { left: "2%", top: "42%", width: "28%", height: "45%" },
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <rect
          x="4"
          y="12"
          width="32"
          height="18"
          rx="5"
          stroke={GOLD}
          strokeWidth="1.5"
        />
        <path
          d="M13 21h6M16 18v6"
          stroke={GOLD}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="26" cy="20" r="1.5" fill={GOLD} />
        <circle cx="30" cy="23" r="1.5" fill={GOLD} />
        <path
          d="M12 12V10a8 8 0 0116 0v2"
          stroke={GOLD}
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>
    ),
    desc: "Desk, chair, dual monitors, RGB peripherals — your gaming corner is styled to match your room's aesthetic, not clash with it. We integrate cable management and ambient lighting into the render.",
  },
];

function SmartFeatures() {
  const [hovered, setHovered] = useState<string | null>(null);
  const active = SMART_ITEMS.find((s) => s.id === hovered) ?? null;

  return (
    <section className="relative z-10 py-48 overflow-hidden">
      <GoldRule />
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 25% 60%,rgba(201,168,76,0.06) 0%,transparent 55%)`,
        }}
      />

      <div className="max-w-[1440px] mx-auto px-8 md:px-20 pt-24">
        <FadeUp className="mb-24 text-center">
          <SectionLabel>Smart Integration</SectionLabel>
          <h2
            className="font-bold leading-tight"
            style={{
              fontFamily: "var(--font-playfair)",
              color: IVORY,
              fontSize: "clamp(44px, 6.5vw, 96px)",
            }}
          >
            Your room,
            <br />
            <span className="italic" style={{ color: GOLD }}>
              intelligently alive.
            </span>
          </h2>
          <p
            className="mt-8 mx-auto leading-relaxed max-w-3xl"
            style={{
              fontFamily: "var(--font-dm)",
              color: MUTED,
              fontSize: "clamp(16px, 1.4vw, 21px)",
              fontWeight: 300,
            }}
          >
            Cova doesn{"'"}t just redesign your room — it integrates the smart
            tech you love. Hover over any feature below to see it highlighted
            live in the render.
          </p>
        </FadeUp>

        <div className="space-y-10">
          {/* Room image — full width with accurate highlights */}
          <FadeUp delay={0.1}>
            <div
              className="relative overflow-hidden w-full"
              style={{
                aspectRatio: "16/9",
                border: `1px solid rgba(201,168,76,0.2)`,
              }}
            >
              {/* 3D tilt on hover */}
              <motion.div
                className="absolute inset-0"
                style={{ transformStyle: "preserve-3d" }}
                animate={
                  hovered
                    ? { rotateY: 3, rotateX: -2, scale: 1.025 }
                    : { rotateY: 0, rotateX: 0, scale: 1 }
                }
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              >
                <Image
                  src={SMART_ROOM_URL}
                  alt="Smart living room"
                  fill
                  className="object-cover"
                  placeholder="blur"
                  blurDataURL={blurSvg(16, 10)}
                />
                {/* Darken non-highlighted areas when a feature is active */}
                <motion.div
                  className="absolute inset-0"
                  animate={
                    hovered
                      ? { backgroundColor: "rgba(9,24,41,0.45)" }
                      : { backgroundColor: "rgba(9,24,41,0.1)" }
                  }
                  transition={{ duration: 0.5 }}
                />
              </motion.div>

              {/* Interactive hover zones — directly on the image */}
              {SMART_ITEMS.map((item) => (
                <div
                  key={`zone-${item.id}`}
                  className="absolute z-10 cursor-pointer"
                  style={{
                    left: item.zone.left,
                    top: item.zone.top,
                    width: item.zone.width,
                    height: item.zone.height,
                  }}
                  onMouseEnter={() => setHovered(item.id)}
                  onMouseLeave={() => setHovered(null)}
                />
              ))}

              {/* Highlight zones — rendered on top */}
              <AnimatePresence>
                {active && (
                  <motion.div
                    key={active.id}
                    className="absolute z-20 pointer-events-none"
                    style={{
                      left: active.zone.left,
                      top: active.zone.top,
                      width: active.zone.width,
                      height: active.zone.height,
                      border: `2px solid ${GOLD}`,
                      boxShadow: `0 0 60px 12px rgba(201,168,76,0.5), inset 0 0 40px 8px rgba(201,168,76,0.12)`,
                      backgroundColor: "rgba(201,168,76,0.08)",
                    }}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 280, damping: 30 }}
                  >
                    {/* Scanning line */}
                    <motion.div
                      className="absolute left-0 right-0 h-0.5"
                      style={{
                        backgroundColor: active.scanColor,
                        opacity: 0.8,
                      }}
                      animate={{ top: ["0%", "100%", "0%"] }}
                      transition={{
                        duration: 2.2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                    {/* Corner brackets */}
                    {[
                      "top-0 left-0 border-t-2 border-l-2",
                      "top-0 right-0 border-t-2 border-r-2",
                      "bottom-0 left-0 border-b-2 border-l-2",
                      "bottom-0 right-0 border-b-2 border-r-2",
                    ].map((cls) => (
                      <div
                        key={cls}
                        className={`absolute w-5 h-5 ${cls}`}
                        style={{ borderColor: active.borderColor }}
                      />
                    ))}
                    {/* Label */}
                    <motion.div
                      className="absolute -bottom-9 left-0 px-3 py-1.5 text-xs tracking-[0.18em] uppercase whitespace-nowrap"
                      style={{
                        fontFamily: "var(--font-dm)",
                        color: IVORY,
                        backgroundColor: "rgba(9,24,41,0.9)",
                        border: `1px solid ${active.borderColor}`,
                      }}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      ✦ {active.label} · {active.sub}
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Default hint */}
              {!hovered && (
                <div
                  className="absolute bottom-5 left-5 z-10 px-4 py-2.5"
                  style={{
                    backgroundColor: "rgba(9,24,41,0.8)",
                    border: `1px solid rgba(201,168,76,0.25)`,
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <span
                    className="text-sm tracking-wide"
                    style={{ fontFamily: "var(--font-dm)", color: MUTED }}
                  >
                    ↓ Hover a feature below to highlight it in the room
                  </span>
                </div>
              )}

              {/* Corner accents on image frame */}
              {[
                ["top-3 left-3", "border-t border-l"],
                ["top-3 right-3", "border-t border-r"],
                ["bottom-3 left-3", "border-b border-l"],
                ["bottom-3 right-3", "border-b border-r"],
              ].map(([pos, cls]) => (
                <div
                  key={pos}
                  className={`absolute w-6 h-6 ${pos} ${cls}`}
                  style={{ borderColor: `rgba(201,168,76,0.4)` }}
                />
              ))}
            </div>
          </FadeUp>

          {/* Pill row — controls below the image */}
          <FadeUp delay={0.2}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {SMART_ITEMS.map((item) => {
                const isActive = hovered === item.id;
                return (
                  <motion.button
                    key={`pill-${item.id}`}
                    type="button"
                    onMouseEnter={() => setHovered(item.id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(item.id)}
                    onBlur={() => setHovered(null)}
                    className="relative flex items-center gap-3 px-5 py-4 text-left"
                    style={{
                      backgroundColor: isActive
                        ? "rgba(201,168,76,0.08)"
                        : "rgba(255,255,255,0.04)",
                      border: `1px solid ${
                        isActive
                          ? "rgba(201,168,76,0.6)"
                          : "rgba(201,168,76,0.15)"
                      }`,
                      color: isActive ? GOLD : IVORY,
                      borderRadius: 24,
                      transition: "all 200ms ease-out",
                    }}
                    whileHover={{ y: -2 }}
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    <span className="flex-1 min-w-0">
                      <span
                        className="block text-sm font-medium truncate"
                        style={{
                          fontFamily: "var(--font-dm)",
                          color: isActive ? GOLD : IVORY,
                          letterSpacing: "0.02em",
                        }}
                      >
                        {item.label}
                      </span>
                      <span
                        className="block text-xs truncate mt-0.5"
                        style={{ fontFamily: "var(--font-dm)", color: DIM }}
                      >
                        {item.sub}
                      </span>
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </FadeUp>
        </div>
      </div>
      <GoldRule className="mt-24" />
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERSONALIZATION
// ═══════════════════════════════════════════════════════════════════════════════
const TABS = [
  {
    id: "space",
    label: "Space",
    icon: "⬡",
    title: "Room Shape & Dimensions",
    desc: "We read your room's exact geometry — ceiling height, window placement, structural columns, alcoves. The AI accounts for every inch, ensuring furniture scale and flow are architecturally accurate.",
    features: [
      "Floor plan detection from photo",
      "Ceiling height analysis",
      "Natural light direction mapping",
      "Traffic flow optimization",
    ],
  },
  {
    id: "furniture",
    label: "Furniture",
    icon: "◈",
    title: "Keep, Replace, or Classify",
    desc: "Upload your room and we identify every piece of furniture. Mark what stays, what goes. We classify each item and either preserve it faithfully in the render or replace it with something better.",
    features: [
      "AI furniture classification",
      "Keep & remove selection",
      "Faithful preservation in render",
      "Style-matched replacements",
    ],
  },
  {
    id: "art",
    label: "Art",
    icon: "◉",
    title: "Visual Direction & Art Curation",
    desc: "Specify frame styles, gallery wall layouts, vinyl collections, coffee table books, and sculptural objects. Your cultural and artistic identity is woven into every corner of the render.",
    features: [
      "Gallery wall layouts",
      "Frame style & matting selection",
      "Vinyl & book collections",
      "Sculptural object placement",
    ],
  },
  {
    id: "tech",
    label: "Tech",
    icon: "◈",
    title: "Smart Tech Integration",
    desc: "Choose your preferred smart devices — TVs, speakers, lighting systems, gaming setups. We render them into your space styled to match, not clash, with your aesthetic.",
    features: [
      "Smart TV & display sizing",
      "Speaker & sound bar placement",
      "Lighting scene rendering",
      "Gaming setup integration",
    ],
  },
  {
    id: "sensory",
    label: "Sensory",
    icon: "✦",
    title: "Texture, Touch & Living Detail",
    desc: "The details that make a room feel alive. Specify cushion density and fill, plant species and pot styles, rug pile and pattern, and window treatment opacity and drape.",
    features: [
      "Cushion density & fill type",
      "Plant species & pot curation",
      "Rug pile, pattern & size",
      "Window treatment & drape style",
    ],
  },
  {
    id: "identity",
    label: "Identity",
    icon: "◎",
    title: "Cultural & Personal Identity",
    desc: "The deepest layer. Pull from cultural references, fandom aesthetics, sentimental objects, and emotional mood boards. Your room becomes an extension of who you are — not just how you look.",
    features: [
      "Cultural reference library",
      "Fandom & subculture aesthetics",
      "Sentimental object preservation",
      "Mood & emotional palette",
    ],
  },
];

function Personalization() {
  const [activeTab, setActiveTab] = useState("space");
  const tab = TABS.find((t) => t.id === activeTab)!;

  return (
    <section className="relative z-10 py-48 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 75% 40%,rgba(201,168,76,0.05) 0%,transparent 55%)`,
        }}
      />
      <div className="max-w-[1440px] mx-auto px-8 md:px-20">
        <FadeUp className="mb-24">
          <SectionLabel>Deep Personalization</SectionLabel>
          <div className="grid lg:grid-cols-2 gap-12 items-end">
            <h2
              className="font-bold leading-tight"
              style={{
                fontFamily: "var(--font-playfair)",
                color: IVORY,
                fontSize: "clamp(44px, 6vw, 92px)",
              }}
            >
              Your room.
              <br />
              <span className="italic" style={{ color: GOLD }}>
                Your rules.
              </span>
            </h2>
            <p
              className="leading-relaxed"
              style={{
                fontFamily: "var(--font-dm)",
                color: MUTED,
                fontSize: "clamp(16px, 1.4vw, 21px)",
                fontWeight: 300,
              }}
            >
              Six layers of personalization — from room geometry to cultural
              identity. Every preference is preserved in your render. The deeper
              you go, the more precisely Cova reflects{" "}
              <em style={{ color: IVORY }}>you</em>.
            </p>
          </div>
        </FadeUp>

        {/* Tabs */}
        <FadeUp delay={0.1} className="mb-14">
          <div className="flex flex-wrap gap-3">
            {TABS.map((t) => (
              <motion.button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="px-7 py-3.5 text-base tracking-[0.1em] uppercase relative overflow-hidden"
                style={{
                  fontFamily: "var(--font-dm)",
                  fontWeight: 500,
                  border: `1px solid ${activeTab === t.id ? GOLD : "rgba(201,168,76,0.2)"}`,
                  color: activeTab === t.id ? NAVY : MUTED,
                  backgroundColor: activeTab === t.id ? GOLD : "transparent",
                }}
                whileHover={{
                  borderColor: GOLD,
                  color: activeTab === t.id ? NAVY : IVORY,
                }}
                transition={{ duration: 0.22 }}
              >
                <span className="mr-2 opacity-70">{t.icon}</span>
                {t.label}
              </motion.button>
            ))}
          </div>
        </FadeUp>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="grid lg:grid-cols-2 gap-10">
              {/* Tab detail */}
              <div
                className="p-12 lg:p-16"
                style={{
                  border: `1px solid rgba(201,168,76,0.18)`,
                  backgroundColor: "rgba(201,168,76,0.02)",
                }}
              >
                <div className="text-6xl mb-8" style={{ color: GOLD }}>
                  {tab.icon}
                </div>
                <h3
                  className="font-bold mb-6"
                  style={{
                    fontFamily: "var(--font-playfair)",
                    color: IVORY,
                    fontSize: "clamp(26px, 2.5vw, 38px)",
                  }}
                >
                  {tab.title}
                </h3>
                <p
                  className="leading-relaxed mb-10"
                  style={{
                    fontFamily: "var(--font-dm)",
                    color: MUTED,
                    fontSize: "clamp(15px, 1.2vw, 19px)",
                  }}
                >
                  {tab.desc}
                </p>
                <div className="space-y-4">
                  {tab.features.map((f, i) => (
                    <motion.div
                      key={f}
                      className="flex items-center gap-4"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.09, duration: 0.45 }}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: GOLD }}
                      />
                      <span
                        style={{
                          fontFamily: "var(--font-dm)",
                          color: `rgba(245,240,232,0.75)`,
                          fontSize: 17,
                        }}
                      >
                        {f}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* AI Stylist + Budget */}
              <div className="space-y-6">
                <div
                  className="p-10 lg:p-12"
                  style={{
                    border: `1px solid rgba(201,168,76,0.28)`,
                    background: `linear-gradient(135deg,rgba(201,168,76,0.07) 0%,rgba(9,24,41,0) 100%)`,
                  }}
                >
                  <div className="flex items-center gap-4 mb-8">
                    <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
                      <rect
                        x="3"
                        y="6"
                        width="34"
                        height="22"
                        rx="4"
                        stroke={GOLD}
                        strokeWidth="1.5"
                      />
                      <circle
                        cx="12"
                        cy="17"
                        r="2.5"
                        fill={GOLD}
                        fillOpacity="0.6"
                      />
                      <circle cx="20" cy="17" r="2.5" fill={GOLD} />
                      <circle
                        cx="28"
                        cy="17"
                        r="2.5"
                        fill={GOLD}
                        fillOpacity="0.6"
                      />
                      <path
                        d="M12 28l4 6h8l4-6"
                        stroke={GOLD}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <div>
                      <h4
                        className="font-semibold"
                        style={{
                          fontFamily: "var(--font-playfair)",
                          color: IVORY,
                          fontSize: 24,
                        }}
                      >
                        Cova AI Stylist
                      </h4>
                      <p
                        className="text-sm"
                        style={{ fontFamily: "var(--font-dm)", color: DIM }}
                      >
                        Curates your room to any budget
                      </p>
                    </div>
                  </div>
                  <p
                    className="leading-relaxed mb-8"
                    style={{
                      fontFamily: "var(--font-dm)",
                      color: MUTED,
                      fontSize: 17,
                    }}
                  >
                    Our conversational AI stylist curates your entire room to
                    your exact budget. Tell it your ceiling, your must-haves,
                    your splurge items — it optimises every product selection
                    accordingly.
                  </p>
                  <div className="space-y-3 mb-8">
                    {[
                      {
                        from: "ai",
                        text: "What's your total budget for this room?",
                      },
                      {
                        from: "user",
                        text: "Around $4,000 — but I want it to feel expensive.",
                      },
                      {
                        from: "ai",
                        text: "Perfect. I'll invest in the sofa and rug — those anchor the room. The rest we'll source smartly. Ready to see your render?",
                      },
                    ].map((msg, i) => (
                      <motion.div
                        key={i}
                        className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.18 + 0.2 }}
                      >
                        <div
                          className="max-w-[82%] px-5 py-3.5 text-base leading-relaxed"
                          style={{
                            fontFamily: "var(--font-dm)",
                            backgroundColor:
                              msg.from === "ai"
                                ? "rgba(201,168,76,0.1)"
                                : "rgba(245,240,232,0.07)",
                            border: `1px solid ${msg.from === "ai" ? "rgba(201,168,76,0.3)" : "rgba(245,240,232,0.1)"}`,
                            color:
                              msg.from === "ai"
                                ? IVORY
                                : `rgba(245,240,232,0.72)`,
                            borderRadius:
                              msg.from === "ai"
                                ? "0 14px 14px 14px"
                                : "14px 0 14px 14px",
                          }}
                        >
                          {msg.text}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  <Link href="/auth">
                    <motion.div
                      className="w-full py-5 text-center text-base tracking-[0.15em] uppercase cursor-pointer relative overflow-hidden"
                      style={{
                        fontFamily: "var(--font-dm)",
                        color: NAVY,
                        backgroundColor: GOLD,
                        fontWeight: 600,
                      }}
                      whileHover={{ opacity: 0.9 }}
                    >
                      Chat With Your AI Stylist
                    </motion.div>
                  </Link>
                </div>

                <div
                  className="p-10"
                  style={{ border: `1px solid rgba(201,168,76,0.12)` }}
                >
                  <p
                    className="text-sm tracking-[0.22em] uppercase mb-6"
                    style={{ fontFamily: "var(--font-dm)", color: GOLD }}
                  >
                    Personalization unlocks with budget
                  </p>
                  {[
                    {
                      tier: "Free",
                      features: "Style quiz + 1 AI render",
                      active: true,
                    },
                    {
                      tier: "$9 / mo",
                      features: "All 6 personalization tabs + AI chatbot",
                      active: false,
                    },
                    {
                      tier: "$29 / mo",
                      features: "Unlimited renders + priority retailers",
                      active: false,
                    },
                  ].map((t, i) => (
                    <div
                      key={t.tier}
                      className="flex items-center justify-between py-4"
                      style={{
                        borderBottom:
                          i < 2 ? `1px solid rgba(201,168,76,0.08)` : "none",
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <span
                          className="font-semibold"
                          style={{
                            fontFamily: "var(--font-playfair)",
                            color: t.active ? GOLD : IVORY,
                            fontSize: 20,
                          }}
                        >
                          {t.tier}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-dm)",
                            color: MUTED,
                            fontSize: 15,
                          }}
                        >
                          {t.features}
                        </span>
                      </div>
                      {t.active && (
                        <span
                          className="text-xs tracking-wider px-3 py-1.5"
                          style={{
                            color: NAVY,
                            backgroundColor: GOLD,
                            fontFamily: "var(--font-dm)",
                            fontWeight: 600,
                          }}
                        >
                          Current
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLE GALLERY
// ═══════════════════════════════════════════════════════════════════════════════
const STYLES = [
  { name: "Warm Serenity", img: STYLE1, desc: "Quiet warmth" },
  { name: "Modern Luxe", img: STYLE2, desc: "Bold & refined" },
  { name: "Airy Calm", img: STYLE3, desc: "Light & serene" },
  { name: "Art Deco", img: STYLE4, desc: "Glamour & geometry" },
];

function StyleGallery() {
  const [hov, setHov] = useState<number | null>(null);
  return (
    <section className="relative z-10 py-48">
      <GoldRule />
      <div className="max-w-[1440px] mx-auto px-8 md:px-20 pt-24">
        <FadeUp className="mb-24 flex flex-col lg:flex-row lg:items-end justify-between gap-12">
          <div>
            <SectionLabelLeft>Design Styles</SectionLabelLeft>
            <h2
              className="font-bold leading-tight"
              style={{
                fontFamily: "var(--font-playfair)",
                color: IVORY,
                fontSize: "clamp(44px, 6.5vw, 96px)",
              }}
            >
              40+ curated aesthetics.
              <br />
              <span className="italic" style={{ color: GOLD }}>
                One is yours.
              </span>
            </h2>
          </div>
          <p
            className="max-w-sm leading-relaxed"
            style={{
              fontFamily: "var(--font-dm)",
              color: MUTED,
              fontSize: "clamp(16px, 1.3vw, 20px)",
              fontWeight: 300,
            }}
          >
            From quiet warmth to maximalist Art Deco, our style engine finds the
            perfect match for your personality.
          </p>
        </FadeUp>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {STYLES.map((s, i) => (
            <FadeUp key={s.name} delay={i * 0.1}>
              <motion.div
                className="relative overflow-hidden cursor-pointer group"
                style={{ aspectRatio: "3/4" }}
                onHoverStart={() => setHov(i)}
                onHoverEnd={() => setHov(null)}
                whileHover={{ y: -12 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <Image
                  src={s.img}
                  alt={s.name}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-110"
                  placeholder="blur"
                  blurDataURL={blurSvg(6, 8)}
                />
                <div
                  className="absolute inset-0 transition-opacity duration-500"
                  style={{
                    background: `linear-gradient(to top,rgba(9,24,41,0.95) 0%,rgba(9,24,41,0.3) 50%,transparent 100%)`,
                    opacity: hov === i ? 1 : 0.75,
                  }}
                />
                <div className="absolute bottom-0 left-0 right-0 p-7">
                  <p
                    className="font-semibold mb-2"
                    style={{
                      fontFamily: "var(--font-playfair)",
                      color: IVORY,
                      fontSize: 24,
                    }}
                  >
                    {s.name}
                  </p>
                  <motion.p
                    style={{
                      fontFamily: "var(--font-dm)",
                      color: GOLD,
                      fontSize: 16,
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={
                      hov === i ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }
                    }
                    transition={{ duration: 0.3 }}
                  >
                    {s.desc}
                  </motion.p>
                </div>
                <motion.div
                  className="absolute top-4 right-4 w-7 h-7"
                  style={{
                    borderTop: `1.5px solid ${GOLD}`,
                    borderRight: `1.5px solid ${GOLD}`,
                  }}
                  initial={{ opacity: 0 }}
                  animate={hov === i ? { opacity: 1 } : { opacity: 0 }}
                  transition={{ duration: 0.3 }}
                />
              </motion.div>
            </FadeUp>
          ))}
        </div>
      </div>
      <GoldRule className="mt-24" />
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTIMONIALS
// ═══════════════════════════════════════════════════════════════════════════════
const TESTIMONIALS = [
  {
    quote:
      "I uploaded a photo of my living room on a Tuesday. By Wednesday I had ordered everything in the render. My apartment looks like it belongs in Architectural Digest.",
    name: "Sophia Reyes",
    role: "Interior Design Enthusiast, NYC",
    img: T1,
    rating: 5,
  },
  {
    quote:
      "As an architect, I was skeptical. But the quality of the renders and the precision of the style matching genuinely surprised me. This is the future of residential design.",
    name: "Marcus Chen",
    role: "Principal Architect, San Francisco",
    img: T2,
    rating: 5,
  },
  {
    quote:
      "I spent 2 years trying to figure out my aesthetic. Cova's style quiz nailed it in 3 minutes. The render it produced was exactly what I had in my head but couldn't articulate.",
    name: "Isabelle Laurent",
    role: "Creative Director, Paris",
    img: T3,
    rating: 5,
  },
];

function Testimonials() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setActive((i) => (i + 1) % TESTIMONIALS.length),
      5500,
    );
    return () => clearInterval(t);
  }, []);
  return (
    <section className="relative z-10 py-48 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 50% 100%,rgba(201,168,76,0.07) 0%,transparent 60%)`,
        }}
      />
      <div className="max-w-[1440px] mx-auto px-8 md:px-20 text-center">
        <FadeUp>
          <SectionLabel>Testimonials</SectionLabel>
          <h2
            className="font-bold mb-24"
            style={{
              fontFamily: "var(--font-playfair)",
              color: IVORY,
              fontSize: "clamp(44px, 6.5vw, 96px)",
            }}
          >
            Loved by design{" "}
            <span className="italic" style={{ color: GOLD }}>
              obsessives.
            </span>
          </h2>
        </FadeUp>

        <div className="relative min-h-[360px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              className="text-center max-w-5xl mx-auto"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex justify-center gap-1 mb-10">
                {Array.from({ length: TESTIMONIALS[active].rating }).map(
                  (_, i) => (
                    <span key={i} style={{ color: GOLD, fontSize: 26 }}>
                      ★
                    </span>
                  ),
                )}
              </div>
              <div
                className="select-none mb-4"
                style={{
                  fontFamily: "var(--font-playfair)",
                  color: `rgba(201,168,76,0.18)`,
                  fontSize: 120,
                  lineHeight: 0.8,
                }}
              >
                {"\u201C"}
              </div>
              <blockquote
                className="leading-relaxed mb-14"
                style={{
                  fontFamily: "var(--font-playfair)",
                  color: IVORY,
                  fontStyle: "italic",
                  fontSize: "clamp(20px, 2.2vw, 30px)",
                }}
              >
                {TESTIMONIALS[active].quote}
              </blockquote>
              <div className="flex items-center justify-center gap-6">
                <div
                  className="w-18 h-18 rounded-full overflow-hidden"
                  style={{
                    border: `2px solid rgba(201,168,76,0.5)`,
                    width: 72,
                    height: 72,
                  }}
                >
                  <Image
                    src={TESTIMONIALS[active].img}
                    alt={TESTIMONIALS[active].name}
                    width={72}
                    height={72}
                    className="object-cover w-full h-full"
                  />
                </div>
                <div className="text-left">
                  <p
                    className="font-semibold"
                    style={{
                      fontFamily: "var(--font-dm)",
                      color: IVORY,
                      fontSize: 20,
                    }}
                  >
                    {TESTIMONIALS[active].name}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-dm)",
                      color: MUTED,
                      fontSize: 16,
                    }}
                  >
                    {TESTIMONIALS[active].role}
                  </p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex justify-center gap-3 mt-14">
          {TESTIMONIALS.map((_, i) => (
            <motion.button
              key={i}
              onClick={() => setActive(i)}
              className="rounded-full"
              style={{
                width: active === i ? 36 : 12,
                height: 12,
                backgroundColor: active === i ? GOLD : `rgba(201,168,76,0.25)`,
              }}
              whileHover={{ backgroundColor: GOLD }}
              transition={{ duration: 0.4 }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FINAL CTA
// ═══════════════════════════════════════════════════════════════════════════════
function FinalCTA() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["-14%", "14%"]);

  return (
    <section ref={ref} className="relative z-10 overflow-hidden">
      <motion.div className="absolute inset-0 z-0" style={{ y }}>
        <Image
          src={FINAL_URL}
          alt="Luxury room"
          fill
          className="object-cover"
          placeholder="blur"
          blurDataURL={blurSvg(16, 9)}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to bottom,rgba(9,24,41,1) 0%,rgba(9,24,41,0.7) 30%,rgba(9,24,41,0.7) 70%,rgba(9,24,41,1) 100%)`,
          }}
        />
      </motion.div>

      <div className="relative z-10 max-w-[1440px] mx-auto px-8 md:px-20 py-60 text-center">
        <FadeUp>
          <SectionLabel>Get Started</SectionLabel>
        </FadeUp>
        <FadeUp delay={0.1}>
          <h2
            className="font-bold leading-tight mb-8"
            style={{
              fontFamily: "var(--font-playfair)",
              color: IVORY,
              fontSize: "clamp(52px, 8vw, 120px)",
            }}
          >
            Your dream home
            <br />
            <span className="italic" style={{ color: GOLD }}>
              starts now.
            </span>
          </h2>
        </FadeUp>
        <FadeUp delay={0.2}>
          <p
            className="mx-auto mb-16 leading-relaxed max-w-2xl"
            style={{
              fontFamily: "var(--font-dm)",
              color: MUTED,
              fontSize: "clamp(17px, 1.5vw, 22px)",
              fontWeight: 300,
            }}
          >
            Free to start. No credit card required. Your first AI render is on
            us — because once you see it, you{"'"}ll never look at your room the
            same way again.
          </p>
        </FadeUp>
        <FadeUp delay={0.3}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <CTAButton href="/auth" large>
              Get Early Access
            </CTAButton>
            <CTAButton href="/auth" large outline>
              View a Demo
            </CTAButton>
          </div>
        </FadeUp>
        <FadeUp
          delay={0.5}
          className="mt-24 flex flex-wrap items-center justify-center gap-12"
        >
          {[
            { icon: "🔒", label: "Privacy First" },
            { icon: "⚡", label: "60s Renders" },
            { icon: "🛍️", label: "500+ Retailers" },
            { icon: "✦", label: "Free to Start" },
            { icon: "🎨", label: "40+ Styles" },
          ].map((b) => (
            <div key={b.label} className="flex items-center gap-3">
              <span className="text-xl">{b.icon}</span>
              <span
                style={{
                  fontFamily: "var(--font-dm)",
                  color: MUTED,
                  fontSize: 16,
                }}
              >
                {b.label}
              </span>
            </div>
          ))}
        </FadeUp>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FOOTER
// ═══════════════════════════════════════════════════════════════════════════════
function Footer() {
  return (
    <footer
      className="relative z-10 py-16 border-t"
      style={{ borderColor: `rgba(201,168,76,0.12)` }}
    >
      <div className="max-w-[1440px] mx-auto px-8 md:px-20 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-3">
          <svg width="28" height="28" viewBox="0 0 34 34" fill="none">
            <path
              d="M17 2L32 10V24L17 32L2 24V10L17 2Z"
              stroke={GOLD}
              strokeWidth="1.5"
              fill="none"
            />
            <circle cx="17" cy="17" r="3.5" fill={GOLD} />
          </svg>
          <span
            className="text-xl tracking-[0.18em] uppercase"
            style={{
              fontFamily: "var(--font-playfair)",
              color: IVORY,
              fontWeight: 600,
            }}
          >
            Cova
          </span>
        </div>
        <p
          className="text-base text-center"
          style={{ fontFamily: "var(--font-dm)", color: MUTED }}
        >
          © {new Date().getFullYear()} Cova Studio. All rights reserved.
        </p>
        <div className="flex items-center gap-8">
          {["Privacy", "Terms", "Contact", "Careers"].map((item) => (
            <motion.a
              key={item}
              href="#"
              className="text-base tracking-wide"
              style={{ fontFamily: "var(--font-dm)", color: MUTED }}
              whileHover={{ color: IVORY }}
            >
              {item}
            </motion.a>
          ))}
        </div>
      </div>
    </footer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════════
export default function CovaLandingPage() {
  return (
    <div
      className={`${playfair.variable} ${dmSans.variable} min-h-screen`}
      style={{ backgroundColor: NAVY, color: IVORY }}
    >
      <Noise />
      <Orbs />
      <CursorGlow />
      <Navbar />
      <main>
        <Hero />
        <StatsBar />
        <HowItWorks />
        <BeforeAfter />
        <ShoppableRoom />
        <SmartFeatures />
        <Personalization />
        <StyleGallery />
        <Testimonials />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
