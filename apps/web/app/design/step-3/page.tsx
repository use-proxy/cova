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

interface CardData {
  id: string;
  imageUrl: string;
  alt: string;
  styleName: string;
  dimensionLabels: Record<DimKey, number>;
  pair_id?: string;
}

interface PairData {
  imageA: CardData;
  imageB: CardData;
}

const DIM_KEYS: DimKey[] = [
  "colorTemperature", "colorSaturation", "density", "formality",
  "era", "material", "texture", "pattern",
  "lineQuality", "lightPreference", "nature", "culturalInfluence",
];

const DIM_COUNT = DIM_KEYS.length; // 12
const NEUTRAL_MIDPOINT = 0.5;

const TOTAL_PAIRS = 12;

type BudgetTier = "budget" | "mid" | "premium" | "luxury";

const BUDGET_LABELS: Record<BudgetTier, string> = {
  budget: "Under $500",
  mid: "$500–$2,000",
  premium: "$2,000–$5,000",
  luxury: "$5,000+",
};

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

interface PhaseAProps {
  roomType: string;
  onComplete: (phaseADims: Array<Record<DimKey, number>>) => void;
  onBack: () => void;
}

function PhaseA({ roomType, onComplete, onBack }: PhaseAProps) {
  const { addPhaseASelection } = useFingerprintStore();
  const [currentRound, setCurrentRound] = useState<1 | 2 | 3>(1);
  const [roundImages, setRoundImages] = useState<CardData[]>([]);
  const [selections, setSelections] = useState<CardData[]>([]);
  const [shownIds, setShownIds] = useState<string[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(true);
  const [accumulatedDims, setAccumulatedDims] = useState<Array<Record<DimKey, number>>>([]);
  const loadedRef = useRef(false);

  const loadCards = useCallback(async (round: number, shown: string[]) => {
    setIsLoadingImages(true);
    try {
      const res = await fetch("/api/quiz/next-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round, room_type: roomType, shown_ids: shown }),
      });
      if (!res.ok) throw new Error("Failed to load cards");
      const data = await res.json() as { cards: CardData[] };
      setRoundImages(data.cards ?? []);
      setShownIds((prev) => [...prev, ...(data.cards ?? []).map((c) => c.id)]);
    } catch {
      setRoundImages([]);
    } finally {
      setIsLoadingImages(false);
    }
  }, [roomType]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void loadCards(1, []);
  }, [loadCards]);

  function toggleCard(card: CardData) {
    setSelections((prev) => {
      const exists = prev.find((c) => c.id === card.id);
      if (exists) return prev.filter((c) => c.id !== card.id);
      if (prev.length >= 3) return [...prev.slice(1), card];
      return [...prev, card];
    });
  }

  const headings: Record<number, string> = {
    1: "Which rooms speak to you?",
    2: "Pick the spaces that feel right",
    3: "Almost there",
  };

  function handleNext() {
    const newDims = selections.map((c) => c.dimensionLabels);
    const allDims = [...accumulatedDims, ...newDims];

    for (const card of selections) {
      addPhaseASelection(card.id);
    }

    setAccumulatedDims(allDims);
    setSelections([]);

    if (currentRound < 3) {
      const nextRound = (currentRound + 1) as 1 | 2 | 3;
      setCurrentRound(nextRound);
      void loadCards(nextRound, shownIds);
    } else {
      onComplete(allDims);
    }
  }

  const isDisabled = selections.length < 2;

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
          {headings[currentRound]}
        </h1>
        <p className="text-sm text-center mb-5" style={{ color: "var(--cova-muted, #8BA3C0)" }}>
          Choose 2 or 3 that resonate
        </p>

        {/* Round progress dots */}
        <div className="flex gap-2 justify-center mb-6">
          {[1, 2, 3].map((r) => (
            <div
              key={r}
              className="rounded-full"
              style={{
                width: r === currentRound ? 10 : 8,
                height: r === currentRound ? 10 : 8,
                backgroundColor: r <= currentRound ? "var(--cova-gold, #C9A84C)" : "transparent",
                border: r > currentRound ? "1px solid var(--cova-border, #1E3A5F)" : "none",
                transition: "all 200ms ease-out",
              }}
            />
          ))}
        </div>

        {/* Image grid */}
        <div className="grid grid-cols-3 gap-2 w-full max-w-md mx-auto">
          {isLoadingImages
            ? Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-xl"
                  style={{ aspectRatio: "1/1", backgroundColor: "var(--cova-surface, #0F1F3D)" }}
                />
              ))
            : roundImages.map((card, idx) => {
                const isSelected = selections.some((c) => c.id === card.id);
                return (
                  <motion.div
                    key={card.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.25, delay: idx * 0.035 }}
                    onClick={() => toggleCard(card)}
                    className="relative cursor-pointer rounded-xl overflow-hidden"
                    style={{
                      aspectRatio: "1/1",
                      boxShadow: isSelected
                        ? "0 0 0 2px var(--cova-gold, #C9A84C), 0 0 0 3px var(--cova-bg, #0A1628)"
                        : "none",
                    }}
                  >
                    <Image
                      src={card.imageUrl}
                      alt={card.alt}
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

        <p className="text-xs text-center mt-3" style={{ color: "var(--cova-muted, #8BA3C0)" }}>
          {selections.length} selected
        </p>

        <button
          onClick={handleNext}
          disabled={isDisabled}
          className="w-full max-w-md mt-4 py-3 rounded-xl font-medium transition-all duration-200"
          style={{
            backgroundColor: isDisabled ? "rgba(201,168,76,0.3)" : "var(--cova-gold, #C9A84C)",
            color: isDisabled ? "rgba(201,168,76,0.5)" : "var(--cova-bg, #0A1628)",
            cursor: isDisabled ? "not-allowed" : "pointer",
          }}
        >
          {isDisabled
            ? "Select at least 2 to continue"
            : currentRound < 3
            ? "Next Round →"
            : "Continue →"}
        </button>
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

interface PhaseBProps {
  roomType: string;
  warmStart: StyleFingerprint;
  onComplete: (finalFP: StyleFingerprint) => void;
}

function PhaseB({ roomType, warmStart, onComplete }: PhaseBProps) {
  const { addPhaseBResponse } = useFingerprintStore();
  const [pairNumber, setPairNumber] = useState(1);
  const [currentPair, setCurrentPair] = useState<PairData | null>(null);
  const [answeredPairs, setAnsweredPairs] = useState<string[]>([]);
  const [localFingerprint, setLocalFingerprint] = useState<StyleFingerprint>(warmStart);
  const [pairShownAt, setPairShownAt] = useState(Date.now());
  const [isLoadingPair, setIsLoadingPair] = useState(true);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const loadNextPair = useCallback(
    async (fp: StyleFingerprint, answered: string[]) => {
      setIsLoadingPair(true);
      try {
        const res = await fetch("/api/quiz/next-pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fingerprint: fp, answered_pairs: answered, room_type: roomType }),
        });
        if (!res.ok) throw new Error("No pairs");
        const data = await res.json() as { pair: PairData };
        setCurrentPair(data.pair);
        setPairShownAt(Date.now());
      } catch {
        setCurrentPair(null);
      } finally {
        setIsLoadingPair(false);
      }
    },
    [roomType]
  );

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void loadNextPair(warmStart, []);
  }, [loadNextPair, warmStart]);

  function handlePairResponse(chosenCard: CardData) {
    if (!currentPair || chosenId) return;
    const responseTimeMs = Date.now() - pairShownAt;
    const rejectedCard =
      chosenCard.id === currentPair.imageA.id ? currentPair.imageB : currentPair.imageA;

    const lambda = Math.min(3, 1 + 500 / Math.max(responseTimeMs, 100));
    const newDims = { ...localFingerprint.dimensions } as Record<DimKey, number>;
    const newCov = localFingerprint.covariance.map((row) => [...row]);

    DIM_KEYS.forEach((dim, i) => {
      const delta =
        ((chosenCard.dimensionLabels[dim] ?? NEUTRAL_MIDPOINT) - (rejectedCard.dimensionLabels[dim] ?? NEUTRAL_MIDPOINT)) *
        0.15 * lambda;
      newDims[dim] = clamp((newDims[dim] ?? NEUTRAL_MIDPOINT) + delta, 0, 1);
      newCov[i]![i] = (newCov[i]![i] ?? 0.5) * 0.85;
    });

    const diagSum = newCov.reduce((s, row, i) => s + (row[i] ?? 0), 0);
    const confidence = Math.min(1, Math.max(0, 1 - (diagSum / DIM_COUNT) / 0.5));

    const updatedFP: StyleFingerprint = {
      dimensions: newDims as StyleFingerprint["dimensions"],
      covariance: newCov,
      confidence,
    };
    setLocalFingerprint(updatedFP);

    addPhaseBResponse({
      pairId: currentPair.imageA.id + "_" + currentPair.imageB.id,
      chosenId: chosenCard.id,
      responseTimeMs,
    });

    const newAnswered = [
      ...answeredPairs,
      currentPair.imageA.pair_id ?? currentPair.imageA.id,
    ];
    setAnsweredPairs(newAnswered);
    setChosenId(chosenCard.id);

    setTimeout(() => {
      setChosenId(null);
      if (pairNumber >= TOTAL_PAIRS) {
        onComplete(updatedFP);
      } else {
        setPairNumber((p) => p + 1);
        void loadNextPair(updatedFP, newAnswered);
      }
    }, 650);
  }

  function handleSkip() {
    if (!currentPair || chosenId) return;
    const newAnswered = [...answeredPairs, currentPair.imageA.pair_id ?? currentPair.imageA.id];
    setAnsweredPairs(newAnswered);
    if (pairNumber >= TOTAL_PAIRS) {
      onComplete(localFingerprint);
    } else {
      setPairNumber((p) => p + 1);
      void loadNextPair(localFingerprint, newAnswered);
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
                {([currentPair.imageA, currentPair.imageB] as CardData[]).map((card) => (
                  <div
                    key={card.id}
                    className="flex-1 relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-150"
                    style={{
                      aspectRatio: "3/4",
                      boxShadow:
                        chosenId === card.id
                          ? "0 0 0 2px var(--cova-gold, #C9A84C)"
                          : "none",
                      transform: chosenId === card.id ? "scale(1.02)" : "scale(1)",
                    }}
                    onClick={() => handlePairResponse(card)}
                    onMouseEnter={(e) => {
                      if (!chosenId) {
                        e.currentTarget.style.boxShadow = "0 0 0 2px rgba(201,168,76,0.5)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (chosenId !== card.id) {
                        e.currentTarget.style.boxShadow = "none";
                      }
                    }}
                  >
                    <Image
                      src={card.imageUrl}
                      alt={card.alt}
                      fill
                      className="object-cover"
                      sizes="(max-width: 512px) 45vw, 230px"
                    />
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        <button
          onClick={handleSkip}
          disabled={!!chosenId}
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

function PhaseC({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const fingerprintStore = useFingerprintStore();
  const sessionStore = useSessionStore();

  const [householdComposition, setHouseholdComposition] = useState("");
  const [localBudgetTier, setLocalBudgetTier] = useState<BudgetTier>(
    (fingerprintStore.budgetTier as BudgetTier | null) ?? "mid"
  );
  const [freeText, setFreeText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleFinishQuiz() {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/quiz/fingerprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase_a_selections: fingerprintStore.phaseASelections,
          phase_b_responses: fingerprintStore.phaseBResponses,
          room_type: fingerprintStore.roomType ?? "bedroom",
          household_composition: householdComposition,
          free_text: freeText || undefined,
        }),
      });

      if (!res.ok) throw new Error("Request failed");

      const data = await res.json() as {
        fingerprint: StyleFingerprint;
        style_name: string;
        style_tags: string[];
      };

      fingerprintStore.setFingerprint(data.fingerprint, data.style_name, data.style_tags);

      if (localBudgetTier !== fingerprintStore.budgetTier) {
        const ranges: Record<BudgetTier, [number, number]> = {
          budget: [200, 500],
          mid: [500, 2000],
          premium: [2000, 5000],
          luxury: [5000, 25000],
        };
        fingerprintStore.setBudget(localBudgetTier, ranges[localBudgetTier]);
      }

      sessionStore.setStep(4);
      router.push("/design/step-4");
    } catch {
      setSubmitError("Something went wrong — tap to retry");
      setIsSubmitting(false);
    }
  }

  const HOUSEHOLD_OPTIONS = ["Solo", "Couple", "Family", "Roommates"];
  const BUDGET_TIERS: BudgetTier[] = ["budget", "mid", "premium", "luxury"];

  return (
    <div
      className="min-h-screen flex flex-col items-center px-6 pt-8"
      style={{ backgroundColor: "var(--cova-bg, #0A1628)" }}
    >
      <div className="w-full max-w-sm mx-auto">
        <StepIndicator currentStep={3} totalSteps={9} />

        <h1
          className="font-serif text-3xl text-center mt-10 mb-1"
          style={{ color: "var(--cova-ivory, #F8F6F1)", fontFamily: "'EB Garamond', serif" }}
        >
          Almost done
        </h1>
        <p className="text-sm text-center mb-10" style={{ color: "var(--cova-muted, #8BA3C0)" }}>
          Three quick questions
        </p>

        <p className="text-sm mb-3" style={{ color: "var(--cova-ivory, #F8F6F1)" }}>
          Who uses this space?
        </p>
        <div className="flex flex-wrap gap-2 mb-8">
          {HOUSEHOLD_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => setHouseholdComposition(opt)}
              className="px-4 py-2 rounded-full text-sm transition-all duration-200"
              style={{
                backgroundColor:
                  householdComposition === opt
                    ? "var(--cova-gold, #C9A84C)"
                    : "var(--cova-surface, #0F1F3D)",
                color:
                  householdComposition === opt
                    ? "var(--cova-bg, #0A1628)"
                    : "var(--cova-ivory, #F8F6F1)",
                border: householdComposition === opt
                  ? "none"
                  : "1px solid var(--cova-border, #1E3A5F)",
                fontWeight: householdComposition === opt ? 500 : 400,
              }}
            >
              {opt}
            </button>
          ))}
        </div>

        <p className="text-sm mb-3" style={{ color: "var(--cova-ivory, #F8F6F1)" }}>
          Confirm your budget
        </p>
        <div className="flex flex-wrap gap-2 mb-8">
          {BUDGET_TIERS.map((tier) => (
            <button
              key={tier}
              onClick={() => setLocalBudgetTier(tier)}
              className="px-4 py-2 rounded-full text-sm transition-all duration-200"
              style={{
                backgroundColor:
                  localBudgetTier === tier
                    ? "var(--cova-gold, #C9A84C)"
                    : "var(--cova-surface, #0F1F3D)",
                color:
                  localBudgetTier === tier
                    ? "var(--cova-bg, #0A1628)"
                    : "var(--cova-ivory, #F8F6F1)",
                border: localBudgetTier === tier
                  ? "none"
                  : "1px solid var(--cova-border, #1E3A5F)",
                fontWeight: localBudgetTier === tier ? 500 : 400,
              }}
            >
              {BUDGET_LABELS[tier]}
            </button>
          ))}
        </div>

        <p className="text-sm mb-3" style={{ color: "var(--cova-ivory, #F8F6F1)" }}>
          Anything we should know?{" "}
          <span style={{ color: "var(--cova-muted, #8BA3C0)" }}>(optional)</span>
        </p>
        <textarea
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder="e.g. I rent, I have a dog, limited natural light"
          rows={3}
          className="w-full rounded-lg px-4 py-3 text-sm resize-none outline-none transition-all duration-200 mb-8"
          style={{
            backgroundColor: "var(--cova-surface, #0F1F3D)",
            color: "var(--cova-ivory, #F8F6F1)",
            border: "1px solid var(--cova-border, #1E3A5F)",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--cova-gold, #C9A84C)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--cova-border, #1E3A5F)")}
        />

        <div className="h-px mb-8" style={{ backgroundColor: "var(--cova-border, #1E3A5F)" }} />

        {submitError && (
          <p className="text-sm text-center mb-4" style={{ color: "var(--cova-error, #C0504A)" }}>
            {submitError}
          </p>
        )}

        <button
          onClick={handleFinishQuiz}
          disabled={!householdComposition || isSubmitting}
          className="w-full py-4 rounded-xl text-base font-medium transition-all duration-200 mb-4"
          style={{
            backgroundColor:
              !householdComposition || isSubmitting
                ? "rgba(201,168,76,0.3)"
                : "var(--cova-gold, #C9A84C)",
            color:
              !householdComposition || isSubmitting
                ? "rgba(201,168,76,0.5)"
                : "var(--cova-bg, #0A1628)",
            cursor: !householdComposition || isSubmitting ? "not-allowed" : "pointer",
          }}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <span
                className="w-4 h-4 rounded-full animate-spin inline-block"
                style={{
                  border: "2px solid rgba(201,168,76,0.5)",
                  borderTopColor: "rgba(201,168,76,0.8)",
                }}
              />
              Building your profile...
            </span>
          ) : (
            "See My Style →"
          )}
        </button>

        <button
          onClick={onBack}
          className="w-full text-sm text-center bg-transparent border-none cursor-pointer transition-colors duration-200"
          style={{ color: "var(--cova-muted, #8BA3C0)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--cova-ivory, #F8F6F1)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--cova-muted, #8BA3C0)")}
        >
          ← Back
        </button>
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

  const roomTypeNorm = roomType ?? "bedroom";

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
            roomType={roomTypeNorm}
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
            roomType={roomTypeNorm}
            warmStart={warmStart}
            onComplete={handlePhaseBComplete}
          />
        </motion.div>
      )}

      {phase === "C" && (
        <motion.div
          key="phase-c"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <PhaseC onBack={() => setPhase("B")} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
