"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { useFingerprintStore, useSessionStore } from "@/lib/store";
import { StepIndicator } from "@/components/cova/StepIndicator";
import type { StyleFingerprint } from "@/types/fingerprint";

// ── Types ─────────────────────────────────────────────────────────────────────

type QuizPhase = "A" | "transitioning" | "B" | "C";

type DimKey =
  | "colorTemperature" | "colorSaturation" | "density" | "formality"
  | "era" | "material" | "texture" | "pattern"
  | "lineQuality" | "lightPreference" | "nature" | "culturalInfluence";

// Response shape from /api/quiz/next-card (Session C wiring).
interface AnchorCard {
  id: string;
  style_name: string;
  style_index: number;
  image_url: string;
  style_vector: Record<DimKey, number>;
}

// Response shape from /api/quiz/next-pair (Session C wiring).
interface PairData {
  id: string;
  dimension: string;
  dimension_index: number;
  image_a_url: string;
  image_b_url: string;
  image_a_vector: Record<DimKey, number>;
  image_b_vector: Record<DimKey, number>;
}

const DIM_KEYS: DimKey[] = [
  "colorTemperature", "colorSaturation", "density", "formality",
  "era", "material", "texture", "pattern",
  "lineQuality", "lightPreference", "nature", "culturalInfluence",
];

const DIM_COUNT = DIM_KEYS.length; // 12
const NEUTRAL_MIDPOINT = 0.5;

const TOTAL_PAIRS = 12;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeIdentityCov(scale: number): number[][] {
  return Array.from({ length: DIM_COUNT }, (_, i) =>
    Array.from({ length: DIM_COUNT }, (__, j) => (i === j ? scale : 0))
  );
}

