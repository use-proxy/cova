# Phase 10 — Landing Page

**Cova V1 implementation · Phase 10 of 12 · Self-contained**

---

## Phase identity

| | |
|---|---|
| **Phase number** | 10 of 12 |
| **Goal** | Replace placeholder landing at covainterior.com with editorial 11-beat scroll-pinned cinematic. Convert visitors into signups. 6-7 chained Veo 3.1 clips + 2 static overlays. Performance budget LCP <2.5s 3G, <30MB mobile. |
| **Executor session estimate** | 3–4 sessions |
| **Calendar estimate** | 2–3 weeks (most complex UI in V1, including Veo production time) |
| **Predicted Claude credits** | ~$60–90 |
| **Predicted infra spend** | ~$10–15 (Veo 3.1 clip generation via Draftly Pro one-time, R2 storage, test render fixtures) |
| **Depends on** | Phase 1 closed (auth + legal pages); can run parallel to Phases 5/6/7/8/9 |
| **Blocks** | Phase 12 deployment (smoke test traverses landing → signup) |

---

## 1. The session loop for this phase

1. **Open new claude.ai chat.** Paste this entire phase doc.
2. **Chat summarizes back.** Confirms understanding, lists gaps. You confirm.
3. **Planner fires.** Fresh Claude Code session. Drift check confirms Phase 1 closed (auth routes work). Confirms Cloudflare R2 zone configured (Phase 1 M3) for frame hosting. Uses Context7 MCP for: current GSAP ScrollTrigger patterns, current Lenis smooth-scroll v1.x API, current Next.js 14 priority Image patterns, current Cloudflare Images URL transformations. Uses EXA MCP for: scroll-pinned cinematic patterns (Apple-style), Veo 3.1 frame extraction workflows, web-vitals optimization for video-heavy pages. Uses web search for: current Veo 3.1 + Draftly Pro pricing, current Veo prompting best practices. Writes executor prompt to `cova-plan/planner-output/P10-executor-prompt.md`.
4. **Executor prompt returns.** Verify covers all 11 beats, performance budget, reduced-motion path, mobile compression. Critical: confirms Veo prompts ready to fire (Daksh runs them in Draftly Pro before executor session).
5. **Executor fires.** 3–4 sessions. Production work split: session 1 = Veo prompts + asset infrastructure; session 2 = layout + scroll mechanics; session 3 = static overlays + reduced motion + performance tuning.
6. **Verifier session 1 fires.** Reviews scroll math (beat positions in pixels), frame loading strategy, performance budget compliance, reduced-motion alternatives, signup CTA wiring, accessibility (skip-link, keyboard nav). Self-heals.
7. **Verifier session 2 fires.** Independent. Hunts for: layout shift on frame load, CLS budget violations, reduced-motion path missing assets, mid-CTA scroll-jump bugs, mobile compression failures.
8. **Manual screenshot review.** §15 click-script. ~30 screenshots covering all 11 beats + scroll states + mid-CTA + reduced motion + mobile. Plus 1 video recording of full scroll-through.
9. **Document updates.** `PHASE_STATUS.md`, `OPEN_DECISIONS.md`, `EMPIRICAL_FINDINGS.md` (LCP/CLS/INP measurements, asset weight totals, scroll-progress smoothness FPS).

---

## 2. Prereq verification

### Phase 1 closure + asset prerequisites
- `PHASE_STATUS.md` shows P1 → CLOSED
- /auth/signup operational (Phase 1)
- /terms and /privacy live
- Cloudflare R2 bucket `cova-landing-frames` provisioned
- Cloudflare Images zone configured for transformations
- Vercel Pro tier active (function limits + analytics)
- Resend account active (for the contact form if added)
- Veo 3.1 access via Draftly Pro confirmed; Daksh has account credits
- Sarah M Brooklyn testimonial: placeholder locked per D-021; real testimonial will replace post-launch

### Halt conditions
- /auth/signup returns 5xx → halt, fix in Phase 1 remediation
- Cloudflare R2 not reachable → halt
- Daksh hasn't generated Veo clips yet → halt, generate first
- Required MCPs not connected → halt

---

## 3. Pre-decisions

**G1. The 11 beats (locked).** Sequence:

| Beat | Approx scroll | Type | Content |
|---|---|---|---|
| 1 — Hero opening | 0-700px | Veo clip 1 | Cinematic camera move through editorial threshold; logo holds; headline letter-stagger reveals |
| 2 — Pain frame | 700-1400px | Veo clip 2 | Camera through cluttered/uninspired room; desaturated; caption |
| 3 — Quiz preview | 1400-2300px | Static overlay | Mock quiz pair animation (rendy-style hover) over dimmed Veo backdrop |
| 4 — Style fingerprint | 2300-3200px | Static overlay | Mock fingerprint visualization with arcs growing |
| 5 — Capture moment | 3200-4000px | Veo clip 3 | Camera circling a phone with room photo on screen |
| 6 — Personalization detail | 4000-4700px | Static overlay | HTML detail orbits — 3 floating cards (art, smart-tech, lighting) over Veo backdrop |
| 7 — Render reveal (mid-CTA Beat) | 4700-5500px | Veo clip 4 | Cinematic transition from raw room to redesigned room; CTA appears |
| 8 — Refine | 5500-6100px | Veo clip 5 | Quick refinement loop visualization |
| 9 — Shop hotspots | 6100-6700px | Veo clip 6 | Camera over rendered room with hotspot dots pulsing |
| 10 — Testimonial | 6700-7100px | Static + dim Veo | Sarah M Brooklyn placeholder testimonial overlay |
| 11 — Close CTA | 7100-7600px | Veo clip 7 (closing) | Final cinematic frame; "Start free" CTA + privacy reassurance + footer |

