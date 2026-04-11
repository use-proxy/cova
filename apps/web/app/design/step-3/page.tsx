"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFingerprintStore, type StyleFingerprint } from "@/lib/store/fingerprint";
import "../step-1/step1.css";
import "./step3.css";

type Phase = "anchors" | "pairs" | "validation" | "compute";

type ValidationRender = {
  url: string | null;
  label: string;
};

const MAX_REFINEMENTS = 2;

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

const SUPABASE_STORAGE =
  "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-images";

function getPairImageUrl(
  dimension: string,
  pole: "low" | "high",
  roomType: string,
  pairIndex: number,
): string {
  const round = pairIndex + 1;
  return `${SUPABASE_STORAGE}/comparisons/${dimension}/${dimension}-${pole}-${roomType}-r${round}.webp`;
}

type FingerprintResult = {
  fingerprint: StyleFingerprint;
  style_name: string;
  style_tags: string[];
};

const TOTAL_PAIRS = 12;
const MAX_ANCHOR_PICKS = 3;
const COMPLETION_ROUTE = "/design/step-4";

export default function CovaStyleQuizPage() {
  const router = useRouter();
  const roomType = useFingerprintStore((s) => s.roomType);
  const [phase, setPhase] = useState<Phase>("pairs");

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

  // Validation state
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationRenders, setValidationRenders] = useState<ValidationRender[]>([]);
  const [refinementCount, setRefinementCount] = useState(0);

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

  // ── Phase A — Anchor selection ────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "anchors" || anchors.length > 0) return;
    let cancelled = false;
    setAnchorsLoading(true);
    setAnchorsError(null);
    fetch("/api/quiz/next-card")
      .then(async (res) => {
        if (!res.ok) throw new Error(`next-card ${res.status}`);
        return res.json() as Promise<{ cards: AnchorCard[] }>;
      })
      .then((json) => {
        if (cancelled) return;
        setAnchors(json.cards ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAnchorsError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setAnchorsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [phase, anchors.length]);

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
          completedPairIds,
          responseCount: completedPairIds.length,
          currentFingerprint: currentFp?.dimensions ?? null,
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
        setPairError(err instanceof Error ? err.message : "Failed to load pair");
      }
    } finally {
      setPairLoading(false);
    }
  }, []);

  useEffect(() => {
    if (phase !== "pairs") return;
    if (pairsAnswered >= TOTAL_PAIRS) {
      setPhase("validation");
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

  // ── Validation — render previews + confirm ──────────────────────────────
  const runValidation = useCallback(async () => {
    setValidationLoading(true);
    setValidationRenders([]);
    const store = useFingerprintStore.getState();
    try {
      const fpRes = await fetch("/api/quiz/fingerprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase_a_selections: store.phaseASelections,
          phase_b_responses: store.phaseBResponses,
          room_type: store.roomType ?? "living_room",
          entry_path: "pairs",
        }),
      });
      if (!fpRes.ok) throw new Error(`fingerprint ${fpRes.status}`);
      const fpResult = (await fpRes.json()) as FingerprintResult;
      useFingerprintStore
        .getState()
        .setFingerprint(fpResult.fingerprint, fpResult.style_name, fpResult.style_tags);

      const vrRes = await fetch("/api/quiz/validation-renders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fingerprint: fpResult.fingerprint,
          roomType: store.roomType ?? "living_room",
        }),
      });
      if (!vrRes.ok) throw new Error(`validation-renders ${vrRes.status}`);
      const vrJson = (await vrRes.json()) as { renders: ValidationRender[] };
      setValidationRenders(vrJson.renders ?? []);
      setValidationLoading(false);
    } catch (err: unknown) {
      console.error("[step-3] validation failed:", err);
      setValidationLoading(false);
      setPhase("compute");
    }
  }, []);

  useEffect(() => {
    if (phase !== "validation") return;
    void runValidation();
  }, [phase, runValidation]);

  const handleValidationConfirm = () => {
    setPhase("compute");
  };

  const handleValidationRefine = () => {
    if (refinementCount >= MAX_REFINEMENTS) {
      setPhase("compute");
      return;
    }
    setRefinementCount((n) => n + 1);
    setValidationRenders([]);
    setCurrentPair(null);
    setPairError(null);
    setPairsAnswered(6);
    setPhase("pairs");
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
          phase_b_responses: store.phaseBResponses,
          room_type: store.roomType ?? "living_room",
          entry_path: "pairs",
        }),
      });
      if (!res.ok) throw new Error(`fingerprint ${res.status}`);
      const result = (await res.json()) as FingerprintResult;
      store.setFingerprint(result.fingerprint, result.style_name, result.style_tags);
      router.push(COMPLETION_ROUTE);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[step-3] fingerprint compute failed:", msg);
      setComputeError(msg);
    }
  }, [router]);

  useEffect(() => {
    if (phase !== "compute") return;
    void runCompute();
  }, [phase, runCompute]);

  // ── Render ────────────────────────────────────────────────────────────────
  const progressValue =
    phase === "anchors"
      ? 10
      : phase === "pairs"
        ? 20 + (pairsAnswered / TOTAL_PAIRS) * 70
        : phase === "validation"
          ? 92
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
          <div className="cova-progress-fill" style={{ width: `${progressValue}%` }} />
        </div>

        <header className="cova-header">
          <button
            className="cova-back-button"
            type="button"
            aria-label="Go back"
            onClick={() => router.push("/design/step-2")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="cova-back-icon">
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
              {phase === "anchors" && "Choose what resonates"}
              {phase === "pairs" && `${pairsAnswered} of ${TOTAL_PAIRS}`}
              {phase === "validation" && "Does this feel like you?"}
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

        {phase === "pairs" && (
          <PairsPhase
            pair={currentPair}
            loading={pairLoading}
            error={pairError}
            pairsAnswered={pairsAnswered}
            roomType={roomType}
            onChoice={handlePairChoice}
            onSkip={handleSkipPair}
            onRetry={() => void fetchNextPair()}
          />
        )}

        {phase === "validation" && (
          <ValidationPhase
            loading={validationLoading}
            renders={validationRenders}
            refinementsLeft={MAX_REFINEMENTS - refinementCount}
            onConfirm={handleValidationConfirm}
            onRefine={handleValidationRefine}
          />
        )}

        {phase === "compute" && <ComputePhase error={computeError} onRetry={runCompute} />}
      </section>
    </main>
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
        {loading && <p style={{ textAlign: "center" }}>Loading...</p>}
        {error && (
          <p style={{ textAlign: "center", color: "#C0504A" }}>
            Failed to load: {error}
          </p>
        )}
        {!loading && !error && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "0.75rem",
              maxWidth: "900px",
              margin: "0 auto",
              padding: "1rem",
            }}
          >
            {anchors.map((a) => {
              const isSelected = selectedIds.includes(a.id);
              const disabled = !isSelected && selectedIds.length >= MAX_ANCHOR_PICKS;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onToggle(a.id)}
                  disabled={disabled}
                  aria-pressed={isSelected}
                  style={{
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

// ── Phase B: Pairs ───────────────────────────────────────────────────────────

function PairsPhase({
  pair,
  loading,
  error,
  pairsAnswered,
  roomType,
  onChoice,
  onSkip,
  onRetry,
}: {
  pair: ComparisonPair | null;
  loading: boolean;
  error: string | null;
  pairsAnswered: number;
  roomType: string | null;
  onChoice: (side: "A" | "B") => void;
  onSkip: () => void;
  onRetry: () => void;
}) {
  return (
    <>
      <section className="cova-editorial-intro">
        <h1>Which feels more like you?</h1>
        <p className="cova-subcopy">Go with your gut — there&apos;s no wrong answer.</p>
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
                  backgroundImage: `url(${
                    roomType
                      ? getPairImageUrl(pair.dimension, "low", roomType, pair.dimension_index)
                      : pair.image_a_url
                  })`,
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
                  backgroundImage: `url(${
                    roomType
                      ? getPairImageUrl(pair.dimension, "high", roomType, pair.dimension_index)
                      : pair.image_b_url
                  })`,
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

// ── Validation Phase ─────────────────────────────────────────────────────────

function ValidationPhase({
  loading,
  renders,
  refinementsLeft,
  onConfirm,
  onRefine,
}: {
  loading: boolean;
  renders: ValidationRender[];
  refinementsLeft: number;
  onConfirm: () => void;
  onRefine: () => void;
}) {
  return (
    <>
      <section className="cova-editorial-intro">
        <h1>Does this feel like your style?</h1>
        <p className="cova-subcopy">
          Three previews generated from your answers so far.
        </p>
      </section>
      <section className="cova-comparison-stage" aria-live="polite">
        {loading && (
          <p style={{ textAlign: "center" }}>Generating style previews...</p>
        )}
        {!loading && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "1rem",
              maxWidth: "1100px",
              margin: "0 auto",
              padding: "1rem",
            }}
          >
            {renders.map((r, idx) => (
              <div
                key={idx}
                style={{
                  aspectRatio: "1 / 1",
                  borderRadius: "12px",
                  border: "1px solid rgba(225, 201, 132, 0.22)",
                  backgroundImage: r.url ? `url(${r.url})` : undefined,
                  backgroundColor: "rgba(17, 35, 55, 0.54)",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: "0.5rem 0.75rem",
                    background: "rgba(10, 22, 40, 0.72)",
                    color: "#f4efe6",
                    fontSize: "0.85rem",
                    borderBottomLeftRadius: "12px",
                    borderBottomRightRadius: "12px",
                  }}
                >
                  {r.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <footer className="cova-footer">
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: "0.875rem 2.25rem",
              borderRadius: "24px",
              border: "none",
              background: loading ? "#445064" : "#C9A84C",
              color: "#0A1628",
              fontFamily: "inherit",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            Yes, perfect
          </button>
          <button
            type="button"
            onClick={onRefine}
            disabled={loading || refinementsLeft <= 0}
            style={{
              padding: "0.875rem 2.25rem",
              borderRadius: "24px",
              border: "1px solid rgba(225, 201, 132, 0.3)",
              background: "transparent",
              color: "#f4efe6",
              fontFamily: "inherit",
              fontSize: "1rem",
              cursor: loading || refinementsLeft <= 0 ? "not-allowed" : "pointer",
            }}
          >
            Not quite
          </button>
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
