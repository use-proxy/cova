"use client";

/**
 * Cova — Step 5: Budget Setup (v8)
 * Large cards · calm CSS-transition slide · no spring/scale/rotation
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { useArea2Store } from "@/lib/stores/area2Store";
import "../step-1/step1.css";
import "./step5.css";

// ─────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────
const T = {
  navy: "#091829",
  gold: "#C9A84C",
  goldLt: "#e8c96a",
  ivory: "#F5F0E8",
  muted: "rgba(245,240,232,0.48)",
  border: "rgba(201,168,76,0.15)",
  serif: "'Playfair Display', Georgia, serif",
  sans: "'DM Sans', system-ui, sans-serif",
} as const;

// ─────────────────────────────────────────────
// Budget tiers
// ─────────────────────────────────────────────
const TIERS = [
  {
    id: 0,
    price: "$500 – $2,000",
    label: "Essential",
    tagline: "Smart Refresh",
    desc: "Statement accessories, curated art, and layered textiles that transform the feel of any room without a full overhaul.",
    stars: 1,
    glow: "rgba(201,168,76,0.09)",
  },
  {
    id: 1,
    price: "$2,000 – $5,000",
    label: "Elevated",
    tagline: "Key Pieces, Big Impact",
    desc: "Hero furniture and décor that anchors your space with intention, warmth, and lasting style.",
    stars: 2,
    glow: "rgba(201,168,76,0.14)",
  },
  {
    id: 2,
    price: "$5,000 – $10,000",
    label: "Refined",
    tagline: "Full Room Transformation",
    desc: "Complete redesign with premium furnishings, layered lighting, and bespoke finishing details.",
    stars: 3,
    glow: "rgba(201,168,76,0.20)",
  },
  {
    id: 3,
    price: "$10,000 – $25,000",
    label: "Prestige",
    tagline: "Elevated Living",
    desc: "Designer-grade pieces, custom millwork, and a fully cohesive interior narrative curated for you.",
    stars: 4,
    glow: "rgba(201,168,76,0.26)",
  },
  {
    id: 4,
    price: "$25,000+",
    label: "Signature",
    tagline: "Curated Luxury",
    desc: "No compromise. Every surface, material, and detail considered, sourced, and perfected.",
    stars: 5,
    glow: "rgba(201,168,76,0.34)",
  },
] as const;

// ─────────────────────────────────────────────
// Particle field
// ─────────────────────────────────────────────
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let W = (canvas.width = window.innerWidth);
    let H = (canvas.height = window.innerHeight);
    const onResize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);
    const pts = Array.from({ length: 44 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      r: Math.random() * 1.2 + 0.3,
      a: Math.random() * Math.PI * 2,
      s: Math.random() * 0.003 + 0.0015,
      base: Math.random() * 0.22 + 0.06,
    }));
    let rafId: number;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      pts.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.a += p.s;
        if (p.x < 0) p.x = W;
        if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H;
        if (p.y > H) p.y = 0;
        const alpha = p.base + Math.sin(p.a) * 0.08;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(201,168,76,${alpha})`;
        ctx.fill();
      });
      rafId = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}
    />
  );
}

// ─────────────────────────────────────────────
// Background decoration — soft, organic, minimal
// ─────────────────────────────────────────────
function BgDecor() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
    >
            {/* Deep vignette — darkens edges, keeps focus on centre */}
            
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(4,11,22,0.72) 100%)",
        }}
      />
            {/* Primary bloom — top right, warm gold */}
            
      <div
        style={{
          position: "absolute",
          top: "-30%",
          right: "-20%",
          width: 820,
          height: 820,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(201,168,76,0.11) 0%, rgba(201,168,76,0.03) 50%, transparent 72%)",
          filter: "blur(48px)",
        }}
      />
            {/* Secondary bloom — bottom left, cooler/dimmer */}
            
      <div
        style={{
          position: "absolute",
          bottom: "-24%",
          left: "-18%",
          width: 700,
          height: 700,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 68%)",
          filter: "blur(60px)",
        }}
      />
            {/* Centre soft halo behind carousel */}
            
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 900,
          height: 420,
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse, rgba(201,168,76,0.055) 0%, transparent 65%)",
          filter: "blur(32px)",
        }}
      />
            {/* Floating organic blob — upper left */}
            
      <div
        style={{
          position: "absolute",
          top: "8%",
          left: "-5%",
          width: 440,
          height: 380,
          borderRadius: "62% 38% 55% 45% / 48% 52% 48% 52%",
          background:
            "radial-gradient(circle at 40% 40%, rgba(201,168,76,0.07) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />
            {/* Floating organic blob — lower right */}
            
      <div
        style={{
          position: "absolute",
          bottom: "6%",
          right: "-4%",
          width: 380,
          height: 340,
          borderRadius: "45% 55% 38% 62% / 52% 48% 52% 48%",
          background:
            "radial-gradient(circle at 60% 60%, rgba(201,168,76,0.065) 0%, transparent 70%)",
          filter: "blur(36px)",
        }}
      />
            {/* Subtle mid-right wisp */}
            
      <div
        style={{
          position: "absolute",
          top: "35%",
          right: "2%",
          width: 280,
          height: 500,
          borderRadius: "50% 50% 40% 60% / 60% 40% 60% 40%",
          background:
            "radial-gradient(ellipse at 50% 30%, rgba(201,168,76,0.05) 0%, transparent 70%)",
          filter: "blur(50px)",
        }}
      />
            {/* Subtle mid-left wisp */}
            
      <div
        style={{
          position: "absolute",
          top: "40%",
          left: "2%",
          width: 260,
          height: 460,
          borderRadius: "40% 60% 50% 50% / 40% 60% 40% 60%",
          background:
            "radial-gradient(ellipse at 50% 60%, rgba(201,168,76,0.045) 0%, transparent 70%)",
          filter: "blur(50px)",
        }}
      />
            {/* Very faint full-screen warm tint — lifts the navy slightly */}
            
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(160deg, rgba(201,168,76,0.025) 0%, transparent 55%, rgba(201,168,76,0.018) 100%)",
        }}
      />
          
    </div>
  );
}