**Total scroll height:** ~7600px desktop / ~5000px mobile (compressed; some beats merged or shortened on mobile).

**G2. Veo 3.1 clips (6-7 needed).** *Resolution:* Daksh generates via Draftly Pro before M-landing executor fires. Each clip ~150-300 frames @ 24fps = 6-12s of motion. Frames extracted as WebP q88. ~$1 per clip generation, ~$7 total one-time.

**G3. Sarah M Brooklyn testimonial (locked per D-021).** *Resolution:* placeholder copy:

> *"I was skeptical that AI could understand my taste. Cova somehow made our living room feel like the version we'd been imagining for years."*  
> — Sarah M., Brooklyn

V1.5 replaces with real beta-tester testimonial.

**G4. Mid-CTA Beat 7 (locked).** *Resolution:* CTA appears at frame 460-510 of Beat 7 (the render reveal moment). Sticky-positioned over the cinematic so user can click without scrolling further. CTA copy: *"Start free →"* gold pill. Routes to /auth/signup. Microcopy below: *"7 free designs to start."*

**G5. Sticky scroll progress indicator (locked).** *Resolution:* bottom-right, 1px gold vertical bar that fills as user scrolls. 200×4px on desktop, 80×3px on mobile. Hidden until user scrolls 300px. Fade out after 2s of scroll-stillness.

**G6. Performance budget (locked).**
- LCP <2.5s on simulated Slow 4G
- CLS = 0 (zero layout shift)
- INP <200ms
- Total page weight <30MB on mobile, <60MB on desktop
- Scroll FPS sustained ≥50 on devices ≥4 years old

**G7. Reduced motion path (locked).** *Resolution:* if `prefers-reduced-motion: reduce`, replace cinematic with 3 editorial photographs in vertical scroll (no scroll-pin, no GSAP, no Lenis). Static caption overlays per photo. Same 3 CTAs. Same content essence, ~95% lighter weight.

**G8. Cloudflare R2 cache strategy (locked).** *Resolution:* hashed filenames (e.g. `beat-1-frame-001-abc123.webp`). Cache-Control: `public, max-age=31536000, immutable` (1 year). Updates via filename hash change.

**G9. Mobile compression strategy.** *Resolution:* mobile delivers ~50% fewer frames per Veo clip (every other frame skipped at runtime; smooth-tween between). Mobile WebP q80 vs desktop q88. Total mobile budget ~25MB, desktop ~50MB.

**G10. SEO + share metadata.** *Resolution locked:*
- `<title>`: "Cova — AI interior design that knows your taste."
- `<meta name="description">`: "Take a 90-second style quiz. Upload one photo. See your room redesigned, then shop the pieces."
- OG image: editorial render at `/public/og-cova-1200x630.jpg`
- Twitter card: same as OG, `summary_large_image`
- JSON-LD: SoftwareApplication schema with name, description, applicationCategory, offers (free)

**G11. Auto-redirect signed-in users.** *Resolution locked:* if user opens covainterior.com while signed in with valid session, redirect to /dashboard (or /onboarding/welcome if quiz incomplete). Implemented via middleware.

**G12. localStorage `cova_landing_seen` flag.** *Resolution locked:* set on first visit. Used post-launch to A/B test variants (V1.5). V1 uses it only for analytics: distinguish first-visit vs returning-visit conversions in PostHog.

---

## 4. Background context (self-contained)

### 4.1 What landing delivers

After Phase 10:
- Cova landing at covainterior.com is a polished editorial cinematic that converts visitors → signups
- 11-beat narrative: hook → problem → quiz → fingerprint → capture → personalize → render reveal (mid-CTA) → refine → shop → testimonial → close CTA
- Two CTAs primary: mid-CTA at Beat 7 ("Start free") and close-CTA at Beat 11 ("Start free")
- Reduced-motion path for users with motion sensitivity
- Mobile-optimized with ~50% asset reduction
- Performance: LCP <2.5s, CLS=0, INP <200ms

### 4.2 Tech stack

| Layer | Tool | Notes |
|---|---|---|
| Frame hosting | Cloudflare R2 + Cloudflare Images | Hashed filenames, 1y immutable cache |
| Video frames | Veo 3.1 via Draftly Pro | 6-7 clips, ~$7 one-time |
| Frame extraction | ffmpeg locally (one-time) | WebP q88 desktop, q80 mobile |
| Smooth scroll | Lenis | Configured for cinematic feel |
| Scroll-pinned beats | GSAP ScrollTrigger | Pin sections, scrub frames |
| Frame painting | Single canvas with frame-by-frame rAF | One canvas, painted as scroll progresses |
| Static overlays | HTML/SVG/Framer Motion | Beats 3-4 (quiz/fingerprint), Beat 6 (personalization) |
| Reduced motion | Static photos in scroll | No GSAP, no Lenis |
| Performance | Next.js Image priority for hero | Lazy-load downstream beats |
| SEO | Next.js Metadata API + JSON-LD | static + dynamic |

