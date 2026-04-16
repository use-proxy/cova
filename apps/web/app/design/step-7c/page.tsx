"use client";

import "../step-1/step1.css";
import "./step7c.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useArea2Store } from "@/lib/stores/area2Store";

type Decision = "keep" | "remove" | null;

type AutoDecision = "keep" | "remove" | null;

type BBoxPct = { x: number; y: number; w: number; h: number };

type RoomItem = {
  id: number;
  name: string;
  label: string;
  category: string;
  decision: Decision;
  autoDecision: AutoDecision;
  confidence?: number;
  isFixed?: boolean;
  dominantColor?: string;
  material?: string;
  sizeInRoom?: "large" | "medium" | "small";
  styleDescriptors?: string[];
  bbox: BBoxPct;
};

type DetectedItem = {
  label: string;
  category: string;
  estimated_bbox_pct?: BBoxPct | null;
  azimuth_degrees?: number;
  elevation_degrees?: number;
  is_fixed: boolean;
  confidence: number;
  auto_decision?: "keep" | "remove" | null;
  dominant_color?: string | null;
  material?: string | null;
  size_in_room?: "large" | "medium" | "small" | null;
  style_descriptors?: string[] | null;
};

const STRUCTURAL_CATEGORIES = new Set([
  "ceiling",
  "wall",
  "floor",
  "window",
  "door",
  "built_in_shelving",
  "radiator",
  "fireplace",
  "built_in_wardrobe",
]);

const CLUTTER_CATEGORIES = new Set([
  "cable",
  "power_cord",
  "bag",
  "clothing_on_floor",
  "trash",
  "random_item",
]);

function normalizeCategory(c: string | null | undefined): string {
  return (c ?? "").toLowerCase().trim().replace(/\s+/g, "_");
}

function resolveAutoDecision(d: DetectedItem): AutoDecision {
  if (d.auto_decision === "keep" || d.auto_decision === "remove") {
    return d.auto_decision;
  }
  const cat = normalizeCategory(d.category);
  if (STRUCTURAL_CATEGORIES.has(cat)) return "keep";
  if (CLUTTER_CATEGORIES.has(cat)) return "remove";
  return null;
}

function bboxFromAzimuth(
  azimuth_degrees: number | undefined,
  elevation_degrees: number | undefined,
): BBoxPct {
  const az = typeof azimuth_degrees === "number" ? azimuth_degrees : 0;
  const el = typeof elevation_degrees === "number" ? elevation_degrees : 0;
  return {
    x: Math.max(0, Math.min(0.95, 0.5 + (az / 90) * 0.4 - 0.05)),
    y: Math.max(0, Math.min(0.95, 0.5 - (el / 60) * 0.3 - 0.05)),
    w: 0.1,
    h: 0.1,
  };
}

