"use client"

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { flowLog } from "@/lib/debug/flow-logger";
import "./step1.css";

export default function StepOnePage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const roomFrameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { flowLog("page:mount", { page: "step-1" }); }, []);

  // Particle field
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const GOLD = "201,168,76";
    const COUNT = 65;
    let W = 0;
    let H = 0;
    let pts: Array<{
      x: number;
      y: number;
      r: number;
      ba: number;
      vx: number;
      vy: number;
      ph: number;
      fr: number;
    }> = [];
    let raf = 0;

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };

    const mkPt = () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.3 + 0.25,
      ba: Math.random() * 0.26 + 0.04,
      vx: (Math.random() - 0.5) * 0.16,
      vy: (Math.random() - 0.5) * 0.11,
      ph: Math.random() * Math.PI * 2,
      fr: 0.007 + Math.random() * 0.011,
    });

    const init = () => {
      resize();
      pts = Array.from({ length: COUNT }, mkPt);
    };

    const loop = () => {
      ctx.clearRect(0, 0, W, H);
      pts.forEach((p) => {
        p.ph += p.fr;
        const a = p.ba * (0.55 + 0.45 * Math.sin(p.ph));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${GOLD},${a.toFixed(3)})`;
        ctx.fill();
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -8) p.x = W + 8;
        if (p.x > W + 8) p.x = -8;
        if (p.y < -8) p.y = H + 8;
        if (p.y > H + 8) p.y = -8;
      });

      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 14400) {
            const la = (1 - Math.sqrt(d2) / 120) * 0.055;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `rgba(${GOLD},${la.toFixed(3)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };

    const onResize = () => {
      resize();
      pts = Array.from({ length: COUNT }, mkPt);
    };

    init();
    loop();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Staggered entrance
  useEffect(() => {
    const stages: Array<[string, number]> = [
      ["nav-wordmark", 0],
      ["nav-right", 80],
      ["eyebrow", 220],
      ["headline", 340],
      ["subtext", 460],
      ["cta-wrap", 580],
      ["hero-right", 500],
      ["steps-label", 720],
      ["step-1", 780],
      ["step-2", 880],
      ["step-3", 980],
    ];
    const timers: number[] = [];
    stages.forEach(([id, d]) => {
      const el = document.getElementById(id);
      if (el) {
        timers.push(
          window.setTimeout(() => el.classList.add("visible"), d + 80),
        );
      }
    });
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  // Subtle vertical float only (no perspective / rotation)
  useEffect(() => {
    let ft = 0;
    let raf = 0;

    const animRoom = () => {
      ft += 0.007;
      const fy = Math.sin(ft) * 9;
      const roomFrame = roomFrameRef.current;
      if (roomFrame) {
        roomFrame.style.transform = `translateY(${fy.toFixed(2)}px)`;
      }
      raf = requestAnimationFrame(animRoom);
    };

    animRoom();

    return () => {
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="step1-wrapper">
      <canvas suppressHydrationWarning ref={canvasRef} className="particle-canvas" />
      <div className="radial-glow" />

      <div className="page-wrapper">
        <nav>
          <button
            type="button"
            className="nav-wordmark"
            id="nav-wordmark"
            onClick={() => router.push("/")}
          >
            Cova
          </button>
          <div className="nav-right" id="nav-right">
            <button type="button" className="nav-link">
              Explore
            </button>
            <button type="button" className="nav-link">
              Projects
            </button>
            <div className="nav-divider" />
            <div className="avatar" title="Your account">
              A
            </div>
          </div>
        </nav>

        <section className="hero">
          <div className="hero-left">
            <div className="eyebrow" id="eyebrow">
              <div className="eyebrow-line" />
              <span className="eyebrow-text">Welcome to Cova</span>
            </div>

            <h1 className="headline" id="headline">
              Your space,
              <br />
              <em>reimagined.</em>
            </h1>

            <p className="subtext" id="subtext">
              In the next few minutes, we&apos;ll learn your style, analyze your
              room, and generate a photorealistic redesign — with every item
              shoppable.
            </p>

            <div className="cta-wrap" id="cta-wrap">
              <button
                type="button"
                className="cta-btn"
                onClick={() => router.push("/design/step-2")}
              >
                Begin Your Design
                <span className="cta-arrow">→</span>
              </button>
              <span className="cta-note">Takes about 3 minutes</span>
            </div>
          </div>

          <div className="hero-right" id="hero-right">
            <div className="room-frame-outer">
              <div
                className="room-frame"
                ref={roomFrameRef}
                style={{
                  position: "relative",
                  borderRadius: "18px",
                  overflow: "hidden",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/after-room.jpg"
                  alt="AI-redesigned luxury living room by Cova"
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: "rgba(9,24,41,0.82)",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    borderTop: "1px solid rgba(201,168,76,0.2)",
                    padding: "14px 24px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div className="badge-dot" />
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "#8BA3C0",
                    }}
                  >
                    Items detected
                  </span>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 500,
                      color: "#F8F6F1",
                    }}
                  >
                    24 shoppable pieces
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "#C9A84C",
                      letterSpacing: "0.04em",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span>✦</span>
                    <span>AI Redesign Ready</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="section-sep" />

        <section className="steps-section">
          <div className="steps-label" id="steps-label">
            Your journey
          </div>
          <div className="steps-grid">
            <div className="step-card" id="step-1">
              <div className="step-number">Step 01</div>
              <span className="step-icon">✦</span>
              <h3 className="step-title">Your Style</h3>
              <p className="step-desc">Tell us what you love</p>
              <div className="step-connector" />
            </div>

            <div className="step-card" id="step-2">
              <div className="step-number">Step 02</div>
              <span className="step-icon">📷</span>
              <h3 className="step-title">Your Room</h3>
              <p className="step-desc">One photo is all we need</p>
              <div className="step-connector" />
            </div>

            <div className="step-card" id="step-3">
              <div className="step-number">Step 03</div>
              <span className="step-icon">✨</span>
              <h3 className="step-title">Your Redesign</h3>
              <p className="step-desc">Photorealistic. Shoppable.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
