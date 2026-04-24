import { describe, it, expect } from "vitest";
import {
  buildLorasFromBlend,
  normalizeLoras,
  readLoras,
} from "@/lib/ai/lora-blending";
import { COVA_TO_DNA_TRIGGER } from "@/lib/styles/lora-registry";

// Phase 3 — weighted LoRA blending contract tests.
// See docs/phase-3/director-migration-design.md for full rationale.
// Contract: max 3 LoRAs, drop <0.10, normalize to sum 1.0, fallback to
// single dominant on empty/degenerate input.

const FALLBACK = "cvwmn";

function sumWeights(loras: Record<string, number>): number {
  return Object.values(loras).reduce((a, b) => a + b, 0);
}

describe("buildLorasFromBlend — fingerprint → cv-trigger map", () => {
  it("single-archetype blend emits one LoRA at 1.0", () => {
    const { loras } = buildLorasFromBlend({ COVAJAPANDI: 1.0 }, FALLBACK);
    expect(loras).toEqual({ cvwmn: 1.0 });
  });

  it("two-archetype borderline blend sums to 1.0 with two entries", () => {
    const { loras } = buildLorasFromBlend(
      { COVAJAPANDI: 0.7, COVAINDUSTRIAL: 0.3 },
      FALLBACK,
    );
    expect(Object.keys(loras).length).toBe(2);
    expect(sumWeights(loras)).toBeCloseTo(1.0, 6);
    expect(loras.cvwmn).toBeCloseTo(0.7, 6);
    expect(loras.cvind).toBeCloseTo(0.3, 6);
  });

  it("three-archetype diffuse blend caps at 3 entries, sums to 1.0", () => {
    const { loras } = buildLorasFromBlend(
      {
        COVAJAPANDI: 0.4,
        COVAINDUSTRIAL: 0.3,
        COVABIOPHILIC: 0.2,
        COVAARTDECO: 0.1,
      },
      FALLBACK,
    );
    expect(Object.keys(loras).length).toBeLessThanOrEqual(3);
    expect(sumWeights(loras)).toBeCloseTo(1.0, 6);
  });

  it("ambiguous / empty fingerprint returns single dominant fallback", () => {
    const { loras } = buildLorasFromBlend({}, FALLBACK);
    expect(loras).toEqual({ cvwmn: 1.0 });
    const { loras: n } = buildLorasFromBlend(null, FALLBACK);
    expect(n).toEqual({ cvwmn: 1.0 });
  });

  it("COVAMINIMAL -> cvmin and COVASCANDINAV -> cvscn are distinct (trigger collision fixed 2026-04-23)", () => {
    const { loras } = buildLorasFromBlend(
      { COVAMINIMAL: 0.5, COVASCANDINAV: 0.5 },
      FALLBACK,
    );
    expect(new Set(Object.keys(loras))).toEqual(new Set(["cvmin", "cvscn"]));
    expect(loras.cvmin).toBeCloseTo(0.5, 6);
    expect(loras.cvscn).toBeCloseTo(0.5, 6);
  });

  it("ignores unknown archetype keys", () => {
    const { loras } = buildLorasFromBlend(
      { COVAJAPANDI: 0.5, FAKESTYLE: 999 },
      FALLBACK,
    );
    expect(loras).toEqual({ cvwmn: 1.0 });
  });
});

