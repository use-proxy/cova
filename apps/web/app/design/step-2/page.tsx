"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useFingerprintStore } from "@/lib/store/fingerprint";
import { STYLE_DISPLAY_NAMES } from "@/lib/ai/anchor-display";
import "../step-1/step1.css";
import "./step2.css";

// ── Types ──────────────────────────────────────────────
type StyleCard = {
  id: string;
  style_name: string;
  style_index: number;
  image_url: string;
};

type NlpAnswer = {
  questionId: "surfaces" | "materials" | "color";
  choiceIndex: number;
  isTiebreaker?: boolean;
};

// ── Display name mapping ──
const DISPLAY_NAME_MAP: Record<string, string> = {
  "Warm Japandi": "Japandi",
  "Dark Moody Glam": "Dark & Moody",
  "Coastal Bright": "Coastal Light",
  "Industrial Loft": "Urban Industrial",
  "Maximalist Eclectic": "Maximalist",
  "Heritage Traditional": "Classic Traditional",
  "Pure Minimal White": "Minimalist",
  "Biophilic Jungle": "Biophilic",
  "Retro Mid-Century": "Mid-Century",
};

function toCardDisplayName(styleName: string): string {
  return DISPLAY_NAME_MAP[styleName] ?? STYLE_DISPLAY_NAMES[styleName] ?? styleName;
}

// ── Room types ──
const ROOM_TYPES: { id: string; label: string }[] = [
  { id: "living_room", label: "Living Room" },
  { id: "bedroom", label: "Bedroom" },
  { id: "dining_room", label: "Dining Room" },
  { id: "home_office", label: "Home Office" },
  { id: "kitchen", label: "Kitchen" },
  { id: "bathroom", label: "Bathroom" },
];

// ── Round copy ──
const ROUND_COPY = [
  { eyebrow: "Round 1 of 3", title: "What draws you in?", subtitle: "Pick 2 spaces that feel like you" },
  { eyebrow: "Round 2 of 3", title: "Which rooms excite you?", subtitle: "Pick 2 more that resonate" },
  { eyebrow: "Round 3 of 3", title: "Final instinct", subtitle: "Pick your last 2 — trust your gut" },
];

// ── NLP questions — mapped to non_visual_responses format ──
// Q1 → questionId: "color" (warmth)
// Q2 → questionId: "surfaces" (density)
// Q3 → questionId: "materials" (organicness)

type NlpOption = {
  label: string;
  questionId: "surfaces" | "materials" | "color";
  choiceIndex: number;
  /** Direct V2 6-dim adjustments. When present, bypasses non_visual_responses mapping. */
  v2Deltas?: number[];
};

type NlpQuestion = {
  question: string;
  options: NlpOption[];
};

// Q2: always about density (surfaces/layering) — but question framing adapts to top style
// Q3: always about organicness/character (materials) — but framing adapts to top style
// Both are built dynamically after the grid so they reflect what the user actually picked.

// V2 dim indices: 0=warmth, 1=visual_complexity, 2=organicness, 3=density, 4=traditionalism, 5=character
const STYLE_V2_CENTERS: Record<number, number[]> = {
  0: [0.80, 0.15, 0.80, 0.15, 0.15, 0.80], // Warm Japandi
  1: [0.15, 0.80, 0.15, 0.80, 0.80, 0.80], // Dark Moody Glam
  2: [0.80, 0.15, 0.50, 0.15, 0.15, 0.15], // Coastal Bright
  3: [0.15, 0.80, 0.15, 0.80, 0.15, 0.15], // Industrial Loft
  4: [0.80, 0.80, 0.80, 0.80, 0.15, 0.80], // Maximalist Eclectic
  5: [0.80, 0.80, 0.80, 0.80, 0.80, 0.15], // Heritage Traditional
  6: [0.15, 0.15, 0.15, 0.15, 0.15, 0.15], // Pure Minimal White
  7: [0.15, 0.15, 0.80, 0.80, 0.15, 0.80], // Biophilic Jungle
  8: [0.80, 0.80, 0.15, 0.15, 0.15, 0.80], // Retro Mid-Century
};

// Universal dim-targeted question system.
// Works for any style combination — questions adapt to whichever dims
// are most uncertain after the grid. Nothing hardcoded per style.

