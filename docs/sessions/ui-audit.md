# Cova V1 — UI Audit
**Date:** 2026-04-05  
**Scope:** Landing page + Steps 1–3  
**Read-only — no code changes made**

---

## Summary Table

| File | Lines | Status |
|------|-------|--------|
| `app/page.tsx` | 1,127 | ⚠️ 3 rule violations, 2 stale values |
| `app/design/step-1/page.tsx` | 669 | ⚠️ Duplicate step indicator, dead CTA label |
| `app/design/step-2/page.tsx` | 536 | ⚠️ Duplicate step indicator, progress bar quirk |
| `app/design/step-3/page.tsx` | 889 | ✅ Mostly clean (anchor_renders fix applied) |

---

## 1. `apps/web/app/page.tsx`

**Line count:** 1,127  
**Route:** `/` (root landing page)

### Key Sections

| Lines | Section |
|-------|---------|
| 1–27 | State declarations (16 useState + 5 useRef) |
| 28–79 | Data: `rooms`, `fingerprints`, `axisLabels`, `axisDescriptions` |
| 81–257 | 9 × useEffect: intro typing, room cycling, fingerprint cycling, drag events, particle canvas, CTA canvas, Three.js CDN load |
| 259–303 | Helper functions: `handleCTAClick`, `getRadarPath`, `getRadarPoints`, `getRoomSVGs` |
| 305–457 | Hero section: intro overlay, nav, before/after divider |
| 458–693 | "How it works" 3-step section with hotspot demo |
| 698–786 | Interactive radar (Style Intelligence section) |
| 790–887 | Smart Integration section |
| 891–1091 | Transformation gallery carousel (SVG-rendered cards) |
| 1095–1110 | Final CTA section with animated canvas |
| 1111–1126 | Footer |

### Rule Violations

**🚨 RULE 1 VIOLATION — sessionStorage used (lines 82–94)**
```tsx
const seen = sessionStorage.getItem("seen_intro")          // line 82
sessionStorage.setItem("seen_intro", "true")               // line 94
```
CLAUDE.md Rule 1: "NEVER use localStorage or sessionStorage." The intro "seen" flag is stored in sessionStorage. This is the landing page and doesn't involve auth, but it's still a hard rule violation.

**🚨 RULE 8 VIOLATION — Forbidden style names visible to users (lines 30–46, 425)**
```tsx
{ name: "NORDIC MINIMAL", ... }    // line 30
{ name: "WARM JAPANDI", ... }      // line 38 ← "Japandi" is forbidden
{ name: "ORGANIC MODERN", ... }    // line 44
```
These names render in the hero's bottom-right label at line 425:
```tsx
<span ...>{rooms[currentRoom].name}</span>   // shows "WARM JAPANDI" to user
```
Also `fingerprints[1].name = "Cool Minimalist"` (line 51) and `getStyleName` can return `"Japandi"` (line 76) — both user-facing.