### 4.3 The 11-beat narrative + caption copy (locked)

**Beat 1 — Hero opening (Scroll 0–700px)**
- Veo clip: cinematic dolly through editorial threshold (warm-wood doorframe with daylight beyond)
- Logo: Cova gold, top-left, holds during entire scroll-progress
- Headline reveal: letter-stagger 80ms, EB Garamond Light Italic 96px gold:
  > *"Your home, the way you've been imagining it."*
- Subhead fade-in 300ms after headline, EB Garamond Italic 28px ivory 80%:
  > *"Cova is interior design built around your taste."*
- Microcopy bottom:
  > *"Scroll to begin."* DM Sans 13px tracking 0.18em uppercase ivory 50%

**Beat 2 — Pain frame (Scroll 700–1400px)**
- Veo clip: camera through a slightly cluttered, uninspired room, desaturated palette, slight haze
- Caption fades in mid-beat:
  > *"You've seen what you don't want."*
- Subcaption:
  > *"Now we'll show you what you do."*

**Beat 3 — Quiz preview (Scroll 1400–2300px)**
- Veo dimmed to 30% opacity background
- Static overlay: mock quiz pair (HTML/CSS rendy-style hover, parallax tilt)
- Caption above pair:
  > *"Twelve picks. Your style emerges."*
- Pair hovers and "select" animates 1.5s
- New pair fades in at scroll 2000px

**Beat 4 — Style fingerprint (Scroll 2300–3200px)**
- Veo dimmed
- Static overlay: SVG fingerprint with 3 concentric arcs growing to hardcoded percentages (Warm Japandi 73%, Coastal 18%, Mid-Century 9%) — sample fingerprint, not user-specific
- Caption:
  > *"This is what your taste actually looks like."*
- Tertiary caption italic:
  > *"Not a label. A composition."*

**Beat 5 — Capture moment (Scroll 3200–4000px)**
- Veo clip: camera circling a phone showing a room photo on its screen, then phone fades and the room takes over the frame
- Caption:
  > *"Then you upload one photo."*
- Subcaption:
  > *"That's it. We do the rest."*

**Beat 6 — Personalization detail (Scroll 4000–4700px)**
- Veo dimmed
- Static overlay: 3 floating cards orbit centerpiece, each labeled
  - "Art" — small mock composition card
  - "Smart tech" — small product card with Sonos-shape silhouette
  - "Lighting" — small mood-card with warm-cozy preview
- Caption:
  > *"You add what makes it yours."*

**Beat 7 — Render reveal + MID-CTA (Scroll 4700–5500px)**
- Veo clip: cinematic transition from raw cluttered room to redesigned editorial-grade room. Frame 460-510 holds on the reveal moment.
- Headline mid-beat:
  > *"Your room. Designed for you."*
- **MID-CTA appears at frame 460:** "Start free →" gold pill + microcopy *"7 free designs to start."*
- CTA sticky-positioned over Veo so user can click without scrolling further
- After Beat 7, CTA un-stickies (re-appears at Beat 11)

**Beat 8 — Refine (Scroll 5500–6100px)**
- Veo clip: quick refine loop — text appears "darker sofa," scene re-renders, text appears "more warm light," scene re-renders again
- Caption:
  > *"Don't love something? Just say so."*

**Beat 9 — Shop hotspots (Scroll 6100–6700px)**
- Veo clip: camera over rendered room with gold hotspot dots pulsing on furniture/decor
- Caption:
  > *"And every piece? You can shop it."*

**Beat 10 — Testimonial (Scroll 6700–7100px)**
- Veo dimmed
- Static testimonial overlay (Sarah M Brooklyn, locked per D-021):
  > *"I was skeptical that AI could understand my taste. Cova somehow made our living room feel like the version we'd been imagining for years."*
  > — Sarah M., Brooklyn
- Layout: italic 28px serif quote, attribution DM Sans 14px gold

**Beat 11 — Close CTA (Scroll 7100–7600px)**
- Veo clip: closing cinematic frame (camera settles on the redesigned room from Beat 7, slight zoom out)
- Headline:
  > *"Ready to start?"*
- CTA: "Start free →" gold pill (primary)
- Secondary: "7 free designs · No credit card required."
- Footer below: links to /terms, /privacy, copyright "© 2026 Cova Inc."
- Cova logotype reverses to bottom-right small

### 4.4 Edge cases

- **Slow 4G (<2 Mbps):** show static fallback (single hero photo) until first 3 Veo frames load; then transition to cinematic. LCP target maintained.
- **JS disabled / no scroll:** static page with all beats stacked, all Veo clips replaced with hero frame stills, both CTAs clickable.
- **First visit:** localStorage `cova_landing_seen` set to true; PostHog event `landing_first_visit`.
- **Returning visit:** skip animation if user has visited 3+ times (configurable). PostHog `landing_returning_visit`.
- **Signed-in user lands:** middleware redirects to /dashboard (or /onboarding/welcome if quiz incomplete). Localhost may bypass for testing.
- **Veo asset fails to load:** fallback to static photo for that beat, log Sentry warning, beat caption still visible.
- **Mid-CTA hover/click on mobile:** CTA stays sticky throughout Beat 7 scroll range; on tap → routes to /auth/signup.
- **User scrolls back up after Beat 7 mid-CTA:** mid-CTA un-stickies if scroll <4700px (Beat 7 boundary).
- **OS reduced motion preference:** entire reduced-motion path served instead. No GSAP loaded.
- **Tab returns from background after long pause:** scroll position preserved, frames re-paint to current scroll.