const DIM_QUESTIONS = [
  {
    // dim 0: warmth
    question: "What feeling do you want when you walk in?",
    hiLabel: "Warm, rich, and inviting", hiEmoji: "🌅",
    hiDeltas: [+0.45, 0, 0, 0, 0, 0],
    loLabel: "Cool, crisp, and composed", loEmoji: "🧊",
    loDeltas: [-0.45, 0, 0, 0, 0, 0],
    midLabel: "Somewhere in between", midEmoji: "⚖️",
    midDeltas: [0, 0, 0, 0, 0, 0],
  },
  {
    // dim 1: visual complexity
    question: "How much should the eye have to explore?",
    hiLabel: "A lot — richness and layers of detail", hiEmoji: "🎨",
    hiDeltas: [0, +0.45, 0, 0, 0, 0],
    loLabel: "Very little — beauty through restraint", loEmoji: "◻️",
    loDeltas: [0, -0.45, 0, 0, 0, 0],
    midLabel: "Some interest, but not overwhelming", midEmoji: "🔲",
    midDeltas: [0, 0, 0, 0, 0, 0],
  },
  {
    // dim 2: organicness
    question: "What's your relationship with natural materials?",
    hiLabel: "Essential — wood, stone, plants, living textures", hiEmoji: "🌿",
    hiDeltas: [0, 0, +0.45, 0, 0, 0],
    loLabel: "Minimal — I prefer glass, metal, precise surfaces", loEmoji: "⬜",
    loDeltas: [0, 0, -0.45, 0, 0, 0],
    midLabel: "A mix of natural and sleek", midEmoji: "🪨",
    midDeltas: [0, 0, 0, 0, 0, 0],
  },
  {
    // dim 3: density
    question: "How do you feel about objects in a space?",
    hiLabel: "Layered — rooms full of collected things and story", hiEmoji: "📚",
    hiDeltas: [0, 0, 0, +0.45, 0, 0],
    loLabel: "Sparse — every object earns its place, nothing extra", loEmoji: "✨",
    loDeltas: [0, 0, 0, -0.45, 0, 0],
    midLabel: "A few curated things, but not cluttered", midEmoji: "🏺",
    midDeltas: [0, 0, 0, 0, 0, 0],
  },
  {
    // dim 4: traditionalism
    question: "Where does your taste sit on the time spectrum?",
    hiLabel: "Heritage — antiques, patina, and timeless forms", hiEmoji: "🏛️",
    hiDeltas: [0, 0, 0, 0, +0.45, 0],
    loLabel: "Forward — contemporary and cutting-edge forms", loEmoji: "🔲",
    loDeltas: [0, 0, 0, 0, -0.45, 0],
    midLabel: "A blend of old and new", midEmoji: "⚖️",
    midDeltas: [0, 0, 0, 0, 0, 0],
  },
  {
    // dim 5: character
    question: "What kind of objects feel most at home to you?",
    hiLabel: "Handcrafted and one-of-a-kind, full of soul", hiEmoji: "🎭",
    hiDeltas: [0, 0, 0, 0, 0, +0.35],
    loLabel: "Refined, precise, and beautifully anonymous", loEmoji: "🪟",
    loDeltas: [0, 0, 0, 0, 0, -0.35],
    midLabel: "A mix — some character, some restraint", midEmoji: "🏺",
    midDeltas: [0, 0, 0, 0, 0, 0],
  },
] as const;