function makeNeutralDims(): Record<DimKey, number> {
  const d = {} as Record<DimKey, number>;
  for (const k of DIM_KEYS) d[k] = NEUTRAL_MIDPOINT;
  return d;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function buildWarmStart(phaseADims: Array<Record<DimKey, number>>): StyleFingerprint {
  const mean = makeNeutralDims();
  if (phaseADims.length > 0) {
    // Reset to 0 and average actual labels (in [0, 1])
    for (const k of DIM_KEYS) mean[k] = 0;
    for (const dims of phaseADims) {
      for (const k of DIM_KEYS) mean[k] += (dims[k] ?? NEUTRAL_MIDPOINT) / phaseADims.length;
    }
  }
  return {
    dimensions: mean as StyleFingerprint["dimensions"],
    covariance: makeIdentityCov(0.5),
    confidence: 0.3,
  };
}

// ── Phase A Component ─────────────────────────────────────────────────────────
//
// Single-round Phase A (Session C).
// Shows all 9 anchor images simultaneously. The user selects EXACTLY 2.
// The second tap immediately advances to Phase B — no Next button.

interface PhaseAProps {
  onComplete: (phaseADims: Array<Record<DimKey, number>>) => void;
  onBack: () => void;
}

function PhaseA({ onComplete, onBack }: PhaseAProps) {
  const { addPhaseASelection } = useFingerprintStore();
  const [anchors, setAnchors] = useState<AnchorCard[]>([]);
  const [selections, setSelections] = useState<AnchorCard[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(true);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const loadedRef = useRef(false);

  const loadAnchors = useCallback(async () => {
    setIsLoadingImages(true);
    try {
      const res = await fetch("/api/quiz/next-card", { method: "GET" });
      if (!res.ok) throw new Error("Failed to load anchors");
      const data = (await res.json()) as { cards: AnchorCard[] };
      setAnchors(data.cards ?? []);
    } catch {
      setAnchors([]);
    } finally {
      setIsLoadingImages(false);
    }
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void loadAnchors();
  }, [loadAnchors]);

  function handleCardTap(card: AnchorCard) {
    if (isAdvancing) return;

    setSelections((prev) => {
      const existsAt = prev.findIndex((c) => c.id === card.id);
      // Toggle: if already selected, deselect.
      if (existsAt >= 0) {
        return prev.filter((c) => c.id !== card.id);
      }
      // Cap at 2; second selection auto-advances below.
      if (prev.length >= 2) return prev;
      const next = [...prev, card];

      // Second tap → record selections in store and advance immediately.
      if (next.length === 2) {
        setIsAdvancing(true);
        for (const c of next) addPhaseASelection(c.id);
        // Brief delay so the user sees the second checkmark before transition.
        setTimeout(() => {
          onComplete(next.map((c) => c.style_vector));
        }, 350);
      }
      return next;
    });
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--cova-bg, #0A1628)" }}>
      <StepIndicator currentStep={3} totalSteps={9} />

      <button
        onClick={onBack}
        className="absolute top-4 left-4 text-sm transition-colors"
        style={{ color: "var(--cova-muted, #8BA3C0)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--cova-ivory, #F8F6F1)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--cova-muted, #8BA3C0)")}
      >
        ← Back
      </button>

      <div className="flex-1 flex flex-col items-center px-4 pb-8">
        <h1
          className="font-serif text-3xl text-center mt-8 mb-1"
          style={{ color: "var(--cova-ivory, #F8F6F1)", fontFamily: "'EB Garamond', serif" }}
        >
          Which rooms speak to you?
        </h1>
        <p className="text-sm text-center mb-6" style={{ color: "var(--cova-muted, #8BA3C0)" }}>
          Pick the two that feel most like home
        </p>

        {/* Image grid — 3×3 of all 9 anchors */}
        <div className="grid grid-cols-3 gap-2 w-full max-w-md mx-auto">
          {isLoadingImages
            ? Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-xl"
                  style={{ aspectRatio: "1/1", backgroundColor: "var(--cova-surface, #0F1F3D)" }}
                />
              ))
            : anchors.map((card, idx) => {
                const isSelected = selections.some((c) => c.id === card.id);
                return (
                  <motion.div
                    key={card.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.25, delay: idx * 0.035 }}
                    onClick={() => handleCardTap(card)}
                    className="relative cursor-pointer rounded-xl overflow-hidden"
                    style={{
                      aspectRatio: "1/1",
                      boxShadow: isSelected
                        ? "0 0 0 2px var(--cova-gold, #C9A84C), 0 0 0 3px var(--cova-bg, #0A1628)"
                        : "none",
                    }}
                  >
                    <Image
                      src={card.image_url}
                      alt="Interior design style option"
                      fill
                      className="object-cover"
                      loading="eager"
                      sizes="(max-width: 448px) 33vw, 149px"
                    />
                    {isSelected && (
                      <div
                        className="absolute inset-0"
                        style={{ backgroundColor: "rgba(201,168,76,0.15)" }}
                      />
                    )}
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 20 }}
                        className="absolute top-1.5 right-1.5 flex items-center justify-center rounded-full"
                        style={{ width: 20, height: 20, backgroundColor: "var(--cova-gold, #C9A84C)" }}
                      >
                        <Check size={12} style={{ color: "var(--cova-bg, #0A1628)" }} />
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
        </div>

        <p
          className="text-xs text-center mt-4"
          style={{ color: "var(--cova-muted, #8BA3C0)", minHeight: 16 }}
        >
          {selections.length === 0
            ? "Tap two to continue"
            : selections.length === 1
              ? "One more"
              : "Refining your style…"}
        </p>
      </div>
    </div>
  );
}

// ── Transition Screen ─────────────────────────────────────────────────────────

function TransitionScreen() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ backgroundColor: "var(--cova-bg, #0A1628)" }}
    >
      <div
        className="w-10 h-10 rounded-full animate-spin"
        style={{ border: "2px solid var(--cova-gold, #C9A84C)", borderTopColor: "transparent" }}
      />
      <p
        className="font-serif text-xl"
        style={{ color: "var(--cova-ivory, #F8F6F1)", fontFamily: "'EB Garamond', serif" }}
      >
        Refining your style profile...
      </p>
      <p className="text-sm" style={{ color: "var(--cova-muted, #8BA3C0)" }}>
        A few more questions to personalize
      </p>
    </div>
  );
}

// ── Phase B Component ─────────────────────────────────────────────────────────
//
// Pairwise refinement (Session C). Body shape sent to /api/quiz/next-pair:
//   { completedPairIds, currentFingerprint, responseCount }
// Response shape:
//   { pair: { id, dimension, dimension_index, image_a_url, image_b_url,
//             image_a_vector, image_b_vector } | null,
//     quizComplete: boolean }
// On every tap we record { pairId, chosenSide: 'A'|'B', responseTimeMs } in
// the store. The skip button records nothing (skip support is deferred per
// Session C scope) and just advances to the next pair.

