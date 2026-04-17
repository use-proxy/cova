"use client";

import "./step8b.css";
import "../step-1/step1.css";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { flowLog } from "@/lib/debug/flow-logger";
import { useRoomStore } from "@/lib/store/room";

type RefinementPath = "specific" | "vibe" | "layout" | "direction" | null;
type LayoutOption = "conversation" | "open" | "cozy" | "balanced" | null;
type VariantOption = "primary" | "contrast" | "twist" | null;

type SliderKey =
  | "lightDark"
  | "minimalLayered"
  | "calmBold"
  | "naturalLuxe"
  | "cozyAiry";

type SliderState = Record<SliderKey, number>;

const MAX_REFINEMENTS = 3;
// TODO: wire STYLE_STRENGTH_DEFAULT to the vibe sliders in the "vibe" refinement path
// once slider-to-strength mapping is defined (higher slider deviation → higher strength)
const STYLE_STRENGTH_DEFAULT = 0.85;
const LOADING_MESSAGES = [
  "Applying your changes...",
  "Re-rendering your room...",
  "Almost ready...",
];

const SPECIFIC_CHIPS = [
  "Swap the sofa",
  "Change the wall color",
  "Adjust the budget",
  "Remove something",
  "Add more plants",
  "Better lighting",
];

const SLIDER_CONFIG: Array<{
  key: SliderKey;
  left: string;
  right: string;
  labels: Record<number, string>;
}> = [
  {
    key: "lightDark",
    left: "Light",
    right: "Dark",
    labels: {
      [-2]: "Very light",
      [-1]: "Softer and lighter",
      [0]: "Balanced light",
      [1]: "Moodier depth",
      [2]: "Rich and dark",
    },
  },
  {
    key: "minimalLayered",
    left: "Minimal",
    right: "Layered",
    labels: {
      [-2]: "Ultra minimal",
      [-1]: "Clean and edited",
      [0]: "Balanced styling",
      [1]: "More layered",
      [2]: "Deeply collected",
    },
  },
  {
    key: "calmBold",
    left: "Calm",
    right: "Bold",
    labels: {
      [-2]: "Very calm",
      [-1]: "Quiet confidence",
      [0]: "Even energy",
      [1]: "A little bolder",
      [2]: "Statement making",
    },
  },
  {
    key: "naturalLuxe",
    left: "Natural",
    right: "Luxe",
    labels: {
      [-2]: "Organic and grounded",
      [-1]: "Warm naturality",
      [0]: "Balanced finish",
      [1]: "Polished richness",
      [2]: "Full luxe",
    },
  },
  {
    key: "cozyAiry",
    left: "Cozy",
    right: "Airy",
    labels: {
      [-2]: "Wrapped and cozy",
      [-1]: "Comfortably soft",
      [0]: "Balanced openness",
      [1]: "More spacious",
      [2]: "Open and airy",
    },
  },
];

const LAYOUT_OPTIONS = [
  {
    value: "conversation" as const,
    label: "Conversation First",
    description: "Sofa facing center",
  },
  {
    value: "open" as const,
    label: "Open Flow",
    description: "Furniture pushed to walls",
  },
  {
    value: "cozy" as const,
    label: "Cozy Corner",
    description: "Grouped intimate arrangement",
  },
  {
    value: "balanced" as const,
    label: "Balanced Symmetry",
    description: "Mirrored layout",
  },
];