/** Estimate the current v2 fingerprint from grid picks alone. */
function buildNlpQuestions(
  gridSelections: Array<{ styleIndex: number; round: number; styleName: string }>,
  tiebreakerDeltasApplied: number[] | null,
): NlpQuestion[] {
  // Step 1: compute blended fingerprint from grid selections
  const NEUTRAL = 0.5;
  const STYLE_V2: number[][] = [
    [0.80, 0.15, 0.80, 0.15, 0.15, 0.80], // Japandi
    [0.15, 0.80, 0.15, 0.80, 0.80, 0.15], // DarkMoody
    [0.80, 0.15, 0.15, 0.15, 0.15, 0.15], // Coastal
    [0.15, 0.80, 0.15, 0.80, 0.15, 0.15], // Industrial
    [0.80, 0.80, 0.80, 0.80, 0.15, 0.80], // Maximalist
    [0.80, 0.80, 0.80, 0.80, 0.80, 0.15], // Traditional
    [0.15, 0.15, 0.15, 0.15, 0.15, 0.15], // Minimalist
    [0.15, 0.15, 0.80, 0.80, 0.15, 0.80], // Biophilic
    [0.80, 0.80, 0.15, 0.15, 0.15, 0.80], // MidCentury
  ];

  const pickCounts: Record<number, number> = {};
  for (const s of gridSelections) {
    pickCounts[s.styleIndex] = (pickCounts[s.styleIndex] ?? 0) + 1;
  }
  const totalPicks = gridSelections.length || 6;

  const fp = Array(6).fill(0) as number[];
  const tw = Array(6).fill(0) as number[];
  for (const [idxStr, count] of Object.entries(pickCounts)) {
    const sv = STYLE_V2[Number(idxStr)];
    if (!sv) continue;
    const w = count / totalPicks;
    for (let d = 0; d < 6; d++) {
      const dev = (sv[d] ?? NEUTRAL) - NEUTRAL;
      const sig = Math.abs(dev) * w;
      fp[d] += dev * sig;
      tw[d] += sig;
    }
  }
  for (let d = 0; d < 6; d++) {
    fp[d] = tw[d] < 0.01 ? NEUTRAL : Math.max(0, Math.min(1, NEUTRAL + fp[d] / tw[d]));
  }

  // Step 2: apply tiebreaker deltas if Q1 fired
  if (tiebreakerDeltasApplied) {
    for (let d = 0; d < 6; d++) {
      fp[d] = Math.max(0, Math.min(1, fp[d] + (tiebreakerDeltasApplied[d] ?? 0)));
    }
  }

  // Step 3: find uncertain dims (|v - 0.5| < 0.25, sorted most uncertain first)
  const uncertain = fp
    .map((v, i) => ({ i, v, u: 1 - Math.abs(v - NEUTRAL) * 2 }))
    .filter(d => d.u > 0.5)
    .sort((a, b) => b.u - a.u);

  // If no uncertain dims, no questions needed
  if (uncertain.length === 0) return [];

  // Step 4: dim → question definitions (each dim maps to a clear 2-option question)
  // NV mapping: {qId, c} = questionId and choiceIndex for NON_VISUAL_ADJUSTMENTS
  const DIM_TO_Q: Record<number, {
    question: string;
    hiLabel: string; hiEmoji: string; hiNV: { qId: "surfaces"|"materials"|"color"; c: number };
    loLabel: string; loEmoji: string; loNV: { qId: "surfaces"|"materials"|"color"; c: number };
    hiDeltas: number[]; loDeltas: number[];
  }> = {
    0: { // warmth
      question: "What feeling do you want when you walk in?",
      hiLabel: "Warm, amber, golden — cozy and inviting",
      hiEmoji: "🌅", hiNV: { qId: "color", c: 1 },
      hiDeltas: [+0.35, 0, 0, 0, 0, 0],
      loLabel: "Cool, grey, crisp — calm and composed",
      loEmoji: "🪨", loNV: { qId: "color", c: 0 },
      loDeltas: [-0.35, 0, 0, 0, 0, 0],
    },
    1: { // complexity
      question: "How visually rich do you want the space?",
      hiLabel: "Bold — pattern, color, lots to look at",
      hiEmoji: "🎨", hiNV: { qId: "color", c: 2 },
      hiDeltas: [0, +0.35, 0, 0, 0, 0],
      loLabel: "Calm — clean, simple, quiet",
      loEmoji: "⬜", loNV: { qId: "color", c: 0 },
      loDeltas: [0, -0.35, 0, 0, 0, 0],
    },
    2: { // organicness
      question: "What materials draw you in?",
      hiLabel: "Natural — wood, stone, plants, linen",
      hiEmoji: "🪵", hiNV: { qId: "materials", c: 0 },
      hiDeltas: [0, 0, +0.35, 0, 0, 0],
      loLabel: "Sleek — metal, glass, concrete, lacquer",
      loEmoji: "⚙️", loNV: { qId: "materials", c: 1 },
      loDeltas: [0, 0, -0.35, 0, 0, 0],
    },
    3: { // density
      question: "How do you feel about objects in a space?",
      hiLabel: "Layered — rooms full of collected things",
      hiEmoji: "📚", hiNV: { qId: "surfaces", c: 2 },
      hiDeltas: [0, 0, 0, +0.35, 0, 0],
      loLabel: "Spare — only what earns its place",
      loEmoji: "✨", loNV: { qId: "surfaces", c: 0 },
      loDeltas: [0, 0, 0, -0.35, 0, 0],
    },
    4: { // traditionalism
      question: "What era draws you in?",
      hiLabel: "Heritage — timeless, old-world craftsmanship",
      hiEmoji: "🏛️", hiNV: { qId: "materials", c: 2 },
      hiDeltas: [0, 0, 0, 0, +0.35, 0],
      loLabel: "Contemporary — raw, stripped-back, modern",
      loEmoji: "🔩", loNV: { qId: "materials", c: 1 },
      loDeltas: [0, 0, 0, 0, -0.35, 0],
    },
    5: { // character
      question: "What kind of objects speak to you?",
      hiLabel: "Handcrafted — artisan, unique, with soul",
      hiEmoji: "🏺", hiNV: { qId: "materials", c: 3 },
      hiDeltas: [0, 0, 0, 0, 0, +0.35],
      loLabel: "Precise — clean lines, no ornamentation",
      loEmoji: "📐", loNV: { qId: "materials", c: 1 },
      loDeltas: [0, 0, 0, 0, 0, -0.35],
    },
  };

  // Step 5: build up to 2 questions for the most uncertain dims
  // (3 if all dims are very uncertain — e.g. 3-way style split)
  const maxQuestions = uncertain.length >= 4 ? 3 : Math.min(uncertain.length, 2);
  const questions: NlpQuestion[] = [];

  for (let qi = 0; qi < maxQuestions; qi++) {
    const dimInfo = uncertain[qi];
    if (!dimInfo) break;
    const def = DIM_TO_Q[dimInfo.i];
    if (!def) continue;

    questions.push({
      question: def.question,
      options: [
        {
          label: `${def.hiEmoji}  ${def.hiLabel}`,
          questionId: def.hiNV.qId,
          choiceIndex: def.hiNV.c,
          v2Deltas: def.hiDeltas,
        },
        {
          label: `${def.loEmoji}  ${def.loLabel}`,
          questionId: def.loNV.qId,
          choiceIndex: def.loNV.c,
          v2Deltas: def.loDeltas,
        },
      ],
    });
  }

  return questions;
}


