/**
 * Phase 0 Extension — prompt-surface regression tests.
 *
 * Covers the three legacy paths that were previously untested for
 * forbidden-name sanitization:
 *   1. buildFluxPromptFromContext — now sanitizes at both return sites.
 *   2. quiz/style-preview route — sanitizes prompt before submitRender.
 *   3. design-director lifestyle.density === "minimalist" no longer pushes
 *      a bare "MINIMALIST" token into the Sonnet system prompt.
 */

import { describe, it, expect } from "vitest";
import {
  buildFluxPromptFromContext,
  sanitizeForbiddenStyleNames,
} from "@/lib/ai/flux";
import { containsForbiddenStyleName } from "@/lib/ai/forbidden-names";
import type { RenderContext } from "@/lib/types/area2";
import type { StyleFingerprint } from "@/types/fingerprint";

// Minimal fingerprint for building a RenderContext. The exact dimension
// values don't matter — we only care that forbidden tokens, if they leak
// through any sub-builder (getMaterialPalette, dominantDescriptors, etc.),
// are scrubbed before the prompt is returned.
function makeFingerprint(): StyleFingerprint {
  return {
    fingerprint_version: "v1",
    confidence: 0.8,
    dimensions: {
      colorTemperature: 0.7,
      material: 0.8,
      lightPreference: 0.6,
      density: 0.4,
      symmetry: 0.5,
      character: 0.5,
      contrast: 0.5,
      ornamentation: 0.3,
      metalFinish: 0.5,
      era: 0.5,
      nature: 0.6,
      saturation: 0.4,
    },
  } as unknown as StyleFingerprint;
}

function makeContext(): RenderContext {
  return {
    roomContext: {
      roomShape: "rectangular",
      ceilingHeight: "9ft",
      ceilingDetail: null,
      estimatedDimensions: "12x14ft",
      cameraAngle: "eye-level",
      focalLength: "standard",
    },
    roomConstraints: {
      primaryFunction: ["bedroom"],
    },
    keepMask: { objects: [] },
    budget: { rangeMin: 1000, rangeMax: 5000 },
    requestedProducts: [],
    artBrief: null,
    techSpec: null,
    sensoryProfile: null,
    identityBrief: null,
    fingerprint: makeFingerprint(),
  } as unknown as RenderContext;
}

describe("buildFluxPromptFromContext — forbidden-name sanitization (P0E.3)", () => {
  it("returns a prompt without any bare forbidden style name", () => {
    const ctx = makeContext();
    const prompt = buildFluxPromptFromContext(ctx);
    expect(containsForbiddenStyleName(prompt)).toBe(false);
  });

  it("sanitizes even if a forbidden token is injected via a roomContext field", () => {
    const ctx = makeContext();
    // Simulate an upstream leak: a stray "Minimalist" sneaking into a
    // free-text field that flows into the prompt. The sanitizer at the
    // return sites must scrub it.
    (ctx as unknown as { roomContext: Record<string, unknown> }).roomContext = {
      ...ctx.roomContext,
      estimatedDimensions: "12x14ft, Minimalist feel",
    };
    const prompt = buildFluxPromptFromContext(ctx);
    expect(containsForbiddenStyleName(prompt)).toBe(false);
  });
});

describe("quiz/style-preview — sanitizer wiring (P0E.5)", () => {
  // We can't invoke the route handler here without stubbing Supabase +
  // submitRender. Instead, reproduce the exact assembly path and assert
  // that sanitizeForbiddenStyleNames cleans the known-leaky descriptor
  // dictionary in the route.
  const LEAKY_DESCRIPTOR =
    "bohemian layered interior with woven macrame wall hanging, kilim rugs";

  it("sanitizer strips bare Bohemian from the style-preview descriptor", () => {
    const prompt = `Completely redesign and redecorate this room. Style: ${LEAKY_DESCRIPTOR}.`;
    expect(containsForbiddenStyleName(prompt)).toBe(true);
    const cleaned = sanitizeForbiddenStyleNames(prompt);
    expect(containsForbiddenStyleName(cleaned)).toBe(false);
  });
});

