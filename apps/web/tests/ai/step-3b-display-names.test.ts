import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  toCovaKeyDisplayName,
  COVA_KEY_DISPLAY_NAMES,
} from "@/lib/ai/anchor-display";
import { findForbiddenStyleNames } from "@/lib/ai/forbidden-names";

// Phase 3 F6.6 — step-3b display-name audit tests.
//
// Verifies:
//   1. Every COVA* archetype key maps to a user-visible label free of bare
//      forbidden tokens (CLAUDE.md Rule 8).
//   2. step-3b/page.tsx renders user-visible style names through
//      toCovaKeyDisplayName() and not via the internal DISPLAY_NAMES map
//      (which is retained for DB-write semantics only — see P5 in the Phase
//      0 prompt-surfaces audit).

const CANONICAL_COVA_KEYS = [
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

describe("COVA_KEY_DISPLAY_NAMES — canonical archetype coverage", () => {
  for (const key of CANONICAL_COVA_KEYS) {
    it(`${key} maps to a forbidden-token-free display label`, () => {
      const label = toCovaKeyDisplayName(key);
      expect(label).toBeTruthy();
      expect(label).not.toBe(key);
      expect(findForbiddenStyleNames(label)).toEqual([]);
    });
  }

  it("exposes exactly the 10 canonical COVA keys", () => {
    expect(Object.keys(COVA_KEY_DISPLAY_NAMES).sort()).toEqual(
      CANONICAL_COVA_KEYS.slice().sort(),
    );
  });

  it("toCovaKeyDisplayName returns empty string for null/undefined", () => {
    expect(toCovaKeyDisplayName(null)).toBe("");
    expect(toCovaKeyDisplayName(undefined)).toBe("");
  });
});

describe("step-3b/page.tsx — user-visible render path audit", () => {
  const source = readFileSync(
    join(__dirname, "../../app/design/step-3b/page.tsx"),
    "utf8",
  );

  it("imports toCovaKeyDisplayName from anchor-display", () => {
    expect(source).toMatch(/toCovaKeyDisplayName/);
    expect(source).toMatch(
      /from\s+"@\/lib\/ai\/anchor-display"|from\s+'@\/lib\/ai\/anchor-display'/,
    );
  });

  it("user-visible render site uses toCovaKeyDisplayName", () => {
    // Locate the step3b-bar-name span that surfaces the style label.
    const match = source.match(
      /step3b-bar-name[\s\S]{0,400}?<\/span>/,
    );
    expect(match, "step3b-bar-name block not found").toBeTruthy();
    expect(match![0]).toContain("toCovaKeyDisplayName");
    expect(match![0]).not.toMatch(/DISPLAY_NAMES\[/);
  });

  it("DISPLAY_NAMES map is scoped to internal DB writes only", () => {
    // DISPLAY_NAMES is retained per Phase 0 P5 audit decision for
    // historical users.style_blend key continuity. Verify it is used only
    // in the DB-write site (handleConfirm) and the V2 reverse-lookup block
    // — never in JSX render sites.
    const jsxSection = source.slice(source.indexOf("return ("));
    expect(jsxSection).not.toMatch(/DISPLAY_NAMES\[/);
  });
});
