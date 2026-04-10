"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFingerprintStore } from "@/lib/store/fingerprint";
import "../step-1/step1.css";
import "./step3.css";

type Option = {
  label: string;
  image: string;
  alt: string;
};

type Round = {
  left: Option;
  right: Option;
};

const ROUNDS: Round[] = [
  {
    left: {
      label: "Calm Warm Woods",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/wl9fpGVTqfYb_712c46ca.jpg",
      alt: "Serene interior with warm woods and restrained styling",
    },
    right: {
      label: "Modern Luxe",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/OqavQS3nn2Of_9e9fb8e6.jpg",
      alt: "Modern luxury interior with polished materials and layered lighting",
    },
  },
  {
    left: {
      label: "Industrial Edge",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/sSOO9vSbaCqI_41f3927f.jpg",
      alt: "Industrial loft interior with metal, concrete, and moody light",
    },
    right: {
      label: "Breezy & Light",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/jibl1ZhpOQ62_055cad1a.jpg",
      alt: "Breezy interior with pale textiles and airy natural light",
    },
  },
  {
    left: {
      label: "Layered & Bold",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/jKNihu1uil8r_f0d63957.jpg",
      alt: "Maximalist room layered with pattern, art, and color",
    },
    right: {
      label: "Bright & Airy",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/PIe6acCOKi2m_d8ea754d.jpg",
      alt: "Bright interior with clean lines and neutral tones",
    },
  },
  {
    left: {
      label: "Walnut Warmth",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/Usn3xSO69ETo_a5618c3b.jpg",
      alt: "Room with walnut tones and iconic silhouettes",
    },
    right: {
      label: "Eclectic Layering",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/LSlC07ju3zi7_1b911039.jpg",
      alt: "Eclectic living room with textiles, plants, and expressive styling",
    },
  },
  {
    left: {
      label: "Art Deco Drama",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/hSdez6NFyEQu_d9775122.jpg",
      alt: "Art Deco interior with geometry, brass, and theatrical contrast",
    },
    right: {
      label: "Quiet Tactile",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/eaiXimstWn9f_7a2cf6ba.jpg",
      alt: "Quiet room with tactile textures and calm imperfect forms",
    },
  },
  {
    left: {
      label: "Contemporary Gallery",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/kCu9jgeFZsGf_20a24f20.jpg",
      alt: "Contemporary interior with sculptural furniture and open space",
    },
    right: {
      label: "Organic Modern",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/r1TP9VIo8yZL_6bbf1ff0.jpg",
      alt: "Organic modern room with curved forms and natural materials",
    },
  },
  {
    left: {
      label: "Serene Retreat",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/foQ4nZPgizp1_5ae5544b.jpg",
      alt: "Serene sitting room with minimal furnishings",
    },
    right: {
      label: "Industrial Loft",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/a6OpNfqj2Tzi_f131b612.jpg",
      alt: "Industrial apartment interior with steel framing and exposed structure",
    },
  },
  {
    left: {
      label: "Sun-Washed Studio",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/Y7za5C9ROKt9_71a8a29c.jpg",
      alt: "Sitting room with sun-washed palette and soft textures",
    },
    right: {
      label: "Salon Maximalism",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/gJMuNAU1m5iy_5b4325bf.jpg",
      alt: "Salon rich in objects, textiles, and saturated accents",
    },
  },
  {
    left: {
      label: "Daylight Studio",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/foQ4nZPgizp1_5ae5544b.jpg",
      alt: "Living room with airy daylight and oak details",
    },
    right: {
      label: "Teak Lounge",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/swRjh6koCRGO_1d9e122c.jpg",
      alt: "Lounge with teak, leather, and low-slung forms",
    },
  },
  {
    left: {
      label: "Collected Escape",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/jXTFKclXF75e_f67f12cb.jpg",
      alt: "Interior with layered rugs and collected décor",
    },
    right: {
      label: "Art Deco Suite",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/c9rKwfiPJmZn_48f4b95f.jpg",
      alt: "Art Deco suite with jewel tones and geometric detailing",
    },
  },
  {
    left: {
      label: "Raw & Calm",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/qt3Z6Ru5Paln_a7023b25.jpg",
      alt: "Shelter with raw wood and soft plaster tones",
    },
    right: {
      label: "Contemporary Loft",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/tHdsVD35bNhW_45615cf1.jpg",
      alt: "Contemporary loft with crisp forms and gallery-like restraint",
    },
  },
  {
    left: {
      label: "Organic Haven",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/eeJ7Rl2WER8X_8379fe2f.jpg",
      alt: "Organic haven with stone, linen, and curved silhouettes",
    },
    right: {
      label: "Modern Luxe Noir",
      image:
        "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/OqavQS3nn2Of_9e9fb8e6.jpg",
      alt: "Dark modern luxury interior with brass accents and dramatic mood",
    },
  },
];

const COMPLETION_BACKGROUND =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663514830424/AAW43aehHztmjdKk5QKJPs/cova-starburst-transition-bg-Qpxi2XBexvgAuRLxVBuzNG.webp";

const COMPLETION_ROUTE = "/design/step-4";

