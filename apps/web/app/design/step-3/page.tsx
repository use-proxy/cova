"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useFingerprintStore,
  type StyleFingerprint,
} from "@/lib/store/fingerprint";
import { logger } from "@/lib/logger";
import { LogEvents } from "@/lib/logEvents";
import "../step-1/step1.css";
import "./step3.css";

const log = logger.child({ stepId: "step-3" });

type Phase = "room_type" | "anchors" | "non_visual" | "pairs" | "compute";

type NonVisualAnswer = {
  questionId: "surfaces" | "materials" | "color";
  choiceIndex: number;
};

const ROOM_TYPES: { id: string; label: string }[] = [
  { id: "living_room", label: "Living Room" },
  { id: "bedroom", label: "Bedroom" },
  { id: "dining_room", label: "Dining Room" },
  { id: "home_office", label: "Home Office" },
  { id: "kitchen", label: "Kitchen" },
  { id: "bathroom", label: "Bathroom" },
];

type AnchorCard = {
  id: string;
  image_url: string;
  style_name: string;
  style_vector: Record<string, number>;
};

type ComparisonPair = {
  id: string;
  dimension: string;
  dimension_index: number;
  image_a_url: string;
  image_b_url: string;
};


type FingerprintResult = {
  fingerprint: StyleFingerprint;
  style_name: string;
  style_tags: string[];
};

const TOTAL_PAIRS = 24;
const MAX_ANCHOR_PICKS = 3;
const COMPLETION_ROUTE = "/design/step-3b";