**🚨 RULE 9 VIOLATION — Three.js loaded from CDN (lines 221–257)**
```tsx
script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
```
Three.js is loaded via a dynamically injected `<script>` tag from cdnjs. Rule 9 says never load SparkJS from CDN — and by extension any Three.js dependency should come from the npm package. Also, this loads an old version (r128 vs. the project's 0.183.2).

### Other Issues

**© 2025 in footer (line 1117)** — current year is 2026.
```tsx
<span ...>© 2025 Cova. All rights reserved.</span>
```

**Stale product count (line 687):**
```tsx
"...catalog of 5,000+ products from 11 premium retailers."
```
M6 is complete — catalog is ~18,150 products across 12 retailers.

**`handleCTAClick` mutates `document.body.style` directly (lines 260–264):**
```tsx
document.body.style.transition = "transform 400ms ease, opacity 400ms ease"
document.body.style.transformOrigin = "center center"
document.body.style.transform = "perspective(1200px) rotateY(90deg) scale(0.8)"
document.body.style.opacity = "0"
```
This leaves body with `opacity: 0` if navigation is cancelled or slow. Should use CSS class toggle or Framer Motion.

**Shoppable demo Buy → links (line 673):** Button has no href/onClick — clicking "Buy →" does nothing. Fine for demo but worth noting.

### First 50 Lines

```tsx
"use client"

import { useEffect, useRef, useState } from "react"

export default function CovaLandingPage() {
  const [introPhase, setIntroPhase] = useState(0)
  const [hasSeenIntro, setHasSeenIntro] = useState(false)
  const [dividerPosition, setDividerPosition] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const [currentRoom, setCurrentRoom] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  const [currentFingerprint, setCurrentFingerprint] = useState(0)
  const [typedText, setTypedText] = useState("")
  const [activeAxis, setActiveAxis] = useState<number | null>(null)
  const [customFingerprint, setCustomFingerprint] = useState<number[] | null>(null)
  const [activeChip, setActiveChip] = useState<number | null>(null)
  const [activeCard, setActiveCard] = useState(0)
  const [cardDragStart, setCardDragStart] = useState<number | null>(null)
  const [activeHotspot, setActiveHotspot] = useState<number | null>(null)
  const [showSheet, setShowSheet] = useState(false)
  const [activeProduct, setActiveProduct] = useState<number | null>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const particleCanvasRef = useRef<HTMLCanvasElement>(null)
  const ctaCanvasRef = useRef<HTMLCanvasElement>(null)
  const threeContainerRef = useRef<HTMLDivElement>(null)
  const dragParticlesRef = useRef<...>([])

  const rooms = [
    { name: "NORDIC MINIMAL", type: "Living Room", beforeUrl: "...before-neutral.jpg", afterUrl: "...after-nordic-minimal.jpg" },
    { name: "WARM JAPANDI",   type: "Living Room", beforeUrl: "...before-neutral.jpg", afterUrl: "...after-warm-japandi.jpg" },
    { name: "ORGANIC MODERN", type: "Living Room", beforeUrl: "...before-neutral.jpg", afterUrl: "...after-organic-modern.jpg" },
  ]

  const fingerprints = [
    { name: "Warm Japandi", values: [0.7, 0.3, 0.8, 0.7, 0.4, 0.6], chips: [...] },
    { name: "Cool Minimalist", values: [0.8, 0.1, 0.2, 0.3, 0.2, 0.2], chips: [...] },
    { name: "Heritage Maximalist", values: [...], chips: [...] },
    { name: "Organic Modern", values: [...], chips: [...] },
  ]

  const axisLabels = ["Luminosity", "Density", "Temperature", "Form", "Era", "Texture"]
  const axisDescriptions = [
    { low: "Dark & Moody", high: "Bright & Airy" },
    ...
  ]

  const introText = "What if your room looked like this..."
```

---

## 2. `apps/web/app/design/step-1/page.tsx`

**Line count:** 669  
**Route:** `/design/step-1`

### Key Sections

| Lines | Section |
|-------|---------|
| 1–8 | Imports |
| 9–73 | Data: `COLORS`, `ROOMS` (9 items), `TIERS` (5 budget tiers) |
| 75–103 | `AnimatedHeadline` component |
| 106–245 | `RoomCard` component (with hover, selected state, checkmark, preset tooltip) |
| 248–358 | `TierCard` component (3D carousel card with transforms) |
| 361–493 | `BudgetCarousel` component (drag + keyboard + touch navigation) |
| 496–506 | `TIER_INDEX_TO_STORE` mapping |
| 508–669 | `CovaDesignStep1` main component |

### Issues

**Duplicate step indicator (lines 543, 555):**
```tsx
<StepIndicator currentStep={1} totalSteps={10} />   // line 543 — renders UI component

<div ...>Step 1 of 10</div>                          // line 555 — hardcoded text below it
```
Two "Step 1 of 10" labels render on the page simultaneously.

**CTA label is identical in both states (line 657):**
```tsx
{selectedRoom ? "Start Designing →" : "Start Designing →"}
```
Text is the same whether a room is selected or not. The button disables and changes color, but the label doesn't change. Presumably should read something like `"Select a room to continue"` when no room is selected, or just always say "Start Designing →" and let the disabled state communicate.

**All room images use `<img>` not `<Image>` (line 155):**
```tsx
<img src={room.imageUrl} alt={room.name} className="absolute inset-0 w-full h-full object-cover" ... />
```
9 room card images served from Supabase storage. Using Next.js `<Image>` would add caching, lazy loading, and format optimization. ESLint already warns about this.

**Budget carousel card overflow on narrow mobile:**  
`TierCard` width is `clamp(260px, 32vw, 300px)` with `translateX(position * 120px)`. Adjacent cards overlap and are positioned absolutely — on iPhone SE (320px width) the side cards (±120px offset) extend beyond screen edges.

### First 50 Lines

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { StepIndicator } from "@/components/cova/StepIndicator";
import { useFingerprintStore, useSessionStore } from "@/lib/store";

const COLORS = {
  background: "#091829",
  surface: "#0D2035",
  elevated: "#112540",
  gold: "#C9A84C",
  goldHover: "#D4B460",
  ivory: "#F5F0E8",
  muted: "#8A9BB5",
  subtle: "#4A5E7A",
  border: "rgba(201,168,76,0.20)",
  borderLight: "rgba(201,168,76,0.15)",
};

const ROOMS = [
  { id: "living-room",     name: "Living Room",     preset: false, imageUrl: "https://...living-room.jpg"     },
  { id: "bedroom",         name: "Bedroom",         preset: false, imageUrl: "https://...bedroom.jpg"         },
  { id: "studio",          name: "Studio",          preset: false, imageUrl: "https://...studio.jpg"          },
  { id: "home-office",     name: "Home Office",     preset: false, imageUrl: "https://...home-office.jpg"     },
  { id: "dining-room",     name: "Dining Room",     preset: false, imageUrl: "https://...dining-room.jpg"     },
  { id: "bathroom",        name: "Bathroom",        preset: false, imageUrl: "https://...bathroom.jpg"        },
  { id: "outdoor",         name: "Outdoor",         preset: false, imageUrl: "https://...outdoor.jpg"         },
  { id: "dorm-room",       name: "Dorm Room",       preset: true,  imageUrl: "https://...dorm-room.jpg"       },
  { id: "first-apartment", name: "First Apartment", preset: true,  imageUrl: "https://...first-apartment.jpg" },
];

const TIERS = [
  { id: 0, label: "Thrift",    range: "$500 – $2,000",    description: "Secondhand finds, DIY projects, budget retailers",         icon: "🪴" },
  { id: 1, label: "Balanced",  range: "$2,000 – $8,000",  description: "Mix of affordable and investment pieces",                   icon: "⚖️" },
  { id: 2, label: "Premium",   range: "$8,000 – $25,000", description: "Quality brands, custom options, designer touches",          icon: "✨" },
  { id: 3, label: "Luxury",    range: "$25,000 – $75,000",description: "High-end designers, bespoke furniture, art pieces",         icon: "💎" },
  { id: 4, label: "Ultra",     range: "$75,000+",          description: "No budget limits, exclusive access, white-glove service",  icon: "👑" },
];

function AnimatedHeadline({ text }: { text: string }) {
  const words = text.split(" ");
  return (
    <h1 className="font-serif text-center" style={{ fontSize: "clamp(32px, 5vw, 48px)", color: COLORS.ivory, ... }}>
      {words.map((word, i) => (
        <span key={i} className="inline-block" style={{ animation: `wordFadeIn 400ms ease forwards`, animationDelay: `${i * 120}ms`, ... }}>
          {word}
        </span>
      ))}
    </h1>
  );
}
```

---

## 3. `apps/web/app/design/step-2/page.tsx`

**Line count:** 536  
**Route:** `/design/step-2`

### Key Sections

| Lines | Section |
|-------|---------|
| 1–15 | Imports + `TOTAL_PAIRS = 19` + `Response` type |
| 17–72 | `completeQuiz` callback (calls fingerprint API → navigates to step-3) |
| 74–135 | `handleSelection`, `handleBack`, `handlePointerDown/Up` |
| 137–141 | Enter animation useEffect |
| 143–185 | `getCardStyle`, `getCardTransition` (animation state machines) |
| 187–443 | JSX: fixed-viewport layout (TOP/MIDDLE/BOTTOM zones) |
| 511–534 | `<style jsx>` animations: counterPop, checkBadge, diamondPulse |

### Issues

**Duplicate step indicator (lines 192, 229):**
```tsx
<StepIndicator currentStep={2} totalSteps={10} />   // line 192 — component

<p ...>Step 2 of 10</p>                              // line 229 — hardcoded text
```
Same problem as Step 1 — the `StepIndicator` component renders and the hardcoded text renders below it.

**Progress bar formula starts at 9%, ends at 18% (line 36):**
```tsx
const progressWidth = ((currentPair / TOTAL_PAIRS) * 9 + 9).toFixed(1);
```
At pair 0/19: width = 9%. At pair 18/19 (last): width ≈ 17.5%. The bar never fills — this represents the proportion of total 10-step progress this quiz represents (9% of the overall journey). This is intentional design but may read as a broken progress bar to users.

**Skip always records `chosen: "B"` (lines 458–460):**
```tsx
const newResponse: Response = {
  chosen: "B",    // always B, not null/skip
  superLiked: false,
};
```
Skipping a pair silently biases the fingerprint toward "B" responses. Likely should be recorded differently or excluded from fingerprint calculation.

**`TOTAL_PAIRS = 19` hardcoded but QUIZ_PAIRS may vary (lines 9, 21):**
```tsx
const TOTAL_PAIRS = 19;
const pairs = QUIZ_PAIRS[roomType ?? "living-room"] ?? QUIZ_PAIRS["living-room"]!;
```
If a room type has fewer than 19 pairs, the quiz will index past the array end and `activePair` will be `undefined`. `currentPair === TOTAL_PAIRS - 1` comparison is safe, but `pairs[currentPair]` would be undefined for missing pairs — mitigated by the fallback `pairId` string, but still a latent bug.

**`<img>` instead of `<Image>` (lines 279–285, 379–385):**  
Both quiz card images (imageA and imageB) use raw `<img>` tags. ESLint warns about this.

### First 50 Lines

```tsx
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
  const { roomType, setFingerprint } = useFingerprintStore();
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

  // Progress width based on cards answered
  const progressWidth = ((currentPair / TOTAL_PAIRS) * 9 + 9).toFixed(1);

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
          body: JSON.stringify({ responses: apiResponses, entry_path: "pairs", room_type: roomType ?? "living-room" }),
        });
