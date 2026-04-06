"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QUIZ_PAIRS } from "@/lib/ai/quiz-data";
import { useFingerprintStore, useSessionStore } from "@/lib/store";
import { StepIndicator } from "@/components/cova/StepIndicator";

const TOTAL_PAIRS = 19;

type Response = {
  pairId: string;
  chosen: "A" | "B";
  superLiked: boolean;
};

export default function StyleQuizPage() {
  const router = useRouter();
  const { roomType, budgetTier, setFingerprint, setShowcasePredictionIds } = useFingerprintStore();
  const { setStep } = useSessionStore();
  const pairs = QUIZ_PAIRS[roomType ?? "living-room"] ?? QUIZ_PAIRS["living-room"]!;

  const [currentPair, setCurrentPair] = useState(0);
  const [responses, setResponses] = useState<Response[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [lastHovered, setLastHovered] = useState<"left" | "right" | null>(null);
  const [selectedCard, setSelectedCard] = useState<"left" | "right" | null>(null);
  const [exitPhase, setExitPhase] = useState(false);
  const [enterPhase, setEnterPhase] = useState(true);
  const [showCheckmark, setShowCheckmark] = useState(false);

  const pointerStartX = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Progress width — genuine 0–100% through the quiz
  const progressWidth = (((currentPair + 1) / TOTAL_PAIRS) * 100).toFixed(1);

  // Call fingerprint API then navigate to step-3
  const completeQuiz = useCallback(
    async (finalResponses: Response[]) => {
      try {
        const apiResponses = finalResponses.map((r) => ({
          pair_id: r.pairId,
          chosen: r.chosen,
          super_liked: r.superLiked,
        }));
        const res = await fetch("/api/quiz/fingerprint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            responses: apiResponses,
            entry_path: "pairs",
            room_type: roomType ?? "living-room",
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            fingerprint: number[];
            style_name: string;
            style_chips?: string[];
          };
          setFingerprint(data.fingerprint, data.style_name);

          // Fire showcase renders non-blocking — stored in Zustand (Rule 1: no sessionStorage)
          const SHOWCASE_INPUTS = [
            { photo_url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1024', label: 'Living Room' },
            { photo_url: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1024', label: 'Bedroom' },
            { photo_url: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1024', label: 'Home Office' },
          ]
          void Promise.all(
            SHOWCASE_INPUTS.map(async (input) => {
              try {
                const renderRes = await fetch('/api/render', {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    photo_url: input.photo_url,
                    fingerprint_vector: data.fingerprint,
                    room_type: roomType ?? 'living_room',
                    budget: budgetTier ?? 'mid',
                    inclusions: [],
                    constraints: [],
                    showcase_mode: true,
                    style_name: data.style_name,
                  }),
                })
                if (renderRes.ok) {
                  const renderData = await renderRes.json() as { prediction_id: string }
                  return { predictionId: renderData.prediction_id, label: input.label }
                }
              } catch {
                // Non-blocking fallback — step-3 will use anchor_renders
              }
              return null
            })
          ).then((results) => {
            const valid = results.filter((r): r is { predictionId: string; label: string } => r !== null)
            if (valid.length > 0) {
              setShowcasePredictionIds(valid)
            }
          })
        }
      } catch {
        // Non-blocking — store will use defaults on step-3
      } finally {
        setStep(3);
        router.push("/design/step-3");
      }
    },
    [roomType, budgetTier, setFingerprint, setShowcasePredictionIds, setStep, router]
  );

  const handleSelection = useCallback(
    (side: "left" | "right") => {
      if (isAnimating) return;
      setIsAnimating(true);
      setSelectedCard(side);

      // Show checkmark at 150ms
      setTimeout(() => setShowCheckmark(true), 150);

      // Exit animation at 600ms
      setTimeout(() => setExitPhase(true), 600);

      // Next pair at 1000ms
      setTimeout(() => {
        const activePair = pairs[currentPair];
        const newResponse: Response = {
          pairId: activePair?.id ?? `pair-${String(currentPair + 1).padStart(2, "0")}`,
          chosen: side === "left" ? "A" : "B",
          superLiked: false,
        };
        const updatedResponses = [...responses, newResponse];
        setResponses(updatedResponses);

        if (currentPair === TOTAL_PAIRS - 1) {
          void completeQuiz(updatedResponses);
        } else {
          setSelectedCard(null);
          setExitPhase(false);
          setShowCheckmark(false);
          setEnterPhase(true);
          setCurrentPair((prev) => prev + 1);

          setTimeout(() => {
            setEnterPhase(false);
            setIsAnimating(false);
          }, 460);
        }
      }, 1000);
    },
    [isAnimating, currentPair, responses, completeQuiz, pairs]
  );

  const handleBack = useCallback(() => {
    if (currentPair > 0 && !isAnimating) {
      setCurrentPair((prev) => prev - 1);
      setResponses((prev) => prev.slice(0, -1));
    }
  }, [currentPair, isAnimating]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isAnimating) return;
    pointerStartX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isAnimating) return;
    const deltaX = e.clientX - pointerStartX.current;
    if (Math.abs(deltaX) > 40) {
      handleSelection(deltaX > 0 ? "left" : "right");
    }
  };

  // Enter animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setEnterPhase(false), 460);
    return () => clearTimeout(timer);
  }, []);

  const activePair = pairs[currentPair];
  const imgUrlA = activePair?.imageA?.url ?? "";
  const imgUrlB = activePair?.imageB?.url ?? "";
  const isWarmup = activePair?.isWarmup ?? (currentPair === 0);

  const getCardStyle = (side: "left" | "right") => {
    const isSelected = selectedCard === side;
    const isRejected = selectedCard && selectedCard !== side;

    let transform = "translateX(0) translateY(0)";
    let opacity = 1;

    if (enterPhase) {
      transform = "translateX(105%)";
      opacity = 0;
    }

    if (exitPhase) {
      if (isSelected) {
        transform = "translateX(105%)";
        opacity = 0;
      } else if (isRejected) {
        transform = "translateX(-105%)";
        opacity = 0;
      }
    } else if (isRejected && !exitPhase) {
      opacity = 0.35;
    }

    return { transform, opacity };
  };

  const getCardTransition = (side: "left" | "right") => {
    if (enterPhase) {
      const delay = side === "left" ? "0ms" : "60ms";
      return `all 400ms cubic-bezier(0.34,1.56,0.64,1) ${delay}`;
    }
    if (exitPhase) {
      const duration = selectedCard === side ? "400ms" : "350ms";
      return `all ${duration} ease-in`;
    }
    return "all 300ms ease";
  };

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ backgroundColor: "#091829" }}
    >
      <StepIndicator currentStep={2} totalSteps={10} />
      {/* TOP ZONE - Progress */}
      <div className="flex flex-col items-center pt-2 pb-1" style={{ height: "10%" }}>
        <p
          className="text-center font-sans mb-2"
          style={{ fontSize: "13px", color: "#8A9BB5" }}
        >
          <span
            key={currentPair}
            className="inline-block"
            style={{ animation: "counterPop 200ms ease" }}
          >
            {currentPair + 1}
          </span>{" "}
          <span style={{ color: "#4A5E7A" }}>of {TOTAL_PAIRS}</span>
        </p>

        {/* Progress bar */}
        <div
          className="w-full max-w-md mx-auto px-6"
          style={{ height: "2px", backgroundColor: "rgba(201,168,76,0.15)" }}
        >
          <div
            style={{
              width: `${progressWidth}%`,
              height: "100%",
              backgroundColor: "#C9A84C",
              transition: "width 400ms ease",
            }}
          />
        </div>

        {/* Warmup text - only on warmup card */}
        <p
          className="mt-1 text-center font-sans italic"
          style={{
            fontSize: "11px",
            color: "#4A5E7A",
            opacity: isWarmup ? 1 : 0,
            transition: "opacity 300ms ease",
            height: 16,
          }}
        >
          Just getting started — no pressure
        </p>
      </div>

      {/* MIDDLE ZONE - Cards */}
      <div
        ref={containerRef}
        className="relative flex-1 flex items-center justify-center px-4"
        style={{ height: "77%" }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        <div
          className="relative flex w-full h-full max-w-[900px]"
          style={{ maxHeight: "calc(75vh - 40px)" }}
        >
          {/* Left Card */}
          <div
            className="relative w-1/2 h-full cursor-pointer overflow-hidden"
            style={{
              borderRadius: "16px 0 0 16px",
              background: "linear-gradient(160deg, #0D2035 0%, #1A2A3A 50%, #0A1828 100%)",
              ...getCardStyle("left"),
              transition: getCardTransition("left"),
              outline: selectedCard === "left" ? "3px solid #C9A84C" : "none",
              boxShadow:
                selectedCard === "left"
                  ? "0 0 0 3px rgba(201,168,76,0.3), 0 0 40px rgba(201,168,76,0.15)"
                  : "none",
            }}
            onClick={() => !isAnimating && handleSelection("left")}
            onMouseEnter={() => setLastHovered("left")}
            onMouseLeave={() => setLastHovered(null)}
          >
            {/* Real image */}
            {imgUrlA ? (
              <img
                src={imgUrlA}
                alt={activePair?.imageA?.alt ?? "Style option A"}
                className="absolute inset-0 w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              /* Fallback placeholder when images not yet generated */
              <svg
                className="absolute inset-0 m-auto"
                width="60%"
                height="60%"
                viewBox="0 0 100 80"
                fill="none"
                style={{ opacity: 0.5 }}
              >
                <rect x="10" y="10" width="30" height="25" stroke="rgba(201,168,76,0.08)" strokeWidth="0.5" />
                <line x1="5" y1="70" x2="95" y2="70" stroke="rgba(201,168,76,0.08)" strokeWidth="0.5" />
                <path d="M20 70 L20 50 Q30 45 40 50 L40 70" stroke="rgba(201,168,76,0.08)" strokeWidth="0.5" />
                <path d="M60 70 L60 55 L85 55 L85 70" stroke="rgba(201,168,76,0.08)" strokeWidth="0.5" />
              </svg>
            )}

            {/* Bottom gradient overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "linear-gradient(transparent 80%, rgba(9,24,41,0.15))",
              }}
            />

            {/* Checkmark badge */}
            {selectedCard === "left" && showCheckmark && (
              <div
                className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center justify-center"
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  backgroundColor: "#C9A84C",
                  animation: "checkBadge 250ms cubic-bezier(0.34,1.56,0.64,1)",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}

            {/* Hover effect */}
            <div
              className="absolute inset-0 pointer-events-none transition-opacity duration-200"
              style={{
                opacity: lastHovered === "left" && !selectedCard ? 1 : 0,
                boxShadow: "inset 0 0 60px rgba(201,168,76,0.04)",
                borderLeft: "2px solid #C9A84C",
                borderTop: "2px solid #C9A84C",
                borderBottom: "2px solid #C9A84C",
                borderRadius: "16px 0 0 16px",
              }}
            />
          </div>

          {/* Gold Divider */}
          <div
            className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 z-10"
            style={{ width: "2px", backgroundColor: "rgba(201,168,76,0.6)" }}
          >
            {/* Diamond */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
              style={{
                width: "8px",
                height: "8px",
                backgroundColor: "#C9A84C",
                transform: "translate(-50%, -50%) rotate(45deg)",
                animation: "diamondPulse 3s ease-in-out infinite",
              }}
            />
          </div>

          {/* Right Card */}
          <div
            className="relative w-1/2 h-full cursor-pointer overflow-hidden"
            style={{
              borderRadius: "0 16px 16px 0",
              background: "linear-gradient(160deg, #1A0E08 0%, #2A1A0A 50%, #1A0A04 100%)",
              ...getCardStyle("right"),
              transition: getCardTransition("right"),
              outline: selectedCard === "right" ? "3px solid #C9A84C" : "none",
              boxShadow:
                selectedCard === "right"
                  ? "0 0 0 3px rgba(201,168,76,0.3), 0 0 40px rgba(201,168,76,0.15)"
                  : "none",
            }}
            onClick={() => !isAnimating && handleSelection("right")}
            onMouseEnter={() => setLastHovered("right")}
            onMouseLeave={() => setLastHovered(null)}
          >
            {/* Real image */}
            {imgUrlB ? (
              <img
                src={imgUrlB}
                alt={activePair?.imageB?.alt ?? "Style option B"}
                className="absolute inset-0 w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              /* Fallback placeholder */
              <svg
                className="absolute inset-0 m-auto"
                width="60%"
                height="60%"
                viewBox="0 0 100 80"
                fill="none"
                style={{ opacity: 0.5 }}
              >
                <rect x="60" y="8" width="35" height="28" stroke="rgba(201,168,76,0.08)" strokeWidth="0.5" />
                <line x1="5" y1="70" x2="95" y2="70" stroke="rgba(201,168,76,0.08)" strokeWidth="0.5" />
                <ellipse cx="35" cy="60" rx="25" ry="8" stroke="rgba(201,168,76,0.08)" strokeWidth="0.5" />
                <path d="M70 70 L70 50 L90 50 L90 70" stroke="rgba(201,168,76,0.08)" strokeWidth="0.5" />
              </svg>
            )}

            {/* Bottom gradient overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "linear-gradient(transparent 80%, rgba(9,24,41,0.15))",
              }}
            />

            {/* Checkmark badge */}
            {selectedCard === "right" && showCheckmark && (
              <div
                className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center justify-center"
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  backgroundColor: "#C9A84C",
                  animation: "checkBadge 250ms cubic-bezier(0.34,1.56,0.64,1)",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}

            {/* Hover effect */}
            <div
              className="absolute inset-0 pointer-events-none transition-opacity duration-200"
              style={{
                opacity: lastHovered === "right" && !selectedCard ? 1 : 0,
                boxShadow: "inset 0 0 60px rgba(201,168,76,0.04)",
                borderRight: "2px solid #C9A84C",
                borderTop: "2px solid #C9A84C",
                borderBottom: "2px solid #C9A84C",
                borderRadius: "0 16px 16px 0",
              }}
            />
          </div>
        </div>
      </div>

      {/* BOTTOM ZONE - Skip + Back */}
      <div
        className="flex flex-col items-center justify-center pb-6"
        style={{ height: "13%" }}
      >
        {/* Neither / Skip button */}
        <button
          onClick={() => {
            if (isAnimating) return;
            if (currentPair + 1 >= TOTAL_PAIRS) {
              void completeQuiz(responses);
            } else {
              setCurrentPair((prev) => prev + 1);
            }
          }}
          disabled={isAnimating}
          className="font-sans transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            fontSize: "12px",
            color: "#4A5E7A",
            background: "transparent",
            border: "1px solid rgba(74,94,122,0.4)",
            borderRadius: 20,
            padding: "6px 20px",
            cursor: isAnimating ? "not-allowed" : "pointer",
            letterSpacing: "0.04em",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "rgba(201,168,76,0.3)";
            e.currentTarget.style.color = "#8A9BB5";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(74,94,122,0.4)";
            e.currentTarget.style.color = "#4A5E7A";
          }}
        >
          Neither — skip
        </button>

        {/* Back button */}
        <button
          onClick={handleBack}
          disabled={currentPair === 0 || isAnimating}
          className="mt-3 font-sans transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            fontSize: "12px",
            color: "#4A5E7A",
            background: "none",
            border: "none",
            cursor: currentPair > 0 ? "pointer" : "not-allowed",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#8A9BB5")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#4A5E7A")}
        >
          ←
        </button>
      </div>

      {/* Animations */}
      <style jsx>{`
        @keyframes counterPop {
          0% { transform: scale(1); }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        @keyframes checkBadge {
          0% { transform: translateX(-50%) scale(0); }
          60% { transform: translateX(-50%) scale(1.1); }
          100% { transform: translateX(-50%) scale(1); }
        }
        @keyframes diamondPulse {
          0%, 100% {
            transform: translate(-50%, -50%) rotate(45deg) scale(1);
            opacity: 0.6;
          }
          50% {
            transform: translate(-50%, -50%) rotate(45deg) scale(1.15);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