interface PhaseBProps {
  warmStart: StyleFingerprint;
  onComplete: (finalFP: StyleFingerprint) => void;
}

function PhaseB({ warmStart, onComplete }: PhaseBProps) {
  const { addPhaseBResponse } = useFingerprintStore();
  const [pairNumber, setPairNumber] = useState(1);
  const [currentPair, setCurrentPair] = useState<PairData | null>(null);
  const [completedPairIds, setCompletedPairIds] = useState<string[]>([]);
  const [responsesPerDim, setResponsesPerDim] = useState<Record<DimKey, number>>(() => {
    const o = {} as Record<DimKey, number>;
    for (const k of DIM_KEYS) o[k] = 0;
    return o;
  });
  const [localFingerprint, setLocalFingerprint] = useState<StyleFingerprint>(warmStart);
  const [pairShownAt, setPairShownAt] = useState(Date.now());
  const [isLoadingPair, setIsLoadingPair] = useState(true);
  const [chosenSide, setChosenSide] = useState<"A" | "B" | null>(null);
  const loadedRef = useRef(false);

  const loadNextPair = useCallback(
    async (fp: StyleFingerprint, completed: string[], count: number) => {
      setIsLoadingPair(true);
      try {
        const res = await fetch("/api/quiz/next-pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            completedPairIds: completed,
            currentFingerprint: fp,
            responseCount: count,
          }),
        });
        if (!res.ok) throw new Error("next-pair failed");
        const data = (await res.json()) as { pair: PairData | null; quizComplete: boolean };
        if (data.quizComplete || !data.pair) {
          setCurrentPair(null);
          // Library exhausted before TOTAL_PAIRS reached — finish with what we have.
          onComplete(fp);
          return;
        }
        setCurrentPair(data.pair);
        setPairShownAt(Date.now());
      } catch {
        setCurrentPair(null);
      } finally {
        setIsLoadingPair(false);
      }
    },
    [onComplete]
  );

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void loadNextPair(warmStart, [], 0);
  }, [loadNextPair, warmStart]);

  function handlePairResponse(side: "A" | "B") {
    if (!currentPair || chosenSide) return;
    const responseTimeMs = Date.now() - pairShownAt;

    const chosenVec = side === "A" ? currentPair.image_a_vector : currentPair.image_b_vector;
    const rejectedVec = side === "A" ? currentPair.image_b_vector : currentPair.image_a_vector;

    // Local fingerprint update — mirrors the server math in
    // /api/quiz/fingerprint so the next-pair selection sees a correct
    // covariance diagonal between calls.
    const lambda = Math.min(3, 1 + 500 / Math.max(responseTimeMs, 100));
    const newDims = { ...localFingerprint.dimensions } as Record<DimKey, number>;

    DIM_KEYS.forEach((dim) => {
      const delta =
        ((chosenVec[dim] ?? NEUTRAL_MIDPOINT) - (rejectedVec[dim] ?? NEUTRAL_MIDPOINT)) *
        0.15 *
        lambda;
      newDims[dim] = clamp((newDims[dim] ?? NEUTRAL_MIDPOINT) + delta, 0, 1);
    });

    // Per-dim response counter → covariance encoding cov[i][i] = 1 - min(1, count/4).
    const newCounts = { ...responsesPerDim };
    if (currentPair.dimension && (currentPair.dimension as DimKey) in newCounts) {
      newCounts[currentPair.dimension as DimKey] += 1;
    }
    const newCov: number[][] = makeIdentityCov(0);
    let confSum = 0;
    DIM_KEYS.forEach((dim, i) => {
      const dimConf = Math.min(1, newCounts[dim] / 4);
      newCov[i]![i] = 1 - dimConf;
      confSum += dimConf;
    });
    const confidence = confSum / DIM_COUNT;

    const updatedFP: StyleFingerprint = {
      dimensions: newDims as StyleFingerprint["dimensions"],
      covariance: newCov,
      confidence,
    };
    setLocalFingerprint(updatedFP);
    setResponsesPerDim(newCounts);

    addPhaseBResponse({
      pairId: currentPair.id,
      chosenSide: side,
      responseTimeMs,
    });

    const newCompleted = [...completedPairIds, currentPair.id];
    setCompletedPairIds(newCompleted);
    setChosenSide(side);

    setTimeout(() => {
      setChosenSide(null);
      if (pairNumber >= TOTAL_PAIRS) {
        onComplete(updatedFP);
      } else {
        setPairNumber((p) => p + 1);
        void loadNextPair(updatedFP, newCompleted, newCompleted.length);
      }
    }, 650);
  }

  function handleSkip() {
    if (!currentPair || chosenSide) return;
    // Skip records no phase_b_response (per Session C scope — full skip support
    // is deferred). The pair is still added to the exclusion list so it
    // doesn't reappear, and responseCount advances so the quiz still ends
    // after TOTAL_PAIRS rounds.
    const newCompleted = [...completedPairIds, currentPair.id];
    setCompletedPairIds(newCompleted);
    if (pairNumber >= TOTAL_PAIRS) {
      onComplete(localFingerprint);
    } else {
      setPairNumber((p) => p + 1);
      void loadNextPair(localFingerprint, newCompleted, newCompleted.length);
    }
  }

  const progressPct = ((pairNumber / TOTAL_PAIRS) * 100).toFixed(1);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--cova-bg, #0A1628)" }}>
      <StepIndicator currentStep={3} totalSteps={9} />

      <div className="h-0.5" style={{ backgroundColor: "var(--cova-surface, #0F1F3D)" }}>
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${progressPct}%`, backgroundColor: "var(--cova-gold, #C9A84C)" }}
        />
      </div>
      <p className="text-xs text-center mt-1" style={{ color: "var(--cova-muted, #8BA3C0)" }}>
        Pair {pairNumber} of {TOTAL_PAIRS}
      </p>

      <div className="flex-1 flex flex-col items-center px-4 pb-8">
        <h1
          className="font-serif text-2xl text-center mt-6"
          style={{
            color: "var(--cova-ivory, #F8F6F1)",
            fontFamily: "'EB Garamond', serif",
            marginBottom: pairNumber === 1 ? 4 : 32,
          }}
        >
          Which feels more like you?
        </h1>

        {pairNumber === 1 && (
          <p className="text-xs text-center mb-6" style={{ color: "var(--cova-muted, #8BA3C0)" }}>
            Just get started — no pressure
          </p>
        )}

        <div className="flex gap-3 w-full max-w-lg mx-auto">
          {isLoadingPair || !currentPair ? (
            <>
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="flex-1 rounded-2xl animate-pulse"
                  style={{ aspectRatio: "3/4", backgroundColor: "var(--cova-surface, #0F1F3D)" }}
                />
              ))}
            </>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={pairNumber}
                className="flex gap-3 w-full"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.3 }}
              >
                {(["A", "B"] as const).map((side) => {
                  const url = side === "A" ? currentPair.image_a_url : currentPair.image_b_url;
                  return (
                    <div
                      key={`${currentPair.id}-${side}`}
                      className="flex-1 relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-150"
                      style={{
                        aspectRatio: "3/4",
                        boxShadow:
                          chosenSide === side
                            ? "0 0 0 2px var(--cova-gold, #C9A84C)"
                            : "none",
                        transform: chosenSide === side ? "scale(1.02)" : "scale(1)",
                      }}
                      onClick={() => handlePairResponse(side)}
                      onMouseEnter={(e) => {
                        if (!chosenSide) {
                          e.currentTarget.style.boxShadow = "0 0 0 2px rgba(201,168,76,0.5)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (chosenSide !== side) {
                          e.currentTarget.style.boxShadow = "none";
                        }
                      }}
                    >
                      <Image
                        src={url}
                        alt="Interior design style option"
                        fill
                        className="object-cover"
                        sizes="(max-width: 512px) 45vw, 230px"
                      />
                    </div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        <button
          onClick={handleSkip}
          disabled={!!chosenSide}
          className="text-xs text-center mt-4 transition-colors duration-200 bg-transparent border-none cursor-pointer"
          style={{ color: "var(--cova-muted, #8BA3C0)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--cova-ivory, #F8F6F1)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--cova-muted, #8BA3C0)")}
        >
          Skip this one
        </button>
      </div>
    </div>
  );
}

// ── Phase C Component ─────────────────────────────────────────────────────────
//
// Phase C — Validation Render Experience.
// Generates 3 FLUX 1.1 Pro previews of the user's style (exact + warmer/layered
// + cooler/minimal), lets them pick the one that feels right, optionally tweak
// 4 sliders for fine adjustment, then confirms and saves to style_fingerprints.

interface RenderSlot {
  url: string | null;
  label: string;
  fingerprint: StyleFingerprint;
  error?: string;
}

interface PhaseCProps {
  initialFingerprint: StyleFingerprint;
  onBack: () => void;
}

function PhaseC({ initialFingerprint, onBack }: PhaseCProps) {
  const router = useRouter();
  const fingerprintStore = useFingerprintStore();
  const sessionStore = useSessionStore();

  const roomType = fingerprintStore.roomType ?? "bedroom";

  const [renders, setRenders] = useState<RenderSlot[] | null>(null);
  const [isLoadingRenders, setIsLoadingRenders] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [confirmedFingerprint, setConfirmedFingerprint] =
    useState<StyleFingerprint>(initialFingerprint);
  const [tweakOpen, setTweakOpen] = useState(false);
  const [isRetweaking, setIsRetweaking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const tweakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchValidationRenders = useCallback(
    async (fp: StyleFingerprint): Promise<RenderSlot[] | null> => {
      const res = await fetch("/api/quiz/validation-renders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint: fp, roomType }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { renders: RenderSlot[] };
      return data.renders ?? null;
    },
    [roomType]
  );

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void (async () => {
      setIsLoadingRenders(true);
      setLoadError(null);
      const slots = await fetchValidationRenders(initialFingerprint);
      if (!slots || slots.length === 0) {
        setLoadError("Couldn't generate previews. Tap to retry.");
      } else {
        setRenders(slots);
      }
      setIsLoadingRenders(false);
    })();
  }, [fetchValidationRenders, initialFingerprint]);

  function handleSelectCard(idx: number) {
    if (!renders || !renders[idx]) return;
    const slot = renders[idx];
    if (!slot.url) return;
    setSelectedIdx(idx);
    setConfirmedFingerprint(slot.fingerprint);
  }

  function handleTweakChange(
    dim: keyof StyleFingerprint["dimensions"],
    value: number
  ) {
    setConfirmedFingerprint((prev) => ({
      ...prev,
      dimensions: { ...prev.dimensions, [dim]: clamp(value, 0, 1) },
    }));
    if (tweakTimerRef.current) clearTimeout(tweakTimerRef.current);
    tweakTimerRef.current = setTimeout(() => {
      void runTweakRerender();
    }, 600);
  }

  async function runTweakRerender() {
    if (!renders) return;
    setIsRetweaking(true);
    try {
      const res = await fetch("/api/quiz/validation-renders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fingerprint: confirmedFingerprint,
          roomType,
        }),
      });
      if (!res.ok) throw new Error("retweak failed");
      const data = (await res.json()) as { renders: RenderSlot[] };
      const first = data.renders?.[0];
      if (first && first.url) {
        // Replace center card only. Keep warmer/cooler flanks intact.
        setRenders((prev) => {
          if (!prev) return prev;
          const next = [...prev];
          next[0] = { ...first, label: "Your tweaked style" };
          return next;
        });
        setSelectedIdx(0);
      }
    } catch {
      /* silent — tweak errors are non-fatal */
    } finally {
      setIsRetweaking(false);
    }
  }

  async function handleConfirm() {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/quiz/fingerprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase_a_selections: fingerprintStore.phaseASelections,
          phase_b_responses: fingerprintStore.phaseBResponses,
          room_type: roomType,
          budget_tier: fingerprintStore.budgetTier,
          phase_c_confirmation: true,
          confirmed_fingerprint: confirmedFingerprint,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      const data = (await res.json()) as {
        fingerprint: StyleFingerprint;
        style_name: string;
        style_tags: string[];
      };
      fingerprintStore.setFingerprint(
        data.fingerprint,
        data.style_name,
        data.style_tags
      );
      sessionStore.setStep(4);
      router.push("/design/step-4");
    } catch {
      setSubmitError("Something went wrong — tap to retry");
      setIsSubmitting(false);
    }
  }

  async function handleRetryLoad() {
    loadedRef.current = false;
    setRenders(null);
    setLoadError(null);
    setIsLoadingRenders(true);
    const slots = await fetchValidationRenders(initialFingerprint);
    if (!slots || slots.length === 0) {
      setLoadError("Couldn't generate previews. Tap to retry.");
    } else {
      setRenders(slots);
    }
    setIsLoadingRenders(false);
  }

  const TWEAK_SLIDERS: Array<{
    key: keyof StyleFingerprint["dimensions"];
    lowLabel: string;
    highLabel: string;
  }> = [
    { key: "colorTemperature", lowLabel: "Cooler", highLabel: "Warmer" },
    { key: "density", lowLabel: "Minimal", highLabel: "Layered" },
    { key: "lightPreference", lowLabel: "Calm", highLabel: "Dramatic" },
    { key: "material", lowLabel: "Manufactured", highLabel: "Natural" },
  ];

  return (
    <div
      className="min-h-screen flex flex-col items-center px-4 pt-8 pb-12"
      style={{ backgroundColor: "var(--cova-bg, #0A1628)" }}
    >
      <div className="w-full max-w-4xl mx-auto">
        <StepIndicator currentStep={3} totalSteps={9} />

        <h1
          className="font-serif text-3xl text-center mt-8 mb-2"
          style={{
            color: "var(--cova-ivory, #F8F6F1)",
            fontFamily: "'EB Garamond', serif",
          }}
        >
          Is this your style?
        </h1>
        <p
          className="text-sm text-center mb-8"
          style={{ color: "var(--cova-muted, #8BA3C0)" }}
        >
          Pick the one that feels right
        </p>

        {/* Loading state */}
        {isLoadingRenders && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <motion.div
              className="rounded-full"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.9, 1.1, 0.9] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              style={{
                width: 12,
                height: 12,
                backgroundColor: "var(--cova-gold, #C9A84C)",
              }}
            />
            <p
              className="text-sm"
              style={{ color: "var(--cova-ivory, #F8F6F1)" }}
            >
              Generating your style...
            </p>
          </div>
        )}

        {/* Error state */}
        {!isLoadingRenders && loadError && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p
              className="text-sm text-center"
              style={{ color: "var(--cova-error, #C0504A)" }}
            >
              {loadError}
            </p>
            <button
              onClick={handleRetryLoad}
              className="px-4 py-2 rounded-full text-sm"
              style={{
                backgroundColor: "var(--cova-surface, #0F1F3D)",
                color: "var(--cova-ivory, #F8F6F1)",
                border: "1px solid var(--cova-border, #1E3A5F)",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Render cards */}
        {!isLoadingRenders && !loadError && renders && (
          <>
            <div className="flex flex-col md:flex-row gap-4 mb-8">
              {renders.map((slot, idx) => {
                const isSel = selectedIdx === idx;
                const isBroken = !slot.url;
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: idx * 0.15 }}
                    onClick={() => !isBroken && handleSelectCard(idx)}
                    className="flex-1 rounded-xl overflow-hidden transition-all duration-200"
                    style={{
                      cursor: isBroken ? "not-allowed" : "pointer",
                      border: isSel
                        ? "2px solid var(--cova-gold, #C9A84C)"
                        : "2px solid transparent",
                      backgroundColor: "var(--cova-surface, #0F1F3D)",
                      opacity: isBroken ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSel && !isBroken)
                        e.currentTarget.style.border =
                          "2px solid rgba(201,168,76,0.5)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSel)
                        e.currentTarget.style.border = "2px solid transparent";
                    }}
                  >
                    <div
                      className="relative w-full"
                      style={{ aspectRatio: "1/1" }}
                    >
                      {slot.url ? (
                        <Image
                          src={slot.url}
                          alt={slot.label}
                          fill
                          className="object-cover"
                          loading="lazy"
                          sizes="(max-width: 768px) 100vw, 33vw"
                          unoptimized
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-xs"
                          style={{ color: "var(--cova-muted, #8BA3C0)" }}
                        >
                          Couldn&apos;t render
                        </div>
                      )}
                      {isSel && slot.url && (
                        <div
                          className="absolute top-2 right-2 flex items-center justify-center rounded-full"
                          style={{
                            width: 24,
                            height: 24,
                            backgroundColor: "var(--cova-gold, #C9A84C)",
                          }}
                        >
                          <Check
                            size={14}
                            style={{ color: "var(--cova-bg, #0A1628)" }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="px-3 py-2">
                      <p
                        className="text-xs text-center"
                        style={{ color: "var(--cova-ivory, #F8F6F1)" }}
                      >
                        {slot.label}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {submitError && (
              <p
                className="text-sm text-center mb-4"
                style={{ color: "var(--cova-error, #C0504A)" }}
              >
                {submitError}
              </p>
            )}

            <button
              onClick={handleConfirm}
              disabled={selectedIdx === null || isSubmitting}
              className="w-full max-w-sm mx-auto block py-4 rounded-xl text-base font-medium transition-all duration-200 mb-4"
              style={{
                backgroundColor:
                  selectedIdx === null || isSubmitting
                    ? "rgba(201,168,76,0.3)"
                    : "var(--cova-gold, #C9A84C)",
                color:
                  selectedIdx === null || isSubmitting
                    ? "rgba(201,168,76,0.5)"
                    : "var(--cova-bg, #0A1628)",
                cursor:
                  selectedIdx === null || isSubmitting
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {isSubmitting ? "Saving..." : "This is my style →"}
            </button>

            <div className="text-center mb-4">
              <button
                onClick={() => setTweakOpen((v) => !v)}
                className="text-xs bg-transparent border-none cursor-pointer transition-colors duration-200"
                style={{ color: "var(--cova-muted, #8BA3C0)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--cova-ivory, #F8F6F1)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--cova-muted, #8BA3C0)")
                }
              >
                {tweakOpen ? "Close tweaks" : "Tweak your style"}
              </button>
            </div>

            {tweakOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="max-w-md mx-auto rounded-xl p-4 mb-4"
                style={{
                  backgroundColor: "var(--cova-surface, #0F1F3D)",
                  border: "1px solid var(--cova-border, #1E3A5F)",
                }}
              >
                {TWEAK_SLIDERS.map((s) => {
                  const val = confirmedFingerprint.dimensions[s.key] ?? 0.5;
                  return (
                    <div key={s.key} className="mb-4 last:mb-0">
                      <div className="flex justify-between text-xs mb-1">
                        <span style={{ color: "var(--cova-muted, #8BA3C0)" }}>
                          {s.lowLabel}
                        </span>
                        <span style={{ color: "var(--cova-muted, #8BA3C0)" }}>
                          {s.highLabel}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={val}
                        onChange={(e) =>
                          handleTweakChange(s.key, parseFloat(e.target.value))
                        }
                        className="w-full"
                        style={{ accentColor: "var(--cova-gold, #C9A84C)" }}
                      />
                    </div>
                  );
                })}
                {isRetweaking && (
                  <p
                    className="text-xs text-center mt-2"
                    style={{ color: "var(--cova-muted, #8BA3C0)" }}
                  >
                    Re-rendering...
                  </p>
                )}
              </motion.div>
            )}

            <button
              onClick={onBack}
              className="w-full text-sm text-center bg-transparent border-none cursor-pointer transition-colors duration-200"
              style={{ color: "var(--cova-muted, #8BA3C0)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--cova-ivory, #F8F6F1)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--cova-muted, #8BA3C0)")
              }
            >
              ← Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Root Page ─────────────────────────────────────────────────────────────────

export default function StyleQuizPage() {
  const router = useRouter();
  const { roomType } = useFingerprintStore();

  const [phase, setPhase] = useState<QuizPhase>("A");
  const [warmStart, setWarmStart] = useState<StyleFingerprint | null>(null);

  useEffect(() => {
    if (!roomType) {
      router.push("/design/step-1");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePhaseAComplete(phaseADims: Array<Record<DimKey, number>>) {
    const ws = buildWarmStart(phaseADims);
    setWarmStart(ws);
    setPhase("transitioning");
    setTimeout(() => setPhase("B"), 1400);
  }

  function handlePhaseBComplete(finalFP: StyleFingerprint) {
    setWarmStart(finalFP);
    setPhase("C");
  }

  return (
    <AnimatePresence mode="wait">
      {phase === "A" && (
        <motion.div
          key="phase-a"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <PhaseA
            onComplete={handlePhaseAComplete}
            onBack={() => router.push("/design/step-2")}
          />
        </motion.div>
      )}

      {phase === "transitioning" && (
        <motion.div
          key="transition"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <TransitionScreen />
        </motion.div>
      )}

      {phase === "B" && warmStart && (
        <motion.div
          key="phase-b"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <PhaseB
            warmStart={warmStart}
            onComplete={handlePhaseBComplete}
          />
        </motion.div>
      )}

      {phase === "C" && warmStart && (
        <motion.div
          key="phase-c"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <PhaseC initialFingerprint={warmStart} onBack={() => setPhase("B")} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
