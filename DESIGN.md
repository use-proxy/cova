# DESIGN.md — Cova Design System
# Last updated: 2026-04-09
# Version: 1.0

---

## Identity

- **System name:** Cova Design System
- **Vibe:** Ultra-luxury dark editorial interior design. Feels like it costs $500/month to use. Every pixel intentional. Every transition smooth. Linear.app meets Architectural Digest.
- **Anti-patterns:** No purple. No generic SaaS blues. No bubbly rounded shapes. No gradients on backgrounds. No gray skeletons.

---

## Color Tokens

| Token | Value | Usage |
|---|---|---|
| `--color-bg` | `#091829` | Page background — used everywhere |
| `--color-surface` | `rgba(255,255,255,0.04)` | Card backgrounds, panels |
| `--color-surface-elevated` | `rgba(255,255,255,0.07)` | Modals, bottom sheets, tweak panels |
| `--color-gold` | `#C9A84C` | CTAs, borders on hover, hotspot markers, active states, icons |
| `--color-gold-hover` | `#D4B460` | Gold on hover (buttons, links) |
| `--color-gold-subtle` | `rgba(201,168,76,0.12)` | Tag/pill backgrounds |
| `--color-gold-shimmer` | `rgba(201,168,76,0.08)` | Skeleton loading backgrounds |
| `--color-text-primary` | `#F5F0E8` | All primary text (ivory warm white) |
| `--color-text-secondary` | `rgba(245,240,232,0.45)` | Labels, secondary text, captions, muted |
| `--color-border` | `rgba(201,168,76,0.15)` | Default card and input borders |
| `--color-border-hover` | `rgba(201,168,76,0.35)` | Hover state borders |
| `--color-border-active` | `rgba(201,168,76,0.6)` | Active/focus borders |
| `--color-topbar` | `rgba(9,24,41,0.8)` | Frosted glass top bar background |
| `--color-topbar-border` | `rgba(201,168,76,0.1)` | Top bar bottom border |
| `--color-sheet` | `rgba(9,24,41,0.95)` | Bottom sheet background |
| `--color-overlay` | `rgba(0,0,0,0.6)` | Overlay behind sheets and modals |
| `--color-error` | `#E87070` | Error states, danger actions |
| `--color-error-bg` | `rgba(232,112,112,0.1)` | Error card tint background |
| `--color-success` | `#6FCF97` | Success states, confirmations |
| `--color-removed` | `rgba(232,112,112,0.3)` | Removed item overlays |

### Critical hex values (verified — copy-paste these exactly):
- Background: **#091829**
- Gold primary: **#C9A84C**
- Gold hover: **#D4B460**
- Primary text: **#F5F0E8**
- Error: **#E87070**
- Success: **#6FCF97**

---

## Typography

### Fonts

| Role | Family | Weights | Source |
|---|---|---|---|
| Display / Headings | **Playfair Display** | 400, 700 | Google Fonts |
| UI / Body / Buttons | **DM Sans** | 400, 500, 600 | Google Fonts |

```html
<!-- Required Google Fonts import -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
```

### Type Scale

| Element | Font | Size | Weight | Color | Usage |
|---|---|---|---|---|---|
| Hero headline | Playfair Display | 64–72px | 400 | `#F5F0E8` | Step-1 hero only |
| H1 | Playfair Display | 40px | 400 | `#F5F0E8` | Page headings |
| H2 | Playfair Display | 36px | 400 | `#F5F0E8` | Section headings |
| H3 | Playfair Display | 28px | 400 | `#F5F0E8` | Sub-section headings |
| H4 | Playfair Display | 22px | 400 | `#F5F0E8` | Card headings, sheet headers |
| Body large | DM Sans | 18px | 400 | `#F5F0E8` | Descriptions, subheadings |
| Body | DM Sans | 15px | 400 | `#F5F0E8` | Message bubbles, body copy |
| Body small | DM Sans | 14px | 400 | `rgba(245,240,232,0.45)` | Secondary descriptions |
| Caption | DM Sans | 13px | 400 | `rgba(245,240,232,0.45)` | Meta text, hints, helper text |
| Label | DM Sans | 12px | 500 | `rgba(245,240,232,0.45)` | Card labels, uppercase tags |
| Micro | DM Sans | 11px | 500 | `rgba(245,240,232,0.45)` | Retailer names, match badges |
| Price | DM Sans | 20–32px | 700 | `#F5F0E8` | All price displays |
| Button | DM Sans | 14–16px | 600 | depends on variant | All button text |
| Wordmark | Playfair Display italic | 20px | 400 | `#C9A84C` | Top bar — every screen |