export default function CovaStyleQuizPage() {
  const router = useRouter();
  const totalRounds = ROUNDS.length;
  const [activeRound, setActiveRound] = useState(0);
  const [selectedSide, setSelectedSide] = useState<"left" | "right" | null>(
    null,
  );
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // Track when current round started for response time measurement
  const roundStartRef = useRef<number>(Date.now())

  const currentRound = ROUNDS[activeRound];
  const roundNumber = activeRound + 1;
  const progressValue = useMemo(
    () => ((activeRound + (selectedSide ? 1 : 0)) / totalRounds) * 100,
    [activeRound, selectedSide, totalRounds],
  );

  useEffect(() => {
    const checkAuth = async () => {
      const { createBrowserClient } = await import('@/lib/supabase/client')
      const supabase = createBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) router.push('/auth?next=/design/step-3')
    }
    checkAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChoice = (side: "left" | "right") => {
    if (selectedSide || isTransitioning || isComplete) return;
    // Record pairwise response to fingerprint store (cookie-persisted)
    const responseTimeMs = Date.now() - roundStartRef.current
    useFingerprintStore.getState().addPhaseBResponse({
      pairId: String(activeRound),
      chosenSide: side === "left" ? "A" : "B",
      responseTimeMs,
    })
    setSelectedSide(side);
  };

  useEffect(() => {
    if (!selectedSide || isTransitioning || isComplete) return;

    const settleTimer = window.setTimeout(() => {
      if (activeRound === totalRounds - 1) {
        setIsComplete(true);
        return;
      }

      setIsTransitioning(true);
      window.setTimeout(() => {
        setActiveRound((prev) => prev + 1);
        setSelectedSide(null);
        setIsTransitioning(false);
        // Reset round start time for accurate response time tracking
        roundStartRef.current = Date.now()
      }, 540);
    }, 180);

    return () => window.clearTimeout(settleTimer);
  }, [activeRound, isComplete, isTransitioning, selectedSide, totalRounds]);

  useEffect(() => {
    if (!isComplete) return;

    const finishTimer = window.setTimeout(() => {
      router.push(COMPLETION_ROUTE);
    }, 1500);

    return () => window.clearTimeout(finishTimer);
  }, [isComplete, router]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (selectedSide || isTransitioning || isComplete) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handleChoice("left");
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        handleChoice("right");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComplete, isTransitioning, selectedSide]);

  return (
    <main className="cova-shell">
      <div className="cova-noise" aria-hidden="true" />
      <div className="cova-glow" aria-hidden="true" />

      {isComplete ? (
        <div className="cova-completion-screen" aria-live="polite">
          <img
            className="cova-completion-background"
            src={COMPLETION_BACKGROUND}
            alt=""
            aria-hidden="true"
          />
          <div className="cova-completion-star">✦</div>
          <p className="cova-completion-copy">
            Building your style fingerprint...
          </p>
        </div>
      ) : null}

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
            onClick={() => router.push('/design/step-2')}
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
              Round {roundNumber} of {totalRounds}
            </div>
            <button
              type="button"
              className="cova-brand-wordmark"
              onClick={() => router.push('/')}
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

        <section className="cova-editorial-intro">
          <h1>Which feels more like you?</h1>
          <p className="cova-subcopy">
            Go with your gut — there&apos;s no wrong answer.
          </p>
        </section>

        <section className="cova-comparison-stage" aria-live="polite">
          <div
            className={`cova-comparison-frame cova-cards-container ${selectedSide ? "has-selection" : ""} ${isTransitioning ? "is-transitioning" : ""}`}
          >
            <ChoiceCard
              option={currentRound.left}
              side="left"
              selectedSide={selectedSide}
              onSelect={handleChoice}
            />

            <div
              className={`cova-or-divider ${selectedSide ? "is-hidden" : ""}`}
              aria-hidden="true"
            >
              <span className="cova-divider-line" />
              <span className="cova-or-badge">OR</span>
              <span className="cova-divider-line" />
            </div>

            <ChoiceCard
              option={currentRound.right}
              side="right"
              selectedSide={selectedSide}
              onSelect={handleChoice}
            />
          </div>
        </section>

        <footer className="cova-footer">
          <p>12 quick choices. That&apos;s all we need.</p>
          <div className="cova-dot-row" aria-hidden="true">
            {ROUNDS.map((_, index) => {
              const completed =
                index < activeRound ||
                (index === activeRound && selectedSide);
              return (
                <span
                  key={index}
                  className={`cova-progress-dot ${completed ? "is-complete" : ""}`}
                />
              );
            })}
          </div>
        </footer>
      </section>
    </main>
  );
}

type ChoiceCardProps = {
  option: Option;
  side: "left" | "right";
  selectedSide: "left" | "right" | null;
  onSelect: (side: "left" | "right") => void;
};

function ChoiceCard({ option, side, selectedSide, onSelect }: ChoiceCardProps) {
  const isSelected = selectedSide === side;
  const isDimmed = selectedSide !== null && selectedSide !== side;

  return (
    <div className={`cova-choice-wrap ${isDimmed ? "is-dimmed" : ""}`}>
      <button
        type="button"
        className={`cova-choice-card ${isSelected ? "is-selected selecting" : ""}`}
        onClick={() => onSelect(side)}
        aria-pressed={isSelected}
        aria-label={`Choose ${option.label}`}
        style={{
          backgroundImage: `url(${option.image})`,
        }}
      >
        {isSelected ? <span className="cova-choice-check">✦</span> : null}
        <span className="cova-sr-only">{option.alt}</span>
      </button>
      <span className="cova-choice-label">{option.label}</span>
    </div>
  );
}