---

## 5. Tech stack (detailed)

### Frame painting strategy

```typescript
// FilmCanvas component (single pinned canvas)
function FilmCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<Map<number, HTMLImageElement>>(new Map());
  
  useEffect(() => {
    // Load frames lazily based on current scroll position
    // Beat 1 frames priority-loaded
    // Beat 2-11 frames lazy-loaded as scroll approaches
  }, []);
  
  // GSAP ScrollTrigger updates currentFrameIndex as scroll progresses
  // rAF loop paints currentFrame to canvas
  
  return <canvas ref={canvasRef} className="film-canvas" />;
}
```

### GSAP ScrollTrigger setup
```typescript
gsap.registerPlugin(ScrollTrigger);

// Pin canvas for entire scroll
ScrollTrigger.create({
  trigger: '#landing-root',
  start: 'top top',
  end: 'bottom bottom',
  pin: '.film-canvas-pin-container',
});

// Per-beat scrub triggers
const beats = [
  { id: 1, startPx: 0, endPx: 700, frameStart: 0, frameEnd: 150, captionFadeIn: 0.3 },
  { id: 2, startPx: 700, endPx: 1400, frameStart: 151, frameEnd: 300, captionFadeIn: 0.4 },
  // ... 11 beats
];

beats.forEach((beat) => {
  ScrollTrigger.create({
    trigger: `#beat-${beat.id}`,
    start: `top center`,
    end: `bottom center`,
    onUpdate: (self) => {
      const progress = self.progress;
      const frameIdx = Math.floor(beat.frameStart + progress * (beat.frameEnd - beat.frameStart));
      paintFrame(frameIdx);
    },
  });
});
```

### Lenis smooth scroll
```typescript
const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
  smoothTouch: false, // critical: native scroll on mobile
});

function raf(time: number) {
  lenis.raf(time);
  ScrollTrigger.update();
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);
```

### Performance budget enforcement

```typescript
// Asset weight check at build time (CI)
// scripts/check-landing-weight.ts
const totalDesktopBytes = await measureLandingAssets('desktop');
const totalMobileBytes = await measureLandingAssets('mobile');

if (totalDesktopBytes > 60 * 1024 * 1024) throw new Error('Desktop > 60MB');
if (totalMobileBytes > 30 * 1024 * 1024) throw new Error('Mobile > 30MB');
```

### Reduced-motion fallback

```tsx
function LandingPage() {
  const reducedMotion = useReducedMotion(); // from framer-motion or media query
  
  if (reducedMotion) {
    return <LandingReducedMotion />;
  }
  return <LandingCinematic />;
}

function LandingReducedMotion() {
  return (
    <div>
      <Image src="/landing-photo-1.jpg" alt="Editorial room" priority />
      <Caption>Your home, the way you've been imagining it.</Caption>
      <Image src="/landing-photo-2.jpg" alt="Style fingerprint sample" />
      <Caption>Twelve picks. Your style emerges.</Caption>
      <Image src="/landing-photo-3.jpg" alt="Redesigned room" />
      <Caption>Your room. Designed for you.</Caption>
      <CTA href="/auth/signup">Start free →</CTA>
    </div>
  );
}
```

---

## 6. Scope

### 10A — Asset production (Daksh runs before executor session)

**Veo 3.1 prompts (drafted in cova-plan/landing/veo-prompts.md):**

```
Beat 1 — Hero opening
"Cinematic dolly shot through a warm-wood doorframe into an editorial 
modern interior. Daylight pours through tall windows. Soft golden-hour 
ambient. Slow camera movement, locked tripod feel. 24fps, 8 seconds."

Beat 2 — Pain frame
"Camera tracking through a cluttered, slightly uninspired room. Walls 
bare or wrong color. Furniture out of proportion. Desaturated palette, 
slight haze. Same camera language as Beat 1 but degraded mood. 24fps, 6 seconds."

Beat 5 — Capture moment
"Camera circling a phone held up showing an interior room photo on its 
screen. Phone is the focal point for 3 seconds, then fades to background 
as the room photo expands to fill the frame. 24fps, 7 seconds."

Beat 7 — Render reveal
"Cinematic transition from a cluttered raw room to a fully redesigned 
editorial-grade room. Crossfade with parallax depth. The redesigned 
room has Warm Japandi aesthetic. Hold on the redesigned room from 
frame 460-510 (the reveal moment). 24fps, 12 seconds."

Beat 8 — Refine
"Quick montage: text caption appears 'darker sofa' over a redesigned 
room, scene morphs to show darker sofa. Then text 'more warm light', 
scene morphs again. Subtle motion. 24fps, 6 seconds."

