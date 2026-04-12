"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useArea2Store } from "@/lib/stores/area2Store";
import { useFingerprintStore } from "@/lib/store/fingerprint";
import { toast } from "sonner";
import { createBrowserClient } from "@/lib/supabase/client";
import "../step-1/step1.css";
import "./step7b.css";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type Fixture =
  | "Fireplace"
  | "Built-ins"
  | "Staircase"
  | "Bay Window"
  | "Exposed Beam"
  | "Skylight";
type FlooringType = "Hardwood" | "Tile" | "Carpet" | "Concrete" | "Mixed";
type BrightestTime = "Morning" | "Midday" | "Afternoon" | "Evening";
type ProtectedArea =
  | "Reading Corner"
  | "Dining Area"
  | "Entryway"
  | "Home Office"
  | "Kids Zone"
  | "Bedroom Corner"
  | "Window Seat"
  | "None";

const FIXTURES: Fixture[] = [
  "Fireplace",
  "Built-ins",
  "Staircase",
  "Bay Window",
  "Exposed Beam",
  "Skylight",
];
const FLOORING_TYPES: FlooringType[] = [
  "Hardwood",
  "Tile",
  "Carpet",
  "Concrete",
  "Mixed",
];
const BRIGHTEST_TIMES: BrightestTime[] = [
  "Morning",
  "Midday",
  "Afternoon",
  "Evening",
];
const PROTECTED_AREAS: ProtectedArea[] = [
  "Reading Corner",
  "Dining Area",
  "Entryway",
  "Home Office",
  "Kids Zone",
  "Bedroom Corner",
  "Window Seat",
  "None",
];

/* ------------------------------------------------------------------ */
/*  useScrollReveal — IntersectionObserver hook                        */
/* ------------------------------------------------------------------ */
function useScrollReveal<T extends HTMLElement>(
  threshold = 0.15,
  rootMargin = "0px 0px -40px 0px",
) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.unobserve(el);
        }
      },
      { threshold, rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, rootMargin]);

  return { ref, visible };
}

/* ------------------------------------------------------------------ */
/*  Section Icons (inline SVGs)                                        */
/* ------------------------------------------------------------------ */
function IconStructure() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );
}

function IconFlooring() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 12h18" />
      <path d="M12 3v18" />
      <path d="M3 7.5h8.5" />
      <path d="M12.5 16.5H21" />
    </svg>
  );
}