function mapDetectedToRoomItems(detected: DetectedItem[]): RoomItem[] {
  return detected.map((d, i) => {
    const auto = resolveAutoDecision(d);
    let bbox: BBoxPct;
    if (d.estimated_bbox_pct && typeof d.estimated_bbox_pct === "object") {
      bbox = {
        x: Math.max(0, Math.min(1, d.estimated_bbox_pct.x ?? 0.4)),
        y: Math.max(0, Math.min(1, d.estimated_bbox_pct.y ?? 0.4)),
        w: Math.max(0.02, Math.min(1, d.estimated_bbox_pct.w ?? 0.2)),
        h: Math.max(0.02, Math.min(1, d.estimated_bbox_pct.h ?? 0.2)),
      };
    } else if (
      typeof d.azimuth_degrees === "number" ||
      typeof d.elevation_degrees === "number"
    ) {
      bbox = bboxFromAzimuth(d.azimuth_degrees, d.elevation_degrees);
    } else {
      bbox = { x: 0.5, y: 0.5, w: 0.1, h: 0.1 };
    }

    return {
      id: i + 1,
      name: d.label.replace(/\b\w/g, (c) => c.toUpperCase()),
      label: d.label.toLowerCase(),
      category: (d.category ?? "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      decision: auto ?? (d.is_fixed ? "keep" : null),
      autoDecision: auto,
      confidence: typeof d.confidence === "number" ? d.confidence : undefined,
      isFixed: !!d.is_fixed,
      dominantColor: d.dominant_color ?? undefined,
      material: d.material ?? undefined,
      sizeInRoom: d.size_in_room ?? undefined,
      styleDescriptors: Array.isArray(d.style_descriptors)
        ? d.style_descriptors
        : undefined,
      bbox,
    };
  });
}

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 60_000;
const MASKS_POLL_INTERVAL_MS = 2_000;
const MASKS_MAX_WAIT_MS = 90_000;

type LoadState = "loading" | "empty" | "ready" | "timeout";
type MasksState = "pending" | "ready" | "timeout";

export default function Step7cKeepOrRemove() {
  const router = useRouter();
  const [items, setItems] = useState<RoomItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [roomPhotoUrl, setRoomPhotoUrl] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [itemMasks, setItemMasks] = useState<Record<string, string>>({});
  const [masksState, setMasksState] = useState<MasksState>("pending");
  const [retryTick, setRetryTick] = useState(0);
  const [activeItemId, setActiveItemId] = useState<number | null>(null);
  const [displayedDecidedCount, setDisplayedDecidedCount] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const segmentMasksFiredRef = useRef(false);

  /* ───────────── Load detection results ───────────── */
  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

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
          "id, pre_detection_result, original_image_url, original_photo_url, render_context",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (cancelled) return;

      const room = rooms?.[0];
      const photo =
        room?.original_photo_url ?? room?.original_image_url ?? null;
      if (photo) setRoomPhotoUrl(photo);
      if (room?.id) setRoomId(room.id);

      const raw = room?.pre_detection_result;
      if (raw === null || raw === undefined) {
        if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
          if (!cancelled) setLoadState("timeout");
          return;
        }
        pollTimer = setTimeout(loadOnce, POLL_INTERVAL_MS);
        return;
      }

      if (!Array.isArray(raw) || raw.length === 0) {
        setItems([]);
        setLoadState("empty");
        return;
      }

      const mapped = mapDetectedToRoomItems(raw as DetectedItem[]);

      // Pick up any masks already written (in case they completed before we loaded).
      // Must run BEFORE setLoadState('ready') so the poll effect sees correct state.
      const ctx = (room?.render_context ?? {}) as Record<string, unknown>;
      const existingMasks = ctx?.itemMasks as Record<string, string> | undefined;
      if (existingMasks && Object.keys(existingMasks).length > 0) {
        setItemMasks(existingMasks);
      }
      const masksAlreadyReady = ctx?.masksReady === true;
      if (masksAlreadyReady) {
        setMasksState("ready");
      }

      setItems(mapped);
      const firstDecidable = mapped.find((m) => m.autoDecision === null);
      setActiveItemId((firstDecidable ?? mapped[0])?.id ?? null);
      setLoadState("ready");

      // Fire EVF-SAM segmentation whenever pre_detection_result exists and masks
      // aren't already ready. Covers fresh detections AND rooms that had
      // pre_detection_result persisted before segment-masks was ever invoked.
      if (room?.id && !masksAlreadyReady && !segmentMasksFiredRef.current) {
        segmentMasksFiredRef.current = true;
        void fetch("/api/pipeline/segment-masks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room_id: room.id }),
        }).catch((err) => {
          console.warn("[step-7c] segment-masks fire failed (non-fatal):", err);
        });
      }
    };

    loadOnce();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, retryTick]);

  /* ───────────── Poll for mask completion ───────────── */
  useEffect(() => {
    if (loadState !== "ready" || !roomId || masksState !== "pending") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    const tick = async () => {
      if (cancelled) return;
      try {
        const { createBrowserClient } = await import("@/lib/supabase/client");
        const supabase = createBrowserClient();
        const { data: row } = await supabase
          .from("rooms")
          .select("render_context")
          .eq("id", roomId)
          .single();
        const ctx = (row?.render_context ?? {}) as Record<string, unknown>;
        const masks = ctx?.itemMasks as Record<string, string> | undefined;
        if (masks && Object.keys(masks).length > 0) {
          setItemMasks(masks);
        }
        if (ctx?.masksReady === true) {
          if (!cancelled) setMasksState("ready");
          return;
        }
      } catch (err) {
        console.warn("[step-7c] mask poll failed (non-fatal):", err);
      }

      if (Date.now() - startedAt >= MASKS_MAX_WAIT_MS) {
        if (!cancelled) {
          console.warn(
            "[step-7c] mask polling hit cap — doing final DB read before enabling CTA",
          );
          try {
            const { createBrowserClient } = await import("@/lib/supabase/client");
            const supabase = createBrowserClient();
            const { data: finalRow } = await supabase
              .from("rooms")
              .select("render_context")
              .eq("id", roomId)
              .single();
            const finalCtx = (finalRow?.render_context ?? {}) as Record<string, unknown>;
            const finalMasks = finalCtx?.itemMasks as Record<string, string> | undefined;
            if (finalMasks && Object.keys(finalMasks).length > 0) {
              setItemMasks(finalMasks);
              setMasksState("ready");
              return;
            }
          } catch (err) {
            console.warn("[step-7c] final mask read failed (non-fatal):", err);
          }
          setMasksState("timeout");
        }
        return;
      }
      timer = setTimeout(tick, MASKS_POLL_INTERVAL_MS);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [loadState, roomId, masksState]);

  /* ───────────── Canvas mask overlay ───────────── */
  const renderMaskOverlay = useCallback(
    async (label: string | null) => {
      const canvas = canvasRef.current;
      const img = imageRef.current;
      if (!canvas || !img) return;

      const rect = img.getBoundingClientRect();
      const container = img.parentElement;
      const containerRect = container?.getBoundingClientRect();
      if (!containerRect) return;

      canvas.style.position = "absolute";
      canvas.style.left = rect.left - containerRect.left + "px";
      canvas.style.top = rect.top - containerRect.top + "px";
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      canvas.width = Math.max(1, Math.round(rect.width));
      canvas.height = Math.max(1, Math.round(rect.height));

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!label) return;

      const normalizedLabel = label.toLowerCase().trim();
      const maskUrl =
        itemMasks[normalizedLabel] ??
        itemMasks[normalizedLabel.replace(/\s+/g, "_")] ??
        itemMasks[normalizedLabel.replace(/_/g, " ")] ??
        itemMasks[label];
      if (!maskUrl) return;

      const maskImg = new window.Image();
      maskImg.crossOrigin = "anonymous";
      maskImg.onload = () => {
        const offscreen = document.createElement("canvas");
        offscreen.width = maskImg.naturalWidth;
        offscreen.height = maskImg.naturalHeight;
        const offCtx = offscreen.getContext("2d");
        if (!offCtx) return;
        offCtx.drawImage(maskImg, 0, 0);

        const imageData = offCtx.getImageData(
          0,
          0,
          offscreen.width,
          offscreen.height,
        );
        const data = imageData.data;

        const outCanvas = document.createElement("canvas");
        outCanvas.width = offscreen.width;
        outCanvas.height = offscreen.height;
        const outCtx = outCanvas.getContext("2d");
        if (!outCtx) return;

        const outData = outCtx.createImageData(
          offscreen.width,
          offscreen.height,
        );
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i] ?? 0;
          const g = data[i + 1] ?? 0;
          const b = data[i + 2] ?? 0;
          const a = data[i + 3] ?? 0;
          const isItem = a > 128 && (r > 150 || g > 150 || b > 150);
          outData.data[i] = isItem ? 201 : 0;
          outData.data[i + 1] = isItem ? 168 : 0;
          outData.data[i + 2] = isItem ? 76 : 0;
          outData.data[i + 3] = isItem ? 140 : 0;
        }
        outCtx.putImageData(outData, 0, 0);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(outCanvas, 0, 0, canvas.width, canvas.height);
      };
      maskImg.onerror = () => {
        console.warn("[step-7c] Failed to load mask image:", maskUrl);
      };
      maskImg.src = maskUrl;
    },
    [itemMasks],
  );

  // Re-render overlay when active selection or masks change.
  useEffect(() => {
    const activeItem = items.find((i) => i.id === activeItemId) ?? null;
    void renderMaskOverlay(activeItem?.label ?? null);
  }, [activeItemId, items, renderMaskOverlay]);

  // Redraw overlay on window resize so canvas stays aligned to photo.
  useEffect(() => {
    const handler = () => {
      const activeItem = items.find((i) => i.id === activeItemId) ?? null;
      void renderMaskOverlay(activeItem?.label ?? null);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [activeItemId, items, renderMaskOverlay]);

  /* ───────────── Derived counts ───────────── */
  const nonFixedItems = useMemo(
    () => items.filter((item) => item.autoDecision === null),
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
  const allDecided = totalDecidable === 0 || decidedCount === totalDecidable;
  const masksReady = masksState !== "pending";
  const canContinue = allDecided && masksReady;

  useEffect(() => {
    const totalFrames = 18;
    const startValue = displayedDecidedCount;
    const diff = decidedCount - startValue;
    if (diff === 0) return;
    let frame = 0;
    const interval = window.setInterval(() => {
      frame += 1;
      const next = Math.round(startValue + (diff * frame) / totalFrames);
      setDisplayedDecidedCount(next);
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
      current.map((item) =>
        item.id === id && item.autoDecision === null
          ? { ...item, decision }
          : item,
      ),
    );
    setActiveItemId(id);
  };

  const handleKeepAll = () =>
    setItems((current) =>
      current.map((item) =>
        item.autoDecision === null ? { ...item, decision: "keep" } : item,
      ),
    );

  const handleStartFresh = () =>
    setItems((current) =>
      current.map((item) =>
        item.autoDecision === null ? { ...item, decision: "remove" } : item,
      ),
    );

  const setKeepMask = useArea2Store((s) => s.setKeepMask);

  const handleContinue = async () => {
    if (!canContinue) return;

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

    try {
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && roomId) {
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

        const { data: existingRoom } = await supabase
          .from("rooms")
          .select("render_context")
          .eq("id", roomId)
          .single();

        const existingCtx =
          (existingRoom?.render_context as Record<string, unknown>) ?? {};

        await supabase
          .from("rooms")
          .update({
            render_context: {
              ...existingCtx,
              keepMask: {
                objects: items.map((item) => ({
                  id: String(item.id),
                  type: item.name,
                  bbox: [0, 0, 0, 0],
                  confidence: 1,
                  confidenceTier: "show-user",
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
              },
            },
          })
          .eq("id", roomId);
      }
    } catch (err) {
      console.warn("[step-7c] Failed to persist decisions:", err);
    }

    router.push("/design/step-7d");
  };

  /* ───────────── Loading / timeout / empty states ───────────── */
  if (loadState === "loading") {
    return (
      <main className="step7c-page step7c-state-center">
        <div className="step7c-skeleton-wrap" aria-label="Analyzing your room">
          <div className="step7c-skeleton-grid">
            <div className="step7c-skeleton-photo" />
            <div className="step7c-skeleton-panel">
              <div className="step7c-skeleton-line step7c-skeleton-line--title" />
              <div className="step7c-skeleton-line step7c-skeleton-line--short" />
              <div className="step7c-skeleton-card" />
              <div className="step7c-skeleton-card" />
              <div className="step7c-skeleton-card" />
            </div>
          </div>
          <p className="step7c-skeleton-caption">Analyzing your room…</p>
        </div>
      </main>
    );
  }

  if (loadState === "timeout") {
    return (
      <main className="step7c-page step7c-state-center">
        <div className="step7c-state-card">
          <p className="step7c-state-text">
            Room analysis is taking longer than expected.
          </p>
          <div className="step7c-state-actions">
            <button
              type="button"
              className="step7c-btn step7c-btn--primary"
              onClick={() => router.push("/design/step-7d")}
            >
              Skip this step
            </button>
            <button
              type="button"
              className="step7c-btn step7c-btn--ghost"
              onClick={async () => {
                try {
                  const { createBrowserClient } = await import(
                    "@/lib/supabase/client"
                  );
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
                setLoadState("loading");
                setRetryTick((n) => n + 1);
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (loadState === "empty") {
    return (
      <main className="step7c-page step7c-state-center">
        <div className="step7c-state-card">
          <p className="step7c-state-text">
            No items detected. We&apos;ll redesign the full room.
          </p>
          <button
            type="button"
            className="step7c-btn step7c-btn--primary"
            onClick={() => router.push("/design/step-7d")}
          >
            Continue
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
        >
          Cova
        </button>
        <div className="step7c-step">3 of 5</div>
      </nav>

      <div className="step7c-shell">
        <section className="step7c-grid" aria-label="Keep or remove room items">
          <div className="step7c-room">
            <div
              ref={containerRef}
              style={{ position: "relative", width: "100%" }}
            >
              {roomPhotoUrl && (
                <img
                  ref={imageRef}
                  src={roomPhotoUrl}
                  alt="Your room"
                  style={{ width: "100%", height: "auto", display: "block" }}
                  onLoad={() => {
                    const a = items.find((i) => i.id === activeItemId) ?? null;
                    void renderMaskOverlay(a?.label ?? null);
                  }}
                />
              )}
              <canvas
                ref={canvasRef}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  pointerEvents: "none",
                }}
                aria-hidden="true"
              />
              {masksState === "pending" && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(10, 22, 40, 0.75)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "16px",
                    borderRadius: "12px",
                    zIndex: 10,
                  }}
                >
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      border: "3px solid rgba(201,168,76,0.25)",
                      borderTopColor: "#C9A84C",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite",
                    }}
                  />
                  <p
                    style={{
                      color: "rgba(245,240,232,0.8)",
                      fontSize: "15px",
                      fontWeight: 500,
                      letterSpacing: "0.3px",
                    }}
                  >
                    Analyzing your room...
                  </p>
                  <p
                    style={{
                      color: "rgba(245,240,232,0.4)",
                      fontSize: "13px",
                    }}
                  >
                    Tap items on the right while you wait
                  </p>
                </div>
              )}
            </div>
            <div className="step7c-legend">
              <span className="step7c-legend-swatch step7c-legend-swatch--keep" />
              <span>Gold = keeping</span>
              <span className="step7c-legend-divider" aria-hidden="true">
                •
              </span>
              <span className="step7c-legend-swatch step7c-legend-swatch--remove" />
              <span>Muted = removing</span>
            </div>
          </div>

          <aside className="step7c-panel">
            <div className="step7c-panel-header">
              <div>
                <h1 className="step7c-heading">What stays?</h1>
                <p className="step7c-subtext">
                  Tap each item to see it highlighted.
                </p>
              </div>
              <div className="step7c-progress-pill" aria-live="polite">
                {displayedDecidedCount} / {totalDecidable}
              </div>
            </div>

            {totalDecidable > 0 && (
              <div className="step7c-quick-actions">
                <button
                  type="button"
                  className="step7c-ghost-action"
                  onClick={handleKeepAll}
                >
                  Keep all
                </button>
                <button
                  type="button"
                  className="step7c-ghost-action"
                  onClick={handleStartFresh}
                >
                  Start fresh
                </button>
              </div>
            )}

            <div className="step7c-list" role="list">
              {items.map((item, index) => {
                const isKeep = item.decision === "keep";
                const isRemove = item.decision === "remove";
                const isFocused = activeItemId === item.id;
                const isAuto = item.autoDecision !== null;

                return (
                  <div
                    key={item.id}
                    ref={(el) => {
                      cardRefs.current[item.id] = el;
                    }}
                    role="listitem"
                    className={
                      "step7c-card" +
                      (isFocused ? " is-focused" : "") +
                      (isKeep ? " is-keep" : "") +
                      (isRemove ? " is-remove" : "") +
                      (isAuto ? " is-auto" : "")
                    }
                    style={{ animationDelay: `${Math.min(index, 20) * 50}ms` }}
                    onMouseEnter={() => setActiveItemId(item.id)}
                    onClick={() => setActiveItemId(item.id)}
                  >
                    <div className="step7c-card-copy">
                      <h2 className="step7c-card-title">{item.name}</h2>
                      <div className="step7c-card-meta">
                        <span className="step7c-card-pill">{item.category}</span>
                        {item.material && (
                          <span className="step7c-card-hint">
                            {item.material}
                          </span>
                        )}
                        {!item.material && item.dominantColor && (
                          <span className="step7c-card-hint">
                            {item.dominantColor}
                          </span>
                        )}
                      </div>
                    </div>

                    {isAuto ? (
                      <div
                        className={
                          "step7c-auto-badge" +
                          (item.autoDecision === "keep"
                            ? " step7c-auto-badge--keep"
                            : " step7c-auto-badge--remove")
                        }
                      >
                        {item.autoDecision === "keep"
                          ? "Auto-kept"
                          : "Auto-removed"}
                      </div>
                    ) : (
                      <div className="step7c-actions">
                        <button
                          type="button"
                          className={
                            "step7c-choice step7c-choice--keep" +
                            (isKeep ? " is-selected" : "")
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            setDecision(item.id, "keep");
                          }}
                          aria-pressed={isKeep}
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          className={
                            "step7c-choice step7c-choice--remove" +
                            (isRemove ? " is-selected" : "")
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            setDecision(item.id, "remove");
                          }}
                          aria-pressed={isRemove}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        </section>
      </div>

      <div className="step7c-bottombar">
        <div className="step7c-summary">
          <strong>{keepCount}</strong> keeping{" "}
          <span aria-hidden="true">/</span> <strong>{removeCount}</strong>{" "}
          removing
        </div>
        <button
          type="button"
          className={"step7c-cta" + (canContinue ? " is-ready" : "")}
          disabled={!canContinue}
          onClick={handleContinue}
        >
          {!masksReady ? (
            <>
              <span className="step7c-spinner" aria-hidden="true" />
              Preparing your room…
            </>
          ) : (
            <>Design My Room &rarr;</>
          )}
        </button>
      </div>
    </main>
  );
}