### Wordmark Rules
- Font: Playfair Display **italic**
- Color: `#C9A84C` (gold primary)
- Size: 20px
- Letter-spacing: 0.05em
- Position: top-left of every screen's frosted glass top bar

---

## Spacing System

| Token | Value | Usage |
|---|---|---|
| `--space-micro` | `8px` | Between icon and label, tight pairs |
| `--space-component` | `16px` | Within component elements |
| `--space-card-padding` | `16px 20px` | Inside all cards |
| `--space-section` | `32px` | Between page sections |
| `--space-page` | `48px` | Page-level vertical rhythm |

---

## Border Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-card` | `12px` | Cards, panels, product images |
| `--radius-button` | `8px` | Buttons and text inputs |
| `--radius-sheet` | `24px 24px 0 0` | Bottom sheet top corners |
| `--radius-pill` | `50px` | Pill buttons, tags, badges |
| `--radius-avatar` | `50%` | Circular avatars |

---

## Component Patterns

### Cards
```css
background: rgba(255,255,255,0.04);
border: 1px solid rgba(201,168,76,0.15);
border-radius: 12px;
padding: 16px 20px;
```
Hover:
```css
border-color: rgba(201,168,76,0.35);
transform: translateY(-4px);
transition: all 200ms ease;
```

### Primary Button (gold CTA)
```css
background: #C9A84C;
color: #091829;
font-family: 'DM Sans', sans-serif;
font-weight: 600;
font-size: 15px;
border-radius: 8px;
padding: 12px 24px;
border: none;
cursor: pointer;
```
Hover:
```css
background: #D4B460;
transform: scale(1.02);
transition: all 150ms ease;
/* + gold shimmer sweep animation */
```
Active/pressed:
```css
transform: scale(0.97);
transition: all 100ms ease;
```

### Secondary Button (outlined)
```css
background: transparent;
border: 1px solid rgba(201,168,76,0.35);
color: #F5F0E8;
font-family: 'DM Sans', sans-serif;
font-weight: 500;
font-size: 15px;
border-radius: 8px;
padding: 12px 24px;
```
Hover:
```css
border-color: rgba(201,168,76,0.6);
color: #C9A84C;
transition: all 200ms ease;
```

### Text Link
```css
color: rgba(245,240,232,0.45);
text-decoration: none;
```
Hover:
```css
color: #F5F0E8;
transition: color 200ms ease;
```

### Gold Text Link
```css
color: #C9A84C;
text-decoration: none;
```
Hover:
```css
color: #D4B460;
transition: color 200ms ease;
```

### Input Field
```css
background: rgba(255,255,255,0.04);
border: 1px solid rgba(201,168,76,0.15);
border-radius: 8px;
padding: 12px 16px;
color: #F5F0E8;
font-family: 'DM Sans', sans-serif;
font-size: 15px;
```
Focus:
```css
border-color: rgba(201,168,76,0.6);
outline: none;
transition: border-color 150ms ease;
```
Placeholder:
```css
color: rgba(245,240,232,0.3);
```

### Tag / Pill
```css
background: rgba(201,168,76,0.12);
color: #C9A84C;
border-radius: 50px;
font-family: 'DM Sans', sans-serif;
font-weight: 500;
font-size: 12px;
padding: 4px 12px;
```

### Status Badges
- **Perfect Match:** `background: rgba(201,168,76,0.12); color: #C9A84C;` (gold pill)
- **Very Similar:** `background: rgba(111,207,151,0.12); color: #6FCF97;` (green pill)
- **Inspired By:** same as tag/pill (muted gold)