describe("normalizeLoras — raw cv-trigger map normalization", () => {
  it("normalizes sum=0.8 input to sum=1.0 output", () => {
    const { loras } = normalizeLoras({ cvwmn: 0.5, cvind: 0.3 }, FALLBACK);
    expect(sumWeights(loras)).toBeCloseTo(1.0, 6);
    expect(loras.cvwmn).toBeCloseTo(5 / 8, 6);
    expect(loras.cvind).toBeCloseTo(3 / 8, 6);
  });

  it("normalizes sum=1.5 input (overweight) to sum=1.0 output", () => {
    const { loras } = normalizeLoras({ cvwmn: 0.9, cvind: 0.6 }, FALLBACK);
    expect(sumWeights(loras)).toBeCloseTo(1.0, 6);
  });

  it("drops sub-0.10 weights and re-normalizes", () => {
    // cvind pre-normalized to 0.08 — dropped.
    // cvwmn 0.92 / cvind 0.08 → post-drop cvwmn becomes 1.0.
    const { loras } = normalizeLoras(
      { cvwmn: 0.92, cvind: 0.08 },
      FALLBACK,
    );
    expect(loras.cvind).toBeUndefined();
    expect(loras.cvwmn).toBeCloseTo(1.0, 6);
    expect(sumWeights(loras)).toBeCloseTo(1.0, 6);
  });

  it("caps at 3 LoRAs, keeping top-3 by weight", () => {
    const { loras } = normalizeLoras(
      {
        cvwmn: 0.30,
        cvind: 0.25,
        cvbio: 0.20,
        cvboh: 0.15,
        cvdco: 0.10,
      },
      FALLBACK,
    );
    expect(Object.keys(loras).length).toBe(3);
    expect(loras.cvwmn).toBeDefined();
    expect(loras.cvind).toBeDefined();
    expect(loras.cvbio).toBeDefined();
    expect(loras.cvboh).toBeUndefined();
    expect(sumWeights(loras)).toBeCloseTo(1.0, 6);
  });

  it("zero-sum / negative / empty input yields fallback primary", () => {
    expect(normalizeLoras(null, FALLBACK).loras).toEqual({ cvwmn: 1.0 });
    expect(normalizeLoras({}, FALLBACK).loras).toEqual({ cvwmn: 1.0 });
    expect(normalizeLoras({ cvwmn: -1, cvind: -2 }, FALLBACK).loras).toEqual({
      cvwmn: 1.0,
    });
  });

  it("all-below-threshold input collapses to top-1 at weight 1.0", () => {
    // Four equal entries at 0.05 each → all below 0.10 threshold after norm
    // (each stays 0.25 post-norm actually, so this case tests the other
    // fallback path: every entry < 0.10 pre-normalization).
    // Use an input designed to normalize to values all < 0.10:
    // impossible with ≤3 entries post-cap; use 10-way split via top-3 cut
    // after selection only top 3 are 0.10/0.10/0.10 = 0.333 each. So
    // instead test the path directly by feeding tiny pre-norm weights that
    // after first normalization still leave some below 0.10.
    // With [0.50, 0.03, 0.01] after norm → [0.926, 0.056, 0.019].
    // After drop → {cvwmn: 0.926} → renormalize → {cvwmn: 1.0}.
    const { loras } = normalizeLoras(
      { cvwmn: 0.50, cvind: 0.03, cvbio: 0.01 },
      FALLBACK,
    );
    expect(loras).toEqual({ cvwmn: 1.0 });
  });
});

describe("canonical cv-trigger registry coverage", () => {
  // 10 COVA* archetypes -> 10 unique cv* triggers after 2026-04-23 fix.
  // Previously COVAMINIMAL collided with COVASCANDINAV at cvscn; now
  // COVAMINIMAL -> cvmin. Research doc's cvjpd/cvlux/cvmax still do not
  // exist in the implementation registry — F3-NAMING.1.
  const CANONICAL_TRIGGERS = [
    "cvwmn",
    "cvscn",
    "cvbio",
    "cvmin",
    "cvmcm",
    "cvcst",
    "cvboh",
    "cvind",
    "cvfrm",
    "cvdco",
  ];

  for (const trigger of CANONICAL_TRIGGERS) {
    it(`archetype resolving to ${trigger} produces a valid single-entry blend`, () => {
      const covaKey = Object.entries(COVA_TO_DNA_TRIGGER).find(
        ([, t]) => t === trigger,
      )?.[0];
      expect(covaKey).toBeDefined();
      const { loras } = buildLorasFromBlend({ [covaKey!]: 1.0 }, FALLBACK);
      expect(loras[trigger]).toBeCloseTo(1.0, 6);
    });
  }
});

describe("readLoras — back-compat reader", () => {
  it("returns loras map when present", () => {
    const out = readLoras({
      primary_lora: "cvwmn interior",
      loras: { cvwmn: 0.7, cvind: 0.3 },
    });
    expect(out).toEqual({ cvwmn: 0.7, cvind: 0.3 });
  });

  it("synthesizes {primary_lora: 1.0} on legacy rows with no loras map", () => {
    const out = readLoras({ primary_lora: "cvwmn interior" });
    expect(out).toEqual({ cvwmn: 1.0 });
  });

  it("strips trailing class descriptor from legacy primary_lora", () => {
    const out = readLoras({ primary_lora: "cvind" });
    expect(out).toEqual({ cvind: 1.0 });
  });

  it("empty / null style_weights returns empty map", () => {
    expect(readLoras(null)).toEqual({});
    expect(readLoras(undefined)).toEqual({});
    expect(readLoras({})).toEqual({});
  });
});
