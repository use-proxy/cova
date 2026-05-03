# Back-bug: globals.css body rule overrides next/font system

Discovered: 2026-05-02 (P01b prep)
Owner of fix: P01b M3 cleanup OR pre-P01b standalone commit

apps/web/app/globals.css lines 27-34 sets body { font-family: "Palatino Linotype", ... } which bypasses the next/font CSS variable system (--font-serif, --font-sans) loaded in app/layout.tsx. Result: Palatino renders by default everywhere, EB Garamond only renders where Tailwind font-serif utility is explicitly applied.

Suggested fix: replace the body rule with `font-family: var(--font-serif);` to use the loaded EB Garamond by default. Verify no regressions on existing surfaces (dashboard, render flows, etc.).

Blast radius: cosmetic — affects default body text rendering app-wide.