function computeTiebreakerDeltas(winnerCenter: number[], loserCenter: number[], primaryDim: number): number[] {
  const deltas = Array(6).fill(0);
  deltas[primaryDim] = winnerCenter[primaryDim] > 0.5 ? +0.35 : -0.35;
  for (let d = 0; d < 6; d++) {
    if (d === primaryDim) continue;
    const diff = winnerCenter[d] - loserCenter[d];
    if (Math.abs(diff) > 0.30) {
      deltas[d] = diff > 0 ? +0.25 : -0.25;
    }
  }
  return deltas;
}
function buildQ1(gridPickCounts: Record<number, number>): NlpQuestion | null {
  const sorted = Object.entries(gridPickCounts)
    .map(([idxStr, count]) => ({ idx: Number(idxStr), count }))
    .sort((a, b) => b.count - a.count);

  if (sorted.length < 2) return null;

  const top = sorted[0]!;
  const second = sorted[1]!;
  if (top.count !== second.count) return null;

  const aCenter = STYLE_V2_CENTERS[top.idx];
  const bCenter = STYLE_V2_CENTERS[second.idx];
  if (!aCenter || !bCenter) return null;

  const styleNames: Record<number, string> = {
    0: "Japandi", 1: "Dark & Moody", 2: "Coastal Light", 3: "Urban Industrial",
    4: "Maximalist", 5: "Classic Traditional", 6: "Minimalist", 7: "Biophilic", 8: "Mid-Century",
  };
  const nameA = styleNames[top.idx] ?? "Style A";
  const nameB = styleNames[second.idx] ?? "Style B";

  const NEUTRAL = 0.5;
  const THRESHOLD = 0.40;

  // Helper: build style-named 2-option question using dynamic multi-dim deltas
  function styleNamedQuestion(dimIdx: number, dqIdx: number): NlpQuestion {
    const desc = DIM_QUESTIONS[dqIdx]!;
    const aIsHigh = (aCenter![dimIdx] ?? NEUTRAL) > NEUTRAL;
    // Use computeTiebreakerDeltas to include ALL dims where styles differ > 0.30
    // This prevents Industrial from stealing DarkMoody wins on secondary dims
    const aDeltasMulti = computeTiebreakerDeltas(aCenter!, bCenter!, dimIdx);
    const bDeltasMulti = computeTiebreakerDeltas(bCenter!, aCenter!, dimIdx);
    return {
      question: `Your picks split between ${nameA} and ${nameB} — which pull matters more?`,
      options: [
        {
          label: `${aIsHigh ? desc.hiEmoji : desc.loEmoji}  ${nameA}: ${aIsHigh ? desc.hiLabel : desc.loLabel}`,
          questionId: "color",
          choiceIndex: 0,
          v2Deltas: aDeltasMulti,
        },
        {
          label: `${aIsHigh ? desc.loEmoji : desc.hiEmoji}  ${nameB}: ${aIsHigh ? desc.loLabel : desc.hiLabel}`,
          questionId: "color",
          choiceIndex: 0,
          v2Deltas: bDeltasMulti,
        },
      ],
    };
  }

  // Priority 1: warmth conflict (dim 0)
  if (Math.abs((aCenter[0] ?? NEUTRAL) - (bCenter[0] ?? NEUTRAL)) > THRESHOLD) {
    return styleNamedQuestion(0, 0);
  }

  // Priority 2: organicness conflict (dim 2)
  if (Math.abs((aCenter[2] ?? NEUTRAL) - (bCenter[2] ?? NEUTRAL)) > THRESHOLD) {
    return styleNamedQuestion(2, 1);
  }

  // Priority 3: traditionalism conflict (dim 4)
  if (Math.abs((aCenter[4] ?? NEUTRAL) - (bCenter[4] ?? NEUTRAL)) > THRESHOLD) {
    const aIsHigh = (aCenter[4] ?? NEUTRAL) > NEUTRAL;
    return {
      question: "What era draws you in most?",
      options: [
        {
          label: aIsHigh
            ? "Rich heritage, old-world craftsmanship, timeless elegance"
            : "Raw, contemporary, stripped-back modern edge",
          questionId: "materials",
          choiceIndex: 0,
          v2Deltas: aIsHigh ? [0, 0, 0, 0, +0.40, 0] : [0, 0, 0, 0, -0.40, 0],
        },
        {
          label: aIsHigh
            ? "Raw, contemporary, stripped-back modern edge"
            : "Rich heritage, old-world craftsmanship, timeless elegance",
          questionId: "materials",
          choiceIndex: 1,
          v2Deltas: aIsHigh ? [0, 0, 0, 0, -0.40, 0] : [0, 0, 0, 0, +0.40, 0],
        },
      ],
    };
  }

  // Priority 4: character conflict (dim 5)
  if (Math.abs((aCenter[5] ?? NEUTRAL) - (bCenter[5] ?? NEUTRAL)) > THRESHOLD) {
    const aIsHigh = (aCenter[5] ?? NEUTRAL) > NEUTRAL;
    return {
      question: "What kind of objects speak to you?",
      options: [
        {
          label: aIsHigh
            ? "Handcrafted, unique, artisan-made with visible character"
            : "Precise, manufactured, clean without ornamentation",
          questionId: "materials",
          choiceIndex: 0,
          v2Deltas: aIsHigh ? [0, 0, 0, 0, 0, +0.35] : [0, 0, 0, 0, 0, -0.35],
        },
        {
          label: aIsHigh
            ? "Precise, manufactured, clean without ornamentation"
            : "Handcrafted, unique, artisan-made with visible character",
          questionId: "materials",
          choiceIndex: 1,
          v2Deltas: aIsHigh ? [0, 0, 0, 0, 0, -0.35] : [0, 0, 0, 0, 0, +0.35],
        },
      ],
    };
  }

  return null;
}