// ─────────────────────────────────────────────
// Fade-up entrance
// ─────────────────────────────────────────────
function Fade({
  on,
  delay = 0,
  children,
  style,
}: {
  on: boolean;
  delay?: number;
  children: React.ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        opacity: on ? 1 : 0,
        transform: on ? "translateY(0)" : "translateY(16px)",
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
        ...style,
      }}
    >
            {children}
          
    </div>
  );
}

// ─────────────────────────────────────────────
// Stars
// ─────────────────────────────────────────────
function Stars({ count, active }: { count: number; active: boolean }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
            
      {[...Array(5)].map((_, i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 12 12">
                    
          <polygon
            points="6,1 7.5,4.5 11,4.5 8.5,7 9.5,11 6,8.8 2.5,11 3.5,7 1,4.5 4.5,4.5"
            fill={i < count ? T.gold : "none"}
            stroke={
              i < count
                ? T.gold
                : active
                  ? "rgba(201,168,76,0.25)"
                  : "rgba(201,168,76,0.1)"
            }
            strokeWidth="0.8"
          />
                  
        </svg>
      ))}
          
    </div>
  );
}

// ─────────────────────────────────────────────
// Card — large, spacious, no animation gimmicks
// ─────────────────────────────────────────────
const CARD_W = 380;
const CARD_H = 260;
const CARD_GAP = 20;
const STEP = CARD_W + CARD_GAP;

