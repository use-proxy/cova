"use client";

import "../step-1/step1.css";
import "./step7c.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useArea2Store } from "@/lib/stores/area2Store";

type Decision = "keep" | "remove" | null;

type RoomItem = {
  id: number;
  name: string;
  category: string;
  decision: Decision;
  confidence?: number;
  isFixed?: boolean;
  dominantColor?: string;
  material?: string;
  sizeInRoom?: "large" | "medium" | "small";
  styleDescriptors?: string[];
  position: {
    x: number;
    y: number;
  };
  highlight: {
    left: string;
    top: string;
    width: string;
    height: string;
  };
};

type DetectedItem = {
  label: string;
  category: string;
  azimuth_degrees: number;
  elevation_degrees: number;
  is_fixed: boolean;
  confidence: number;
  dominant_color?: string | null;
  material?: string | null;
  size_in_room?: "large" | "medium" | "small" | null;
  style_descriptors?: string[] | null;
};

function mapDetectedToRoomItems(detected: DetectedItem[]): RoomItem[] {
  return detected.map((d, i) => ({
    id: i + 1,
    name: d.label.replace(/\b\w/g, (c) => c.toUpperCase()),
    category: (d.category ?? "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    decision: d.is_fixed ? ("keep" as Decision) : null,
    confidence: typeof d.confidence === "number" ? d.confidence : undefined,
    isFixed: !!d.is_fixed,
    dominantColor: d.dominant_color ?? undefined,
    material: d.material ?? undefined,
    sizeInRoom: d.size_in_room ?? undefined,
    styleDescriptors: Array.isArray(d.style_descriptors)
      ? d.style_descriptors
      : undefined,
    position: {
      x: Math.round(50 + (d.azimuth_degrees / 90) * 40),
      y: Math.round(50 + (d.elevation_degrees / 60) * 30),
    },
    highlight: {
      left: `${Math.max(5, Math.min(80, 50 + (d.azimuth_degrees / 90) * 40 - 8))}%`,
      top: `${Math.max(5, Math.min(80, 50 + (d.elevation_degrees / 60) * 30 - 8))}%`,
      width: "16%",
      height: "16%",
    },
  }));
}

function CheckIcon() {
  return (
    <svg
      className="step7c-icon"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 8.5 6.2 11.7 13 4.8"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      className="step7c-icon"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 4 12 12M12 4 4 12"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

type LoadState = "loading" | "empty" | "ready" | "timeout";

export default function Step7cKeepOrRemove() {
  const router = useRouter();
  const [items, setItems] = useState<RoomItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [roomPhotoUrl, setRoomPhotoUrl] = useState<string | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<number | null>(null);
  const [activeItemId, setActiveItemId] = useState<number | null>(null);
  const [flashAction, setFlashAction] = useState<
    "keepAll" | "startFresh" | null
  >(null);
  const [displayedDecidedCount, setDisplayedDecidedCount] = useState(0);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  /* ---- Auth gate + poll pre-detection results from Supabase ---- */
  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();
    // 3-minute ceiling. After this we stop polling and show the timeout UI.
    const POLL_TIMEOUT_MS = 180_000;

    const loadOnce = async () => {
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth?next=/design/step-7c");
        return;
      }

      const { data: rooms } = await supabase
        .from("rooms")
        .select(
          "id, pre_detection_result, photo_url, original_image_url, original_photo_url",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (cancelled) return;

      const room = rooms?.[0];
      const photo =
        room?.photo_url ??
        room?.original_image_url ??
        room?.original_photo_url ??
        null;
      if (photo) setRoomPhotoUrl(photo);

      const raw = room?.pre_detection_result;
      if (raw === null || raw === undefined) {
        if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
          if (!cancelled) setLoadState("timeout");
          return;
        }
        // Still waiting on pipeline. Poll again in 2s.
        pollTimer = setTimeout(loadOnce, 2000);
        return;
      }

      if (!Array.isArray(raw) || raw.length === 0) {
        setItems([]);
        setLoadState("empty");
        return;
      }

      const mapped = mapDetectedToRoomItems(raw as DetectedItem[]);
      setItems(mapped);
      setActiveItemId(mapped[0]?.id ?? null);
      setLoadState("ready");
    };

    loadOnce();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [router]);

  const roomImageSrc = roomPhotoUrl ?? "";
  const nonFixedItems = useMemo(
    () => items.filter((item) => !item.isFixed),
    [items],
  );
  const decidedCount = useMemo(
    () => nonFixedItems.filter((item) => item.decision !== null).length,
    [nonFixedItems],
  );
  const totalDecidable = nonFixedItems.length;
  const keepCount = useMemo(
    () => items.filter((item) => item.decision === "keep").length,
    [items],
  );
  const removeCount = useMemo(
    () => items.filter((item) => item.decision === "remove").length,
    [items],
  );
  const allDecided = totalDecidable > 0 && decidedCount === totalDecidable;

  useEffect(() => {
    const totalFrames = 18;
    const startValue = displayedDecidedCount;
    const difference = decidedCount - startValue;

    if (difference === 0) {
      return;
    }

    let frame = 0;
    const interval = window.setInterval(() => {
      frame += 1;
      const nextValue = Math.round(
        startValue + (difference * frame) / totalFrames,
      );
      setDisplayedDecidedCount(nextValue);

      if (frame >= totalFrames) {
        window.clearInterval(interval);
        setDisplayedDecidedCount(decidedCount);
      }
    }, 20);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decidedCount]);

  const setDecision = (id: number, decision: Exclude<Decision, null>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, decision } : item)),
    );
    setActiveItemId(id);
  };

  const flash = (name: "keepAll" | "startFresh") => {
    setFlashAction(name);
    window.setTimeout(() => {
      setFlashAction((current) => (current === name ? null : current));
    }, 420);
  };

  const handleKeepAll = () => {
    setItems((current) =>
      current.map((item) => ({ ...item, decision: "keep" })),
    );
    flash("keepAll");
  };

  const handleStartFresh = () => {
    setItems((current) =>
      current.map((item) => ({ ...item, decision: "remove" })),
    );
    flash("startFresh");
  };

  const handleBadgeSelect = (id: number) => {
    setActiveItemId(id);
    cardRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  const setKeepMask = useArea2Store((s) => s.setKeepMask);

  const handleContinue = async () => {
    if (!allDecided) return;

    // Update Area2Store keepMask so the assembler can read it
    setKeepMask({
      objects: items.map((item) => ({
        id: String(item.id),
        type: item.name,
        bbox: [0, 0, 0, 0] as [number, number, number, number],
        confidence: 1,
        confidenceTier: "show-user" as const,
        keep: item.decision === "keep",
        immovable: !!item.isFixed,
        material: item.material,
        dominantColor: item.dominantColor,
        sizeInRoom: item.sizeInRoom,
        styleDescriptors: item.styleDescriptors,
      })),
      depthMapUrl: "",
      rawDetectionCount: items.length,
      detectionModelVersion: "user-selection",
    });

    // Persist keep/remove decisions to Supabase
    try {
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: rooms } = await supabase
          .from("rooms")
          .select("id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);
        const roomId = rooms?.[0]?.id;
        if (roomId) {
          const decisions = items.map((item) => ({
            id: item.id,
            name: item.name,
            category: item.category,
            decision: item.decision,
          }));
          await supabase
            .from("rooms")
            .update({ keep_remove_decisions: decisions })
            .eq("id", roomId);
        }
      }
    } catch (err) {
      console.warn("[step-7c] Failed to persist decisions:", err);
    }

    router.push("/design/step-7d");
  };

  if (loadState === "loading") {
    return (
      <main
        className="step7c-page"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100dvh",
          background: "#0A1628",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              border: "3px solid rgba(201,168,76,0.2)",
              borderTopColor: "#C9A84C",
              animation: "spin 1s linear infinite",
            }}
            aria-hidden="true"
          />
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              color: "#F8F6F1",
              fontSize: 14,
              letterSpacing: "0.02em",
            }}
          >
            Detecting items in your room...
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  if (loadState === "timeout") {
    return (
      <main
        className="step7c-page"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100dvh",
          background: "#0A1628",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              color: "#F8F6F1",
              fontSize: 16,
              maxWidth: 440,
              lineHeight: 1.5,
            }}
          >
            Detection is taking longer than expected. You can retry or re-upload
            your photo.
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              onClick={async () => {
                setLoadState("loading");
                try {
                  const { createBrowserClient } =
                    await import("@/lib/supabase/client");
                  const supabase = createBrowserClient();
                  const {
                    data: { user },
                  } = await supabase.auth.getUser();
                  if (user) {
                    const { data: rooms } = await supabase
                      .from("rooms")
                      .select("id")
                      .eq("user_id", user.id)
                      .order("created_at", { ascending: false })
                      .limit(1);
                    const rid = rooms?.[0]?.id;
                    if (rid) {
                      await fetch("/api/pipeline/pre-detect", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ room_id: rid }),
                      });
                    }
                  }
                } catch (err) {
                  console.warn("[step-7c] retry failed:", err);
                }
                window.location.reload();
              }}
              style={{
                fontFamily: "Inter, sans-serif",
                background: "#C9A84C",
                color: "#0A1628",
                border: "none",
                borderRadius: 24,
                padding: "12px 28px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                letterSpacing: "0.04em",
              }}
            >
              Retry detection
            </button>
            <button
              type="button"
              onClick={() => router.push("/design/step-6")}
              style={{
                fontFamily: "Inter, sans-serif",
                background: "transparent",
                color: "#F8F6F1",
                border: "1px solid rgba(201,168,76,0.4)",
                borderRadius: 24,
                padding: "12px 28px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                letterSpacing: "0.04em",
              }}
            >
              Re-upload photo
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (loadState === "empty") {
    return (
      <main
        className="step7c-page"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100dvh",
          background: "#0A1628",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              color: "#F8F6F1",
              fontSize: 16,
              maxWidth: 420,
              lineHeight: 1.5,
            }}
          >
            We couldn&apos;t detect any items in your photo. Try uploading a
            clearer image.
          </p>
          <button
            type="button"
            onClick={() => router.push("/design/step-6")}
            style={{
              fontFamily: "Inter, sans-serif",
              background: "#C9A84C",
              color: "#0A1628",
              border: "none",
              borderRadius: 24,
              padding: "12px 28px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.04em",
            }}
          >
            Re-upload Photo
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="step7c-page">
      <nav className="step7c-topbar" aria-label="Step navigation">
        <a
          className="step7c-nav-link"
          href="/design/step-7b"
          onClick={(event) => {
            event.preventDefault();
            router.push("/design/step-7b");
          }}
        >
          <span aria-hidden="true">&larr;</span>
          <span>Back</span>
        </a>
        <button
          type="button"
          className="step7c-brand"
          onClick={() => router.push("/")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          Cova
        </button>
        <div className="step7c-step">3 of 5</div>
      </nav>

      <div className="step7c-shell">
        <section className="step7c-grid" aria-label="Keep or remove room items">
          <div className="step7c-room">
            <div className="step7c-room-frame">
              <img
                className="step7c-room-photo"
                src={roomImageSrc}
                alt="Scanned room with detected furniture items"
              />
              <div className="step7c-room-overlay" />
              <div className="step7c-room-scan" />

              {items.map((item, index) => {
                const isVisible = activeItemId === item.id;

                return (
                  <div key={item.id}>
                    <div
                      className={`step7c-item-highlight${isVisible ? " is-visible" : ""}`}
                      style={item.highlight}
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      className={`step7c-badge${isVisible ? " is-active" : ""}`}
                      style={{
                        left: `${item.position.x}%`,
                        top: `${item.position.y}%`,
                        animationDelay: `${index * 90}ms`,
                      }}
                      onMouseEnter={() => setActiveItemId(item.id)}
                      onFocus={() => setActiveItemId(item.id)}
                      onClick={() => handleBadgeSelect(item.id)}
                      aria-label={`Select ${item.name}`}
                    >
                      {item.id}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="step7c-panel">
            <div className="step7c-panel-header">
              <div>
                <h1 className="step7c-heading">What stays in your new room?</h1>
                <p className="step7c-subtext">
                  Only items you keep will be worked around.
                </p>
              </div>
              <div className="step7c-progress-pill" aria-live="polite">
                {displayedDecidedCount} of {totalDecidable} decided
              </div>
            </div>

            <div className="step7c-quick-actions">
              <button
                type="button"
                className={`step7c-ghost-action${flashAction === "keepAll" ? " is-flashing" : ""}`}
                onClick={handleKeepAll}
              >
                Keep All
              </button>
              <button
                type="button"
                className={`step7c-ghost-action${flashAction === "startFresh" ? " is-flashing" : ""}`}
                onClick={handleStartFresh}
              >
                Start Fresh
              </button>
            </div>

            <div
              className="step7c-list"
              role="list"
              aria-label="Detected furniture items"
            >
              {items.map((item) => {
                const isKeep = item.decision === "keep";
                const isRemove = item.decision === "remove";
                const isFocused = activeItemId === item.id;

                return (
                  <div
                    key={item.id}
                    ref={(element) => {
                      cardRefs.current[item.id] = element;
                    }}
                    className={`step7c-card${isFocused ? " is-focused" : ""}${isKeep ? " is-keep" : ""}${isRemove ? " is-remove" : ""}`}
                    role="listitem"
                    onMouseEnter={() => setActiveItemId(item.id)}
                  >
                    <div className="step7c-card-main">
                      <div className="step7c-card-badge">{item.id}</div>
                      <div className="step7c-card-copy">
                        {editingLabelId === item.id ? (
                          <input
                            type="text"
                            defaultValue={item.name}
                            autoFocus
                            onBlur={(e) => {
                              const newLabel = e.currentTarget.value.trim();
                              if (newLabel && newLabel !== item.name) {
                                setItems((curr) =>
                                  curr.map((it) =>
                                    it.id === item.id
                                      ? { ...it, name: newLabel }
                                      : it,
                                  ),
                                );
                              }
                              setEditingLabelId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                (e.currentTarget as HTMLInputElement).blur();
                              } else if (e.key === "Escape") {
                                setEditingLabelId(null);
                              }
                            }}
                            style={{
                              background: "transparent",
                              border: "1px solid rgba(201,168,76,0.6)",
                              color: "#F8F6F1",
                              padding: "4px 8px",
                              borderRadius: 4,
                              fontSize: 16,
                              width: "100%",
                            }}
                          />
                        ) : (
                          <h2 className="step7c-card-title">{item.name}</h2>
                        )}
                        <div className="step7c-card-category">
                          {item.category}
                        </div>
                        {typeof item.confidence === "number" &&
                          item.confidence < 0.85 && (
                            <div
                              style={{
                                fontSize: 11,
                                color:
                                  item.confidence < 0.65
                                    ? "#C0504A"
                                    : "#C9A84C",
                                marginTop: 4,
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <span>
                                {item.confidence < 0.65
                                  ? "Not sure what this is"
                                  : "AI detected — is this right?"}
                              </span>
                              <button
                                type="button"
                                onClick={() => setEditingLabelId(item.id)}
                                style={{
                                  background: "transparent",
                                  border: "1px solid rgba(201,168,76,0.4)",
                                  color: "#C9A84C",
                                  borderRadius: 4,
                                  padding: "2px 8px",
                                  fontSize: 10,
                                  cursor: "pointer",
                                }}
                              >
                                Edit
                              </button>
                            </div>
                          )}
                      </div>
                    </div>

                    <div className="step7c-actions">
                      <button
                        type="button"
                        className={`step7c-choice step7c-choice--keep${isKeep ? " is-selected" : ""}`}
                        onClick={() => setDecision(item.id, "keep")}
                        aria-pressed={isKeep}
                      >
                        <CheckIcon />
                        <span>KEEP</span>
                      </button>
                      <button
                        type="button"
                        className={`step7c-choice step7c-choice--remove${isRemove ? " is-selected" : ""}`}
                        onClick={() => setDecision(item.id, "remove")}
                        aria-pressed={isRemove}
                      >
                        <CloseIcon />
                        <span>REMOVE</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </section>
      </div>

      <div className="step7c-bottombar">
        <div className="step7c-summary">
          <strong>{keepCount}</strong> items keeping{" "}
          <span aria-hidden="true">/</span> <strong>{removeCount}</strong> items
          removing
        </div>
        <button
          type="button"
          className={`step7c-cta${allDecided ? " is-ready" : ""}`}
          disabled={!allDecided}
          onClick={handleContinue}
        >
          Lock In My Choices &rarr;
        </button>
      </div>
    </main>
  );
}