Beat 9 — Shop hotspots
"Camera slowly panning over a redesigned room. Gold hotspot dots pulse 
on furniture and decor pieces. Each dot pulses 1.0 → 1.2 scale on a 
2-second cycle. 24fps, 6 seconds."

Beat 11 — Closing
"Closing cinematic frame: camera settles on the redesigned editorial 
room from Beat 7, slight zoom out, hold. Soft golden ambient. 24fps, 5 seconds."
```

**Production steps:**
1. Daksh generates each clip in Draftly Pro (~$1 each, ~$7 total)
2. Downloads MP4 files
3. Runs ffmpeg locally to extract frames at 24fps:
   ```bash
   ffmpeg -i beat-1.mp4 -vf "fps=24,scale=1920:1080" -quality 88 frames/beat-1-frame-%03d.webp
   ```
4. Generates mobile variants (~50% frame skip + q80):
   ```bash
   ffmpeg -i beat-1.mp4 -vf "fps=12,scale=960:540" -quality 80 frames-mobile/beat-1-frame-%03d.webp
   ```
5. Uploads frames to R2 with hashed filenames (script generates SHA8 hashes)
6. Creates `cova-plan/landing/manifest.json` mapping beat → frame URLs

### 10B — Layout + scroll mechanics

1. **Page route:** `apps/web/app/page.tsx` (replaces current placeholder)
2. **Reduced-motion fork:** detect via `useReducedMotion()` hook
3. **Cinematic path:**
   - Lenis smooth scroll initialized
   - GSAP ScrollTrigger with pin
   - 11 beat sections with relative scroll positions
   - Single pinned canvas painting current frame
   - Static overlays for Beats 3, 4, 6 (HTML/SVG with Framer Motion)
   - Sticky scroll progress bottom-right
4. **Reduced motion path:**
   - 3 editorial photos in vertical scroll
   - Native scroll only
   - Same headline copy, no animation
5. **Top nav (sticky):**
   - Cova logotype gold left
   - "Skip to content" hidden link for keyboard users
   - "Sign in" link right (DM Sans 14px ivory 70% gold-hover)

### 10C — Static overlays + reduced motion + performance

1. **Beat 3 (Quiz preview) HTML overlay:**
   - 2 mock quiz cards positioned over dimmed Veo
   - Rendy.io hover effect on cards
   - Auto-loop "select" animation every 5s
2. **Beat 4 (Fingerprint) SVG overlay:**
   - Concentric arcs grow on scroll-into-view
   - Hardcoded percentages: Warm Japandi 73%, Coastal 18%, Mid-Century 9%
3. **Beat 6 (Personalization) HTML overlay:**
   - 3 floating cards in orbital animation
   - Art card, smart-tech card, lighting card
   - Each with hover state
4. **Beat 10 (Testimonial) overlay:**
   - Static centered quote + attribution
5. **Mid-CTA:**
   - Sticky-positioned during Beat 7 (scroll 4700-5500px)
   - Un-stickies above/below
   - Click → /auth/signup
6. **Close CTA:**
   - Beat 11 only
   - Same gold pill style
7. **Footer:**
   - /terms, /privacy, copyright
   - Below Beat 11
8. **Performance:**
   - Beat 1 frames priority-load
   - Beats 2-3 lazy-load when scroll approaches
   - Beats 4+ lazy-load aggressively
   - Asset weight CI check
   - Web Vitals tracking via PostHog

### 10D — Integration + review

- Wire mid-CTA + close-CTA to /auth/signup (Phase 1)
- Wire "Sign in" top nav link to /auth/signin
- Footer links to /terms and /privacy (Phase 1)
- Middleware redirect for signed-in users to /dashboard
- localStorage `cova_landing_seen` flag set on first visit
- PostHog events fire per spec
- Web Vitals (LCP, CLS, INP, FCP, TTFB) reported to PostHog via `web-vitals` lib
- Reduced motion path tested
- Mobile compression delivered correctly
- Verifier 7-phase: cinematic happy path + reduced-motion path + slow-4G fallback + asset-fail beat + scroll-back-after-mid-CTA + signed-in redirect

---

## 7. Out of scope

- A/B testing framework (V1.5 — but localStorage flag set for future use)
- Real testimonial replacement (V1.5; Sarah M Brooklyn locked placeholder)
- Localization beyond English (V2)
- Newsletter signup form (V1.5)
- Press / "as seen on" logos (V1.5)
- Designer marketplace teaser (V2)
- Video play controls (cinematic is scroll-controlled; no play/pause UI)
- Skip-to-end CTA (forces full scroll for narrative)
- Annotations / how-it-works section (Beat content covers this)

---

## 8. Files touched

### Created
- `apps/web/app/page.tsx` (replaces placeholder root)
- `apps/web/components/landing/LandingCinematic.tsx`
- `apps/web/components/landing/LandingReducedMotion.tsx`
- `apps/web/components/landing/FilmCanvas.tsx`
- `apps/web/components/landing/Beat1Hero.tsx`
- `apps/web/components/landing/Beat2Pain.tsx`
- `apps/web/components/landing/Beat3QuizOverlay.tsx`
- `apps/web/components/landing/Beat4FingerprintOverlay.tsx`
- `apps/web/components/landing/Beat5Capture.tsx`
- `apps/web/components/landing/Beat6PersonalizationOverlay.tsx`
- `apps/web/components/landing/Beat7RevealMidCta.tsx`
- `apps/web/components/landing/Beat8Refine.tsx`
- `apps/web/components/landing/Beat9Shop.tsx`
- `apps/web/components/landing/Beat10Testimonial.tsx`
- `apps/web/components/landing/Beat11CloseCta.tsx`
- `apps/web/components/landing/LandingNav.tsx`
- `apps/web/components/landing/LandingFooter.tsx`
- `apps/web/components/landing/ScrollProgressIndicator.tsx`
- `apps/web/components/landing/MidCta.tsx`
- `apps/web/components/landing/CloseCta.tsx`
- `apps/web/lib/landing/lenis-init.ts`
- `apps/web/lib/landing/scroll-trigger-setup.ts`
- `apps/web/lib/landing/frame-loader.ts`
- `apps/web/lib/landing/use-reduced-motion.ts`
- `apps/web/lib/landing/web-vitals-report.ts`
- `apps/web/lib/landing/manifest.ts` (frame URLs per beat)
- `cova-plan/landing/veo-prompts.md` (7 prompts documented)
- `cova-plan/landing/manifest.json` (R2 frame URL mapping)
- `public/landing-photo-1.jpg` (reduced motion)
- `public/landing-photo-2.jpg`
- `public/landing-photo-3.jpg`
- `public/og-cova-1200x630.jpg`
- `scripts/landing/extract-frames.sh` (ffmpeg wrapper)
- `scripts/landing/upload-r2.ts` (uploads frames to Cloudflare R2 with hashed names)
- `scripts/landing/check-landing-weight.ts` (CI asset budget check)
- `tests/landing/scroll-positions.test.ts` (snapshot test for beat boundaries)
- `tests/landing/web-vitals.test.ts` (Lighthouse CI integration)
- `tests/landing/reduced-motion.test.ts`

### Modified
- `apps/web/middleware.ts` (redirect signed-in users to /dashboard from /)
- `apps/web/lib/analytics/events.ts` (landing events)
- `apps/web/app/layout.tsx` (add JSON-LD + OG meta + Lenis script)

---

## 9. API contracts

No new public API routes in Phase 10. All work is asset + frontend rendering.

Internal: PostHog events fired client-side via existing client.

---

## 10. Schema migrations

None. Phase 10 is pure frontend + asset production.

---

## 11. Failure handling

```typescript
export type LandingFailure =
  | 'frame_load_fail'              // single frame fail; non-fatal, fallback to last loaded
  | 'gsap_init_fail'                // graceful: fall back to reduced-motion path
  | 'lenis_init_fail'                // fall back to native scroll
  | 'web_vitals_report_fail'         // silent, retry once
  | 'asset_weight_budget_exceeded'   // CI fail, blocks deploy
  | 'reduced_motion_asset_missing';  // 404 on photo; show colored placeholder