describe("step-3b user-visible style label (BLOCKER 1 fix)", () => {
  it("toCovaKeyDisplayName maps every COVA* archetype to a non-forbidden label", async () => {
    const { COVA_KEY_DISPLAY_NAMES, toCovaKeyDisplayName } = await import(
      "@/lib/ai/anchor-display"
    );
    const covaKeys = [
      "COVASCANDINAV",
      "COVAJAPANDI",
      "COVABIOPHILIC",
      "COVAMINIMAL",
      "COVAMIDCENTURY",
      "COVACOASTAL",
      "COVABOHEMIAN",
      "COVAINDUSTRIAL",
      "COVAFARMHOUSE",
      "COVAARTDECO",
    ];
    for (const key of covaKeys) {
      const display = toCovaKeyDisplayName(key);
      expect(display, `key ${key} must have a display mapping`).not.toBe(key);
      expect(
        containsForbiddenStyleName(display),
        `display label for ${key} contains forbidden token: "${display}"`,
      ).toBe(false);
    }
    // Also directly check the canonical map covers all 10 archetypes.
    for (const key of covaKeys) {
      expect(COVA_KEY_DISPLAY_NAMES[key]).toBeDefined();
    }
  });

  it("step-3b source no longer renders DISPLAY_NAMES directly in the UI", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(
      new URL("../../app/design/step-3b/page.tsx", import.meta.url),
      "utf8",
    );
    // The user-visible render must go through toCovaKeyDisplayName.
    expect(src).toMatch(/toCovaKeyDisplayName\(entry\.style\)/);
    // The old UI-leak pattern must be gone from the JSX render path.
    // Scope: the <span className="step3b-bar-name"> block must no longer
    // read DISPLAY_NAMES[entry.style] directly.
    expect(src).not.toMatch(
      /step3b-bar-name[^<]*<\/span>[\s\S]*?\{DISPLAY_NAMES\[entry\.style\]\}/,
    );
  });
});

describe("step-7d suggestion chips — no forbidden names (BLOCKER 2 fix)", () => {
  it("no entry in SUGGESTION_CHIPS contains a bare forbidden style name", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(
      new URL("../../app/design/step-7d/page.tsx", import.meta.url),
      "utf8",
    );
    // Extract SUGGESTION_CHIPS block
    const match = src.match(
      /SUGGESTION_CHIPS:\s*Record<ChatTabId,\s*string\[\]>\s*=\s*\{([\s\S]*?)\n\};/,
    );
    expect(match, "SUGGESTION_CHIPS block must be present").not.toBeNull();
    const block = match![1]!;
    // Collect all string literals in the block and assert none contain a
    // bare canonical forbidden token.
    const stringLiterals = block.match(/"[^"]*"/g) ?? [];
    expect(stringLiterals.length).toBeGreaterThan(0);
    for (const lit of stringLiterals) {
      expect(
        containsForbiddenStyleName(lit),
        `SUGGESTION_CHIPS entry contains forbidden token: ${lit}`,
      ).toBe(false);
    }
  });
});

describe("design-director density=minimalist — no forbidden echo (P0E.4)", () => {
  it("lifestyle.density value 'minimalist' is mapped to 'RESTRAINED' token in the system-prompt assembly", async () => {
    // Read design-director.ts and assert the token swap is in place. This
    // is a source-level assertion because the actual Sonnet call requires
    // credentials + network.
    const fs = await import("node:fs");
    const src = fs.readFileSync(
      new URL("../../lib/ai/design-director.ts", import.meta.url),
      "utf8",
    );
    // The old string must be gone.
    expect(src).not.toMatch(/"MINIMALIST: reduce max objects/);
    // The new string must be present.
    expect(src).toMatch(/"RESTRAINED: reduce max objects/);
    // The system-prompt template must no longer say `density=minimalist ->`.
    expect(src).not.toMatch(/density=minimalist ->/);
    expect(src).toMatch(/density=restrained ->/);
  });
});
