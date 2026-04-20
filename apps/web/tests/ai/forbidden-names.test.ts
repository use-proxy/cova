import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  containsForbiddenStyleName,
  findForbiddenStyleNames,
  sanitizeForbiddenNames,
} from "@/lib/ai/forbidden-names";
import { STYLE_DNA_BLOCKS } from "@/lib/ai/design-director";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 0 B-3 patch tests — enforce forbidden-name defense on Director path.
// Canonical list per research doc §7.4 and CLAUDE.md Rule 8:
//   Japandi, Bohemian, Coastal, Mid-Century Modern, Minimalist, Scandinavian
// Qualified forms allowed: Warm Japandi, Coastal Bright, Retro Mid-Century
// ─────────────────────────────────────────────────────────────────────────────

describe("findForbiddenStyleNames", () => {
  it("flags bare forbidden tokens", () => {
    expect(findForbiddenStyleNames("a Japandi room")).toEqual(["Japandi"]);
    expect(findForbiddenStyleNames("Bohemian layered space")).toEqual(["Bohemian"]);
    expect(findForbiddenStyleNames("Coastal bedroom")).toEqual(["Coastal"]);
    expect(findForbiddenStyleNames("Mid-Century Modern chair")).toEqual([
      "Mid-Century Modern",
    ]);
    expect(findForbiddenStyleNames("Minimalist aesthetic")).toEqual([
      "Minimalist",
    ]);
    expect(findForbiddenStyleNames("Scandinavian heritage")).toEqual([
      "Scandinavian",
    ]);
  });

  it("allows canonical qualified forms", () => {
    expect(findForbiddenStyleNames("Warm Japandi interior")).toEqual([]);
    expect(findForbiddenStyleNames("Coastal Bright vibe")).toEqual([]);
    expect(findForbiddenStyleNames("Retro Mid-Century chair")).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(findForbiddenStyleNames("japandi room")).toEqual(["Japandi"]);
    expect(findForbiddenStyleNames("BOHEMIAN style")).toEqual(["Bohemian"]);
    expect(findForbiddenStyleNames("coastal waves")).toEqual(["Coastal"]);
  });

  it("returns empty for clean text", () => {
    expect(findForbiddenStyleNames("An oak-framed bed with cream linen")).toEqual(
      [],
    );
    expect(findForbiddenStyleNames("")).toEqual([]);
  });

  it("flags multiple forbidden tokens", () => {
    const text = "Japandi meets Bohemian, with Coastal accents.";
    expect(findForbiddenStyleNames(text).sort()).toEqual(
      ["Bohemian", "Coastal", "Japandi"].sort(),
    );
  });
});

describe("containsForbiddenStyleName", () => {
  it("true for bare forbidden tokens", () => {
    expect(containsForbiddenStyleName("Japandi")).toBe(true);
    expect(containsForbiddenStyleName("pure Bohemian energy")).toBe(true);
  });

  it("false for qualified forms", () => {
    expect(containsForbiddenStyleName("Warm Japandi")).toBe(false);
    expect(containsForbiddenStyleName("Coastal Bright")).toBe(false);
  });

  it("false for clean text", () => {
    expect(containsForbiddenStyleName("oak and brass")).toBe(false);
  });
});