const VARIANT_OPTIONS = [
  {
    value: "primary" as const,
    name: "Primary Match",
    badge: "Closest to your profile",
    tags: ["Tailored", "Warm Neutrals", "Collected"],
  },
  {
    value: "contrast" as const,
    name: "Bold Contrast",
    badge: "More dramatic",
    tags: ["Higher Contrast", "Sharper Lines", "Moody"],
  },
  {
    value: "twist" as const,
    name: "Unexpected Twist",
    badge: "Curated surprise",
    tags: ["Unexpected Color", "Sculptural", "Editorial"],
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 32 32" className="step8b-card-icon" aria-hidden="true">
      <circle
        cx="16"
        cy="16"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle
        cx="16"
        cy="16"
        r="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M16 2v6M16 24v6M2 16h6M24 16h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg viewBox="0 0 32 32" className="step8b-card-icon" aria-hidden="true">
      <path
        d="M6 9h20M6 16h20M6 23h20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle
        cx="12"
        cy="9"
        r="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle
        cx="20"
        cy="16"
        r="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle
        cx="15"
        cy="23"
        r="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 32 32" className="step8b-card-icon" aria-hidden="true">
      <rect
        x="5"
        y="5"
        width="9"
        height="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        rx="2"
      />
      <rect
        x="18"
        y="5"
        width="9"
        height="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        rx="2"
      />
      <rect
        x="5"
        y="18"
        width="9"
        height="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        rx="2"
      />
      <rect
        x="18"
        y="18"
        width="9"
        height="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        rx="2"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 32 32" className="step8b-card-icon" aria-hidden="true">
      <path
        d="M25 12a10 10 0 0 0-17-3.5M7 8V3m0 5h5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M7 20a10 10 0 0 0 17 3.5M25 24v5m0-5h-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="step8b-arrow-icon" aria-hidden="true">
      <path
        d="M5 12h14M13 5l7 7-7 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="step8b-back-icon" aria-hidden="true">
      <path
        d="M19 12H5M11 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function LayoutThumbnail({
  layout,
}: {
  layout: (typeof LAYOUT_OPTIONS)[number];
}) {
  const piecesByLayout: Record<string, React.ReactNode> = {
    conversation: (
      <>
        <rect
          x="18"
          y="18"
          width="34"
          height="10"
          rx="3"
          className="step8b-plan-sofa"
        />
        <rect
          x="76"
          y="18"
          width="34"
          height="10"
          rx="3"
          className="step8b-plan-sofa"
        />
        <rect
          x="47"
          y="44"
          width="34"
          height="14"
          rx="3"
          className="step8b-plan-rug"
        />
        <circle cx="64" cy="36" r="5" className="step8b-plan-table" />
      </>
    ),
    open: (
      <>
        <rect
          x="16"
          y="16"
          width="36"
          height="10"
          rx="3"
          className="step8b-plan-sofa"
        />
        <rect
          x="76"
          y="16"
          width="36"
          height="10"
          rx="3"
          className="step8b-plan-sofa"
        />
        <rect
          x="16"
          y="54"
          width="36"
          height="10"
          rx="3"
          className="step8b-plan-chair"
        />
        <rect
          x="76"
          y="54"
          width="36"
          height="10"
          rx="3"
          className="step8b-plan-chair"
        />
        <circle cx="64" cy="40" r="7" className="step8b-plan-table" />
      </>
    ),
    cozy: (
      <>
        <rect
          x="20"
          y="20"
          width="42"
          height="10"
          rx="3"
          className="step8b-plan-sofa"
        />
        <rect
          x="20"
          y="36"
          width="10"
          height="26"
          rx="3"
          className="step8b-plan-chair"
        />
        <rect
          x="38"
          y="44"
          width="24"
          height="14"
          rx="3"
          className="step8b-plan-rug"
        />
        <circle cx="76" cy="46" r="8" className="step8b-plan-table" />
      </>
    ),
    balanced: (
      <>
        <rect
          x="18"
          y="18"
          width="30"
          height="10"
          rx="3"
          className="step8b-plan-sofa"
        />
        <rect
          x="80"
          y="18"
          width="30"
          height="10"
          rx="3"
          className="step8b-plan-sofa"
        />
        <rect
          x="18"
          y="50"
          width="30"
          height="10"
          rx="3"
          className="step8b-plan-chair"
        />
        <rect
          x="80"
          y="50"
          width="30"
          height="10"
          rx="3"
          className="step8b-plan-chair"
        />
        <rect
          x="52"
          y="32"
          width="24"
          height="14"
          rx="3"
          className="step8b-plan-rug"
        />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 128 80" className="step8b-layout-svg" aria-hidden="true">
      <rect
        x="4"
        y="4"
        width="120"
        height="72"
        rx="10"
        className="step8b-plan-shell"
      />
      {piecesByLayout[layout.value]}
    </svg>
  );
}

export default function Step8B() {
  const router = useRouter();
  useEffect(() => { flowLog("page:mount", { page: "step-8b" }); }, []);
  const roomId = useRoomStore((s) => s.roomId);
  const renderUrl = useRoomStore((s) => s.renderUrl);
  const setRenderUrl = useRoomStore((s) => s.setRenderUrl);
  const renderSessions = useRoomStore((s) => s.renderSessions);
  const addRenderSession = useRoomStore((s) => s.addRenderSession);
  const [activePath, setActivePath] = useState<RefinementPath>(null);
  const [specificText, setSpecificText] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [vibeValues, setVibeValues] = useState<SliderState>({
    lightDark: 0,
    minimalLayered: 0,
    calmBold: 0,
    naturalLuxe: 0,
    cozyAiry: 0,
  });
  const [selectedLayout, setSelectedLayout] = useState<LayoutOption>(null);
  const [selectedVariant, setSelectedVariant] = useState<VariantOption>(null);
  const [refinementsUsed, setRefinementsUsed] = useState(renderSessions.length);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [showStartOverModal, setShowStartOverModal] = useState(false);
  // Current prompt loaded from rooms.render_context.fluxPrompt on mount.
  // Passed to /api/render/refine so refinements build on the existing design context.
  const [currentPrompt, setCurrentPrompt] = useState<string>("");

  const refinementsRemaining = Math.max(MAX_REFINEMENTS - refinementsUsed, 0);

  useEffect(() => {
    const checkAuthAndLoadPrompt = async () => {
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth?next=/design/step-8b");
        return;
      }
      // Load the prompt used for the most recent render of this room.
      // Priority: render_context.fluxPrompt → render_context.prompt → empty string.
      // The API falls back to reading this from DB if currentPrompt is empty,
      // so this is belt-and-suspenders rather than strictly required.
      if (roomId) {
        try {
          const { data: roomRow } = await supabase
            .from("rooms")
            .select("render_context")
            .eq("id", roomId)
            .single();
          const ctx = roomRow?.render_context as
            | { fluxPrompt?: string; prompt?: string }
            | null;
          const prompt = ctx?.fluxPrompt ?? ctx?.prompt ?? "";
          if (prompt) setCurrentPrompt(prompt);
        } catch {
          // Non-fatal — the API will load it from DB if needed
        }
      }
    };

    checkAuthAndLoadPrompt();
  }, [router, roomId]);

  // Refinement count is kept in component state only (no localStorage per rule #1)

  useEffect(() => {
    if (activePath !== "specific" || !specificText.trim()) {
      setShowPreview(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowPreview(true);
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [activePath, specificText]);

  // Animated progress bar and message cycling while rendering
  useEffect(() => {
    if (!isRendering) return;

    setRenderProgress(0);
    setLoadingMessageIndex(0);

    const startedAt = Date.now();
    // Slow logarithmic progress — caps at 90% until real completion
    const progressInterval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const nextProgress = clamp(Math.log10(1 + elapsed / 1000) * 30, 0, 90);
      setRenderProgress(nextProgress);
    }, 200);

    const messageInterval = window.setInterval(() => {
      setLoadingMessageIndex(
        (current) => (current + 1) % LOADING_MESSAGES.length,
      );
    }, 2500);

    return () => {
      window.clearInterval(progressInterval);
      window.clearInterval(messageInterval);
    };
  }, [isRendering]);

  const specificPreviewLines = useMemo(() => {
    const content = specificText.trim().toLowerCase();
    if (!content) return [];

    const lines: string[] = [];

    if (content.includes("sofa") || content.includes("couch")) {
      lines.push("Update the sofa selection and seating presence.");
    }
    if (
      content.includes("wall") ||
      content.includes("paint") ||
      content.includes("color")
    ) {
      lines.push("Shift the wall color or overall palette direction.");
    }
    if (
      content.includes("budget") ||
      content.includes("$") ||
      content.includes("cost")
    ) {
      lines.push("Rebalance the concept around a tighter budget target.");
    }
    if (content.includes("remove") || content.includes("less")) {
      lines.push("Edit out at least one visual element to simplify the room.");
    }
    if (content.includes("plant") || content.includes("greenery")) {
      lines.push("Bring in more greenery and layered natural accents.");
    }
    if (content.includes("light") || content.includes("bright")) {
      lines.push("Adjust the lighting mood for a stronger glow and clarity.");
    }
    if (content.includes("rug")) {
      lines.push(
        "Reconsider the rug choice, scale, or presence in the layout.",
      );
    }

    if (!lines.length) {
      lines.push("Refine the room according to your written direction.");
      lines.push(
        "Preserve the strongest parts of the current render while improving the weak spots.",
      );
    }

    return lines.slice(0, 3);
  }, [specificText]);

  const vibeSummary = useMemo(() => {
    const light =
      vibeValues.lightDark < 0
        ? "lighter"
        : vibeValues.lightDark > 0
          ? "darker"
          : "balanced in tone";

    const layering =
      vibeValues.minimalLayered < 0
        ? "more edited"
        : vibeValues.minimalLayered > 0
          ? "more layered"
          : "cleanly balanced";

    const mood =
      vibeValues.calmBold < 0
        ? "with calm energy"
        : vibeValues.calmBold > 0
          ? "with a bolder attitude"
          : "with an even emotional tone";

    const finish =
      vibeValues.naturalLuxe < 0
        ? "natural warmth"
        : vibeValues.naturalLuxe > 0
          ? "a luxe finish"
          : "a balanced material mix";

    const volume =
      vibeValues.cozyAiry < 0
        ? "and a cozier feel"
        : vibeValues.cozyAiry > 0
          ? "and a more airy feel"
          : "and comfortable openness";

    return `Your new direction: ${light}, ${layering}, ${mood}, with ${finish} ${volume}.`;
  }, [vibeValues]);

  function handleCardSelect(path: Exclude<RefinementPath, null>) {
    setActivePath(path);
  }

  function handleBackToCards() {
    setActivePath(null);
  }

  function appendChip(chip: string) {
    setSpecificText((current) => {
      const trimmed = current.trim();
      if (!trimmed) return chip;
      const separator = /[.!?]$/.test(trimmed) ? " " : ". ";
      return `${trimmed}${separator}${chip}`;
    });
  }

  function updateSlider(key: SliderKey, value: number) {
    setVibeValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function startRerender() {
    if (refinementsRemaining <= 0 || isRendering || !roomId) return;
    setIsRendering(true);
    setRenderError(null);

    // Build refinement text based on active path
    let refinementText = "";
    if (activePath === "specific") {
      refinementText = specificText.trim();
    } else if (activePath === "vibe") {
      refinementText = vibeSummary;
    } else if (activePath === "layout") {
      const layoutDesc: Record<string, string> = {
        conversation:
          "Rearrange furniture into a conversation-first layout with seating facing center",
        open: "Push furniture to walls for an open flow layout with maximum floor space",
        cozy: "Group furniture into a cozy corner arrangement for intimate gathering",
        balanced: "Create balanced symmetry with mirrored layout on both sides",
      };
      refinementText = selectedLayout ? (layoutDesc[selectedLayout] ?? "") : "";
    } else if (activePath === "direction") {
      const variantDesc: Record<string, string> = {
        primary:
          "Keep the overall direction but refine details — closer to my original style profile",
        contrast:
          "Make it more dramatic — higher contrast, sharper lines, moodier atmosphere",
        twist:
          "Try an unexpected twist — introduce an unusual color or sculptural element",
      };
      refinementText = selectedVariant
        ? (variantDesc[selectedVariant] ?? "")
        : "";
    }

    if (!refinementText) {
      refinementText =
        "Refine the overall design while keeping the same style direction.";
    }

    try {
      const res = await fetch("/api/render/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_render_url: renderUrl ?? "",
          refinement_text: refinementText,
          room_id: roomId,
          current_prompt: currentPrompt,
          style_strength: STYLE_STRENGTH_DEFAULT,
        }),
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errData.error ?? "Refinement failed");
      }

      const data = (await res.json()) as { render_url: string };
      setRefinementsUsed((current) => clamp(current + 1, 0, MAX_REFINEMENTS));
      if (data.render_url) {
        setRenderUrl(data.render_url);
        addRenderSession({
          id: `refine-${Date.now()}`,
          renderUrl: data.render_url,
          previewUrl: null,
          parallaxVideoUrl: null,
          iteration: refinementsUsed + 1,
          createdAt: new Date().toISOString(),
        });
      }
      router.push("/design/step-8a");
    } catch (err) {
      setRenderError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setIsRendering(false);
    }
  }

  function renderSelectionCards() {
    const cards = [
      {
        key: "specific" as const,
        icon: <TargetIcon />,
        title: "Something specific",
        description:
          "Describe exactly what you want changed — a piece, the colors, the budget, anything.",
      },
      {
        key: "vibe" as const,
        icon: <SlidersIcon />,
        title: "The overall vibe",
        description:
          "The whole feel is off — dial it in with five simple sliders.",
      },
      {
        key: "layout" as const,
        icon: <GridIcon />,
        title: "Layout only",
        description: "Keep the style, just rearrange the furniture.",
      },
      {
        key: "direction" as const,
        icon: <RefreshIcon />,
        title: "Try a different direction",
        description: "Start fresh with one of your original design variants.",
      },
    ];

    return (
      <div className="step8b-panel-content step8b-state-cards">
        <div className="step8b-heading-block">
          <p className="step8b-eyebrow">REFINE YOUR ROOM</p>
          <h1 className="step8b-title">What&apos;s not working?</h1>
          <p className="step8b-subtitle">Pick a path — we&apos;ll fix it.</p>
        </div>

        <div className="step8b-card-list">
          {cards.map((card, index) => (
            <button
              key={card.key}
              type="button"
              className="step8b-refine-card"
              style={{ animationDelay: `${index * 100}ms` }}
              onClick={() => handleCardSelect(card.key)}
            >
              <span className="step8b-refine-card-left">
                <span className="step8b-refine-card-icon">{card.icon}</span>
                <span className="step8b-refine-card-copy">
                  <span className="step8b-refine-card-title">{card.title}</span>
                  <span className="step8b-refine-card-description">
                    {card.description}
                  </span>
                </span>
              </span>
              <span className="step8b-refine-card-arrow">
                <ArrowIcon />
              </span>
              <span className="step8b-card-shimmer" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderPathHeader(title: string, subtitle: string) {
    return (
      <div className="step8b-path-header">
        <button
          type="button"
          className="step8b-inline-back"
          onClick={handleBackToCards}
        >
          <BackIcon />
          <span>Back</span>
        </button>
        <div>
          <h2 className="step8b-path-title">{title}</h2>
          <p className="step8b-path-subtitle">{subtitle}</p>
        </div>
      </div>
    );
  }

  function renderSpecificPath() {
    return (
      <div className="step8b-panel-content step8b-path-view">
        {renderPathHeader(
          "Tell us what to change",
          "Be as specific or vague as you want.",
        )}

        <label
          className="step8b-textarea-shell"
          htmlFor="step8b-specific-textarea"
        >
          <textarea
            id="step8b-specific-textarea"
            className="step8b-textarea"
            placeholder="e.g. 'swap the sofa for something in cream linen', 'remove the rug', 'make the walls a darker shade', 'cut $500 from the budget'"
            value={specificText}
            onChange={(event) => setSpecificText(event.target.value)}
          />
        </label>

        <div className="step8b-chip-row">
          {SPECIFIC_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="step8b-chip"
              onClick={() => appendChip(chip)}
            >
              {chip}
            </button>
          ))}
        </div>

        {showPreview && specificPreviewLines.length > 0 ? (
          <div className="step8b-preview-card">
            <p className="step8b-preview-label">
              ✦ Here&apos;s what we&apos;ll change:
            </p>
            <ul className="step8b-preview-list">
              {specificPreviewLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="step8b-preview-actions">
              <button type="button" className="step8b-pill step8b-pill-gold">
                Looks right
              </button>
              <button
                type="button"
                className="step8b-pill step8b-pill-ghost"
                onClick={() => setShowPreview(false)}
              >
                Edit
              </button>
            </div>
          </div>
        ) : null}

        <div className="step8b-cta-row">
          <button
            type="button"
            className="step8b-main-cta"
            disabled={!specificText.trim() || refinementsRemaining <= 0}
            onClick={startRerender}
          >
            <span>
              {isRendering ? "Re-rendering your room..." : "Apply Changes"}
            </span>
            {!isRendering ? (
              <ArrowIcon />
            ) : (
              <span className="step8b-button-spinner" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    );
  }

  function renderVibePath() {
    return (
      <div className="step8b-panel-content step8b-path-view">
        {renderPathHeader(
          "Dial in the feel",
          "Drag any combination. We'll re-render accordingly.",
        )}

        <div className="step8b-slider-stack">
          {SLIDER_CONFIG.map((slider) => (
            <div key={slider.key} className="step8b-slider-block">
              <div className="step8b-slider-label-row">
                <span>{slider.left}</span>
                <span className="step8b-slider-current">
                  {slider.labels[vibeValues[slider.key]]}
                </span>
                <span>{slider.right}</span>
              </div>
              <input
                type="range"
                min={-2}
                max={2}
                step={1}
                value={vibeValues[slider.key]}
                onChange={(event) =>
                  updateSlider(slider.key, Number(event.target.value))
                }
                className="step8b-slider"
                aria-label={`${slider.left} to ${slider.right}`}
              />
            </div>
          ))}
        </div>

        <div className="step8b-direction-summary">
          <p>{vibeSummary}</p>
        </div>

        <div className="step8b-cta-row">
          <button
            type="button"
            className="step8b-main-cta"
            disabled={refinementsRemaining <= 0}
            onClick={startRerender}
          >
            <span>
              {isRendering
                ? "Re-rendering your room..."
                : "Render This Direction"}
            </span>
            {!isRendering ? (
              <ArrowIcon />
            ) : (
              <span className="step8b-button-spinner" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    );
  }

  function renderLayoutPath() {
    return (
      <div className="step8b-panel-content step8b-path-view">
        {renderPathHeader(
          "Choose a new arrangement",
          "Same style, same pieces — just a different layout.",
        )}

        <div className="step8b-layout-grid">
          {LAYOUT_OPTIONS.map((layout) => {
            const selected = selectedLayout === layout.value;
            return (
              <button
                key={layout.value}
                type="button"
                className={`step8b-layout-card ${selected ? "is-selected" : ""}`}
                onClick={() => setSelectedLayout(layout.value)}
              >
                <div className="step8b-layout-visual">
                  <LayoutThumbnail layout={layout} />
                  {selected ? (
                    <span className="step8b-check-badge">✓</span>
                  ) : null}
                </div>
                <div className="step8b-layout-copy">
                  <span className="step8b-layout-title">{layout.label}</span>
                  <span className="step8b-layout-description">
                    {layout.description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="step8b-cta-row">
          <button
            type="button"
            className="step8b-main-cta"
            disabled={!selectedLayout || refinementsRemaining <= 0}
            onClick={startRerender}
          >
            <span>
              {isRendering ? "Re-rendering your room..." : "Apply This Layout"}
            </span>
            {!isRendering ? (
              <ArrowIcon />
            ) : (
              <span className="step8b-button-spinner" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    );
  }

  function renderDirectionPath() {
    return (
      <div className="step8b-panel-content step8b-path-view">
        {renderPathHeader(
          "Choose a direction",
          "Pick one of your original variants or generate something entirely new.",
        )}

        <div className="step8b-variant-row">
          {VARIANT_OPTIONS.map((variant) => {
            const selected = selectedVariant === variant.value;
            const muted = selectedVariant && selectedVariant !== variant.value;

            return (
              <button
                key={variant.value}
                type="button"
                className={`step8b-variant-card ${selected ? "is-selected" : ""} ${muted ? "is-muted" : ""}`}
                onClick={() => setSelectedVariant(variant.value)}
              >
                <div className="step8b-variant-image">
                  <div className="step8b-variant-gradient" />
                  {selected ? (
                    <span className="step8b-variant-ring" aria-hidden="true" />
                  ) : null}
                </div>
                <div className="step8b-variant-copy">
                  <span className="step8b-variant-badge">{variant.badge}</span>
                  <span className="step8b-variant-name">{variant.name}</span>
                  <div className="step8b-tag-row">
                    {variant.tags.map((tag) => (
                      <span key={tag} className="step8b-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="step8b-separator" />

        <div className="step8b-secondary-actions">
          <button
            type="button"
            className="step8b-link-button"
            onClick={() => router.push("/design/step-3")}
          >
            Generate a brand new direction
            <ArrowIcon />
          </button>
        </div>

        <div className="step8b-cta-row">
          <button
            type="button"
            className="step8b-main-cta"
            disabled={!selectedVariant || refinementsRemaining <= 0}
            onClick={startRerender}
          >
            <span>
              {isRendering
                ? "Re-rendering your room..."
                : "Render Selected Variant"}
            </span>
            {!isRendering ? (
              <ArrowIcon />
            ) : (
              <span className="step8b-button-spinner" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    );
  }

  function renderActivePanel() {
    switch (activePath) {
      case "specific":
        return renderSpecificPath();
      case "vibe":
        return renderVibePath();
      case "layout":
        return renderLayoutPath();
      case "direction":
        return renderDirectionPath();
      default:
        return renderSelectionCards();
    }
  }

  return (
    <>
      <div className="step8b-page">
        <header className="step8b-top-nav">
          <button
            type="button"
            className="step8b-top-link"
            onClick={() => router.push("/design/step-8a")}
          >
            <BackIcon />
            <span>Back to Reveal</span>
          </button>

          <button
            type="button"
            className="step8b-brand"
            onClick={() => router.push("/")}
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            Cova
          </button>

          <div className="step8b-nav-status">
            {refinementsRemaining} refinements remaining
          </div>
        </header>

        <main className="step8b-shell">
          <section className="step8b-panel-column" aria-live="polite">
            <div className="step8b-panel-shell">{renderActivePanel()}</div>
          </section>

          <section
            className="step8b-context-column"
            aria-label="Current room render"
          >
            <div className="step8b-render-frame">
              <div className="step8b-render-thumbnail">
                <div className="step8b-room-scene">
                  <div className="step8b-room-wall step8b-room-wall-left" />
                  <div className="step8b-room-wall step8b-room-wall-right" />
                  <div className="step8b-room-floor" />
                  <div className="step8b-room-window" />
                  <div className="step8b-room-sofa" />
                  <div className="step8b-room-chair" />
                  <div className="step8b-room-rug" />
                  <div className="step8b-room-lamp" />
                </div>
                <div className="step8b-render-overlay" />
              </div>
              <p className="step8b-render-label">Current render</p>
            </div>
          </section>
        </main>

        <div className="step8b-bottom-bar">
          <div className="step8b-bottom-progress">
            <span>{refinementsUsed} of 3 refinements used</span>
            <div className="step8b-progress-dots" aria-hidden="true">
              {Array.from({ length: MAX_REFINEMENTS }).map((_, index) => (
                <span
                  key={index}
                  className={`step8b-progress-dot ${index < refinementsUsed ? "is-filled" : ""}`}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            className="step8b-bottom-link step8b-bottom-link-muted"
            onClick={() => setShowStartOverModal(true)}
          >
            Start completely over
          </button>

          <button
            type="button"
            className="step8b-bottom-link step8b-bottom-link-gold"
            onClick={() => router.push("/design/step-9")}
          >
            Shop current render
            <ArrowIcon />
          </button>
        </div>
      </div>

      {showStartOverModal ? (
        <div
          className="step8b-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="step8b-modal-title"
        >
          <div className="step8b-modal-card">
            <div className="step8b-modal-sparkle">✦</div>
            <h3 id="step8b-modal-title" className="step8b-modal-title">
              Start from the beginning?
            </h3>
            <p className="step8b-modal-copy">
              This will take you back to Step 1. Your style profile and
              preferences will be saved so you can reference them.
            </p>
            <div className="step8b-modal-actions">
              <button
                type="button"
                className="step8b-pill step8b-pill-gold"
                onClick={() => router.push("/design/step-1")}
              >
                Yes, start over
              </button>
              <button
                type="button"
                className="step8b-pill step8b-pill-ghost"
                onClick={() => setShowStartOverModal(false)}
              >
                Keep refining
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isRendering ? (
        <div
          className="step8b-loading-overlay"
          aria-live="assertive"
          aria-busy="true"
        >
          <div className="step8b-loading-shell">
            <div className="step8b-wireframe-room" aria-hidden="true">
              <span className="step8b-wireframe-panel step8b-wireframe-back" />
              <span className="step8b-wireframe-panel step8b-wireframe-floor" />
              <span className="step8b-wireframe-panel step8b-wireframe-left" />
              <span className="step8b-wireframe-panel step8b-wireframe-object-one" />
              <span className="step8b-wireframe-panel step8b-wireframe-object-two" />
              <span className="step8b-wireframe-scan" />
            </div>

            <div className="step8b-loading-progress-shell">
              <div className="step8b-loading-progress-track">
                <div
                  className="step8b-loading-progress-fill"
                  style={{ width: `${renderProgress}%` }}
                />
              </div>
            </div>

            <p className="step8b-loading-copy">
              {LOADING_MESSAGES[loadingMessageIndex]}
            </p>
          </div>
        </div>
      ) : null}

      {renderError ? (
        <div
          className="step8b-loading-overlay"
          style={{ background: "rgba(10,22,40,0.92)" }}
        >
          <div className="step8b-loading-shell" style={{ gap: "16px" }}>
            <p
              style={{
                color: "#C0504A",
                fontFamily: "Inter, sans-serif",
                fontSize: "15px",
              }}
            >
              {renderError}
            </p>
            <button
              type="button"
              onClick={() => setRenderError(null)}
              style={{
                background: "#C9A84C",
                color: "#0A1628",
                border: "none",
                borderRadius: "24px",
                padding: "10px 24px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