export default function CovaStyleQuizPage() {
  const router = useRouter();
  const roomType = useFingerprintStore((s) => s.roomType);
  // Start at "pairs" when step-2 already ran NLP and set a fingerprint.
  // Start at "non_visual" as fallback for direct navigation without step-2.
  const [phase, setPhase] = useState<Phase>(() => {
    const store = useFingerprintStore.getState();
    if (!store.roomType) return "room_type";
    if (store.fingerprint) {
      const isConfident = store.blendRatio >= 0.72 && store.competingStyles.length <= 1;
      if (isConfident) return "compute";
      return "pairs";
    }
    return "non_visual";
  });

  // Non-visual questions state
  const [nonVisualAnswers, setNonVisualAnswers] = useState<NonVisualAnswer[]>([]);

  // Phase A state
  const [anchors, setAnchors] = useState<AnchorCard[]>([]);
  const [anchorsLoading, setAnchorsLoading] = useState(false);
  const [anchorsError, setAnchorsError] = useState<string | null>(null);
  const [selectedAnchorIds, setSelectedAnchorIds] = useState<string[]>([]);

  // Phase B state
  const [currentPair, setCurrentPair] = useState<ComparisonPair | null>(null);
  const [pairsAnswered, setPairsAnswered] = useState(0);
  const [pairLoading, setPairLoading] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const pairStartRef = useRef<number>(Date.now());

  // Phase C state
  const [computeError, setComputeError] = useState<string | null>(null);

  // Auth check (preserved from previous implementation)
  useEffect(() => {
    const checkAuth = async () => {
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) router.push("/auth?next=/design/step-3");
    };
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset computed outputs so previous pair answers don't bleed into the new
  // session. DO NOT wipe roomType or gridSelections (set by step-2).
  // Phase was already set correctly by the useState initializer above —
  // do NOT call setPhase here; that would override the "pairs" fast-path.
  useEffect(() => {
    useFingerprintStore.setState({
      fingerprint: null,
      styleName: null,
      styleTags: [],
      styleExplanation: null,
      phaseBResponses: [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Phase A — Anchor fetch (only used if somehow anchors phase is reached) ───
  // Guard: anchors phase is skipped when coming from step-2 (phaseASelections
  // are already in the store). This only fires as a fallback edge case.
  useEffect(() => {
    if (phase !== "anchors") return;
    if (!roomType) return;
    const controller = new AbortController();

    async function load() {
      setAnchorsLoading(true);
      setAnchorsError(null);
      const url = `/api/quiz/next-card?room_type=${roomType}`;
      log.info("QUIZ", LogEvents.QUIZ_ANCHOR_FETCH_START,
        `Fetching: ${url}`,
        { data: { url, roomType } },
      );
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`next-card ${res.status}`);
        const json = (await res.json()) as { cards: AnchorCard[] };
        if (!controller.signal.aborted) {
          setAnchors(json.cards ?? []);
          setAnchorsLoading(false);
          log.info("QUIZ", LogEvents.QUIZ_ANCHOR_FETCH_SUCCESS,
            `Loaded ${json.cards?.length ?? 0} anchors`,
            { data: { count: json.cards?.length ?? 0, roomType } },
          );
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        log.error("QUIZ", LogEvents.QUIZ_ANCHOR_FETCH_FAILURE,
          `Anchor fetch failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          {
            error: {
              message: err instanceof Error ? err.message : "Unknown error",
              name: err instanceof Error ? err.name : "Error",
              stack: null,
              code: "FETCH_FAILED",
              httpStatus: null,
              retryCount: null,
            },
          },
        );
        setAnchorsError(err instanceof Error ? err.message : "Failed to load");
        setAnchorsLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [phase, roomType]);

  // Called when the user taps a room type button in Phase 0.
  // roomType is passed directly to fetchAnchors — no useEffect, no store read.
  function handleRoomTypeSelect(selectedRoomType: string) {
    useFingerprintStore.getState().setRoomType(selectedRoomType);
    setPhase("non_visual");
  }

  const toggleAnchor = (id: string) => {
    setSelectedAnchorIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_ANCHOR_PICKS) return prev;
      return [...prev, id];
    });
  };

  const handleAnchorsContinue = () => {
    const store = useFingerprintStore.getState();
    for (const id of selectedAnchorIds) store.addPhaseASelection(id);
    setPhase("pairs");
  };

  // ── Phase B — Pairwise comparison ─────────────────────────────────────────
  const fetchNextPair = useCallback(async () => {
    setPairLoading(true);
    setPairError(null);
    const store = useFingerprintStore.getState();
    const completedPairIds = store.phaseBResponses.map((r) => r.pairId);
    const currentFp = store.fingerprint;

    const doFetch = async (): Promise<ComparisonPair | null> => {
      const res = await fetch("/api/quiz/next-pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competing_styles: store.competingStyles ?? [],
          completedPairIds,
          responseCount: completedPairIds.length,
          currentFingerprint: currentFp?.dimensions ?? null,
          ...(store.roomType ? { room_type: store.roomType } : {}),
        }),
      });
      if (!res.ok) throw new Error(`next-pair ${res.status}`);
      const json = (await res.json()) as {
        pair: ComparisonPair | null;
        quizComplete?: boolean;
      };
      return json.pair;
    };

    try {
      const pair = await doFetch();
      setCurrentPair(pair);
      pairStartRef.current = Date.now();
    } catch {
      try {
        const pair = await doFetch();
        setCurrentPair(pair);
        pairStartRef.current = Date.now();
      } catch (err: unknown) {
        setPairError(
          err instanceof Error ? err.message : "Failed to load pair",
        );
      }
    } finally {
      setPairLoading(false);
    }
  }, []);

  useEffect(() => {
    if (phase !== "pairs") return;
    if (pairsAnswered >= TOTAL_PAIRS) {
      setPhase("compute");
      return;
    }
    if (currentPair) return;
    void fetchNextPair();
  }, [phase, pairsAnswered, currentPair, fetchNextPair]);

  const handlePairChoice = (side: "A" | "B") => {
    if (!currentPair || pairLoading) return;
    useFingerprintStore.getState().addPhaseBResponse({
      pairId: currentPair.id,
      chosenSide: side,
      responseTimeMs: Date.now() - pairStartRef.current,
    });
    setCurrentPair(null);
    setPairsAnswered((n) => n + 1);
  };

  const handleSkipPair = () => {
    if (currentPair) {
      useFingerprintStore.getState().addPhaseBResponse({
        pairId: currentPair.id,
        chosenSide: "skip",
        responseTimeMs: 0,
      });
    }
    setCurrentPair(null);
    setPairError(null);
    setPairsAnswered((n) => n + 1);
  };

  // ── Phase C — Compute fingerprint ─────────────────────────────────────────
  const runCompute = useCallback(async () => {
    setComputeError(null);
    const store = useFingerprintStore.getState();
    try {
      const res = await fetch("/api/quiz/fingerprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase_a_selections: store.phaseASelections,
          grid_selections: store.gridSelections,
          phase_b_responses: store.phaseBResponses,
          non_visual_responses: nonVisualAnswers,
          room_type: store.roomType ?? "living_room",
          tiebreaker_deltas: store.tiebreakerDeltas ?? null,
          entry_path: "pairs",
          // V3 anchor prior from step-2 (if available)
          ...(store.anchorPrior ? { anchor_prior: store.anchorPrior } : {}),
        }),
      });
      if (!res.ok) throw new Error(`fingerprint ${res.status}`);
      const result = (await res.json()) as FingerprintResult;
      store.setFingerprint(
        result.fingerprint,
        result.style_name,
        result.style_tags,
      );
      router.push(COMPLETION_ROUTE);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[step-3] fingerprint compute failed:", msg);
      setComputeError(msg);
    }
  }, [router, nonVisualAnswers]);

  useEffect(() => {
    if (phase !== "compute") return;
    void runCompute();
  }, [phase, runCompute]);

  // ── Render ────────────────────────────────────────────────────────────────
  const progressValue =
    phase === "room_type"
      ? 5
      : phase === "anchors"
        ? 10
        : phase === "non_visual"
          ? 15
          : phase === "pairs"
            ? 20 + (pairsAnswered / TOTAL_PAIRS) * 80
            : 100;

  return (
    <main className="cova-shell">
      <div className="cova-noise" aria-hidden="true" />
      <div className="cova-glow" aria-hidden="true" />

      <section className="cova-page">
        <div
          className="cova-progress-rail"
          aria-label={`Progress ${Math.round(progressValue)} percent`}
        >
          <div
            className="cova-progress-fill"
            style={{ width: `${progressValue}%` }}
          />
        </div>

        <header className="cova-header">
          <button
            className="cova-back-button"
            type="button"
            aria-label="Go back"
            onClick={() => router.push("/design/step-2")}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="cova-back-icon"
            >
              <path
                d="M15.5 19 8.5 12l7-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div className="cova-brand-lockup">
            <div className="cova-progress-copy">
              {phase === "room_type" && "Which room are we designing?"}
              {phase === "anchors" && "Choose what resonates"}
              {phase === "non_visual" && "A few quick questions"}
              {phase === "pairs" && `${pairsAnswered} of ${TOTAL_PAIRS}`}
              {phase === "compute" && "Analyzing your style..."}
            </div>
            <button
              type="button"
              className="cova-brand-wordmark"
              onClick={() => router.push("/")}
              aria-label="Go to home"
            >
              Cova
            </button>
          </div>

          <div className="cova-header-spacer" aria-hidden="true" />
        </header>

        <div className="cova-eyebrow-band">
          <div className="cova-divider-gold" aria-hidden="true" />
          <p className="cova-eyebrow">Style Quiz</p>
          <div className="cova-divider-gold" aria-hidden="true" />
        </div>

        {phase === "room_type" && (
          <RoomTypePhase onSelect={handleRoomTypeSelect} />
        )}

        {phase === "anchors" && (
          <AnchorsPhase
            anchors={anchors}
            loading={anchorsLoading}
            error={anchorsError}
            selectedIds={selectedAnchorIds}
            onToggle={toggleAnchor}
            onContinue={handleAnchorsContinue}
          />
        )}

        {phase === "non_visual" && (
          <NonVisualPhase
            answers={nonVisualAnswers}
            onAnswer={(answer) => {
              setNonVisualAnswers((prev) => [...prev, answer]);
            }}
            onComplete={() => setPhase("pairs")}
          />
        )}

        {phase === "pairs" && (
          <PairsPhase
            pair={currentPair}
            loading={pairLoading}
            error={pairError}
            pairsAnswered={pairsAnswered}
            onChoice={handlePairChoice}
            onSkip={handleSkipPair}
            onRetry={() => void fetchNextPair()}
          />
        )}

        {phase === "compute" && (
          <ComputePhase error={computeError} onRetry={runCompute} />
        )}
      </section>
    </main>
  );
}

// ── Phase 0: Room type selection ─────────────────────────────────────────────

function RoomTypePhase({ onSelect }: { onSelect: (roomType: string) => void }) {
  return (
    <>
      <section className="cova-editorial-intro">
        <h1>Which room are we designing?</h1>
        <p className="cova-subcopy">Pick one to get started.</p>
      </section>
      <section className="cova-comparison-stage">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
            maxWidth: "900px",
            margin: "0 auto",
            padding: "1.5rem",
          }}
        >
          {ROOM_TYPES.map((room) => (
            <button
              key={room.id}
              type="button"
              onClick={() => onSelect(room.id)}
              style={{
                padding: "2rem 1rem",
                borderRadius: "12px",
                border: "1px solid rgba(225, 201, 132, 0.22)",
                background: "rgba(17, 35, 55, 0.54)",
                color: "#f4efe6",
                fontSize: "1.1rem",
                fontFamily: "inherit",
                cursor: "pointer",
                transition: "all 200ms ease-out",
              }}
            >
              {room.label}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

// ── Phase A: Anchors ─────────────────────────────────────────────────────────

function AnchorsPhase({
  anchors,
  loading,
  error,
  selectedIds,
  onToggle,
  onContinue,
}: {
  anchors: AnchorCard[];
  loading: boolean;
  error: string | null;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onContinue: () => void;
}) {
  return (
    <>
      <section className="cova-editorial-intro">
        <h1>Which of these feel like you?</h1>
        <p className="cova-subcopy">
          Pick up to {MAX_ANCHOR_PICKS} that resonate most.
        </p>
      </section>
      <section className="cova-comparison-stage">
        {loading && anchors.length === 0 && (
          <p style={{ textAlign: "center" }}>Loading...</p>
        )}
        {error && anchors.length === 0 && (
          <p style={{ textAlign: "center", color: "#C0504A" }}>
            Failed to load: {error}
          </p>
        )}
        {anchors.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "0.75rem",
              maxWidth: "900px",
              width: "100%",
              margin: "0 auto",
              padding: "1rem",
            }}
          >
            {anchors.map((a) => {
              const isSelected = selectedIds.includes(a.id);
              const disabled =
                !isSelected && selectedIds.length >= MAX_ANCHOR_PICKS;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onToggle(a.id)}
                  disabled={disabled}
                  aria-pressed={isSelected}
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    borderRadius: "12px",
                    border: isSelected
                      ? "3px solid #C9A84C"
                      : "1px solid rgba(225, 201, 132, 0.2)",
                    backgroundImage: `url(${a.image_url})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.4 : 1,
                    padding: 0,
                    transition: "all 200ms ease-out",
                  }}
                />
              );
            })}
          </div>
        )}
      </section>
      <footer className="cova-footer">
        <button
          type="button"
          onClick={onContinue}
          disabled={selectedIds.length === 0}
          style={{
            padding: "0.875rem 2.5rem",
            borderRadius: "24px",
            border: "none",
            background: selectedIds.length === 0 ? "#445064" : "#C9A84C",
            color: "#0A1628",
            fontFamily: "inherit",
            fontSize: "1rem",
            fontWeight: 600,
            cursor: selectedIds.length === 0 ? "not-allowed" : "pointer",
            transition: "all 200ms ease-out",
          }}
        >
          Continue
        </button>
      </footer>
    </>
  );
}

// ── Non-Visual Questions Phase ────────────────────────────────────────────────

const NON_VISUAL_QUESTIONS: Array<{
  id: "surfaces" | "materials" | "color";
  question: string;
  choices: string[];
}> = [
  {
    id: "surfaces",
    question: "How do you prefer your surfaces?",
    choices: [
      "Clear and minimal",
      "Some thoughtful objects",
      "Layered with things I love",
    ],
  },
  {
    id: "materials",
    question: "What materials feel most like home?",
    choices: [
      "Natural wood, stone, plants",
      "Clean white, glass, metal",
      "Rich fabrics, velvet, brass",
      "Mix of everything",
    ],
  },
  {
    id: "color",
    question: "What\u2019s your relationship with color?",
    choices: [
      "Neutrals only",
      "One accent color, rest neutral",
      "Bold color as a statement",
      "Color everywhere",
    ],
  },
];

function NonVisualPhase({
  answers,
  onAnswer,
  onComplete,
}: {
  answers: NonVisualAnswer[];
  onAnswer: (answer: NonVisualAnswer) => void;
  onComplete: () => void;
}) {
  const currentQ = NON_VISUAL_QUESTIONS[answers.length];

  // All questions answered — auto-advance
  useEffect(() => {
    if (answers.length >= NON_VISUAL_QUESTIONS.length) {
      const timer = setTimeout(onComplete, 300);
      return () => clearTimeout(timer);
    }
  }, [answers.length, onComplete]);

  if (!currentQ) return null;

  return (
    <>
      <section className="cova-editorial-intro">
        <h1>{currentQ.question}</h1>
        <p className="cova-subcopy">
          Question {answers.length + 1} of {NON_VISUAL_QUESTIONS.length}
        </p>
      </section>
      <section className="cova-comparison-stage">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            maxWidth: "480px",
            margin: "0 auto",
            padding: "1.5rem",
          }}
        >
          {currentQ.choices.map((choice, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() =>
                onAnswer({ questionId: currentQ.id, choiceIndex: idx })
              }
              style={{
                padding: "1.25rem 1.5rem",
                borderRadius: "12px",
                border: "1px solid rgba(225, 201, 132, 0.22)",
                background: "rgba(17, 35, 55, 0.54)",
                color: "#f4efe6",
                fontSize: "1rem",
                fontFamily: "inherit",
                cursor: "pointer",
                transition: "all 200ms ease-out",
                textAlign: "left",
              }}
            >
              {choice}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

// ── Phase B: Pairs ───────────────────────────────────────────────────────────

function PairsPhase({
  pair,
  loading,
  error,
  pairsAnswered,
  onChoice,
  onSkip,
  onRetry,
}: {
  pair: ComparisonPair | null;
  loading: boolean;
  error: string | null;
  pairsAnswered: number;
  onChoice: (side: "A" | "B") => void;
  onSkip: () => void;
  onRetry: () => void;
}) {
  return (
    <>
      <section className="cova-editorial-intro">
        <h1>Which feels more like you?</h1>
        <p className="cova-subcopy">
          Go with your gut — there&apos;s no wrong answer.
        </p>
      </section>
      <section className="cova-comparison-stage" aria-live="polite">
        {loading && <p style={{ textAlign: "center" }}>Loading next pair...</p>}
        {error && !loading && (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "#C0504A" }}>Failed: {error}</p>
            <button type="button" onClick={onRetry} style={retryButton}>
              Retry
            </button>
            <button type="button" onClick={onSkip} style={skipButton}>
              Skip
            </button>
          </div>
        )}
        {pair && !loading && !error && (
          <div className="cova-comparison-frame cova-cards-container">
            <div className="cova-choice-wrap">
              <button
                type="button"
                className="cova-choice-card"
                onClick={() => onChoice("A")}
                aria-label="Choose left"
                style={{
                  backgroundImage: `url(${pair.image_a_url})`,
                }}
              />
            </div>
            <div className="cova-or-divider" aria-hidden="true">
              <span className="cova-divider-line" />
              <span className="cova-or-badge">OR</span>
              <span className="cova-divider-line" />
            </div>
            <div className="cova-choice-wrap">
              <button
                type="button"
                className="cova-choice-card"
                onClick={() => onChoice("B")}
                aria-label="Choose right"
                style={{
                  backgroundImage: `url(${pair.image_b_url})`,
                }}
              />
            </div>
          </div>
        )}
      </section>
      <footer className="cova-footer">
        <p>
          {pairsAnswered} of {TOTAL_PAIRS}
        </p>
        <div className="cova-dot-row" aria-hidden="true">
          {Array.from({ length: TOTAL_PAIRS }).map((_, index) => (
            <span
              key={index}
              className={`cova-progress-dot ${index < pairsAnswered ? "is-complete" : ""}`}
            />
          ))}
        </div>
      </footer>
    </>
  );
}

// ── Phase C: Compute ─────────────────────────────────────────────────────────

function ComputePhase({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <section className="cova-comparison-stage" aria-live="polite">
      <div style={{ textAlign: "center", padding: "4rem 1rem" }}>
        {!error ? (
          <>
            <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>✦</div>
            <p>Analyzing your style...</p>
          </>
        ) : (
          <>
            <p style={{ color: "#C0504A", marginBottom: "1rem" }}>
              Something went wrong: {error}
            </p>
            <button type="button" onClick={onRetry} style={retryButton}>
              Retry
            </button>
          </>
        )}
      </div>
    </section>
  );
}

const retryButton: React.CSSProperties = {
  padding: "0.75rem 2rem",
  borderRadius: "24px",
  border: "none",
  background: "#C9A84C",
  color: "#0A1628",
  fontFamily: "inherit",
  fontSize: "0.95rem",
  fontWeight: 600,
  cursor: "pointer",
  marginRight: "0.5rem",
};

const skipButton: React.CSSProperties = {
  padding: "0.75rem 2rem",
  borderRadius: "24px",
  border: "1px solid rgba(225, 201, 132, 0.3)",
  background: "transparent",
  color: "#f4efe6",
  fontFamily: "inherit",
  fontSize: "0.95rem",
  cursor: "pointer",
};
