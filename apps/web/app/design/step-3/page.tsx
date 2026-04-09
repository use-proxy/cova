"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useFingerprintStore, useSessionStore } from "@/lib/store";
import type { StyleFingerprint } from "@/types/fingerprint";

// ── Types ─────────────────────────────────────────────────────────────────────

type DimKey =
  | "colorTemperature" | "colorSaturation" | "density" | "formality"
  | "era" | "material" | "texture" | "pattern"
  | "lineQuality" | "lightPreference" | "nature" | "culturalInfluence";

// Response shape from /api/quiz/next-pair
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

// Build a warm-start fingerprint from anchor selection dimensions.
// Called when no phaseA dims are provided (entry from new step-2 flow).
function buildNeutralFingerprint(): StyleFingerprint {
  return {
    dimensions: makeNeutralDims() as StyleFingerprint["dimensions"],
    covariance: makeIdentityCov(0.5),
    confidence: 0.3,
  };
}

// ── Phase B Component (Pairwise Quiz) ─────────────────────────────────────────
//
// Full-viewport two-image layout matching SITE.md PAGE 4.
// All quiz logic preserved from original implementation.

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
  const [flashSide, setFlashSide] = useState<"A" | "B" | null>(null);
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

  // Keyboard support: A/ArrowLeft = left choice, D/ArrowRight = right choice
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (chosenSide) return;
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        handlePairResponse('A');
      } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        handlePairResponse('B');
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenSide, currentPair]);

  function handlePairResponse(side: "A" | "B") {
    if (!currentPair || chosenSide) return;
    const responseTimeMs = Date.now() - pairShownAt;

    const chosenVec = side === "A" ? currentPair.image_a_vector : currentPair.image_b_vector;
    const rejectedVec = side === "A" ? currentPair.image_b_vector : currentPair.image_a_vector;

    // Local fingerprint update
    const lambda = Math.min(3, 1 + 500 / Math.max(responseTimeMs, 100));
    const newDims = { ...localFingerprint.dimensions } as Record<DimKey, number>;

    DIM_KEYS.forEach((dim) => {
      const delta =
        ((chosenVec[dim] ?? NEUTRAL_MIDPOINT) - (rejectedVec[dim] ?? NEUTRAL_MIDPOINT)) *
        0.15 *
        lambda;
      newDims[dim] = clamp((newDims[dim] ?? NEUTRAL_MIDPOINT) + delta, 0, 1);
    });

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

    // Flash gold overlay
    setFlashSide(side);
    setTimeout(() => setFlashSide(null), 300);

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

  const progressPct = ((pairNumber - 1) / TOTAL_PAIRS) * 100;

  return (
    <div className="min-h-screen bg-[#091829] relative overflow-hidden">
      {/* Gold progress bar */}
      <div className="fixed top-0 left-0 right-0 h-[3px] bg-[rgba(201,168,76,0.15)] z-[60]">
        <motion.div
          className="h-full bg-cova-gold"
          animate={{ width: `${progressPct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>

      {/* Top bar */}
      <div
        className="fixed top-[3px] left-0 right-0 h-[53px] flex items-center justify-between px-6 border-b border-[rgba(201,168,76,0.1)] z-50"
        style={{
          background: 'rgba(9,24,41,0.8)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <span className="font-playfair italic text-xl text-cova-gold tracking-[0.05em]">
          Cova
        </span>
        {/* Round counter */}
        <span className="font-dm-sans text-[13px] text-cova-muted">
          {pairNumber} of {TOTAL_PAIRS}
        </span>
      </div>

      {/* Loading skeleton */}
      {(isLoadingPair || !currentPair) && (
        <div className="absolute inset-0 flex">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex-1 bg-[rgba(201,168,76,0.08)]"
            />
          ))}
        </div>
      )}

      {/* Two-image full-viewport layout */}
      {!isLoadingPair && currentPair && (
        <AnimatePresence mode="wait">
          <motion.div
            key={pairNumber}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0"
          >
            {/* Left image — A */}
            <div
              onClick={() => handlePairResponse('A')}
              className="absolute left-0 top-0 w-1/2 h-screen overflow-hidden"
              style={{ cursor: chosenSide ? 'default' : 'pointer' }}
            >
              <Image
                src={currentPair.image_a_url}
                alt="Option A"
                fill
                style={{ objectFit: 'cover' }}
                sizes="50vw"
                priority
              />
              {/* A label */}
              <div
                className="absolute top-[72px] left-4 bg-[rgba(255,255,255,0.07)] border border-[rgba(201,168,76,0.15)] rounded-full font-dm-sans text-[12px] text-cova-ivory"
                style={{ padding: '4px 12px' }}
              >
                A
              </div>
              {/* Gold flash overlay */}
              <AnimatePresence>
                {flashSide === 'A' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.3 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="absolute inset-0 bg-[rgba(201,168,76,0.3)] pointer-events-none"
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Right image — B */}
            <div
              onClick={() => handlePairResponse('B')}
              className="absolute right-0 top-0 w-1/2 h-screen overflow-hidden"
              style={{ cursor: chosenSide ? 'default' : 'pointer' }}
            >
              <Image
                src={currentPair.image_b_url}
                alt="Option B"
                fill
                style={{ objectFit: 'cover' }}
                sizes="50vw"
                priority
              />
              {/* B label */}
              <div
                className="absolute top-[72px] right-4 bg-[rgba(255,255,255,0.07)] border border-[rgba(201,168,76,0.15)] rounded-full font-dm-sans text-[12px] text-cova-ivory"
                style={{ padding: '4px 12px' }}
              >
                B
              </div>
              {/* Gold flash overlay */}
              <AnimatePresence>
                {flashSide === 'B' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.3 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="absolute inset-0 bg-[rgba(201,168,76,0.3)] pointer-events-none"
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Center divider */}
            <div
              className="absolute top-0 bottom-0 w-px bg-[rgba(201,168,76,0.3)] z-10 pointer-events-none"
              style={{ left: '50%', transform: 'translateX(-50%)' }}
            />
            {/* OR pill at center */}
            <div
              className="absolute bg-cova-gold text-[#091829] rounded-full font-dm-sans font-semibold text-[12px] z-[11] pointer-events-none"
              style={{
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                padding: '6px 12px',
              }}
            >
              OR
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

// ── Phase C Component ─────────────────────────────────────────────────────────
//
// Phase C — Validation Render Experience.
// Generates 3 FLUX 1.1 Pro previews, lets user pick, optionally tweak, then saves.

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
    <div className="min-h-screen bg-[#091829] font-dm-sans">
      {/* Top bar */}
      <div
        className="sticky top-0 z-50 h-14 flex items-center justify-between px-6 border-b border-[rgba(201,168,76,0.1)]"
        style={{
          background: 'rgba(9,24,41,0.8)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <span className="font-playfair italic text-xl text-cova-gold tracking-[0.05em]">
          Cova
        </span>
        <span className="font-dm-sans text-[13px] text-cova-muted">
          Step 3 of 7
        </span>
      </div>

      <div className="max-w-[900px] mx-auto px-6 pt-12 pb-20">
        <h1 className="font-playfair text-4xl font-normal text-cova-ivory text-center mb-2">
          Is this your style?
        </h1>
        <p className="font-dm-sans text-base text-cova-muted text-center mb-10">
          Pick the one that feels right
        </p>

        {/* Loading state */}
        {isLoadingRenders && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <motion.div
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.9, 1.1, 0.9] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              className="w-3 h-3 rounded-full bg-cova-gold"
            />
            <p className="font-dm-sans text-sm text-cova-ivory">
              Generating your style...
            </p>
          </div>
        )}

        {/* Error state */}
        {!isLoadingRenders && loadError && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className="font-dm-sans text-sm text-center" style={{ color: '#E87070' }}>
              {loadError}
            </p>
            <button
              onClick={handleRetryLoad}
              className="rounded-lg bg-[rgba(255,255,255,0.04)] border border-[rgba(201,168,76,0.15)] text-cova-ivory font-dm-sans text-sm cursor-pointer"
              style={{ padding: '8px 20px' }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Render cards */}
        {!isLoadingRenders && !loadError && renders && (
          <>
            <div className="flex flex-row gap-4 mb-8 flex-wrap">
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
                    className="flex-1 min-w-[200px] rounded-xl overflow-hidden bg-[rgba(255,255,255,0.04)] transition-all duration-200 ease-out"
                    style={{
                      cursor: isBroken ? 'not-allowed' : 'pointer',
                      border: isSel
                        ? '2px solid #C9A84C'
                        : '2px solid rgba(201,168,76,0.15)',
                      opacity: isBroken ? 0.5 : 1,
                    }}
                  >
                    <div className="relative aspect-square">
                      {slot.url ? (
                        <Image
                          src={slot.url}
                          alt={slot.label}
                          fill
                          style={{ objectFit: 'cover' }}
                          sizes="(max-width: 900px) 100vw, 300px"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-dm-sans text-[12px] text-cova-muted">
                          Couldn&apos;t render
                        </div>
                      )}
                    </div>
                    <div className="p-2 px-3">
                      <p className="font-dm-sans text-[12px] text-cova-ivory text-center">
                        {slot.label}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {submitError && (
              <p
                className="font-dm-sans text-sm text-center mb-4"
                style={{ color: '#E87070' }}
              >
                {submitError}
              </p>
            )}

            <div className="max-w-[400px] mx-auto">
              <button
                onClick={handleConfirm}
                disabled={selectedIdx === null || isSubmitting}
                className="w-full font-dm-sans font-semibold text-[15px] rounded-lg border-none mb-4 transition-all duration-200 ease-out"
                style={{
                  padding: '14px 0',
                  background:
                    selectedIdx === null || isSubmitting
                      ? 'rgba(201,168,76,0.3)'
                      : '#C9A84C',
                  color:
                    selectedIdx === null || isSubmitting
                      ? 'rgba(201,168,76,0.5)'
                      : '#091829',
                  cursor:
                    selectedIdx === null || isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? "Saving..." : "This is my style →"}
              </button>

              <div className="text-center mb-4">
                <button
                  onClick={() => setTweakOpen((v) => !v)}
                  className="font-dm-sans text-[13px] text-cova-muted bg-transparent border-none cursor-pointer"
                >
                  {tweakOpen ? "Close tweaks" : "Tweak your style"}
                </button>
              </div>

              {tweakOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-[rgba(255,255,255,0.04)] border border-[rgba(201,168,76,0.15)] rounded-xl p-4 mb-4"
                >
                  {TWEAK_SLIDERS.map((s) => {
                    const val = confirmedFingerprint.dimensions[s.key] ?? 0.5;
                    return (
                      <div key={s.key} className="mb-4">
                        <div className="flex justify-between mb-1">
                          <span className="font-dm-sans text-[12px] text-cova-muted">
                            {s.lowLabel}
                          </span>
                          <span className="font-dm-sans text-[12px] text-cova-muted">
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
                          style={{ accentColor: '#C9A84C' }}
                        />
                      </div>
                    );
                  })}
                  {isRetweaking && (
                    <p className="font-dm-sans text-[12px] text-cova-muted text-center mt-2">
                      Re-rendering...
                    </p>
                  )}
                </motion.div>
              )}

              <button
                onClick={onBack}
                className="w-full font-dm-sans text-sm text-cova-muted bg-transparent border-none cursor-pointer text-center py-2"
              >
                ← Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Root Page ─────────────────────────────────────────────────────────────────
//
// Phase A (anchor selection) has moved to step-2.
// This page starts directly at Phase B (pairwise comparison).

type QuizPhase = "B" | "C";

export default function StyleQuizPage() {
  const router = useRouter();
  const { roomType } = useFingerprintStore();

  const [phase, setPhase] = useState<QuizPhase>("B");
  const [warmStart] = useState<StyleFingerprint>(() => buildNeutralFingerprint());
  const [phaseBResult, setPhaseBResult] = useState<StyleFingerprint | null>(null);

  useEffect(() => {
    if (!roomType) {
      router.push("/design/step-1");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePhaseBComplete(finalFP: StyleFingerprint) {
    setPhaseBResult(finalFP);
    setPhase("C");
  }

  return (
    <AnimatePresence mode="wait">
      {phase === "B" && (
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

      {phase === "C" && phaseBResult && (
        <motion.div
          key="phase-c"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <PhaseC
            initialFingerprint={phaseBResult}
            onBack={() => setPhase("B")}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