### Skeleton Loader (image placeholders)
```css
background: rgba(201,168,76,0.08);
border-radius: 12px;
/* sweep animation: */
background: linear-gradient(90deg, rgba(201,168,76,0.08) 0%, rgba(201,168,76,0.15) 50%, rgba(201,168,76,0.08) 100%);
background-size: 200% 100%;
animation: shimmer 1.5s infinite ease-in-out;

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```
**Never use gray skeletons.**

---

## Layout Patterns

### Frosted Glass Top Bar
```css
background: rgba(9,24,41,0.8);
backdrop-filter: blur(20px);
-webkit-backdrop-filter: blur(20px);
border-bottom: 1px solid rgba(201,168,76,0.1);
height: 56px;
padding: 0 24px;
display: flex;
align-items: center;
position: sticky;
top: 0;
z-index: 50;
```
Contents: Cova wordmark left, page context center (DM Sans 600 15px ivory), user avatar right (32px circle).

### Bottom Sheet
```css
background: rgba(9,24,41,0.95);
backdrop-filter: blur(20px);
-webkit-backdrop-filter: blur(20px);
border-radius: 24px 24px 0 0;
max-height: 80vh;
overflow-y: auto;
position: fixed;
bottom: 0;
left: 0;
right: 0;
z-index: 100;
```
Drag handle:
```css
width: 48px;
height: 4px;
background: rgba(245,240,232,0.2);
border-radius: 2px;
margin: 8px auto 0;
```
Overlay behind sheet:
```css
background: rgba(0,0,0,0.6);
position: fixed;
inset: 0;
z-index: 90;
```

### Progress Bar (quiz screens)
```css
position: fixed;
top: 0;
left: 0;
right: 0;
height: 3px;
background: rgba(201,168,76,0.15);
z-index: 60;

/* Fill: */
background: #C9A84C;
height: 100%;
transition: width 400ms ease;
```

---

## Motion System

### Page Entrance
All page elements start invisible and translate up:
```js
// Framer Motion
initial={{ opacity: 0, y: 24 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
```

### Stagger Children
```js
// Parent container
variants={{
  show: {
    transition: { staggerChildren: 0.08 }
  }
}}

// Each child
variants={{
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 }
}}
```
- **Stagger delay:** 80ms per child

### Spring Physics (all interactive transforms)
```js
transition={{
  type: "spring",
  stiffness: 280,
  damping: 30
}}
```

### Hover Card
```js
whileHover={{
  y: -4,
  transition: { duration: 0.2, ease: "easeOut" }
}}
// + CSS border-color transition
```

### Hover Primary Button
```js
whileHover={{ scale: 1.02, backgroundColor: "#D4B460" }}
whileTap={{ scale: 0.97 }}
transition={{ duration: 0.15, ease: "easeOut" }}
// + gold shimmer sweep animation on hover
```

### Gold Shimmer (Buy Now buttons on hover)
```css
@keyframes shimmer-sweep {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}

/* Applied on hover: */
background: linear-gradient(
  90deg,
  #C9A84C 0%,
  #D4B460 40%,
  #F0D080 50%,
  #D4B460 60%,
  #C9A84C 100%
);
background-size: 200% auto;
animation: shimmer-sweep 400ms ease-in-out;
```

### Hotspot Sonar Markers
```css
@keyframes sonar-ring {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(2.5); opacity: 0; }
}

.hotspot-ring {
  animation: sonar-ring 2s infinite ease-out;
}

.hotspot-ring-delayed {
  animation: sonar-ring 2s infinite ease-out 0.7s;
}
```
- Scale: 1 → 2.5
- Opacity: 0.6 → 0
- Duration: 2s
- Mode: infinite
- Easing: ease-out

### 3D Card Tilt (style variant cards)
```js
// Track mouse position within card
// Apply transform:
style={{
  rotateX: mouseY * 8,  // -8 to +8 degrees
  rotateY: mouseX * -8, // -8 to +8 degrees
  transformPerspective: 1200,
}}
transition={{ type: "spring", stiffness: 280, damping: 30 }}
```

### Bottom Sheet Entrance
```js
initial={{ y: "100%" }}
animate={{ y: 0 }}
exit={{ y: "100%" }}
transition={{ type: "spring", stiffness: 280, damping: 30 }}
```

### Page Transitions (between steps)
- Use Framer Motion `layoutId` for shared element transitions
- Room image transitions with `layoutId="room-image"`
- Step containers use `AnimatePresence` with `mode="wait"`