function IconLight() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconNote() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Floor Texture Icons (CSS-drawn)                                    */
/* ------------------------------------------------------------------ */
function FloorIcon({ type }: { type: FlooringType }) {
  switch (type) {
    case "Hardwood":
      return (
        <div className="floor-icon floor-hardwood">
          <div className="floor-hardwood-plank" />
          <div className="floor-hardwood-plank" />
          <div className="floor-hardwood-plank" />
          <div className="floor-hardwood-plank" />
          <div className="floor-hardwood-plank" />
        </div>
      );
    case "Tile":
      return (
        <div className="floor-icon floor-tile">
          <div className="floor-tile-cell" />
          <div className="floor-tile-cell" />
          <div className="floor-tile-cell" />
          <div className="floor-tile-cell" />
        </div>
      );
    case "Carpet":
      return <div className="floor-icon floor-carpet" />;
    case "Concrete":
      return <div className="floor-icon floor-concrete" />;
    case "Mixed":
      return (
        <div className="floor-icon floor-mixed">
          <div className="floor-mixed-a" />
          <div className="floor-mixed-b" />
          <div className="floor-mixed-b" />
          <div className="floor-mixed-a" />
        </div>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Back Arrow SVG                                                     */
/* ------------------------------------------------------------------ */
function BackArrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
export default function Step7b() {
  const router = useRouter();

  /* ---- Auth gate ---- */
  useEffect(() => {
    const checkAuth = async () => {
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) router.push("/auth?next=/design/step-7b");
    };
    checkAuth();
  }, [router]);

  /* ---- State ---- */
  const [removeWalls, setRemoveWalls] = useState(false);
  const [ceilingHeight, setCeilingHeight] = useState(9);
  const [selectedFixtures, setSelectedFixtures] = useState<Set<Fixture>>(
    new Set(),
  );
  const [selectedFlooring, setSelectedFlooring] = useState<FlooringType | null>(
    null,
  );
  const [keepFlooring, setKeepFlooring] = useState(false);
  const [brightestTime, setBrightestTime] = useState<BrightestTime | null>(
    null,
  );
  const [windowCount, setWindowCount] = useState(3);
  const [protectedAreas, setProtectedAreas] = useState<Set<ProtectedArea>>(
    new Set(),
  );
  const [notes, setNotes] = useState("");
  const [stepperBump, setStepperBump] = useState(false);

  /* ---- Nav scroll state ---- */
  const [navScrolled, setNavScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ---- Scroll reveal refs ---- */
  const headerEyebrow = useScrollReveal<HTMLParagraphElement>(0.5);
  const headerLine = useScrollReveal<HTMLDivElement>(0.5);
  const headerHeadline = useScrollReveal<HTMLHeadingElement>(0.3);
  const headerSubtext = useScrollReveal<HTMLParagraphElement>(0.3);
  const card1 = useScrollReveal<HTMLElement>(0.1);
  const card2 = useScrollReveal<HTMLElement>(0.1);
  const card3 = useScrollReveal<HTMLElement>(0.1);
  const card4 = useScrollReveal<HTMLElement>(0.1);
  const card5 = useScrollReveal<HTMLElement>(0.1);

  /* ---- Slider logic ---- */
  const sliderRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const MIN_HEIGHT = 7;
  const MAX_HEIGHT = 14;
  const heightToPercent = (h: number) =>
    ((h - MIN_HEIGHT) / (MAX_HEIGHT - MIN_HEIGHT)) * 100;

  const updateSliderFromClient = useCallback((clientX: number) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = MIN_HEIGHT + pct * (MAX_HEIGHT - MIN_HEIGHT);
    setCeilingHeight(Math.round(raw * 2) / 2);
  }, []);

  const onSliderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setIsDragging(true);
      updateSliderFromClient(e.clientX);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [updateSliderFromClient],
  );

  const onSliderPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      updateSliderFromClient(e.clientX);
    },
    [isDragging, updateSliderFromClient],
  );

  const onSliderPointerUp = useCallback(() => setIsDragging(false), []);

  /* ---- Toggles ---- */
  const toggleFixture = (f: Fixture) => {
    setSelectedFixtures((prev) => {
      const next = new Set(prev);
      if (next.has(f)) {
        next.delete(f);
      } else {
        next.add(f);
      }
      return next;
    });
  };

  const toggleProtectedArea = (area: ProtectedArea) => {
    setProtectedAreas((prev) => {
      const next = new Set(prev);
      if (area === "None") {
        if (next.has("None")) {
          next.clear();
        } else {
          next.clear();
          next.add("None");
        }
      } else {
        next.delete("None");
        if (next.has(area)) {
          next.delete(area);
        } else {
          next.add(area);
        }
      }
      return next;
    });
  };

  /* ---- Stepper with bump animation ---- */
  const bumpStepper = () => {
    setStepperBump(true);
    setTimeout(() => setStepperBump(false), 200);
  };

  const incrementWindows = () => {
    setWindowCount((c) => Math.min(20, c + 1));
    bumpStepper();
  };

  const decrementWindows = () => {
    setWindowCount((c) => Math.max(0, c - 1));
    bumpStepper();
  };

  /* ---- Area2Store access ---- */
  const setRoomConstraints = useArea2Store((s) => s.setRoomConstraints);
  const existingConstraints = useArea2Store((s) => s.roomConstraints);
  const updateRoomContextField = useArea2Store((s) => s.updateRoomContextField);
  const roomIdFromStore = useArea2Store((s) => s.roomId);
  const quizRoomType = useFingerprintStore((s) => s.roomType);

  /* ---- Navigation ---- */
  const handleBack = () => {
    router.push("/design/step-7");
  };
  const handleContinue = async () => {
    // Map ceiling height to RoomContext format
    const ceilingMap: Record<
      string,
      "low" | "standard-8ft" | "high" | "vaulted" | "coffered"
    > = {};
    let ceilingLabel: "low" | "standard-8ft" | "high" | "vaulted" | "coffered" =
      "standard-8ft";
    if (ceilingHeight <= 7.5) ceilingLabel = "low";
    else if (ceilingHeight <= 9) ceilingLabel = "standard-8ft";
    else if (ceilingHeight <= 12) ceilingLabel = "high";
    else ceilingLabel = "vaulted";
    void ceilingMap; // suppress lint

    // Map brightest time to constraint format
    const timeMap: Record<
      string,
      "morning" | "afternoon" | "evening" | "always-dim"
    > = {
      Morning: "morning",
      Midday: "afternoon",
      Afternoon: "afternoon",
      Evening: "evening",
    };

    // Build merged constraints object
    const protectedAreaEntries = Array.from(protectedAreas)
      .filter((a) => a !== "None")
      .map((a) => `protected area: ${a.toLowerCase()}`);
    const flooringEntry = selectedFlooring
      ? [
          `existing flooring: ${selectedFlooring.toLowerCase()}`,
          keepFlooring ? "keep existing flooring" : "replace existing flooring",
        ]
      : [];
    const mergedConstraints = {
      wallPermanence:
        existingConstraints?.wallPermanence ?? "own-anything-goes",
      physicalConstraints: [
        ...(removeWalls ? ["walls can be removed"] : []),
        ...Array.from(selectedFixtures).map(
          (f) => `fixture: ${f.toLowerCase()}`,
        ),
        ...flooringEntry,
        ...protectedAreaEntries,
        ...(existingConstraints?.physicalConstraints ?? []),
      ],
      bestLightTime: timeMap[brightestTime ?? ""] ?? "morning",
      roomSize: existingConstraints?.roomSize ?? "medium",
      whoUsesRoom: existingConstraints?.whoUsesRoom ?? [],
      primaryFunction:
        existingConstraints?.primaryFunction ??
        (quizRoomType ? [quizRoomType] : []),
      hasPetsOrKids: existingConstraints?.hasPetsOrKids ?? false,
      storagePriority: existingConstraints?.storagePriority ?? "medium",
      offScreenPieces: existingConstraints?.offScreenPieces ?? "",
      styleDirectionDelta: existingConstraints?.styleDirectionDelta ?? {
        coziness: 0,
        colorBoldness: 0,
        traditionality: 0,
      },
    } as Parameters<typeof setRoomConstraints>[0];

    // Persist to Area2Store
    setRoomConstraints(mergedConstraints);

    // Immediate fire-and-forget Supabase persist so the compiler sees the
    // updated constraints even if the user navigates away before step-7d.
    const roomId =
      roomIdFromStore ??
      (typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("roomId")
        : null);
    if (roomId) {
      const supabase = createBrowserClient();
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { error } = await supabase
            .from("rooms")
            .update({ room_constraints: mergedConstraints })
            .eq("id", roomId)
            .eq("user_id", user.id);
          if (error) {
            console.error("[step-7b] constraint persist failed:", error);
            toast.error(
              "We couldn't save your room details. Please try again.",
            );
            return;
          }

          // Fire-and-forget: merge floorMaterial into render_context so the
          // prompt compiler sees it even before persistRenderContext() runs.
          if (selectedFlooring) {
            supabase
              .from("rooms")
              .select("render_context")
              .eq("id", roomId)
              .eq("user_id", user.id)
              .single()
              .then(({ data }) => {
                const existing = (data?.render_context as Record<string, unknown>) ?? {};
                const existingRoomContext = (existing.roomContext as Record<string, unknown>) ?? {};
                return supabase
                  .from("rooms")
                  .update({
                    render_context: {
                      ...existing,
                      roomContext: {
                        ...existingRoomContext,
                        floorMaterial: selectedFlooring.toLowerCase(),
                      },
                    },
                  })
                  .eq("id", roomId)
                  .eq("user_id", user.id);
              })
              .catch((err) =>
                console.error("[step-7b] render_context floor merge failed:", err),
              );
          }
        }
      } catch (err) {
        console.error("[step-7b] constraint persist threw:", err);
        toast.error("We couldn't save your room details. Please try again.");
        return;
      }
    }

    // Update room context fields from step-7b data
    updateRoomContextField("ceilingHeight", ceilingLabel);
    updateRoomContextField(
      "ceilingDetail",
      `${ceilingHeight}ft${selectedFixtures.size > 0 ? `, ${Array.from(selectedFixtures).join(", ")}` : ""}`,
    );
    updateRoomContextField("windowCount", windowCount);
    if (selectedFlooring) {
      updateRoomContextField("floorMaterial", selectedFlooring.toLowerCase());
    }
    if (notes) {
      updateRoomContextField("userNotes", notes);
    }

    router.push("/design/step-7c");
  };

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  return (
    <div className="step7b-page">
      {/* ---- Fixed Nav ---- */}
      <nav className={`step7b-nav ${navScrolled ? "scrolled" : ""}`}>
        <button
          className="step7b-nav-back"
          onClick={handleBack}
          aria-label="Go back"
        >
          <BackArrow />
        </button>
        <button
          type="button"
          className="step7b-nav-logo"
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
        <div className="step7b-nav-progress">
          <span>2</span> of 5
        </div>
      </nav>

      {/* ---- Main Content ---- */}
      <main className="step7b-content">
        {/* Header */}
        <header className="step7b-header">
          <p
            ref={headerEyebrow.ref}
            className={`step7b-eyebrow ${headerEyebrow.visible ? "visible" : ""}`}
          >
            Your Constraints
          </p>
          <div
            ref={headerLine.ref}
            className={`step7b-eyebrow-line ${headerLine.visible ? "visible" : ""}`}
          />
          <h1
            ref={headerHeadline.ref}
            className={`step7b-headline ${headerHeadline.visible ? "visible" : ""}`}
          >
            What should we work around?
          </h1>
          <p
            ref={headerSubtext.ref}
            className={`step7b-subtext ${headerSubtext.visible ? "visible" : ""}`}
          >
            Tell us what&rsquo;s fixed. We&rsquo;ll design around everything
            else.
          </p>
        </header>

        {/* ======== 1. STRUCTURAL LIMITS ======== */}
        <section
          ref={card1.ref}
          className={`step7b-card ${card1.visible ? "visible" : ""}`}
        >
          <h2 className="step7b-card-title">
            <span className="step7b-card-icon">
              <IconStructure />
            </span>
            Structural Limits
          </h2>

          <div className="step7b-toggle-row">
            <span className="step7b-toggle-label">Open to removing walls?</span>
            <div
              className={`step7b-toggle ${removeWalls ? "active" : ""}`}
              role="switch"
              aria-checked={removeWalls}
              tabIndex={0}
              onClick={() => setRemoveWalls(!removeWalls)}
              onKeyDown={(e) =>
                e.key === "Enter" && setRemoveWalls(!removeWalls)
              }
            >
              <div className="step7b-toggle-knob" />
            </div>
          </div>

          <div className="step7b-divider" />

          <div className="step7b-field">
            <label className="step7b-field-label">Ceiling height</label>
            <div className="step7b-slider-wrapper">
              <div
                className={`step7b-slider-value ${isDragging ? "dragging" : ""}`}
              >
                {ceilingHeight % 1 === 0
                  ? ceilingHeight
                  : ceilingHeight.toFixed(1)}
                <span>ft</span>
              </div>
              <div
                className="step7b-slider-track"
                ref={sliderRef}
                onPointerDown={onSliderPointerDown}
                onPointerMove={onSliderPointerMove}
                onPointerUp={onSliderPointerUp}
                onPointerCancel={onSliderPointerUp}
              >
                <div
                  className="step7b-slider-fill"
                  style={{ width: `${heightToPercent(ceilingHeight)}%` }}
                />
                <div
                  className={`step7b-slider-orb ${isDragging ? "dragging" : ""}`}
                  style={{ left: `${heightToPercent(ceilingHeight)}%` }}
                />
              </div>
              <div className="step7b-slider-labels">
                <span>7 ft</span>
                <span>14 ft</span>
              </div>
            </div>
          </div>

          <div className="step7b-divider" />

          <div className="step7b-field">
            <label className="step7b-field-label">
              Permanent fixtures in the room
            </label>
            <div className="step7b-pill-grid">
              {FIXTURES.map((f) => (
                <button
                  key={f}
                  className={`step7b-pill ${selectedFixtures.has(f) ? "selected" : ""}`}
                  onClick={() => toggleFixture(f)}
                  type="button"
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ======== 2. FLOORING ======== */}
        <section
          ref={card2.ref}
          className={`step7b-card ${card2.visible ? "visible" : ""}`}
        >
          <h2 className="step7b-card-title">
            <span className="step7b-card-icon">
              <IconFlooring />
            </span>
            Flooring
          </h2>

          <div className="step7b-field">
            <label className="step7b-field-label">
              What&rsquo;s currently underfoot?
            </label>
            <div className="step7b-icon-cards">
              {FLOORING_TYPES.map((ft) => (
                <button
                  key={ft}
                  className={`step7b-icon-card ${selectedFlooring === ft ? "selected" : ""}`}
                  onClick={() => setSelectedFlooring(ft)}
                  type="button"
                >
                  <div className="step7b-icon-card-icon">
                    <FloorIcon type={ft} />
                  </div>
                  <span className="step7b-icon-card-label">{ft}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="step7b-divider" />

          <div className="step7b-toggle-row">
            <span className="step7b-toggle-label">Keep existing flooring?</span>
            <div
              className={`step7b-toggle ${keepFlooring ? "active" : ""}`}
              role="switch"
              aria-checked={keepFlooring}
              tabIndex={0}
              onClick={() => setKeepFlooring(!keepFlooring)}
              onKeyDown={(e) =>
                e.key === "Enter" && setKeepFlooring(!keepFlooring)
              }
            >
              <div className="step7b-toggle-knob" />
            </div>
          </div>
        </section>

        {/* ======== 3. NATURAL LIGHT ======== */}
        <section
          ref={card3.ref}
          className={`step7b-card ${card3.visible ? "visible" : ""}`}
        >
          <h2 className="step7b-card-title">
            <span className="step7b-card-icon">
              <IconLight />
            </span>
            Natural Light
          </h2>

          <div className="step7b-field">
            <label className="step7b-field-label">
              When is your room brightest?
            </label>
            <div className="step7b-pill-grid">
              {BRIGHTEST_TIMES.map((t) => (
                <button
                  key={t}
                  className={`step7b-pill ${brightestTime === t ? "selected" : ""}`}
                  onClick={() =>
                    setBrightestTime(brightestTime === t ? null : t)
                  }
                  type="button"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="step7b-divider" />

          <div className="step7b-field">
            <label className="step7b-field-label">How many windows?</label>
            <div className="step7b-stepper">
              <button
                className="step7b-stepper-btn"
                onClick={decrementWindows}
                type="button"
                aria-label="Decrease window count"
              >
                −
              </button>
              <div
                className={`step7b-stepper-value ${stepperBump ? "bump" : ""}`}
              >
                {windowCount}
              </div>
              <button
                className="step7b-stepper-btn"
                onClick={incrementWindows}
                type="button"
                aria-label="Increase window count"
              >
                +
              </button>
            </div>
          </div>
        </section>

        {/* ======== 4. PROTECTED AREAS ======== */}
        <section
          ref={card4.ref}
          className={`step7b-card ${card4.visible ? "visible" : ""}`}
        >
          <h2 className="step7b-card-title">
            <span className="step7b-card-icon">
              <IconShield />
            </span>
            Protected Areas
          </h2>

          <div className="step7b-field">
            <label className="step7b-field-label">
              Which areas should stay exactly as they are?
            </label>
            <div className="step7b-pill-grid">
              {PROTECTED_AREAS.map((area) => (
                <button
                  key={area}
                  className={`step7b-pill ${protectedAreas.has(area) ? "selected" : ""}`}
                  onClick={() => toggleProtectedArea(area)}
                  type="button"
                >
                  {area}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ======== 5. SPECIAL REQUIREMENTS ======== */}
        <section
          ref={card5.ref}
          className={`step7b-card ${card5.visible ? "visible" : ""}`}
        >
          <h2 className="step7b-card-title">
            <span className="step7b-card-icon">
              <IconNote />
            </span>
            Special Requirements
          </h2>

          <div className="step7b-field">
            <label className="step7b-field-label">
              Anything else we should know?
            </label>
            <textarea
              className="step7b-textarea"
              placeholder='E.g. "The east wall has water damage" or "We need wheelchair access throughout."'
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
            />
          </div>
        </section>
      </main>

      {/* ---- Fixed Bottom Bar ---- */}
      <div className="step7b-bottom-bar">
        <button className="step7b-cta" onClick={handleContinue} type="button">
          Save &amp; Continue
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </button>
        <div className="step7b-dots">
          <div className="step7b-dot completed" />
          <div className="step7b-dot active" />
          <div className="step7b-dot" />
          <div className="step7b-dot" />
          <div className="step7b-dot" />
        </div>
      </div>
    </div>
  );
}
