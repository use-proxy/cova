"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useFingerprintStore } from "@/lib/store/fingerprint";
import type { StyleName } from "@/lib/quiz/style-archetypes";
import type { StyleFingerprint } from "@/types/fingerprint";
import "../step-1/step1.css";
import "./step2.css";

// ── Room types ─────────────────────────────────────────────────────────────────
const ROOM_TYPES: { id: string; label: string }[] = [
  { id: "living_room", label: "Living Room" },
  { id: "bedroom", label: "Bedroom" },
  { id: "dining_room", label: "Dining Room" },
  { id: "home_office", label: "Home Office" },
  { id: "kitchen", label: "Kitchen" },
  { id: "bathroom", label: "Bathroom" },
];

// ── Anchor question definitions ────────────────────────────────────────────────
// Q1 — Natural vs Structured (natureMateriality + plantPresence)
// Q2 — Warm vs Cool (warmth + lightingDrama)
// Q3 — Bold vs Refined (complexity + symmetryPreference)
//
// Q3 style slots 0 and 1 are fixed (COVAARTDECO, COVAINDUSTRIAL).
// Slots 2 and 3 are filled dynamically with the Q1 and Q2 winners.

const Q1_STYLES: StyleName[] = ["COVABIOPHILIC", "COVAJAPANDI", "COVASCANDINAV", "COVAMINIMAL"];
const Q2_STYLES: StyleName[] = ["COVABOHEMIAN", "COVAFARMHOUSE", "COVAMIDCENTURY", "COVACOASTAL"];
const Q3_FIXED_STYLES: StyleName[] = ["COVAARTDECO", "COVAINDUSTRIAL"];

const SUPABASE_STORAGE_BASE = "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-images";

function imageUrl(styleName: StyleName, roomType: string): string {
  return `${SUPABASE_STORAGE_BASE}/${styleName.toLowerCase()}_${roomType}.jpg`;
}

type Phase = "room" | "anchor";

interface AnchorQuestion {
  questionNumber: 1 | 2 | 3;
  styles: StyleName[];
}

// ── Prior computation ──────────────────────────────────────────────────────────
// After all 3 questions:
//   Q1 winner: 0.40
//   Q2 winner: 0.30
//   Q3 winner: 0.20
//   remaining 0.10 distributed across other picked styles
function computePrior(
  q1Winner: StyleName,
  q2Winner: StyleName,
  q3Winner: StyleName,
): Record<string, number> {
  const prior: Record<string, number> = {};

  // Core three winners
  prior[q1Winner] = 0.40;
  prior[q2Winner] = (prior[q2Winner] ?? 0) + 0.30;
  prior[q3Winner] = (prior[q3Winner] ?? 0) + 0.20;

  // Remaining 0.10 split across all picked styles (Q1+Q2+Q3 selections, excluding winners)
  const allPicked = new Set<StyleName>([q1Winner, q2Winner, q3Winner]);
  // Q1 styles not chosen as winner get a tiny share
  const others = [...Q1_STYLES, ...Q2_STYLES, ...Q3_FIXED_STYLES].filter(
    (s) => !allPicked.has(s),
  );
  if (others.length > 0) {
    const share = 0.10 / others.length;
    for (const s of others) {
      prior[s] = (prior[s] ?? 0) + share;
    }
  }

  // Normalize to sum to 1.0
  const total = Object.values(prior).reduce((a, b) => a + b, 0);
  for (const key of Object.keys(prior)) {
    prior[key] = (prior[key] ?? 0) / total;
  }

  return prior;
}