```

---

## 4. `apps/web/app/design/step-3/page.tsx`

**Line count:** 889  
**Route:** `/design/step-3`

### Key Sections

| Lines | Section |
|-------|---------|
| 1–8 | Imports (includes `createBrowserClient` after anchor_renders fix) |
| 9–24 | `axisLabels`, `adjustChips`, `derivepalette`, `mockData` |
| 26–74 | State declarations (22 useState + 1 useRef) |
| 76–116 | `loadShowcaseImages` useEffect (anchor_renders query, post-fix) |
| 118–231 | Phase 1 animation sequence useEffect (10 timed stages) |
| 233–238 | `feelRightVisible` useEffect (triggers after all cards loaded) |
| 240–262 | `proceedToPhase2` (divider + card stagger + scroll) |
| 264–336 | `handleChipToggle`, `handleRegenerate` (fingerprint refinement + re-query anchor_renders) |
| 338–385 | Radar chart math helpers |
| 386–810 | Phase 1 JSX: iris, radar chart SVG, palette, chips, auth buttons |
| 632–807 | Phase 2 JSX: divider, heading, 3 showcase cards, "Feel right?" CTA |
| 808–911 | Adjust panel overlay + animations |

### Issues (post anchor_renders fix)

**`STOCK_PHOTOS.url` unused (lines 33–37):**
```tsx
const STOCK_PHOTOS = stockPhotosForRoom.map((p, i) => ({
  url: p.url,    // ← never read after fix
  name: "...",
}))
```
`url` was needed for the deleted render calls. Now only `name` is consumed in the JSX card labels. The `url` field is harmless dead code.

**Card labels don't match anchor_renders (line 664):**
```tsx
{STOCK_PHOTOS.map((photo, i) => (
  <span ...>{photo.name}</span>   // "Living Room 1", "Living Room 2", "Living Room 3"
```
The images come from `anchor_renders` which has its own `label` field (not loaded). Users see generic "Living Room 1" labels instead of the actual anchor_renders labels (e.g. "Warm Japandi Living Room").

**"Share your Design DNA" button has no onClick (lines 400–423):**
```tsx
<button className="fixed top-6 right-6 ...">
  <svg ...>{/* share icon */}</svg>
  <span>Share your Design DNA</span>
</button>
```
No handler attached — clicking is a no-op.

**3 cards always shown even if fewer than 3 anchor_renders rows:**  
If `anchor_renders` returns 1 or 2 rows for a room type, `renderUrls[2]` (or `[1]`, `[2]`) stays `null`. With `cardsLoaded[i] = true`, this triggers the "Preview unavailable" fallback UI rather than a loading shimmer. Acceptable behavior but worth flagging.

**`mockData` indirection (line 24):**
```tsx
const mockData = { palette: [1, 2, 3, 4, 5] }
// Used only as:
{mockData.palette.forEach((_, i) => ...)}
```
Could be `const PALETTE_COUNT = 5` or just the literal `[0,1,2,3,4]`.

### First 50 Lines

```tsx
"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useFingerprintStore } from "@/lib/store"
import { STOCK_PHOTOS as QUIZ_STOCK_PHOTOS } from "@/lib/ai/quiz-data"
import { StepIndicator } from "@/components/cova/StepIndicator"
import { createBrowserClient } from "@/lib/supabase/client"

const axisLabels = ["Luminosity", "Density", "Temperature", "Form", "Era", "Texture"]
const adjustChips = ["Warmer", "Cooler", "More minimal", "More layered", "More modern", "More classic"]

function derivepalette(fp: number[]): string[] {
  const warm = fp[2] > 0.5
  const bright = fp[0] > 0.5
  if (warm && bright)  return ["#C9A84C", "#D4956A", "#8B6914", "#F5E6C8", "#3D2010"]
  if (warm && !bright) return ["#8B6914", "#5C3D1A", "#3D2010", "#C9A84C", "#1A0E08"]
  if (!warm && bright) return ["#8A9BB5", "#6A8AA0", "#4A6E8A", "#F5F0E8", "#1A2A3A"]
  return ["#4A5E7A", "#2A3A4A", "#1A2A3A", "#8A9BB5", "#091829"]
}

const mockData = { palette: [1, 2, 3, 4, 5] }

export default function Step3Page() {
  const router = useRouter()
  const { fingerprint: storedFingerprint, styleName: storedStyleName, roomType } = useFingerprintStore()

  const stockPhotosForRoom = QUIZ_STOCK_PHOTOS[roomType ?? "living-room"] ?? QUIZ_STOCK_PHOTOS["living-room"] ?? []
  const STOCK_PHOTOS = stockPhotosForRoom.map((p, i) => ({
    url: p.url,
    name: (roomType ?? "living-room").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) + ` ${i + 1}`,
  }))

  const [fingerprint, setFingerprint] = useState<number[]>(
    storedFingerprint ?? [0.7, 0.3, 0.8, 0.7, 0.4, 0.6, 0.5, 0.5, 0.5, 0.5]
  )
  const [styleName, setStyleName] = useState(storedStyleName ?? "Warm Japandi")
  const [styleChips, setStyleChips] = useState<string[]>([
    "organic textures", "warm neutrals", "minimal layers", "natural materials"
  ])
  const palette = derivepalette(fingerprint)

  // Render URLs — populated from anchor_renders table
  const [renderUrls, setRenderUrls] = useState<(string | null)[]>([null, null, null])
  ...
```

---

## Issues by Priority

### 🚨 Rule Violations (must fix)

| File | Issue | CLAUDE.md Rule |
|------|-------|----------------|
| `page.tsx:82,94` | `sessionStorage` used for intro-seen flag | Rule 1 |
| `page.tsx:38` | `"WARM JAPANDI"` rendered as user-facing label | Rule 8 |
| `page.tsx:76` | `getStyleName` can return `"Japandi"` to the UI | Rule 8 |
| `page.tsx:221` | Three.js r128 loaded from CDN | Rule 9 (spirit) |

### ⚠️ Functional Issues

| File | Issue |
|------|-------|
| `step-1:543,555` | "Step 1 of 10" rendered twice (StepIndicator + hardcoded div) |
| `step-2:192,229` | "Step 2 of 10" rendered twice (StepIndicator + hardcoded text) |
| `step-2:36` | Progress bar only reaches 18% at quiz completion |
| `step-2:458` | Skip records `chosen: "B"` — biases fingerprint |

### 📝 Minor / Cosmetic

| File | Issue |
|------|-------|
| `page.tsx:1117` | Copyright says © 2025, should be © 2026 |
| `page.tsx:687` | "5,000+ products" — stale (now ~18,150) |
| `page.tsx:260` | `document.body.style` mutations for CTA transition |
| `step-1:657` | CTA label identical in enabled/disabled state |
| `step-3:34` | `STOCK_PHOTOS.url` is dead code after anchor_renders fix |
| `step-3:400` | "Share your Design DNA" button has no handler |
| `step-3:664` | Card labels use "Living Room 1" instead of anchor_renders labels |

---

*No files were modified. This is a read-only audit.*
