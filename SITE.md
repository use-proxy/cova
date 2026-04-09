# SITE.md — Cova
# AI Interior Design Web Application
# Last updated: 2026-04-09

---

## Site Identity

- **Name:** Cova
- **Tagline:** Your room. Reimagined.
- **Type:** Desktop-first luxury SaaS — AI interior design + shoppable renders
- **Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Framer Motion, Supabase
- **Design System:** See DESIGN.md

---

## Pages

---

### PAGE 1

- **Route:** `/auth`
- **Name:** Sign In
- **Purpose:** Email + Google OAuth authentication entry point.
- **Layout:** Centered split layout — left half shows an atmospheric AI room render (full-bleed, no overlay text); right half contains the sign-in form on a surface card. No header bar. Minimal, dark, zero clutter.
- **Elements:**
  - Left panel: full-bleed atmospheric room render image, no caption
  - Right panel: Cova wordmark top-center (Playfair Display italic, #C9A84C), form card centered vertically
  - Form: "Sign in to Cova" heading (Playfair Display), email input, password input, "Sign In" primary gold button
  - Divider: "or" in muted text between email form and OAuth
  - Google OAuth button: surface card style, Google icon left, "Continue with Google" label
  - Forgot password link: muted text, below form
  - New user link: "New to Cova? Start your design →" muted text, bottom of right panel
- **States:** default, loading (button spinner), error (red input border + error message card)
- **Motion:** Right panel fades in translateY 24px → 0 on load; form fields stagger 80ms each

---

### PAGE 2

- **Route:** `/design/step-1`
- **Name:** Welcome
- **Purpose:** Hero onboarding screen. First impression. Must feel cinematic and aspirational.
- **Layout:** Full-bleed atmospheric background (AI room render, darkened). All content centered vertically and horizontally. No sidebar. No cards.
- **Elements:**
  - Frosted glass top bar: Cova wordmark left, empty center, user avatar right
  - Hero headline: "Your room. Reimagined." — Playfair Display, very large (64–72px), ivory #F5F0E8, centered
  - Subheading: One sentence explaining the 4-step process — DM Sans, 18px, muted rgba(245,240,232,0.45), centered, max-width 520px
  - Steps row: 4 small numbered steps in a horizontal row, icon + label each, muted text, separated by thin gold lines
  - CTA: "Begin Your Style Profile" — primary gold button, large, centered below steps
  - Ambient: subtle floating particle system in background (gold dust, very low opacity)
- **Motion:** Headline enters first (opacity 0 → 1, translateY 32px → 0, 600ms). Subheading follows 200ms later. Steps row staggers 80ms per item. CTA fades in last. Particles float continuously.

---

### PAGE 3

- **Route:** `/design/step-2`
- **Name:** Style Anchor Selection
- **Purpose:** User selects exactly 2 editorial room photos that feel like them. Calibrates the style model.
- **Layout:** Full-width masonry grid (3 columns), frosted glass top bar, progress bar at very top.
- **Elements:**
  - Progress bar: full-width gold fill, top of viewport
  - Step counter: "Step 1 of 7" top right, muted DM Sans
  - Frosted glass top bar: Cova wordmark left, "Choose your anchors" center, step counter right
  - Section heading: "Choose two rooms that feel like you." — Playfair Display, 36px, ivory, above grid
  - Masonry grid: 9 editorial room photography images, 3 columns, varied heights
  - Each image card: rounded 12px, no border by default, subtle scale 1.0
  - Selected state: gold border 2px, gold checkmark badge top-right corner, scale 1.02, unselected cards dim to opacity 0.5
  - Selection counter: "2 of 2 selected" pill badge, bottom-center of screen, DM Sans, gold text on surface card
  - CTA: "Continue →" primary gold button — disabled (opacity 0.4, not clickable) until exactly 2 selected; activates when count = 2
- **Motion:** Grid images stagger in 80ms each. Selection triggers gold border flash + checkmark scale-in. CTA enables with opacity transition 300ms.

---

### PAGE 4

- **Route:** `/design/step-3`
- **Name:** Pairwise Comparison Quiz
- **Purpose:** 12 rounds of A vs B image comparison to build the user's 12-dimensional style fingerprint.
- **Layout:** Full-viewport. Two room images fill the entire screen side by side. No cards. Immersive.
- **Elements:**
  - Progress bar: gold fill at very top, advances with each round
  - Round counter: "3 of 12" top right, muted DM Sans
  - Left image: fills left 50% of viewport, clickable, label "A" top-left corner
  - Right image: fills right 50% of viewport, clickable, label "B" top-right corner
  - Divider: thin vertical line centered, with "OR" pill in gold at vertical center
  - On click: clicked side flashes a gold overlay (opacity 0 → 0.3 → 0, 300ms), then next pair loads
  - Keyboard support: A/left arrow = left, D/right arrow = right
- **Motion:** Between rounds — 3D card-flip animation (rotateY 0 → 90deg, image swap, rotateY 90 → 0deg, 400ms). Progress bar advances with spring. Gold flash on selection.

---

### PAGE 5

- **Route:** `/design/step-4`
- **Name:** Style Fingerprint Reveal
- **Purpose:** Cinematic reveal of the user's computed 12-dimensional style profile. High moment of delight.
- **Layout:** Centered single column. Dark background. No top bar clutter — just the chart and content.
- **Elements:**
  - Frosted glass top bar: Cova wordmark left, "Your Style Profile" center, step counter right
  - Progress bar: full gold (quiz complete)
  - Section label: "Your Style Fingerprint" — DM Sans 500, muted, uppercase, letter-spacing 0.12em, above chart
  - Radar/spider chart: large (420px diameter), 12 axes, gold lines and fill (rgba(201,168,76,0.2) fill, #C9A84C stroke), drawn with SVG animation
  - Chart axis labels: 12 dimensions around perimeter — Color Temperature, Saturation, Density, Formality, Era, Material, Texture, Pattern, Line Quality, Light Preference, Nature, Cultural Influence — DM Sans 12px, muted
  - Style descriptor tags: 3 pill tags below chart (e.g. "Warm Minimalist", "Biophilic", "Contemporary") — gold pill style
  - CTA: "Design My Room →" — primary gold button, centered below tags
- **Motion:** Chart axes draw from center outward with staggered SVG stroke-dashoffset animation, 800ms total, ease-out. Tags scale in 80ms stagger after chart completes. CTA fades in last.

---

### PAGE 6

- **Route:** `/design/step-5`
- **Name:** Budget Setup
- **Purpose:** Capture room type and budget range before room upload.
- **Layout:** Centered single column, max-width 640px, frosted glass top bar, progress bar.
- **Elements:**
  - Frosted glass top bar: Cova wordmark left, "Budget Setup" center, step counter right
  - Section heading: "Tell us about your space." — Playfair Display, 36px, ivory
  - Room type selector: pill button group — Living Room, Bedroom, Kitchen, Dining Room, Office, Other — selected pill has gold background (#C9A84C), unselected surface card with gold border
  - Budget slider: dual-handle range slider, gold thumb handles, gold fill track between handles
  - Budget tier indicator: 4 labeled cards below slider — Budget ($500–2K), Mid-Range ($2K–8K), Premium ($8K–20K), Luxury ($20K+) — active tier (matching slider position) highlights gold border + gold label
  - Selected range display: "Your budget: $2,000 – $8,000" — DM Sans 18px, ivory, centered above slider
  - CTA: "Continue →" primary gold button
- **Motion:** Page elements stagger in 80ms each. Slider thumb drag with spring physics. Tier card highlight transitions 200ms ease.

---

### PAGE 7

- **Route:** `/design/step-6`
- **Name:** Room Photo Upload
- **Purpose:** User uploads their room photo. The gateway to the AI pipeline.
- **Layout:** Centered single column, upload zone dominant, frosted glass top bar, progress bar.
- **Elements:**
  - Frosted glass top bar: Cova wordmark left, "Upload Your Room" center, step counter right
  - Section heading: "Upload your room" — Playfair Display, 40px, ivory, centered
  - Subtext: "We'll analyze every detail." — DM Sans, muted, centered
  - Upload zone: large centered box (min 400px tall), dashed border 2px rgba(201,168,76,0.35), border-radius 12px, surface card background
  - Upload zone content: upload icon (lucide, gold), "Drag & drop your photo here" label (DM Sans, ivory), "or" muted divider, "Browse files" text link
  - Hover state: border becomes solid gold 2px rgba(201,168,76,0.8), background rgba(201,168,76,0.04)
  - Drag-over state: gold border pulsing, background rgba(201,168,76,0.06)
  - After upload: image preview fills the zone with object-fit cover, subtle dark overlay at bottom, overlay text "Looking good. Ready to analyze." (DM Sans, ivory, small)
  - File format note: "JPG, PNG or HEIC — max 25MB" — muted DM Sans 13px, below upload zone
  - CTA: "Analyze My Room →" — primary gold button, centered below zone, disabled until file uploaded
- **Motion:** Upload zone border animates on hover 200ms. After upload, image fades in with 400ms crossfade. CTA enables with opacity transition.

---

### PAGE 8

- **Route:** `/design/step-7`
- **Name:** Room Analysis Loading
- **Purpose:** Cinematic processing screen while AI analyzes the uploaded room. Must feel premium, never generic.
- **Layout:** Full viewport. Pure atmosphere. No top bar, no progress indicators, no step counter.
- **Elements:**
  - Background: uploaded room photo at very low opacity (0.08) blurred (blur 40px), fills viewport
  - Center: animated gold concentric rings — 3 rings, each pulsing outward from center, gold, opacity fading 0.8 → 0, staggered 600ms between rings, infinite loop
  - Status messages: single line centered below rings, DM Sans 18px, ivory. Messages crossfade every 2.5s in sequence: "Reading your room..." → "Mapping the light..." → "Identifying materials..." → "Understanding your space..." → "Building your profile..."
  - Particle system: very subtle floating gold dust particles, low opacity, slow drift
  - No spinner. No percentage. No progress bar. Pure atmosphere.
- **Motion:** Rings pulse continuously. Status messages crossfade with opacity 0 → 1 → 0 transitions. Particles drift with random velocity.

---

### PAGE 9

- **Route:** `/design/step-7a`
- **Name:** Room Analysis Results
- **Purpose:** Display what the AI detected about the room. User confirms before proceeding.
- **Layout:** Centered, max-width 800px, card grid, frosted glass top bar.
- **Elements:**
  - Frosted glass top bar: Cova wordmark left, "Room Analysis" center, step counter right
  - Section heading: "Here's what we found." — Playfair Display, 36px, ivory
  - Card grid: asymmetric masonry/grid layout, 9 detection cards
  - Detection cards (one each): Room Shape, Dimensions, Ceiling Height, Lighting Direction, Floor Material, Wall Color, Camera Angle, Dominant Colors, Existing Style
  - Each card: surface card (rgba white 4%), 12px radius, 16px 20px padding, small icon top-left (lucide, gold), muted label DM Sans 12px uppercase, value DM Sans 16px ivory
  - Dominant Colors card: shows 3–5 color swatches (circular, 20px each) instead of text
  - CTA: "These look right →" primary gold button, centered below grid
  - Secondary link: "Something looks off — retake ↩" muted text link, below CTA
- **Motion:** Cards stagger in 80ms each (bottom-up). Icon appears first, then label fades, then value slides in.

---

### PAGE 10

- **Route:** `/design/step-7b`
- **Name:** Constraints
- **Purpose:** Capture physical and lifestyle constraints that affect the redesign.
- **Layout:** Centered single column, max-width 680px, scrollable, frosted glass top bar.
- **Elements:**
  - Frosted glass top bar: Cova wordmark left, "Your Space" center, step counter right
  - Section heading: "Tell us about your constraints." — Playfair Display, 36px
  - Form cards (one per constraint, surface card style):
    - **Own or Rent:** toggle — "Own" / "Rent" — affects whether structural changes are suggested
    - **Physical Constraints:** checkbox group — Radiator, Column, Sloped Ceiling, Low Clearance, Bay Window, Exposed Brick — each as a pill checkbox
    - **Best Light Time:** pill select — Morning / Afternoon / Evening
    - **Room Size:** pill select — Small (<12m²) / Medium / Large / Open-Plan
    - **Who Uses Room:** checkbox group — Solo / Couple / Kids / Guests / Work-from-Home
    - **Pets or Kids:** toggle
    - **Storage Priority:** three-position slider — Low / Medium / High — gold thumb
    - **Off-Screen Pieces:** text input — "Describe any pieces not in the photo we should incorporate" — placeholder in muted text
  - Style delta sliders (3): horizontal sliders ranging -2 to +2 with center zero (labeled "0" at center). Slider thumb gold. Each labeled:
    - Coziness: "Minimal ←→ Cozy"
    - Color Boldness: "Neutral ←→ Bold"
    - Traditionality: "Modern ←→ Traditional"
  - CTA: "Continue →" primary gold button, bottom
- **Motion:** Each form card slides in staggered 80ms. Toggle animations spring-based.

---

### PAGE 11

- **Route:** `/design/step-7c`
- **Name:** Keep or Remove Objects
- **Purpose:** User reviews AI-detected furniture and marks what to keep vs. remove from the redesign.
- **Layout:** Full-width split — left 60% room photo with bounding boxes, right 40% summary list.
- **Elements:**
  - Frosted glass top bar: Cova wordmark left, "What stays?" center, step counter right
  - Left panel: uploaded room photo, full height, with colored bounding box overlays
    - Each bounding box: label tag above box (DM Sans 12px, surface card), two icon buttons top-right of box: checkmark (keep) and X (remove)
    - Kept item bounding box: gold glow border, #C9A84C color
    - Removed item bounding box: red tinted overlay rgba(232,112,112,0.3), X icon
    - Unreviewed item: dashed white border
  - Right panel: scrollable list of all detected items
    - Each row: item icon, item label, keep/remove status badge (gold "Keep" or red "Remove"), and toggle button
    - Grouped by: Furniture, Lighting, Decor
  - CTA: "Continue →" primary gold button, right panel bottom — activates when at least 1 decision made
- **Motion:** Bounding boxes fade in staggered on load. Keep/remove transition: gold border animates in, removed overlay fades in.

---

### PAGE 12

- **Route:** `/design/step-7d`
- **Name:** Personalization Chatbot
- **Purpose:** Conversational personalization across 6 topic tabs before the AI redesign is triggered.
- **Layout:** Full-height single column. Tab bar at top below frosted glass bar. Chat area fills remaining height.
- **Elements:**
  - Frosted glass top bar: Cova wordmark left, "Personalize" center, step counter right
  - Tab bar: 6 horizontal tabs — Budget, Products, Art, Tech, Sensory, Identity — DM Sans 14px. Active tab: ivory text, gold underline 2px. Inactive: muted text. Completed tab: gold checkmark icon right of label. Progress dots below each tab label.
  - Chat area: scrollable, fills height. Messages:
    - AI messages: left-aligned, surface card background, DM Sans 15px, ivory, 12px radius
    - User messages: right-aligned, surface elevated background, gold left border 2px, DM Sans 15px, ivory
    - Typing indicator: 3 gold dots pulsing (sequential opacity animation), left-aligned
  - Message input: bottom, surface card input with send icon button (gold arrow), border gold on focus
  - CTA: "Design My Room →" full-width gold button — activates only when Budget tab complete AND at least 1 other tab complete
  - Helper text below CTA: "Your personalized redesign takes about 60 seconds." — muted DM Sans 13px
- **Motion:** Tab switch: slide content left/right with opacity. Checkmark appears on tab completion with scale-in. Messages animate in from bottom with 200ms ease.

---

### PAGE 13

- **Route:** `/design/step-7e`
- **Name:** Style Variant Picker
- **Purpose:** User picks from 3 AI-generated style direction variants before the full render is triggered.
- **Layout:** Centered single column, 3 cards horizontal, frosted glass top bar, full-width gold progress bar at very top.
- **Elements:**
  - Full-width gold progress bar: very top of viewport
  - Frosted glass top bar: Cova wordmark left, step counter "Step 4 of 4" right
  - Section heading: "Choose your direction." — Playfair Display, 36px, centered
  - 3 variant cards side by side (equal width):
    - Preview image: 200×200px, border-radius 12px, object-fit cover
    - Style direction label: DM Sans 600, 16px, ivory, below image
    - Descriptor line: DM Sans 14px, muted, 1 line
    - "Refine This →" button: secondary outlined gold button, below descriptor
    - 3D hover tilt: rotateX/rotateY ±8deg based on mouse position, perspective 1200px
    - Selected state: scale 1.02, gold border-glow (box-shadow gold), gold border
  - Bottom center link: "Skip — use my style as-is →" muted text link
- **Motion:** Cards stagger in 80ms. 3D tilt on mouse move with spring physics stiffness 280 damping 30. Selection triggers scale + gold glow with 200ms transition.

---

### PAGE 14

- **Route:** `/design/step-8`
- **Name:** Render Loading + Result + Tweak Panel
- **Purpose:** The core product experience — AI redesign generation, before/after reveal, and iterative tweaking.
- **Layout:** Full viewport. Three distinct states managed by component state, not page navigation.

#### STATE A — LOADING

- Full viewport dark background
- Center: large animated gold arc (SVG circle, stroke-dashoffset rotating, continuous)
- Behind the arc: room thumbnail fading in at opacity 0.06 as background, blurred
- Center text: "Generating your redesign" DM Sans 20px ivory, animated ellipsis below
- Muted text: "About 60 seconds" DM Sans 14px muted, below ellipsis
- Bottom strip: 3 small preview cards with shimmer skeleton (rgba(201,168,76,0.08) background + sweep animation) — appear progressively as Schnell previews complete

#### STATE B — RESULT

- Full viewport before/after comparison
- Left half: original room photo, "Before" label top-left (DM Sans 12px, muted, surface card pill)
- Right half: AI redesign, "After" label top-right (DM Sans 12px, gold, surface card pill)
- Divider: thin vertical gold line with circular drag handle centered — user can drag left/right to change split position
- Design explanation card: slides up from bottom after 1s delay — surface elevated card, serif headline (Playfair Display 22px) summarizing design direction, 3 bullet points DM Sans 15px
- Action buttons below explanation card: "Shop This Room →" primary gold, "Refine →" secondary outlined
- Top bar: frosted glass, Cova wordmark left, "Your Redesign" center, Share icon right

#### STATE C — TWEAK PANEL

- Glass morphism bottom sheet: rgba(255,255,255,0.07) background, backdrop-blur 20px, 1px gold border at top, slides up from bottom with spring physics
- 3 tweak category cards side by side (equal width, surface card):
  - **Card 1 "Color & Lighting":** color palette chips (6, clickable), lighting warmth slider (gold thumb), "Apply →" gold button
  - **Card 2 "Swap Furniture":** text input "Describe the piece to swap in...", selected bounding box highlighted on render behind panel, "Apply →" gold button
  - **Card 3 "Add Accessories":** text input "Describe an accessory to add...", "Apply →" gold button
- Undo stack: "← Undo" text link, shows previous version thumbnail (48×48px rounded), DM Sans 13px muted
- Dismiss: "Done →" right-aligned text link in gold, closes panel and navigates to step-9
- Tweak in progress: gold arc animation overlays current render, panel grays out (opacity 0.5), inputs disabled

- **Motion (all states):** State A → B: arc fades out, before/after slides up from opacity 0. Explanation card slides up spring. Panel STATE C: spring slide from y:100% to y:0.

---

### PAGE 15

- **Route:** `/design/step-9`
- **Name:** Shoppable Room
- **Purpose:** The commerce layer — users shop every visible product in the AI redesign through hotspot markers and a product bottom sheet.
- **Layout:** Full viewport redesigned room image. Frosted glass top bar. Floating hotspot markers. Bottom sheet system.

#### STATE A — BASE VIEW

- Full-viewport redesigned room image (object-fit cover)
- Frosted glass top bar (56px, blur 20px):
  - Left: back chevron icon (ivory)
  - Center: "Shop This Look" — DM Sans 600, ivory
  - Right: Share icon button + "Budget Room" pill button (outlined gold)
- Floating hotspot markers (one per detected furniture item):
  - Center dot: 20px, solid #C9A84C
  - Ring 1: 40px, gold, pulsing outward — scale 1 → 2.5, opacity 0.6 → 0, 2s infinite ease-out
  - Ring 2: same, delayed 700ms (creates sonar effect)
  - On hover: tooltip label appears above dot (DM Sans 13px, surface card)

#### STATE B — PRODUCT BOTTOM SHEET

- Slides up from bottom on hotspot tap: spring physics y:100% → y:0
- Height: 60% viewport, max-height 80vh
- Background: rgba(9,24,41,0.95) + backdrop-blur 20px
- Top corners: 24px border-radius
- Drag handle: 48px wide, 4px height, rgba(245,240,232,0.2), 8px from top, centered
- Content:
  - Muted uppercase label: "Matching: [item label]" DM Sans 11px, letter-spacing 0.12em
  - Primary product card: product image 80×80 left (12px radius), right side:
    - Match badge: "Perfect Match" (gold pill), "Very Similar" (green pill), "Inspired By" (muted pill)
    - Product name: DM Sans 600, 15px, ivory, 2-line clamp
    - Price: DM Sans 700, 20px, ivory
    - Retailer: DM Sans 13px, muted
    - Two buttons: "Buy Now →" full gold, "Try in Room" outlined secondary
  - "More options" label: DM Sans 12px, muted, uppercase, letter-spacing 0.1em
  - Horizontal scroll row: alternative product cards (128×128 image, name 2-line, price, "Shop →" link)
  - Bottom text link: "Complete the Room →" gold text, centered

#### STATE C — SWAP IN PROGRESS

- Gold arc animation overlaid on render (full viewport)
- Sheet: "Swapping into your room... ~30s" text center with pulsing gold dot
- On completion: before/after 50/50 grid appears in sheet with "Keep" (gold) and "Revert" (outlined) buttons

#### STATE D — COMPLETE THE ROOM PANEL

- Second sheet stacks over product sheet (same spring animation)
- Header: "Complete the Look" left, back arrow right — Playfair Display 22px
- For each of 3 complementary items:
  - Section header: item label, DM Sans 600
  - Style reason: italic muted sentence, DM Sans 14px
  - Horizontal scroll row: 3 product cards each with "Shop →" button

- **Motion:** Hotspot sonar rings: keyframe animation continuous. Sheet spring entrance. Drag-to-dismiss gesture. Second sheet stacks with slight Y offset behind first (scale 0.97).

---

### PAGE 16

- **Route:** `/budget-panel`
- **Name:** Room Budget Calculator
- **Purpose:** Bottom sheet showing the complete room cost broken down by tier, with tier-alternative products.
- **Layout:** Bottom sheet (same system as step-9). Triggered from "Budget Room" button in top bar.
- **Elements:**
  - Header: "Room Budget" DM Sans 600 18px left, close X right
  - Tier tabs: Budget / Mid-Range / Premium / Luxury — DM Sans 14px, active tab gold underline
  - Total display: "Total Room: $4,240" — DM Sans 700 32px ivory, centered, below tabs
    - Original price struck through if different: DM Sans 500 18px rgba(245,240,232,0.3)
    - Savings badge: green pill "Save $640" OR premium badge: amber pill "Premium Selection"
  - Item list: each row:
    - Item label left: DM Sans 500 14px ivory
    - Original product center: name + price muted
    - Arrow separator: →
    - Tier alternative right: name + price ivory
    - "Shop →" link far right: gold text link
  - Loading skeleton rows: shimmer animation rgba(201,168,76,0.08) while fetching tier alternatives
- **Motion:** Sheet slides up spring. Tier switch: content crossfades 200ms. Skeleton rows shimmer.

---

### PAGE 17

- **Route:** `/dashboard`
- **Name:** Dashboard
- **Purpose:** User's home base — view all rooms, see stats, start new design.
- **Layout:** Full page, frosted glass top bar, content max-width 1200px centered.
- **Elements:**
  - Frosted glass top bar: Cova wordmark left, empty center, user avatar + settings gear right
  - Greeting: "Good evening, [First Name]" — Playfair Display 40px, ivory, page top
  - Stats row: 3 metric cards side by side (surface card each):
    - Rooms Designed: large number, DM Sans 700 36px gold, label muted below
    - Products Saved: same
    - Style Matches: same
  - Section header: "Your Rooms" — Playfair Display 28px ivory left, "New Room +" button outlined gold right
  - Room grid: 3 columns, room cards:
    - Room render thumbnail: full-width, 200px height, object-fit cover, 12px radius top
    - Room name: DM Sans 600 16px ivory
    - Date: DM Sans 13px muted
    - Style tags: 3 small pill tags (gold pill style)
    - Action links: "Continue Shopping" and "Redesign" — muted text links with hover gold
  - Empty state (no rooms): atmospheric illustration (line-art interior, gold), "Design your first room" Playfair Display 28px, "It only takes a few minutes." muted, "Begin Now →" primary gold button
- **Motion:** Greeting fades in. Stats row staggers 80ms. Room cards stagger 80ms. Hover on room card: translateY -4px, gold border.

---

### PAGE 18

- **Route:** `/dashboard/saved`
- **Name:** Saved Products
- **Purpose:** View and shop all products the user has saved across their rooms.
- **Layout:** Full page, frosted glass top bar, filter bar below, product grid.
- **Elements:**
  - Frosted glass top bar: Cova wordmark left, "Saved Products" center, user avatar right
  - Filter bar: room dropdown left, category pills (All, Furniture, Lighting, Rugs, Art, Plants, Decor), price sort right
  - Product grid: 4 columns, product cards:
    - Product image: full-width, 180px, object-fit cover, 12px radius top
    - Product name: DM Sans 600 14px ivory, 2-line clamp
    - Retailer badge: small muted pill DM Sans 12px
    - Price: DM Sans 700 18px ivory
    - "Shop →" button: full-width, primary gold, bottom of card
    - "View in Room" link: muted text link below button
  - Card hover: translateY -4px, gold border, price and CTA become more prominent (CTA brightens, price increases size slightly)
  - Empty state: "No saved products yet" with muted text and "Start Designing →" CTA
- **Motion:** Filter change: grid fades + re-staggers 80ms. Card hover spring -4px. Shop button shimmer on hover.

---

### PAGE 19

- **Route:** `/dashboard/settings`
- **Name:** Settings
- **Purpose:** Account management, notifications, style profile, and privacy.
- **Layout:** Two-column — left 240px nav column, right content panel, frosted glass top bar.
- **Elements:**
  - Frosted glass top bar: Cova wordmark left, "Settings" center, user avatar right
  - Left nav: vertical list of 4 nav items — Account, Notifications, Style Profile, Privacy — active item has gold left border + gold text, inactive muted
  - Right content panel (tab content):

  **Account tab:**
    - Avatar: 72px circle, upload overlay on hover
    - Name and email: editable inline fields
    - Connected accounts: Google card with status badge
    - Danger zone: red-bordered card, "Delete Account" outlined error button

  **Notifications tab:**
    - Toggle rows for: New Design Complete, Product Price Drop, Weekly Style Digest
    - Each: label left, muted description below label, toggle right

  **Style Profile tab:**
    - Radar chart (same as step-4, read-only)
    - 3 style descriptor tags
    - "Retake Style Quiz →" outlined secondary button

  **Privacy tab:**
    - Toggle rows: Allow Analytics, Save Room Data, Public Profile
    - GDPR data export link: "Download my data" text link
    - Data deletion: "Delete all my data" outlined error text link

- **Motion:** Left nav active state transitions 200ms. Tab content fades + translates 16px on switch. Form input focus: gold border transition 150ms.

---

## Global Rules (apply to ALL pages)

1. Every page has a **frosted glass top bar** (rgba(9,24,41,0.8), blur 20px, border-bottom 1px solid rgba(201,168,76,0.1), height 56px) with: Cova wordmark left, page context center, user avatar right (authenticated screens).

2. **Quiz/multi-step screens** (step-2 through step-7e): always show a top progress bar (full-width, gold fill, 3px height) and step counter "Step X of Y" top right in muted DM Sans.

3. **Loading states** never use generic spinners. Always use one of: animated gold SVG arc (rotating), pulsing gold concentric rings, or sequential crossfading text messages.

4. **Empty states** always have: atmospheric icon (not generic), Playfair Display serif headline, muted DM Sans description, gold CTA button.

5. **Error states:** red-tinted card (#E87070 at 10% opacity background), error message DM Sans 14px, retry button outlined style.

6. Every **interactive element** has three states: default, hover (gold border activates, 200ms), active/pressed (scale 0.97, 100ms).

7. **"Buy Now →" buttons** on product cards: gold shimmer sweep animation on hover (linear-gradient moving left to right, 400ms).

8. **Bottom sheets** on all screens: spring physics y:100% → y:0, drag-to-dismiss gesture, overlay rgba(0,0,0,0.6).

9. **Image placeholders / skeletons:** shimmer animation rgba(201,168,76,0.08) with sweep — never gray.

10. **Cova wordmark** (top left every screen): Playfair Display italic, #C9A84C, 20px, letter-spacing 0.05em.