export default function Step2Page() {
  const router = useRouter();
  const roomType = useFingerprintStore((s) => s.roomType);
  const setRoomType = useFingerprintStore((s) => s.setRoomType);

  const [phase, setPhase] = useState<Phase>("room");
  const [currentQuestion, setCurrentQuestion] = useState<1 | 2 | 3>(1);
  const [selections, setSelections] = useState<Partial<Record<1 | 2 | 3, StyleName>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) router.push("/auth?next=/design/step-2");
    };
    void checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build the current question's style list
  const buildQuestion = useCallback(
    (qNum: 1 | 2 | 3): AnchorQuestion => {
      if (qNum === 1) {
        return { questionNumber: 1, styles: Q1_STYLES };
      }
      if (qNum === 2) {
        return { questionNumber: 2, styles: Q2_STYLES };
      }
      // Q3: COVAARTDECO + COVAINDUSTRIAL + Q1 winner + Q2 winner
      const q1Winner = selections[1] ?? Q1_STYLES[0]!;
      const q2Winner = selections[2] ?? Q2_STYLES[0]!;
      return {
        questionNumber: 3,
        styles: [...Q3_FIXED_STYLES, q1Winner, q2Winner],
      };
    },
    [selections],
  );

  const currentQ = buildQuestion(currentQuestion);
  const activeRoomType = roomType ?? "living_room";

  // Progress bar width: room=8%, anchor q1=30%, q2=55%, q3=80%
  const progressWidth =
    phase === "room"
      ? "8%"
      : currentQuestion === 1
      ? "30%"
      : currentQuestion === 2
      ? "55%"
      : "80%";

  const handleRoomSelect = useCallback(
    (id: string) => {
      setRoomType(id);
      setPhase("anchor");
      setCurrentQuestion(1);
      setSelections({});
    },
    [setRoomType],
  );

  const handleImageSelect = useCallback(
    (styleName: StyleName) => {
      setSelections((prev) => ({ ...prev, [currentQuestion]: styleName }));
    },
    [currentQuestion],
  );

  const handleNext = useCallback(async () => {
    const selected = selections[currentQuestion];
    if (!selected) return;

    if (currentQuestion < 3) {
      setIsTransitioning(true);
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
      setCurrentQuestion((q) => (q + 1) as 2 | 3);
      setIsTransitioning(false);
      return;
    }

    // Q3 complete — build prior and call fingerprint API
    const q1Winner = selections[1] ?? Q1_STYLES[0]!;
    const q2Winner = selections[2] ?? Q2_STYLES[0]!;
    const q3Winner = selections[3]!;
    const prior = computePrior(q1Winner, q2Winner, q3Winner);

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/quiz/fingerprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anchor_prior: prior,
          q1_winner: q1Winner,
          q2_winner: q2Winner,
          q3_winner: q3Winner,
          room_type: activeRoomType,
          // Legacy fields — send as empty so the API route doesn't error
          phase_a_selections: [],
          grid_selections: [],
          phase_b_responses: [],
          non_visual_responses: [],
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          fingerprint?: StyleFingerprint;
          style_name?: string;
          style_tags?: string[];
          competing_styles?: string[];
          blend_ratio?: number;
        };
        if (data.fingerprint) {
          useFingerprintStore.getState().setFingerprint(
            data.fingerprint,
            data.style_name ?? "Your Unique Style",
            data.style_tags ?? [],
          );
          useFingerprintStore.getState().setCompetingStyles(
            data.competing_styles ?? [],
            data.blend_ratio ?? 1.0,
          );
        }
      }
    } catch {
      // Navigate anyway — step-3 can recover
    }

    // Persist anchor prior so step-3 can forward it to the fingerprint API
    useFingerprintStore.getState().setAnchorPrior(prior);
    router.push("/design/step-3");
  }, [selections, currentQuestion, activeRoomType, router]);

  const handleBack = useCallback(() => {
    if (phase === "anchor") {
      if (currentQuestion > 1) {
        setCurrentQuestion((q) => (q - 1) as 1 | 2);
      } else {
        setPhase("room");
      }
    } else {
      router.push("/design/step-1");
    }
  }, [phase, currentQuestion, router]);

  return (
    <main className="cova-page">
      <div className="cova-ambient-layer" />
      <div className="cova-noise-overlay" />

      <section className="cova-shell">
        {/* ── Header ── */}
        <header className="cova-header">
          <button
            type="button"
            className="cova-icon-button"
            aria-label="Go back"
            onClick={handleBack}
          >
            <span aria-hidden="true">&lsaquo;</span>
          </button>

          <div className="cova-header-center">
            <button
              type="button"
              className="cova-wordmark"
              onClick={() => router.push("/")}
              aria-label="Cova home"
            >
              Cova
            </button>
            <div className="cova-progress-rail">
              <div
                className="cova-progress-fill"
                style={{ width: progressWidth, transition: "width 320ms ease" }}
              />
            </div>
          </div>

          <div className="cova-step-meta">
            <span>Step 1 of 4</span>
            {phase === "anchor" && (
              <span>{currentQuestion} of 3</span>
            )}
          </div>
        </header>

        {/* ── Room type selection ── */}
        {phase === "room" && (
          <>
            <section className="cova-hero">
              <p className="cova-eyebrow">Before We Begin</p>
              <h1>Which room are we designing?</h1>
              <p className="cova-subtext">Pick one to get started.</p>
            </section>
            <section
              className="anchor-room-grid"
              aria-label="Room type selection"
            >
              {ROOM_TYPES.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  className="anchor-room-btn"
                  onClick={() => handleRoomSelect(room.id)}
                >
                  {room.label}
                </button>
              ))}
            </section>
          </>
        )}

        {/* ── Anchor question phase ── */}
        {phase === "anchor" && (
          <div className={`anchor-phase${isTransitioning ? " anchor-phase--exiting" : " anchor-phase--entering"}`}>
            {/* Progress pips */}
            <div className="anchor-pips" aria-label="Question progress">
              {([1, 2, 3] as const).map((q) => (
                <div
                  key={q}
                  className={`anchor-pip${
                    q < currentQuestion
                      ? " anchor-pip--done"
                      : q === currentQuestion
                      ? " anchor-pip--active"
                      : ""
                  }`}
                />
              ))}
            </div>

            {/* Question counter */}
            <p className="anchor-counter" aria-live="polite">
              {currentQuestion} of 3
            </p>

            {/* 2x2 image grid */}
            <div
              className="anchor-grid"
              aria-label="Select a room style"
              role="group"
            >
              {currentQ.styles.map((styleName) => {
                const isSelected = selections[currentQuestion] === styleName;
                const src = imageUrl(styleName, activeRoomType);
                return (
                  <button
                    key={styleName}
                    type="button"
                    className={`anchor-cell${isSelected ? " anchor-cell--selected" : ""}`}
                    aria-pressed={isSelected}
                    onClick={() => handleImageSelect(styleName)}
                  >
                    <img
                      className="anchor-cell__img"
                      src={src}
                      alt=""
                      draggable={false}
                    />
                    {isSelected && (
                      <div className="anchor-cell__check" aria-hidden="true">
                        <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
                          <path
                            d="M1.5 5.5L5.5 9.5L12.5 1.5"
                            stroke="#0A1628"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Next button — appears after selection */}
            <div className="anchor-cta-row">
              {selections[currentQuestion] && !isSubmitting && (
                <button
                  type="button"
                  className="cova-round-btn anchor-next-btn"
                  onClick={() => { void handleNext(); }}
                >
                  {currentQuestion < 3 ? "Next \u2192" : "See my style \u2192"}
                </button>
              )}
              {isSubmitting && (
                <p className="anchor-loading">Building your profile&hellip;</p>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