### Loading Arc (gold SVG)
```js
// SVG circle with animated strokeDashoffset
// Rotation: continuous 360deg
// Used in: step-7 (concentric rings), step-8 loading, tweak panel

animate={{ rotate: 360 }}
transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
```

### Status Message Crossfade
```js
// Sequential messages crossfade every 2500ms
initial={{ opacity: 0 }}
animate={{ opacity: 1 }}
exit={{ opacity: 0 }}
transition={{ duration: 0.6, ease: "easeInOut" }}
```

---

## Interaction States

Every interactive element has exactly three states:

| State | Transform | Border | Timing |
|---|---|---|---|
| Default | none | `rgba(201,168,76,0.15)` | — |
| Hover | `translateY(-4px)` on cards; `scale(1.02)` on buttons | `rgba(201,168,76,0.35)` | 200ms ease |
| Active/pressed | `scale(0.97)` | same as hover | 100ms ease |

---

## Loading State Rules

**NEVER use generic spinners.** Use one of:

1. **Animated gold SVG arc** — rotating stroke-dashoffset circle, used for: step-8 render loading, tweak panel, swap-in-progress
2. **Pulsing gold concentric rings** — keyframe scale + opacity, used for: step-7 analysis loading
3. **Sequential crossfading text messages** — status lines that crossfade every 2.5s, used alongside rings in step-7

---

## Empty State Rules

Every empty state must have:
1. Atmospheric icon (line-art, gold, not generic)
2. Playfair Display serif headline
3. Muted DM Sans description
4. Primary gold CTA button

---

## Error State Rules

```css
/* Error card */
background: rgba(232,112,112,0.1);
border: 1px solid rgba(232,112,112,0.3);
border-radius: 12px;
padding: 16px 20px;
```
- Error message: DM Sans 14px, `#E87070`
- Retry button: outlined secondary button style

---

## Screen Architecture Notes

- **Full-bleed screens** (step-1, step-3, step-7, step-8, step-9): room images fill the entire viewport, frosted glass top bar floats above
- **Centered form screens** (step-5, step-6, step-7b, step-7d): max-width 640–680px, centered, standard top bar
- **Grid screens** (step-2, step-7a, dashboard, saved): content grid, standard top bar, scrollable
- **Split screens** (auth, step-7c): fixed left/right panels, no scroll

---

## Tailwind Utility Mapping

```js
// tailwind.config.js additions
module.exports = {
  theme: {
    extend: {
      colors: {
        bg: '#091829',
        gold: '#C9A84C',
        'gold-hover': '#D4B460',
        ivory: '#F5F0E8',
        error: '#E87070',
        success: '#6FCF97',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        ui: ['"DM Sans"', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
        button: '8px',
        sheet: '24px',
        pill: '50px',
      },
      backdropBlur: {
        topbar: '20px',
      },
    },
  },
}
```

---

## Verification Checklist

Before any page is considered done:
- [ ] Background is exactly `#091829` — not black, not `#000`, not `#0a0a0a`
- [ ] Gold is exactly `#C9A84C` — not `#d4a017`, not `#c0a030`
- [ ] Primary text is exactly `#F5F0E8` — warm ivory, not pure white `#ffffff`
- [ ] Display font is "Playfair Display" (not Merriweather, not Georgia)
- [ ] UI font is "DM Sans" (not Inter, not Roboto)
- [ ] All cards have `rgba(255,255,255,0.04)` background, not opaque colors
- [ ] All card borders are `rgba(201,168,76,0.15)` by default
- [ ] No gray skeletons — skeletons use `rgba(201,168,76,0.08)`
- [ ] Top bar uses `rgba(9,24,41,0.8)` with `backdrop-filter: blur(20px)`
- [ ] Wordmark is Playfair Display **italic**, 20px, `#C9A84C`, letter-spacing 0.05em
- [ ] All springs: stiffness 280, damping 30
- [ ] Entrance: opacity 0 + translateY 24px → opacity 1 + translateY 0
- [ ] Stagger: 80ms per child
- [ ] Hotspot rings: scale 1→2.5, opacity 0.6→0, 2s infinite ease-out
