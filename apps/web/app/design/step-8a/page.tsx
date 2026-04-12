"use client";

/**
 * Design reminder for Step 8A:
 * Treat the room as the hero object and let every motion cue, overlay, and interaction feel
 * like a sculptural unveiling suspended in cinematic space.
 */
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoomStore } from "@/lib/store/room";
import { useFingerprintStore } from "@/lib/store/fingerprint";
import "../step-1/step1.css";
import "./step8a.css";

const DEFAULT_RENDER_COUNT = 3;

type PointerState = {
  x: number;
  y: number;
  glowX: number;
  glowY: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export default function RevealStep8A() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Store values — read on mount, used as primary source
  const storeRenderUrl = useRoomStore((s) => s.renderUrl);
  const storeRenderSessions = useRoomStore((s) => s.renderSessions);
  const storeRoomId = useRoomStore((s) => s.roomId);
  const storeStyleName = useFingerprintStore((s) => s.styleName);
  const storeStyleTags = useFingerprintStore((s) => s.styleTags);

  // Dynamic state replacing hardcoded constants
  const [heroImage, setHeroImage] = useState<string | null>(null);
  const [styleName, setStyleName] = useState<string>("");
  const [styleTags, setStyleTags] = useState<string[]>([]);
  const [remainingRenders, setRemainingRenders] =
    useState(DEFAULT_RENDER_COUNT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<string>("");
  const [retryTick, setRetryTick] = useState(0);

  const [pointer, setPointer] = useState<PointerState>({
    x: 0,
    y: 0,
    glowX: 50,
    glowY: 38,
  });

  useEffect(() => {
    const checkAuthAndLoadData = async () => {
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth?next=/design/step-8a");
        return;
      }

      // 1. Try Zustand store first (fastest — already in memory)
      const resolvedRenderUrl = storeRenderUrl ?? null;
      const resolvedStyleName = storeStyleName ?? "";
      const resolvedStyleTags = storeStyleTags ?? [];

      // Refinement count: DEFAULT minus sessions already used
      const usedSessions = storeRenderSessions?.length ?? 0;
      const resolvedRemainingRenders = Math.max(
        0,
        DEFAULT_RENDER_COUNT - usedSessions,
      );

      if (resolvedRenderUrl) {
        // Store had everything we need
        setHeroImage(resolvedRenderUrl);
        setStyleName(resolvedStyleName);
        setStyleTags(resolvedStyleTags);
        setRemainingRenders(resolvedRemainingRenders);
        setLoading(false);
        return;
      }

      // 2. Store had no render URL — query Supabase for most recent room
      try {
        const urlRoomId =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("roomId")
            : null;
        const resolvedRoomId = storeRoomId ?? urlRoomId ?? null;
        let roomQuery = supabase
          .from("rooms")
          .select("render_url, redesign_pano_url, created_at")
          .eq("user_id", user.id);
        if (resolvedRoomId) {
          roomQuery = roomQuery.eq("id", resolvedRoomId);
        }
        const { data: rooms, error: roomsError } = await roomQuery
          .order("created_at", { ascending: false })
          .limit(1);

        if (roomsError) throw roomsError;

        const room = rooms?.[0] ?? null;
        // Prefer redesign_pano_url (set by redesign pipeline) over legacy render_url
        const resolvedUrl = room?.redesign_pano_url ?? room?.render_url;

        if (!resolvedUrl) {
          // No URL yet — keep loading=true; polling effect will handle it
          return;
        }

        setHeroImage(resolvedUrl);
        setStyleTags(resolvedStyleTags);
        setRemainingRenders(resolvedRemainingRenders);
        setLoading(false);
      } catch {
        setError("Unable to load your room. Please try again.");
        setLoading(false);
      }
    };

    checkAuthAndLoadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Poll for redesign pipeline completion if no hero image loaded yet.
  // The redesign pipeline writes redesign_pano_url directly to Supabase.
  const storeRoomId2 = useRoomStore((s) => s.roomId);
  const [urlRoomId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("roomId");
  });
  const roomId = storeRoomId2 ?? urlRoomId;
  useEffect(() => {
    if (heroImage || !roomId) return;
    let cancelled = false;
    const poll = setInterval(async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/rooms/status?roomId=${encodeURIComponent(roomId)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          redesign_status?: string;
          redesignPanoUrl?: string | null;
          perspective_render_url?: string | null;
        };
        // Update pipeline status for loading UI
        if (data.redesign_status) {
          setPipelineStatus(data.redesign_status);
        }
        const panoUrl = data.redesignPanoUrl ?? data.perspective_render_url;
        if (panoUrl && !cancelled) {
          setHeroImage(panoUrl);
          setLoading(false);
          clearInterval(poll);

          // Fire render detection for zone bounding boxes (non-blocking)
          fetch("/api/detect/render", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomId }),
          }).catch((err) =>
            console.warn("[step-8a] Render detection trigger failed:", err),
          );
        }
        if (
          (data.redesign_status === "error" ||
            data.redesign_status === "failed") &&
          !cancelled
        ) {
          setError(
            "Something went wrong with your render. Please try again or contact support.",
          );
          setLoading(false);
          clearInterval(poll);
        }
      } catch {
        /* silent */
      }
    }, 3000);
    // 5-minute timeout
    const timeout = setTimeout(() => {
      if (!cancelled) {
        clearInterval(poll);
        setError(
          "Your redesign is taking longer than expected. Please try again.",
        );
        setLoading(false);
      }
    }, 300_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroImage, roomId, retryTick]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    type Particle = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      life: number;
    };

    let animationFrameId = 0;
    let particles: Particle[] = [];

    const resizeCanvas = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const devicePixelRatio = window.devicePixelRatio || 1;

      canvas.width = width * devicePixelRatio;
      canvas.height = height * devicePixelRatio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

      const originX = width / 2;
      const originY = height / 2;

      particles = Array.from({ length: 40 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 40 + Math.random() * 0.28;
        const velocity = 2.4 + Math.random() * 4.4;

        return {
          x: originX,
          y: originY,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity,
          radius: 1.2 + Math.random() * 2.8,
          life: 1,
        };
      });
    };

    resizeCanvas();

    const renderParticles = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      context.clearRect(0, 0, width, height);

      particles.forEach((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vx *= 0.985;
        particle.vy *= 0.985;
        particle.life = Math.max(0, particle.life - 0.02);

        if (particle.life <= 0) {
          return;
        }

        const glow = context.createRadialGradient(
          particle.x,
          particle.y,
          0,
          particle.x,
          particle.y,
          particle.radius * 7,
        );

        glow.addColorStop(0, `rgba(201, 168, 76, ${0.95 * particle.life})`);
        glow.addColorStop(0.35, `rgba(245, 240, 232, ${0.22 * particle.life})`);
        glow.addColorStop(1, "rgba(201, 168, 76, 0)");

        context.fillStyle = glow;
        context.beginPath();
        context.arc(
          particle.x,
          particle.y,
          particle.radius * 7,
          0,
          Math.PI * 2,
        );
        context.fill();
      });

      if (particles.some((particle) => particle.life > 0)) {
        animationFrameId = window.requestAnimationFrame(renderParticles);
      } else {
        context.clearRect(0, 0, width, height);
      }
    };

    animationFrameId = window.requestAnimationFrame(renderParticles);
    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resizeCanvas);
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };
  }, []);

  const interactiveStyle = useMemo(
    () =>
      ({
        "--pointer-x": pointer.x.toFixed(4),
        "--pointer-y": pointer.y.toFixed(4),
        "--glow-x": `${pointer.glowX}%`,
        "--glow-y": `${pointer.glowY}%`,
      }) as CSSProperties,
    [pointer],
  );

  const handlePointerMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeX = (event.clientX - bounds.left) / bounds.width;
    const relativeY = (event.clientY - bounds.top) / bounds.height;

    setPointer({
      x: clamp((relativeX - 0.5) * 2, -1, 1),
      y: clamp((relativeY - 0.5) * 2, -1, 1),
      glowX: relativeX * 100,
      glowY: relativeY * 100,
    });
  };

  const resetPointer = () => {
    setPointer({
      x: 0,
      y: 0,
      glowX: 50,
      glowY: 38,
    });
  };

  const isRefineLocked = remainingRenders <= 0;

  // Loading state — sequential pipeline progress steps
  if (loading) {
    const steps = [
      { key: "analyzing_room", label: "Analyzing your space..." },
      { key: "applying_style", label: "Applying your style preferences..." },
      { key: "rendering", label: "Rendering your redesign..." },
      { key: "finalizing", label: "Almost ready..." },
    ];
    const currentIdx = steps.findIndex((s) => s.key === pipelineStatus);
    const effectiveIdx = currentIdx === -1 ? 0 : currentIdx;

    return (
      <div
        style={{
          minHeight: "100dvh",
          background: "#0A1628",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "24px",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            minWidth: 280,
          }}
        >
          {steps.map((step, i) => {
            const isCompleted = i < effectiveIdx;
            const isActive = i === effectiveIdx;
            return (
              <div
                key={step.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  opacity: isCompleted || isActive ? 1 : 0.4,
                  transition: "opacity 0.3s ease",
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: `2px solid ${isCompleted ? "#4A9B7F" : isActive ? "#C9A84C" : "#1E3A5F"}`,
                    background: isCompleted ? "#4A9B7F" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    animation: isActive
                      ? "pulse 1.5s ease-in-out infinite"
                      : "none",
                  }}
                  aria-hidden="true"
                >
                  {isCompleted ? (
                    <svg width="10" height="10" viewBox="0 0 12 12">
                      <polyline
                        points="2,6 5,9 10,3"
                        fill="none"
                        stroke="#0A1628"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : null}
                </div>
                <p
                  style={{
                    fontFamily: "Inter, sans-serif",
                    color: isActive ? "#F8F6F1" : "#8BA3C0",
                    fontSize: 14,
                    letterSpacing: "0.02em",
                    fontWeight: isActive ? 600 : 400,
                    margin: 0,
                  }}
                >
                  {step.label}
                </p>
              </div>
            );
          })}
        </div>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        `}</style>
      </div>
    );
  }

  // Error state — no render found after loading
  if (!heroImage && !loading) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          background: "#0A1628",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "20px",
          padding: "0 24px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            color: "#F8F6F1",
            fontSize: "16px",
          }}
        >
          {error ?? "No rendered room found."}
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            type="button"
            onClick={async () => {
              if (!roomId) return;
              setError(null);
              setLoading(true);
              // Reset redesign_status so the Modal pipeline doesn't hit an
              // in-flight/idempotency guard on retry.
              try {
                const { createBrowserClient } =
                  await import("@/lib/supabase/client");
                const supabase = createBrowserClient();
                const {
                  data: { user: u },
                } = await supabase.auth.getUser();
                if (u) {
                  await supabase
                    .from("rooms")
                    .update({ redesign_status: "failed" })
                    .eq("id", roomId)
                    .eq("user_id", u.id);
                }
              } catch (err) {
                console.warn("[step-8a] status reset failed:", err);
              }
              // Re-fire redesign pipeline
              fetch("/api/pipeline/redesign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ room_id: roomId }),
              }).catch((err) => console.warn("[step-8a] Retry failed:", err));
              // Restart polling
              setRetryTick((n) => n + 1);
            }}
            style={{
              fontFamily: "Inter, sans-serif",
              background: "#C9A84C",
              color: "#0A1628",
              border: "none",
              borderRadius: "24px",
              padding: "12px 28px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.04em",
            }}
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() =>
              window.open("mailto:hello@covainterior.com", "_blank")
            }
            style={{
              fontFamily: "Inter, sans-serif",
              background: "transparent",
              color: "#F8F6F1",
              border: "1px solid rgba(201,168,76,0.4)",
              borderRadius: "24px",
              padding: "12px 28px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.04em",
            }}
          >
            Contact Support
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="reveal-shell"
      style={interactiveStyle}
      onMouseMove={handlePointerMove}
      onMouseLeave={resetPointer}
    >
      <canvas ref={canvasRef} className="reveal-particles" aria-hidden="true" />

      <div className="reveal-scene">
        <div className="reveal-image-parallax">
          <div className="reveal-image-fade">
            <img
              className="reveal-image"
              src={heroImage ?? undefined}
              alt="A redesigned luxury living room reveal"
            />
          </div>
        </div>
        <div className="reveal-vignette" aria-hidden="true" />
        <div className="reveal-lux-light" aria-hidden="true" />
        <div className="reveal-grain" aria-hidden="true" />
        <div className="reveal-blackout" aria-hidden="true" />
        <div className="reveal-title" aria-hidden="true">
          <span className="reveal-title__glyph">✦</span>
          <em>Your room is ready</em>
        </div>
      </div>

      <header className="reveal-brand">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="reveal-wordmark"
        >
          COVA
        </button>
      </header>

      <section
        className="reveal-style-plaque"
        aria-label="Selected style details"
      >
        {styleName ? <p className="reveal-style-name">{styleName}</p> : null}
        {styleTags.length > 0 ? (
          <div className="reveal-tags">
            {styleTags.map((tag) => (
              <span key={tag} className="reveal-tag">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <div className="reveal-bottom-gradient" aria-hidden="true" />

      <section className="reveal-bottom-panel" aria-label="Reveal actions">
        <div className="reveal-counter">
          <p className="reveal-counter__label">
            {remainingRenders} refinement{remainingRenders === 1 ? "" : "s"}{" "}
            remaining
          </p>
          <div className="reveal-counter__dots" aria-hidden="true">
            {Array.from({ length: DEFAULT_RENDER_COUNT }, (_, index) => (
              <span
                key={`render-dot-${index + 1}`}
                className={`reveal-counter__dot ${index < remainingRenders ? "is-active" : ""}`}
              />
            ))}
          </div>
        </div>

        <div className="reveal-actions">
          <div
            className={`reveal-tooltip-wrap ${isRefineLocked ? "is-locked" : ""}`}
          >
            <button
              type="button"
              className={`reveal-ghost-button ${isRefineLocked ? "is-muted" : ""}`}
              aria-disabled={isRefineLocked}
              onClick={() => {
                if (!isRefineLocked) {
                  router.push("/design/step-8b");
                }
              }}
            >
              Refine This
            </button>
            {isRefineLocked ? (
              <div className="reveal-tooltip" role="tooltip">
                Upgrade to Pro for unlimited refinements
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="reveal-shop-button"
            onClick={() => router.push("/design/step-9")}
          >
            <span>Shop This Look</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    </div>
  );
}