function Card({
  tier,
  offset, // integer distance from active (−2,−1,0,1,2)
  pixelOffset, // CSS-transition-driven pixel position
  onClick,
}: {
  tier: (typeof TIERS)[number];
  offset: number;
  pixelOffset: number;
  onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  const isActive = offset === 0;
  const absOff = Math.abs(offset); // ── Calm, luxury: translate only + gentle opacity ──
  // No scale, no rotation, no blur

  const opacity = isActive ? 1 : Math.max(0, 1 - absOff * 0.52);

  const border = isActive
    ? `1px solid ${T.gold}`
    : hov
      ? "1px solid rgba(201,168,76,0.38)"
      : "1px solid rgba(201,168,76,0.13)";

  const bg = isActive
    ? "linear-gradient(150deg, rgba(201,168,76,0.08) 0%, rgba(9,24,41,0.97) 50%)"
    : "rgba(255,255,255,0.03)";

  const shadow = isActive
    ? `0 0 0 1px rgba(201,168,76,0.25), 0 16px 56px rgba(201,168,76,0.14), 0 4px 24px rgba(0,0,0,0.45)`
    : hov
      ? "0 4px 28px rgba(201,168,76,0.08), 0 2px 12px rgba(0,0,0,0.3)"
      : "0 2px 16px rgba(0,0,0,0.28)";

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      role="option"
      aria-selected={isActive}
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: CARD_W,
        height: CARD_H,
        marginLeft: -CARD_W / 2,
        marginTop: -CARD_H / 2, // ── Pure translateX — calm, no scale, no rotation ──
        transform: `translateX(${pixelOffset}px)`,
        opacity, // Smooth CSS transition — 480ms ease-out feels deliberate and premium
        transition:
          "transform 0.48s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.48s ease, box-shadow 0.3s ease, border-color 0.3s ease",
        cursor: isActive ? "default" : "pointer",
        borderRadius: 20,
        border,
        background: bg,
        backdropFilter: "blur(16px)",
        boxShadow: shadow,
        overflow: "hidden",
        userSelect: "none",
        zIndex: isActive ? 10 : Math.max(1, 5 - absOff),
        pointerEvents: absOff > 1 ? "none" : "auto",
      }}
    >
            {/* Active top-edge gold line */}
            
      {isActive && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            borderRadius: "20px 20px 0 0",
            background: `linear-gradient(90deg, transparent 0%, ${T.gold} 35%, ${T.goldLt} 65%, transparent 100%)`,
            zIndex: 15,
          }}
        />
      )}
            {/* Card body */}
            
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: "28px 32px 24px",
          position: "relative",
          zIndex: 5,
        }}
      >
                {/* Price */}
                
        <div
          style={{
            fontFamily: T.serif,
            fontSize: 30,
            fontWeight: 700,
            color: isActive ? T.gold : "rgba(201,168,76,0.55)",
            lineHeight: 1,
            letterSpacing: "-0.01em",
            marginBottom: 14,
            transition: "color 0.4s ease",
          }}
        >
                    {tier.price}
                  
        </div>
                {/* Divider */}
                
        <div
          style={{
            height: 1,
            background: isActive
              ? `linear-gradient(90deg, ${T.gold}, rgba(201,168,76,0.06))`
              : "rgba(201,168,76,0.09)",
            marginBottom: 16,
            transition: "background 0.4s ease",
          }}
        />
                {/* Label + stars */}
                
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 7,
          }}
        >
                    
          <div
            style={{
              fontFamily: T.serif,
              fontSize: 22,
              fontWeight: 600,
              color: isActive ? T.ivory : "rgba(245,240,232,0.42)",
              transition: "color 0.4s ease",
            }}
          >
                        {tier.label}
                      
          </div>
                    
          <Stars count={tier.stars} active={isActive} />
                  
        </div>
                {/* Tagline */}
                
        <div
          style={{
            fontFamily: T.sans,
            fontSize: 10.5,
            fontWeight: 500,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: isActive ? T.gold : "rgba(201,168,76,0.32)",
            marginBottom: 14,
            transition: "color 0.4s ease",
          }}
        >
                    {tier.tagline}
                  
        </div>
                {/* Description */}
                
        <div
          style={{
            fontFamily: T.sans,
            fontSize: 13.5,
            lineHeight: 1.7,
            color: isActive
              ? "rgba(245,240,232,0.68)"
              : "rgba(245,240,232,0.2)",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            transition: "color 0.4s ease",
          }}
        >
                    {tier.desc}
                  
        </div>
                {/* Checkmark */}
                
        {isActive && (
          <div
            style={{
              position: "absolute",
              bottom: 20,
              right: 22,
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: T.gold,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 0 18px rgba(201,168,76,0.5)`,
            }}
          >
                        
            <svg width="14" height="11" viewBox="0 0 14 11">
                            
              <polyline
                points="1.5,5.5 5.5,9.5 12.5,1.5"
                fill="none"
                stroke="#091829"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
                          
            </svg>
                      
          </div>
        )}
              
      </div>
          
    </div>
  );
}

// ─────────────────────────────────────────────
// Carousel — CSS-transition driven, no spring
// ─────────────────────────────────────────────
const STAGE_H = CARD_H + 52;

function Carousel({
  active,
  setActive,
}: {
  active: number;
  setActive: (i: number) => void;
}) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const [dragPx, setDragPx] = useState(0);
  const isDragging = useRef(false);

  const THRESHOLD = 55;

  const onDown = useCallback((x: number) => {
    dragging.current = true;
    isDragging.current = false;
    startX.current = x;
  }, []);

  const onMove = useCallback((x: number) => {
    if (!dragging.current) return;
    const d = x - startX.current;
    if (Math.abs(d) > 4) isDragging.current = true;
    setDragPx(d);
  }, []);

  const onUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    const d = dragPx;
    setDragPx(0);
    if (d < -THRESHOLD && active < TIERS.length - 1) setActive(active + 1);
    else if (d > THRESHOLD && active > 0) setActive(active - 1);
  }, [dragPx, active, setActive]);

  useEffect(() => {
    const mm = (e: MouseEvent) => onMove(e.clientX);
    const mu = () => onUp();
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    return () => {
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
    };
  }, [onMove, onUp]);

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 22,
      }}
    >
            {/* Stage */}
            
      <div
        style={{
          position: "relative",
          width: "100%",
          height: STAGE_H,
          cursor: dragging.current ? "grabbing" : "grab",
          overflow: "hidden",
          touchAction: "pan-y",
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          onDown(e.clientX);
        }}
        onTouchStart={(e) => onDown(e.touches[0].clientX)}
        onTouchMove={(e) => {
          e.preventDefault();
          onMove(e.touches[0].clientX);
        }}
        onTouchEnd={() => onUp()}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" && active < TIERS.length - 1)
            setActive(active + 1);
          if (e.key === "ArrowLeft" && active > 0) setActive(active - 1);
        }}
        tabIndex={0}
        role="listbox"
        aria-label="Budget tier selector"
      >
                {/* Soft left fade */}
                
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: 90,
            background: "linear-gradient(90deg, #091829 0%, transparent 100%)",
            zIndex: 30,
            pointerEvents: "none",
          }}
        />
                {/* Soft right fade */}
                
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: 90,
            background: "linear-gradient(270deg, #091829 0%, transparent 100%)",
            zIndex: 30,
            pointerEvents: "none",
          }}
        />
                {/* Ambient glow — transitions smoothly between tiers */}
                
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            width: 460,
            height: 300,
            borderRadius: "50%",
            background: `radial-gradient(ellipse, ${TIERS[active].glow} 0%, transparent 70%)`,
            pointerEvents: "none",
            zIndex: 1,
            transition: "background 0.7s ease",
          }}
        />
                {/* Cards — each positioned by CSS transform only */}
                
        {TIERS.map((tier) => {
          const offset = tier.id - active;
          const pixelOff = offset * STEP + dragPx;
          return (
            <Card
              key={tier.id}
              tier={tier}
              offset={offset}
              pixelOffset={pixelOff}
              onClick={() => {
                if (tier.id !== active) setActive(tier.id);
              }}
            />
          );
        })}
              
      </div>
            {/* Dot indicators */}
            
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                
        {TIERS.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            aria-label={`Select tier ${i + 1}`}
            style={{
              width: i === active ? 32 : 7,
              height: 7,
              borderRadius: 999,
              border: "none",
              padding: 0,
              background: i === active ? T.gold : "rgba(201,168,76,0.18)",
              cursor: "pointer",
              transition:
                "width 0.45s cubic-bezier(0.34,1.56,0.64,1), background 0.3s ease",
              boxShadow:
                i === active ? "0 0 10px rgba(201,168,76,0.55)" : "none",
            }}
          />
        ))}
              
      </div>
            {/* Arrow controls */}
            
      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                
        <ArrowBtn
          dir="left"
          disabled={active === 0}
          onClick={() => setActive(Math.max(0, active - 1))}
        />
                
        <div
          style={{
            fontFamily: T.sans,
            fontSize: 12,
            color: T.muted,
            letterSpacing: "0.07em",
            minWidth: 52,
            textAlign: "center",
          }}
        >
                    {active + 1} / {TIERS.length}
                  
        </div>
                
        <ArrowBtn
          dir="right"
          disabled={active === TIERS.length - 1}
          onClick={() => setActive(Math.min(TIERS.length - 1, active + 1))}
        />
              
      </div>
          
    </div>
  );
}

// ─────────────────────────────────────────────
// Arrow button
// ─────────────────────────────────────────────
function ArrowBtn({
  dir,
  disabled,
  onClick,
}: {
  dir: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "left" ? "Previous" : "Next"}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 44,
        height: 44,
        borderRadius: "50%",
        border: `1px solid ${disabled ? "rgba(201,168,76,0.09)" : hov ? "rgba(201,168,76,0.6)" : "rgba(201,168,76,0.32)"}`,
        background:
          hov && !disabled ? "rgba(201,168,76,0.07)" : "rgba(255,255,255,0.02)",
        color: disabled ? "rgba(201,168,76,0.18)" : T.gold,
        cursor: disabled ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.25s ease",
        backdropFilter: "blur(8px)",
      }}
    >
            
      {dir === "left" ? (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M9 2L4 7L9 12"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M5 2L10 7L5 12"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
          
    </button>
  );
}

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────
// Budget tier → BudgetProfile mapping
const TIER_TO_BUDGET: Array<{ rangeMin: number; rangeMax: number }> = [
  { rangeMin: 500, rangeMax: 2000 },
  { rangeMin: 2000, rangeMax: 5000 },
  { rangeMin: 5000, rangeMax: 10000 },
  { rangeMin: 10000, rangeMax: 25000 },
  { rangeMin: 25000, rangeMax: 50000 },
];

export default function BudgetSetup() {
  const router = useRouter();
  const setBudget = useArea2Store((s) => s.setBudget);
  const roomId = useArea2Store((s) => s.roomId);
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [s0, setS0] = useState(false);
  const [s1, setS1] = useState(false);
  const [s2, setS2] = useState(false);
  const [s3, setS3] = useState(false);
  const [s4, setS4] = useState(false);

  // Auth gate
  useEffect(() => {
    const checkAuth = async () => {
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) router.push("/auth?next=/design/step-5");
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    setMounted(true);
    const ts = [
      setTimeout(() => setS0(true), 80),
      setTimeout(() => setS1(true), 200),
      setTimeout(() => setS2(true), 320),
      setTimeout(() => setS3(true), 450),
      setTimeout(() => setS4(true), 600),
    ];
    return () => ts.forEach(clearTimeout);
  }, []);

  if (!mounted) return null;

  const tier = TIERS[active];

  return (
    <>
                   
      <ParticleField />
            
      <BgDecor />
            {/* ── Nav ── */}
            
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 28px",
          background: "rgba(9,24,41,0.85)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(201,168,76,0.12)",
        }}
      >
                
        <button
          onClick={() => router.push("/design/step-4")}
          aria-label="Back to previous step"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: T.ivory,
            fontFamily: T.sans,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 6,
            opacity: 0.6,
            transition: "opacity 0.2s",
          }}
        >
                    
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        
            <path
              d="M10 3L5 8L10 13"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
                      
          </svg>
                    Back         
        </button>
                
        <button
          onClick={() => router.push("/")}
          aria-label="Cova — home"
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: T.serif,
            fontSize: 22,
            fontWeight: 600,
            color: T.gold,
            letterSpacing: "0.04em",
          }}
        >
          Cova
        </button>
                
        <div
          style={{
            fontFamily: T.sans,
            fontSize: 11.5,
            color: T.muted,
            letterSpacing: "0.09em",
          }}
        >
                    STEP 3 OF 4         
        </div>
              
      </nav>
            {/* ── Progress bar ── */}
            
      <div
        style={{
          position: "fixed",
          top: 56,
          left: 0,
          right: 0,
          height: 2,
          zIndex: 99,
          background: "rgba(201,168,76,0.07)",
        }}
      >
                
        <div
          style={{
            width: "75%",
            height: "100%",
            background: `linear-gradient(90deg, ${T.gold} 0%, ${T.goldLt} 50%, ${T.gold} 100%)`,
            backgroundSize: "200% 100%",
            animation: "step5ProgressShimmer 2.8s linear infinite",
          }}
        />
              
      </div>
            {/* ── Main ── */}
            
      <main
        style={{
          position: "relative",
          zIndex: 10,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "68px 24px 24px",
          fontFamily: T.sans,
        }}
      >
                
        <div
          style={{
            width: "100%",
            maxWidth: 720,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
                    {/* Eyebrow */}
                    
          <Fade on={s0} style={{ marginBottom: 10 }}>
                        
            <div
              style={{
                fontFamily: T.sans,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: T.gold,
              }}
            >
                            Your Investment             
            </div>
                      
          </Fade>
                    {/* Headline */}
                    
          <Fade on={s1} style={{ marginBottom: 8, textAlign: "center" }}>
                        
            <h1
              style={{
                fontFamily: T.serif,
                fontSize: "clamp(24px,3.8vw,38px)",
                fontWeight: 600,
                color: T.ivory,
                lineHeight: 1.2,
              }}
            >
                            What&rsquo;s your redesign budget?             
            </h1>
                      
          </Fade>
                    {/* Subtext */}
                    
          <Fade on={s2} style={{ marginBottom: 28, textAlign: "center" }}>
                        
            <p
              style={{
                fontFamily: T.sans,
                fontSize: 14,
                color: T.muted,
                lineHeight: 1.7,
              }}
            >
                            Swipe to find your range — we&rsquo;ll curate every
              piece to match perfectly.             
            </p>
                      
          </Fade>
                    {/* Carousel */}
                    
          <Fade on={s3} style={{ width: "100%", marginBottom: 20 }}>
                        
            <Carousel active={active} setActive={setActive} />
                      
          </Fade>
                    {/* CTA */}
                    
          <Fade on={s4}>
                        
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
                            
              <div
                style={{
                  fontFamily: T.sans,
                  fontSize: 13,
                  color: "rgba(245,240,232,0.35)",
                  letterSpacing: "0.01em",
                }}
              >
                                Selected:&nbsp;                 
                <span style={{ color: T.gold, fontWeight: 500 }}>
                  {tier.label}
                </span>
                                &nbsp;—&nbsp;{tier.price}
                              
              </div>
                            
              <button
                onClick={async () => {
                  // Write budget to area2Store
                  const tierBudget =
                    TIER_TO_BUDGET[active] ?? TIER_TO_BUDGET[0]!;
                  setBudget({
                    rangeMin: tierBudget.rangeMin,
                    rangeMax: tierBudget.rangeMax,
                    strategy: "even-quality",
                    hardCeiling: false,
                    tier: TIERS[active].label.toLowerCase() as
                      | "essential"
                      | "elevated"
                      | "refined"
                      | "prestige"
                      | "signature",
                  });

                  // Persist to Supabase render_context.budget if roomId exists
                  if (roomId) {
                    try {
                      const { createBrowserClient } =
                        await import("@/lib/supabase/client");
                      const supabase = createBrowserClient();
                      const { data: existingRoom } = await supabase
                        .from("rooms")
                        .select("render_context")
                        .eq("id", roomId)
                        .single();

                      const existingCtx =
                        (existingRoom?.render_context as Record<
                          string,
                          unknown
                        >) ?? {};

                      await supabase
                        .from("rooms")
                        .update({
                          render_context: {
                            ...existingCtx,
                            budget: {
                              rangeMin: tierBudget.rangeMin,
                              rangeMax: tierBudget.rangeMax,
                              strategy: "even-quality",
                              hardCeiling: false,
                              tier: TIERS[active].label.toLowerCase(),
                            },
                          },
                        })
                        .eq("id", roomId);
                    } catch (e) {
                      console.warn(
                        "[step-5] Failed to persist budget to Supabase:",
                        e,
                      );
                    }
                  }

                  router.push("/design/step-6");
                }}
                style={{
                  fontFamily: T.sans,
                  fontSize: 14,
                  fontWeight: 500,
                  color: T.gold,
                  letterSpacing: "0.06em",
                  padding: "14px 52px",
                  borderRadius: 999,
                  border: `1px solid ${T.gold}`,
                  background: "transparent",
                  cursor: "pointer",
                  animation: "step5CtaPulse 2.8s ease-in-out infinite",
                  transition: "background 0.25s ease, color 0.25s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    T.gold;
                  (e.currentTarget as HTMLButtonElement).style.color = T.navy;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "transparent";
                  (e.currentTarget as HTMLButtonElement).style.color = T.gold;
                }}
              >
                                See My Matches →               
              </button>
                            
              <div
                style={{
                  fontFamily: T.sans,
                  fontSize: 11.5,
                  color: "rgba(245,240,232,0.26)",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                                
                <svg width="11" height="13" viewBox="0 0 11 13" fill="none">
                                    
                  <rect
                    x="1"
                    y="5"
                    width="9"
                    height="7.5"
                    rx="1.5"
                    stroke="currentColor"
                    strokeWidth="1.1"
                  />
                                    
                  <path
                    d="M3.5 5V3.5a2 2 0 0 1 4 0V5"
                    stroke="currentColor"
                    strokeWidth="1.1"
                    strokeLinecap="round"
                  />
                                  
                </svg>
                                Your budget stays private               
              </div>
                          
            </div>
                      
          </Fade>
                  
        </div>
              
      </main>
          
    </>
  );
}