```

| Category | Recovery |
|---|---|
| frame_load_fail | Show last-loaded frame; log Sentry warning; lazy-retry on next ScrollTrigger update |
| gsap_init_fail | Fall back to reduced-motion path (no scroll-pin animation) |
| lenis_init_fail | Native scroll (no smoothing); cinematic still works |
| web_vitals_report_fail | Silent; doesn't affect user experience |
| asset_weight_budget_exceeded | CI build fails; blocks deploy |
| reduced_motion_asset_missing | Colored placeholder + caption still visible |

---

## 12. Cost budget

| Source | Estimated cost |
|---|---|
| Claude credits | $60–90 |
| Veo 3.1 generation (7 clips × ~$1) | $7 |
| ffmpeg local (free) | $0 |
| Cloudflare R2 storage (frames ~50MB total) | <$1/month |
| Test render fixtures (reduced-motion photos, OG image) | ~$2 |
| **Total** | **~$70–100** |

---

## 13. Verifier focus areas

| Criterion | Verifier check |
|---|---|
| All 11 beats render | Scroll through entire page; each beat scroll-position triggers correct content |
| Veo frames load | Network tab shows 6-7 clip frame batches loading lazily |
| Reduced motion path | Set OS preference; reload; 3-photo path renders without GSAP |
| Mid-CTA at Beat 7 | Sticky between scroll 4700-5500px; click routes to /auth/signup |
| Close CTA at Beat 11 | Visible; click routes to /auth/signup |
| Sign-in nav link | Click routes to /auth/signin |
| Signed-in user redirected | Sign in test user; visit /; redirects to /dashboard |
| Asset weight | CI script measures total page weight; mobile <30MB, desktop <60MB |
| LCP <2.5s on Slow 4G | Lighthouse CI run with throttling; LCP measurement |
| CLS = 0 | Lighthouse CI; no layout shift |
| INP <200ms | RUM via Web Vitals to PostHog over 7 days |
| Hashed filenames + 1y cache | R2 URLs include hashes; Cache-Control headers correct |
| OG image renders | Test at https://www.opengraph.xyz/ |
| JSON-LD valid | Test at https://search.google.com/test/rich-results |
| Skip-to-content link | Keyboard user can press Tab on first focus, "Skip to content" appears |
| All 11 caption copies match spec | Visual check |
| Footer /terms /privacy links | Click each, verify routes to Phase 1 pages |
| localStorage flag set on first visit | First visit: cova_landing_seen=true after 5s |
| Reduced motion lazy doesn't load GSAP | Network tab: GSAP bundle NOT loaded when reduced-motion |
| All landing PostHog events fire | landing_viewed, landing_beat_reached, landing_mid_cta_clicked, landing_close_cta_clicked, landing_signed_in_redirect |

---

## 14. Adversarial code review checklist

- [ ] FilmCanvas uses single canvas element (not 11) — performance critical
- [ ] Frame painting via rAF, not setInterval
- [ ] Frames lazy-load 2 beats ahead of current scroll position
- [ ] Frame hashes in URLs (e.g. `beat-1-frame-001-abc123.webp`); cache busting works
- [ ] R2 Cache-Control: `public, max-age=31536000, immutable` set correctly
- [ ] LCP element identified: hero headline (text), NOT first frame (avoid LCP regression)
- [ ] Hero headline rendered server-side (text in HTML, no JS dependency)
- [ ] CLS = 0: every reserved space declared with width/height (no FOUC for text)
- [ ] Lenis `smoothTouch: false` (critical: native scroll on mobile)
- [ ] GSAP ScrollTrigger uses `pin: true` only on cinematic mode, never on reduced-motion
- [ ] ScrollTrigger refresh() called on resize/orientationchange
- [ ] window resize debounced 150ms before scroll math recalculates
- [ ] localStorage `cova_landing_seen` set in client-only code (not SSR)
- [ ] Middleware redirect for signed-in users uses Supabase session check (not localStorage)
- [ ] Auto-redirect doesn't loop (signed-in user on /dashboard isn't redirected back to /)
- [ ] OG image path works absolute (not relative)
- [ ] JSON-LD wrapped in `<script type="application/ld+json">` tag
- [ ] All `<Image>` use `priority={false}` except hero
- [ ] Cinematic mode doesn't load on `prefers-reduced-motion: reduce` (not even GSAP bundle)
- [ ] Reduced-motion path passes Lighthouse with same SEO score
- [ ] Mid-CTA z-index above scroll progress bar
- [ ] Mid-CTA un-stickies cleanly when scrolling out of Beat 7 range
- [ ] Mid-CTA on mobile: tap target 44×44 minimum
- [ ] Close CTA at Beat 11 visible without footer overlap
- [ ] Footer below all beats (z-index 0); navigation above (z-index 100)
- [ ] All caption copy passes through `redactLogPayload` if logged (no PII risk on landing)
- [ ] Web Vitals report errors don't block analytics
- [ ] Mobile asset weight under 30MB (CI fails build if exceeded)
- [ ] Desktop asset weight under 60MB
- [ ] CI runs Lighthouse against deployed preview; LCP/CLS/INP gates enforced
- [ ] Skip-to-content link works (focus trap escape)
- [ ] Keyboard navigation: Tab order logical (logo → skip → sign-in → content)
- [ ] All headlines wrapped in semantic `<h1>`, `<h2>` tags
- [ ] Color contrast WCAG AA on all text
- [ ] No emoji used (per design system rules)
- [ ] Veo prompts documented for reproducibility (V1.5 may regenerate clips)
- [ ] Frame manifest committed to git (mapping changes are tracked)

---

## 15. Manual click-script

Save to `cova-plan/manual-evidence/P10/`.

### Cinematic happy path (desktop, fresh visit)
1. Open https://covainterior.com in incognito **[J1: beat-1-hero.png]**
2. Verify hero headline letter-stagger reveal animation plays
3. Scroll slowly through Beat 2 (pain) → caption fades in **[J2: beat-2-pain.png]**
4. Scroll Beat 3 (quiz preview) → mock pair animates **[J3: beat-3-quiz.png]**
5. Scroll Beat 4 (fingerprint) → arcs grow to percentages **[J4: beat-4-fingerprint.png]**
6. Scroll Beat 5 (capture) → phone-to-room transition **[J5: beat-5-capture.png]**
7. Scroll Beat 6 (personalization) → 3 cards orbit **[J6: beat-6-personalization.png]**
8. Scroll Beat 7 (render reveal) → cinematic transition + MID-CTA appears **[J7: beat-7-mid-cta.png]**
9. Click MID-CTA → routes to /auth/signup **[J8: signup-from-mid-cta.png]**
10. Back-button to landing → Beat 7 again, MID-CTA still sticky in this range
11. Continue scroll to Beat 8 (refine) → text-prompt loop **[J9: beat-8-refine.png]**
12. Scroll Beat 9 (shop) → hotspot dots pulse **[J10: beat-9-shop.png]**
13. Scroll Beat 10 (testimonial) → Sarah M quote appears **[J11: beat-10-testimonial.png]**
14. Scroll Beat 11 (close) → final headline + CTA **[J12: beat-11-close.png]**
15. Click close-CTA → routes to /auth/signup **[J13: signup-from-close-cta.png]**

### Sticky scroll progress
16. Scroll mid-page → progress bar visible bottom-right **[J14: scroll-progress.png]**
17. Stop scrolling for 2s → progress bar fades out
18. Scroll again → progress bar fades back in

### Mid-CTA un-sticky behavior
19. Scroll past Beat 7 (>5500px) → MID-CTA disappears
20. Scroll back to Beat 7 (4700-5500px) → MID-CTA reappears

### Sign-in nav
21. Click "Sign in" top-right → routes to /auth/signin **[J15: signin-route.png]**

### Footer links
22. Scroll to footer → click /terms → routes to Phase 1 ToS page
23. Back, click /privacy → routes to Phase 1 Privacy page

### Signed-in redirect
24. Sign in test user (with completed onboarding) in another tab
25. Open https://covainterior.com → redirects to /dashboard **[J16: signed-in-redirect.png]**

### localStorage flag
26. Clear localStorage → reload → confirm `cova_landing_seen` set after 5s
27. PostHog: confirm `landing_first_visit` event fired

### Reduced motion path
28. Enable OS reduced motion preference → reload **[J17: reduced-motion-1.png]**
29. Verify: 3 editorial photos in vertical scroll, no GSAP, no Lenis (Network tab confirms GSAP bundle absent)
30. Captions per photo present **[J18-20: reduced-motion-2-4.png]**
31. CTAs at top + bottom both work

### Slow 4G simulation
32. Chrome DevTools → Network → throttle Slow 4G → reload
33. LCP measurement: hero text renders <2.5s **[J21: lcp-slow-4g.png]**
34. Beat 1 frames lazy-load → cinematic begins after frames available
35. Verify static photo fallback shown for first 2-3 seconds before frames load

### Mobile responsive
36. iPhone Safari: open landing → 5000px scroll, beats compressed **[J22-26: mobile-beat-{1,3,7,9,11}.png]**
37. Mobile asset weight: Network tab shows ~25MB total (under 30MB)
38. Mid-CTA tap target 44×44 (verify via Chrome devtools mobile emulator)

### Web Vitals
39. Lighthouse CI report on production deploy:
    - LCP <2.5s (target met)
    - CLS = 0
    - INP <200ms
    **[J27: lighthouse-report.png]**

### Performance recording
40. Record a video of full scroll-through on desktop (mp4)
41. Save to `cova-plan/manual-evidence/P10/scroll-recording.mp4` (compress if needed)

### SEO + share
42. Test at https://www.opengraph.xyz/ → OG card renders correctly **[J28: og-card.png]**
43. Test at https://search.google.com/test/rich-results → JSON-LD valid **[J29: json-ld-valid.png]**

### Asset failure resilience
44. Manually break URL of one Beat 5 frame in Network tab (block) → reload
45. Verify: that beat shows last-loaded frame OR static photo fallback **[J30: asset-fail.png]**

### Reduced motion + signed in (combined)
46. Enable reduced motion + sign in → visit / → still redirects to /dashboard

---

## 16. Manual evidence bundle

- 30+ screenshots from §15
- 1 video recording of full scroll-through (mp4)
- Lighthouse CI HTML report archived
- PostHog events SQL dump for landing events
- INDEX.md linking artifacts to spec criteria

---

## 17. Remediation budget

- Round 1: Verifier session 1 self-heals
- Round 2: Verifier session 2 finds new issues → remediation
- Round 3 (escalation): write `cova-plan/escalations/P10.md`

If LCP fails repeatedly: escalation = static-photo hero (no Veo on Beat 1) until LCP recovers; Veo Beat 1 deferred to V1.5.

---

## 18. Closing checklist

- [ ] All 30+ screenshots in `cova-plan/manual-evidence/P10/`
- [ ] Scroll-through video archived
- [ ] Lighthouse report archived
- [ ] INDEX.md written
- [ ] `PHASE_STATUS.md` Phase 10 → CLOSED
- [ ] `OPEN_DECISIONS.md` updated: 11-beat sequence locked, 7 Veo prompts archived, mid-CTA Beat 7 frame 460-510 locked, mobile compression strategy, performance budget targets, reduced-motion 3-photo path, Sarah M Brooklyn placeholder
- [ ] `EMPIRICAL_FINDINGS.md` updated: actual LCP/CLS/INP measurements (desktop + mobile + Slow 4G), total asset weight, scroll FPS sustained, signup conversion rate from landing (initial baseline)
- [ ] Phase 11 prereq section reviewed
- [ ] Verifier reports archived
- [ ] Session handoffs written

---

## 19. Rollback plan

- Revert merge commit on main → Vercel rolls back to placeholder landing
- No DB migrations to revert
- R2 frames stay in bucket (cheap; can be re-used if Phase 10 re-attempted)
- If landing breaks production: feature flag `landing_v2_enabled=false` shows minimal hero + CTA only (no scroll cinematic)

---

## 20. Feature flags introduced

| Flag key | Description | Default |
|---|---|---|
| `landing_v2_enabled` | Master switch for cinematic landing (false = minimal placeholder) | true |
| `landing_reduced_motion_only` | Force reduced-motion path for everyone | false |
| `landing_signed_in_redirect_enabled` | Auto-redirect signed-in users to /dashboard | true |
| `landing_web_vitals_reporting_enabled` | PostHog Web Vitals reporting | true |

---

## End of Phase 10 doc.

Next: Phase 11 (Pre-launch validation gates).