describe("sanitizeForbiddenNames (Layer 3 — wired into compilePrompt)", () => {
  it("replaces bare forbidden tokens with descriptive phrases", () => {
    const dirty = "Japandi room with Bohemian accents";
    const clean = sanitizeForbiddenNames(dirty);
    expect(containsForbiddenStyleName(clean)).toBe(false);
    expect(clean).toContain("calm warm naturalism");
    expect(clean).toContain("boldly layered eclecticism");
  });

  it("preserves Warm Japandi verbatim", () => {
    const clean = sanitizeForbiddenNames("Warm Japandi interior");
    expect(clean).toMatch(/Warm\s+Japandi/i);
  });

  it("preserves Coastal Bright verbatim", () => {
    const clean = sanitizeForbiddenNames("a Coastal Bright bedroom");
    expect(clean).toMatch(/Coastal\s+Bright/i);
  });

  it("rewrites bare Coastal while preserving Coastal Bright in same text", () => {
    const clean = sanitizeForbiddenNames(
      "Coastal vibes meet Coastal Bright finishes",
    );
    expect(clean).toContain("Coastal Bright");
    expect(clean).toContain("relaxed sun-drenched lightness");
    // The standalone "Coastal" at start should have been rewritten
    expect(/^Coastal\s+vibes/i.test(clean)).toBe(false);
  });

  it("is idempotent", () => {
    const dirty = "Bohemian Minimalist Scandinavian";
    const once = sanitizeForbiddenNames(dirty);
    const twice = sanitizeForbiddenNames(once);
    expect(twice).toBe(once);
    expect(containsForbiddenStyleName(twice)).toBe(false);
  });

  it("catches a forbidden token in a realistic compiler-output prompt", () => {
    const compilerOutput =
      "cvboh bedroom with walnut frame, linen bedding, Bohemian layered textiles, warm lantern light, eye level, magazine photography, restrained";
    expect(containsForbiddenStyleName(compilerOutput)).toBe(true);
    const sanitized = sanitizeForbiddenNames(compilerOutput);
    expect(containsForbiddenStyleName(sanitized)).toBe(false);
    expect(sanitized).toContain("boldly layered eclecticism");
  });
});

describe("Zod refine on Director free-text fields (Layer 4)", () => {
  // Mirrors the schema used in design-director.ts generateDesignBrief post-tool-call.
  const schema = z.object({
    design_rationale: z
      .string()
      .refine((s) => !containsForbiddenStyleName(s), {
        message: "design_rationale contains forbidden style name",
      }),
    smart_suggestions: z.array(z.string()).refine(
      (arr) => arr.every((s) => !containsForbiddenStyleName(s)),
      { message: "smart_suggestions contains forbidden style name" },
    ),
  });

  it("accepts clean rationale + suggestions", () => {
    const r = schema.safeParse({
      design_rationale: "White oak anchors the space with brass accents.",
      smart_suggestions: ["swap oak for walnut", "add a reading nook"],
    });
    expect(r.success).toBe(true);
  });

  it("accepts qualified forms in rationale", () => {
    const r = schema.safeParse({
      design_rationale: "A Warm Japandi palette grounds the room.",
      smart_suggestions: ["layer a Coastal Bright accent"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects design_rationale containing bare 'Japandi'", () => {
    const r = schema.safeParse({
      design_rationale: "The Japandi aesthetic balances the heritage bones.",
      smart_suggestions: [],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]!.path).toEqual(["design_rationale"]);
    }
  });

  it("rejects smart_suggestions containing bare 'Bohemian'", () => {
    const r = schema.safeParse({
      design_rationale: "oak and brass throughout.",
      smart_suggestions: ["swap walnut for oak", "introduce Bohemian textiles"],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]!.path).toEqual(["smart_suggestions"]);
    }
  });

  it("rejects any of the 6 canonical forbidden tokens standalone", () => {
    for (const token of [
      "Japandi",
      "Bohemian",
      "Coastal",
      "Mid-Century Modern",
      "Minimalist",
      "Scandinavian",
    ]) {
      const r = schema.safeParse({
        design_rationale: `A ${token} aesthetic.`,
        smart_suggestions: [],
      });
      expect(r.success, `token '${token}' should fail refine`).toBe(false);
    }
  });
});

describe("STYLE_DNA_BLOCKS — canonical-language assertion (Phase 0 B-3 patch)", () => {
  it("no entry contains a bare forbidden style name", () => {
    for (const [trigger, block] of Object.entries(STYLE_DNA_BLOCKS)) {
      const hits = findForbiddenStyleNames(block);
      expect(
        hits,
        `STYLE_DNA_BLOCKS[${trigger}] contains forbidden tokens: ${hits.join(", ")} in "${block}"`,
      ).toEqual([]);
    }
  });

  it("cvboh specifically no longer contains 'Bohemian' alone (B-3 scrub)", () => {
    const cvboh = STYLE_DNA_BLOCKS.cvboh;
    expect(cvboh).toBeDefined();
    expect(/\bBohemian\b/i.test(cvboh!)).toBe(false);
  });
});
