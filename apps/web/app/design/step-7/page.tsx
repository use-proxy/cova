"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoomStore } from "@/lib/store/room";
import { useArea2Store } from "@/lib/stores/area2Store";
import "../step-1/step1.css";
import "./step7.css";

const HEADLINES = [
  "Reading your room...",
  "Mapping your space...",
  "Detecting your style...",
  "Almost ready...",
];

const STATUS_MESSAGES = [
  "Identifying furniture pieces",
  "Measuring spatial dimensions",
  "Analyzing natural light",
  "Matching your style profile",
];

const POLLING_MESSAGES = [
  "Building your design profile...",
  "Analyzing spatial dimensions...",
  "Detecting furniture and features...",
  "Mapping natural light patterns...",
  "Identifying materials and textures...",
  "Almost ready...",
];

const DETECTION_DOTS: Array<{
  id: string;
  label: string;
  left: string;
  top: string;
  delay: number;
}> = [
  { id: "sofa", label: "Sofa detected", left: "22%", top: "60%", delay: 1200 },
  { id: "table", label: "Coffee table", left: "48%", top: "68%", delay: 2000 },
  { id: "chair", label: "Accent chair", left: "68%", top: "56%", delay: 2800 },
  { id: "lamp", label: "Floor lamp", left: "80%", top: "34%", delay: 3400 },
  { id: "rug", label: "Area rug", left: "44%", top: "78%", delay: 4000 },
];