export default function CovaStyleSelectionPage() {
  const router = useRouter();
  // Phase state machine: "room" → "grid" → "nlp" → step-3
  const [phase, setPhase] = useState<"room" | "grid" | "nlp">("room");

  // Grid round state
  const [currentRound, setCurrentRound] = useState(1);
  const [roundPicks, setRoundPicks] = useState<number[]>([]);
  const [cards, setCards] = useState<StyleCard[]>([]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [gridKey, setGridKey] = useState(0);

  // NLP state
  const [nlpAnswers, setNlpAnswers] = useState<NlpAnswer[]>([]);
  const [nlpSubmitting, setNlpSubmitting] = useState(false);
  const [nlpQuestions, setNlpQuestions] = useState<NlpQuestion[]>([
    ...buildNlpQuestions([], null),
  ]);

  // 3D tilt + pointer glow
  const [tiltStyles, setTiltStyles] = useState<Record<number, React.CSSProperties>>({});
  const [pointer, setPointer] = useState({ x: 50, y: 28 });

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
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch cards for a specific round — called explicitly, not via round-change effect
  const fetchCards = useCallback(async (round: number) => {
    const rt = useFingerprintStore.getState().roomType;
    const params = new URLSearchParams();
    if (rt) params.set("room_type", rt);
    params.set("round", String(round));
    try {
      const res = await fetch(`/api/quiz/next-card?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.cards) {
        setCards(
          json.cards.map((c: Record<string, unknown>) => ({
            id: c.id as string,
            style_name: c.style_name as string,
            style_index: c.style_index as number,
            image_url: c.image_url as string,
          })),
        );
      }
    } catch {
      // fall back silently
    }
  }, []);

  // Fetch when entering grid phase (round 1).
  // currentRound intentionally excluded from deps — handleNextRound and the
  // back button call fetchCards directly with the correct round number so that
  // images are loaded BEFORE the UI transitions (exact sequence per spec).
  useEffect(() => {
    if (phase === "grid") {
      void fetchCards(currentRound);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, fetchCards]);

  // Progress bar width
  const progressWidth = useMemo(() => {
    if (phase === "nlp") return `${58 + nlpAnswers.length * 10}%`;
    const base = 26;
    const roundBonus = (currentRound - 1) * 10;
    const pickBonus = roundPicks.length * 3;
    return `${Math.min(base + roundBonus + pickBonus, 58)}%`;
  }, [phase, currentRound, roundPicks.length, nlpAnswers.length]);

  // Card click handler
  const handleCardClick = useCallback((card: StyleCard) => {
    setRoundPicks((prev) => {
      if (prev.includes(card.style_index)) return prev.filter((idx) => idx !== card.style_index);
      if (prev.length >= 2) return prev;
      const next = [...prev, card.style_index];
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(30);
      return next;
    });
  }, []);

  // 3D tilt handlers
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, styleIndex: number) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      setTiltStyles((prev) => ({
        ...prev,
        [styleIndex]: {
          transform: `perspective(600px) rotateX(${(0.5 - y) * 16}deg) rotateY(${(x - 0.5) * 16}deg) translateY(-4px)`,
        },
      }));
    },
    [],
  );

  const handleMouseLeave = useCallback((styleIndex: number) => {
    setTiltStyles((prev) => {
      const next = { ...prev };
      delete next[styleIndex];
      return next;
    });
  }, []);

  // Next round / finish grid — exact sequence per spec
  const handleNextRound = useCallback(async () => {
    if (roundPicks.length < 2) return;

    const store = useFingerprintStore.getState();

    // 1. Save current round picks to store
    for (const styleIdx of roundPicks) {
      const card = cards.find((c) => c.style_index === styleIdx);
      if (card) {
        store.addGridSelection({ styleIndex: styleIdx - 1, styleName: card.style_name, round: currentRound });
      }
    }

    if (currentRound < 3) {
      const nextRound = currentRound + 1;

      // 2. Start exit animation
      setIsTransitioning(true);

      // 3. Wait 280ms
      await new Promise<void>((resolve) => setTimeout(resolve, 280));

      // 4. Fetch NEW images for next round (before updating round UI)
      await fetchCards(nextRound);

      // 5. Advance round
      setCurrentRound(nextRound);

      // 6. Clear picks
      setRoundPicks([]);
      setTiltStyles({});

      // 7. Force card re-mount for entrance animation
      setGridKey((k) => k + 1);

      // 8. End transition
      setIsTransitioning(false);

      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 300);
    } else {
      // Final round complete → enter NLP phase
      setIsTransitioning(true);
      await new Promise<void>((resolve) => setTimeout(resolve, 280));

      // Build tie-breaker Q1 from all grid picks accumulated in the store
      const allSelections = useFingerprintStore.getState().gridSelections;
      const gridPickCounts: Record<number, number> = {};
      for (const sel of allSelections) {
        gridPickCounts[sel.styleIndex] = (gridPickCounts[sel.styleIndex] ?? 0) + 1;
      }
      const currentGridSelections = useFingerprintStore.getState().gridSelections;
      const currentTiebreaker = useFingerprintStore.getState().tiebreakerDeltas;
      const questions = buildNlpQuestions(currentGridSelections, currentTiebreaker);
      const q1Tiebreaker = buildQ1(gridPickCounts); // personalized tiebreaker only when picks are tied
      if (q1Tiebreaker) questions[0] = q1Tiebreaker; // only override when tiebreaker is valid
      setNlpQuestions(questions);
      // Reset accumulated tiebreaker deltas for this fresh NLP session
      useFingerprintStore.getState().setTiebreakerDeltas(null);

      setPhase("nlp");
      setRoundPicks([]);
      setIsTransitioning(false);
    }
  }, [roundPicks, cards, currentRound, fetchCards]);

  // NLP option tap — records answer; on 3rd tap, calls fingerprint API and navigates
  const handleNlpOptionTap = useCallback(
    async (opt: NlpOption) => {
      if (nlpSubmitting) return;

      // All NLP options use v2Deltas — ACCUMULATE across all 3 questions so every
      // answer contributes to the fingerprint (not just the last one).
      let isTiebreaker = false;
      if (opt.v2Deltas) {
        const currentDeltas = useFingerprintStore.getState().tiebreakerDeltas ?? Array(6).fill(0) as number[];
        const accumulated = opt.v2Deltas.map((d, i) => (currentDeltas[i] ?? 0) + d) as number[];
        useFingerprintStore.getState().setTiebreakerDeltas(accumulated);
        isTiebreaker = true;
      }

      const newAnswer: NlpAnswer = { questionId: opt.questionId, choiceIndex: opt.choiceIndex, isTiebreaker };
      const newAnswers = [...nlpAnswers, newAnswer];
      setNlpAnswers(newAnswers);

      if (newAnswers.length < nlpQuestions.length) return;

      // All 3 answered — compute fingerprint then navigate to step-3
      setNlpSubmitting(true);
      const store = useFingerprintStore.getState();

      try {
        const res = await fetch("/api/quiz/fingerprint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phase_a_selections: [],
            grid_selections: store.gridSelections,
            phase_b_responses: store.phaseBResponses,
            non_visual_responses: newAnswers.filter((a) => !a.isTiebreaker),
            room_type: store.roomType ?? "living_room",
            budget_tier: store.budgetTier,
            tiebreaker_deltas: store.tiebreakerDeltas ?? null, // all 3 accumulated deltas
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.fingerprint) {
            store.setFingerprint(
              data.fingerprint,
              data.style_name ?? "Your Unique Style",
              data.style_tags ?? [],
            );
            store.setCompetingStyles(
              data.competing_styles ?? [],
              data.blend_ratio ?? 1.0,
            );
          }
        }
      } catch {
        // Navigate anyway — step-3 can recover
      }

      router.push("/design/step-3");
    },
    [nlpAnswers, nlpSubmitting, nlpQuestions, router],
  );

  const nlpQuestionIndex = nlpAnswers.length;
  const currentNlpQuestion = nlpQuestions[nlpQuestionIndex];

  return (
    <main
      className="cova-page"
      onMouseMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        setPointer({
          x: ((event.clientX - bounds.left) / bounds.width) * 100,
          y: ((event.clientY - bounds.top) / bounds.height) * 100,
        });
      }}
    >
      <div className="cova-ambient-layer" />
      <div
        className="cova-pointer-glow"
        style={{
          background: `radial-gradient(circle at ${pointer.x}% ${pointer.y}%, rgba(201,168,76,0.16), rgba(201,168,76,0.06) 22%, rgba(9,24,41,0) 54%)`,
        }}
      />
      <div className="cova-grid-overlay" />
      <div className="cova-noise-overlay" />

      {/* Gold flash overlay between rounds */}
      <div className={`cova-round-flash ${showFlash ? "is-active" : ""}`} />

      <section className="cova-shell">
        <header className="cova-header">
          <button
            type="button"
            className="cova-icon-button"
            aria-label="Go back"
            onClick={() => {
              if (phase === "nlp") {
                // Back to grid round 3 — cards still in state, phase change re-fetches
                setNlpAnswers([]);
                setPhase("grid");
              } else if (phase === "grid" && currentRound > 1) {
                // Back to previous round
                const store = useFingerprintStore.getState();
                const prevRound = currentRound - 1;
                const remaining = store.gridSelections.filter((g) => g.round !== prevRound);
                store.clearGridSelections();
                remaining.forEach((g) => store.addGridSelection(g));
                void fetchCards(prevRound);
                setCurrentRound(prevRound);
                setRoundPicks([]);
                setTiltStyles({});
                setGridKey((k) => k + 1);
              } else if (phase === "grid") {
                setPhase("room");
                setCurrentRound(1);
                setRoundPicks([]);
                setCards([]);
                useFingerprintStore.getState().clearGridSelections();
              } else {
                router.push("/design/step-1");
              }
            }}
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
              <div className="cova-progress-fill" style={{ width: progressWidth }} />
            </div>
          </div>

          <div className="cova-step-meta">
            <span>Step 1 of 4</span>
            <span>Style quiz phase</span>
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
              className="cova-grid"
              aria-label="Room type selection"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "1rem",
                padding: "1.5rem",
                maxWidth: "900px",
                margin: "0 auto",
              }}
            >
              {ROOM_TYPES.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => {
                    useFingerprintStore.getState().setRoomType(room.id);
                    useFingerprintStore.getState().clearGridSelections();
                    setCurrentRound(1);
                    setRoundPicks([]);
                    setPhase("grid");
                  }}
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
            </section>
          </>
        )}

        {/* ── 3-round style grid ── */}
        {phase === "grid" && (
          <div className="cova-grid-phase">
            <div className="cova-round-header">
              <p className="cova-round-eyebrow">{ROUND_COPY[currentRound - 1]!.eyebrow}</p>
              <h2 className="cova-round-title">{ROUND_COPY[currentRound - 1]!.title}</h2>
              <p className="cova-round-subtitle">{ROUND_COPY[currentRound - 1]!.subtitle}</p>
            </div>

            <div className="cova-round-pips">
              {[1, 2, 3].map((r) => (
                <div
                  key={r}
                  className={`cova-round-pip ${
                    r < currentRound ? "is-done" : r === currentRound ? "is-active" : ""
                  }`}
                />
              ))}
            </div>

            <div
              key={gridKey}
              className={`cova-style-grid ${isTransitioning ? "is-exiting" : "is-entering"}`}
            >
              {cards.map((card) => {
                const isSelected = roundPicks.includes(card.style_index);
                const isDisabled = roundPicks.length >= 2 && !isSelected;
                return (
                  <button
                    key={card.id}
                    type="button"
                    className={`cova-style-card ${isSelected ? "is-selected" : ""} ${isDisabled ? "is-disabled" : ""}`}
                    onClick={() => handleCardClick(card)}
                    onMouseMove={(e) => handleMouseMove(e, card.style_index)}
                    onMouseLeave={() => handleMouseLeave(card.style_index)}
                    style={tiltStyles[card.style_index]}
                  >
                    <img
                      className="cova-style-card__image"
                      src={card.image_url}
                      alt={toCardDisplayName(card.style_name)}
                      draggable={false}
                    />
                    <div className="cova-style-card__overlay" />
                    <div className="cova-style-card__label">{toCardDisplayName(card.style_name)}</div>
                    <div className="cova-style-card__check">
                      <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                        <path
                          d="M1 4L4 7.5L10 1"
                          stroke="#0A1628"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="cova-round-cta">
              <button
                type="button"
                className="cova-round-btn"
                disabled={roundPicks.length < 2}
                onClick={() => { void handleNextRound(); }}
              >
                {currentRound < 3 ? "Next Round \u2192" : "Continue \u2192"}
              </button>
              <p className={`cova-pick-counter ${roundPicks.length === 2 ? "is-ready" : ""}`}>
                {roundPicks.length === 2
                  ? "\u2713 Ready \u2014 tap to continue"
                  : `${roundPicks.length} of 2 selected`}
              </p>
            </div>
          </div>
        )}

        {/* ── NLP questions ── */}
        {phase === "nlp" && !nlpSubmitting && currentNlpQuestion && (
          <div className="cova-nlp-phase">
            <div className="cova-round-header">
              <p className="cova-round-eyebrow">Almost there — {nlpQuestionIndex + 1} of {nlpQuestions.length}</p>
              <h2 className="cova-round-title">{currentNlpQuestion.question}</h2>
            </div>
            <div className="cova-nlp-options">
              {currentNlpQuestion.options.map((opt, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="cova-nlp-option"
                  onClick={() => { void handleNlpOptionTap(opt); }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === "nlp" && nlpSubmitting && (
          <div className="cova-nlp-phase">
            <div className="cova-round-header">
              <p className="cova-round-eyebrow">\u2736 Building your profile</p>
              <h2 className="cova-round-title">Analyzing your taste\u2026</h2>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