export default function StepSevenPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const [headlineIdx, setHeadlineIdx] = useState(0);
  const [statusIdx, setStatusIdx] = useState(0);
  const [visibleDots, setVisibleDots] = useState<Set<string>>(new Set());
  const [completed, setCompleted] = useState(false);
  const [showContinue, setShowContinue] = useState(false);
  const [showCompletionMsg, setShowCompletionMsg] = useState(false);
  const [flashOpacity, setFlashOpacity] = useState(0);
  const [pollingMsgIdx, setPollingMsgIdx] = useState(0);

  // Zustand store values — read once via getState() to avoid re-render loops
  const roomId = useRoomStore((s) => s.roomId);
  const photoUrl = useRoomStore((s) => s.originalPhotoUrl);
  const area2RoomId = useArea2Store((s) => s.roomId);
  const setDetectionStatus = useArea2Store((s) => s.setDetectionStatus);

  // Auth gate
  useEffect(() => {
    const checkAuth = async () => {
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) router.push("/auth?next=/design/step-7");
    };
    checkAuth();
  }, [router]);

  // Detection pipeline — poll rooms.pre_detection_result directly.
  // Step-6 already fires /api/pipeline/pre-detect; we just wait for the
  // pipeline to write pre_detection_result, then navigate to step-7b.
  // The redesign pipeline fires later from step-7d once the user's
  // render_context is persisted.
  useEffect(() => {
    const effectiveRoomId = roomId ?? area2RoomId;
    if (!effectiveRoomId) {
      // No room data — cosmetic mode only; cosmetic timer handles navigation
      return;
    }

    let pollIntervalId: ReturnType<typeof setInterval> | null = null;
    let msgIntervalId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const runDetection = async () => {
      try {
        const { createBrowserClient } = await import("@/lib/supabase/client");
        const supabase = createBrowserClient();

        // Start rotating polling messages
        msgIntervalId = setInterval(() => {
          if (cancelled) return;
          setPollingMsgIdx((i) => (i + 1) % POLLING_MESSAGES.length);
        }, 2500);

        // Poll for pre_detection_result completion
        pollIntervalId = setInterval(async () => {
          if (cancelled) return;
          try {
            const { data } = await supabase
              .from("rooms")
              .select("pre_detection_result")
              .eq("id", effectiveRoomId)
              .single();
            if (cancelled) return;
            if (data?.pre_detection_result != null) {
              if (pollIntervalId) clearInterval(pollIntervalId);
              if (msgIntervalId) clearInterval(msgIntervalId);
              setDetectionStatus("complete");
              setCompleted(true);
            }
          } catch (pollErr) {
            console.warn("[step-7] Poll request error:", pollErr);
          }
        }, 2000);
      } catch (err) {
        console.warn(
          "[step-7] Detection pipeline error, cosmetic mode active:",
          err,
        );
      }
    };

    runDetection();

    return () => {
      cancelled = true;
      if (pollIntervalId) clearInterval(pollIntervalId);
      if (msgIntervalId) clearInterval(msgIntervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ambient particle canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;
    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const motes = Array.from({ length: 70 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.1 + 0.3,
      vx: (Math.random() - 0.5) * 0.08,
      vy: -Math.random() * 0.06 - 0.01,
      a: Math.random() * 0.18 + 0.03,
      phase: Math.random() * Math.PI * 2,
    }));

    let t = 0;
    let rafId = 0;
    const draw = () => {
      t += 0.004;
      ctx.clearRect(0, 0, W, H);

      const gx = W / 2 + Math.sin(t * 0.3) * 40;
      const gy = H / 2 + Math.cos(t * 0.25) * 30 - 20;
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 320);
      g.addColorStop(0, "rgba(201,168,76,0.035)");
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      motes.forEach((m) => {
        m.x += m.vx + Math.sin(t + m.phase) * 0.03;
        m.y += m.vy;
        if (m.y < -10) {
          m.y = H + 10;
          m.x = Math.random() * W;
        }
        if (m.x < -10) m.x = W + 10;
        if (m.x > W + 10) m.x = -10;
        const flicker = 0.7 + 0.3 * Math.sin(t * 1.5 + m.phase);
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(201,168,76,${m.a * flicker})`;
        ctx.fill();
      });

      rafId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // Rotate headlines + status messages
  useEffect(() => {
    const hInt = setInterval(() => {
      setHeadlineIdx((i) => (i + 1) % HEADLINES.length);
    }, 2200);
    const sInt = setInterval(() => {
      setStatusIdx((i) => (i + 1) % STATUS_MESSAGES.length);
    }, 1200);
    return () => {
      clearInterval(hInt);
      clearInterval(sInt);
    };
  }, []);

  // Stagger detection dots
  useEffect(() => {
    const timers = DETECTION_DOTS.map((d) =>
      setTimeout(() => {
        setVisibleDots((prev) => {
          const next = new Set(prev);
          next.add(d.id);
          return next;
        });
      }, d.delay),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  // Progress bar fill
  useEffect(() => {
    const t = setTimeout(() => {
      if (progressFillRef.current) {
        progressFillRef.current.style.width = "100%";
      }
    }, 1000);

    const pulseTimer = setTimeout(() => {
      if (progressFillRef.current) {
        progressFillRef.current.style.boxShadow =
          "0 0 16px 4px rgba(201,168,76,0.5)";
        setTimeout(() => {
          if (progressFillRef.current) {
            progressFillRef.current.style.boxShadow =
              "0 0 8px 2px rgba(201,168,76,0.25)";
          }
        }, 800);
      }
    }, 6000);

    return () => {
      clearTimeout(t);
      clearTimeout(pulseTimer);
    };
  }, []);

  // Cosmetic 6-second minimum timer — always fires; detection can also trigger completed
  useEffect(() => {
    const autoComplete = setTimeout(() => setCompleted(true), 6000);
    return () => clearTimeout(autoComplete);
  }, []);

  useEffect(() => {
    if (!completed) return;
    const hasRealData = !!(roomId ?? area2RoomId) && !!photoUrl;
    const timers: ReturnType<typeof setTimeout>[] = [];
    setShowCompletionMsg(true);
    timers.push(
      setTimeout(() => setFlashOpacity(1), 1400),
      setTimeout(() => {
        setFlashOpacity(0);
        setShowCompletionMsg(false);
      }, 1700),
    );
    if (hasRealData) {
      // Auto-navigate when detection was real
      timers.push(setTimeout(() => router.push("/design/step-7b"), 2300));
    } else {
      // Cosmetic mode — show Continue button
      timers.push(setTimeout(() => setShowContinue(true), 2300));
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed]);

  return (
    <div className="step7-root">
      <canvas ref={canvasRef} className="step7-ambient-canvas" />
      <div className="step7-vignette" />

      <button
        type="button"
        aria-label="Back to previous step"
        className="step7-back-btn"
        onClick={() => router.push("/design/step-6")}
      >
        ← Back
      </button>
      <button
        type="button"
        aria-label="Cova — home"
        className="step7-cta-wordmark"
        onClick={() => router.push("/")}
      >
        Cova
      </button>

      <div className="step7-cm step7-cm-tl" />
      <div className="step7-cm step7-cm-tr" />
      <div className="step7-cm step7-cm-bl" />
      <div className="step7-cm step7-cm-br" />

      <div className="step7-screen">
        <div className="step7-eyebrow">Analyzing Your Space</div>

        <div className="step7-headline-wrap">
          {HEADLINES.map((line, i) => (
            <div
              key={line}
              className={`step7-headline${i === headlineIdx ? " active" : ""}`}
            >
              {line}
            </div>
          ))}
        </div>

        <div className="step7-room-stage">
          <div className="step7-room-pivot">
            <div className="step7-wall step7-w-floor" />
            <div className="step7-wall step7-w-back" />
            <div className="step7-wall step7-w-left" />
            <div className="step7-wall step7-w-right" />
            <div className="step7-wall step7-w-ceil" />
            <div className="step7-wall step7-w-front" />

            <div className="step7-f-sofa">
              <div className="step7-f-sofa-top" />
              <div className="step7-f-sofa-back" />
            </div>
            <div className="step7-f-table">
              <div className="step7-f-table-top" />
            </div>
            <div className="step7-f-lamp">
              <div className="step7-f-lamp-shade" />
              <div className="step7-f-lamp-pole" />
            </div>
          </div>

          <div className="step7-scan-line" />

          {DETECTION_DOTS.map((d) => (
            <div
              key={d.id}
              className={`step7-dot-wrap${visibleDots.has(d.id) ? " visible" : ""}`}
              style={{ left: d.left, top: d.top }}
            >
              <div className="step7-dot" />
              <div className="step7-dot-label">{d.label}</div>
            </div>
          ))}
        </div>

        <div className="step7-progress-wrap">
          <div className="step7-progress-track">
            <div ref={progressFillRef} className="step7-progress-fill" />
          </div>
        </div>

        <div className="step7-status-wrap">
          {(roomId ?? area2RoomId) && photoUrl
            ? POLLING_MESSAGES.map((msg, i) => (
                <div
                  key={msg}
                  className={`step7-status-msg${i === pollingMsgIdx ? " active" : ""}`}
                >
                  {msg}
                </div>
              ))
            : STATUS_MESSAGES.map((msg, i) => (
                <div
                  key={msg}
                  className={`step7-status-msg${i === statusIdx ? " active" : ""}`}
                >
                  {msg}
                </div>
              ))}
        </div>
      </div>

      <div
        className="step7-completion-msg"
        style={{ opacity: showCompletionMsg ? 1 : 0 }}
      >
        ✧ &nbsp; Analysis Complete
      </div>

      <div
        className="step7-flash"
        style={{
          opacity: flashOpacity,
          transition:
            flashOpacity === 1 ? "opacity 0.3s ease" : "opacity 0.8s ease",
        }}
      />

      <div className={`step7-continue${showContinue ? " visible" : ""}`}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div className="step7-cta-label">Your analysis is ready.</div>
          <div className="step7-cta-sub">
            Cova has mapped your space and identified your style.
          </div>
          <button
            type="button"
            className="step7-cta-btn"
            onClick={() => router.push("/design/step-7b")}
          >
            Continue →
          </button>
        </div>
      </div>

      {!showContinue && (
        <button
          type="button"
          className="step7-skip-btn"
          onClick={() => setCompleted(true)}
        >
          Skip to Results →
        </button>
      )}
    </div>
  );
}
