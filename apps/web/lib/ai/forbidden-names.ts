/**
 * Forbidden style-name enforcement shared utilities.
 *
 * Canonical forbidden tokens per research doc §7.4 and CLAUDE.md Rule 8.
 * Qualified forms ("Warm Japandi", "Coastal Bright", etc.) are allowed;
 * bare tokens must never reach user-facing surfaces.
 *
 * Used by: prompt-compiler.ts (Layer 3 runtime sanitizer wiring),
 * design-director.ts (Layer 4 Zod refine on Sonnet free-text fields).
 */

export interface ForbiddenTokenSpec {
  /** Regex matching the forbidden token (case-insensitive at call sites). */
  pattern: RegExp;
  /** Canonical public name (for reporting). */
  name: string;
  /**
   * Qualified forms that include this token but are allowed. Matched
   * case-insensitively; any match with `qualifiedForms` covers the bare
   * token occurrence at that location.
   */
  qualifiedForms: ReadonlyArray<RegExp>;
  /** Replacement when sanitizing the bare token. */
  replacement: string;
}

export const FORBIDDEN_TOKENS: ReadonlyArray<ForbiddenTokenSpec> = [
  {
    pattern: /\bjapandi\b/i,
    name: "Japandi",
    qualifiedForms: [/\bwarm\s+japandi\b/i],
    replacement: "calm warm naturalism",
  },
  {
    pattern: /\bbohemian\b/i,
    name: "Bohemian",
    qualifiedForms: [],
    replacement: "boldly layered eclecticism",
  },
  {
    pattern: /\bcoastal\b/i,
    name: "Coastal",
    qualifiedForms: [/\bcoastal\s+bright\b/i],
    replacement: "relaxed sun-drenched lightness",
  },
  {
    pattern: /\bmid[-\s]?century\s+modern\b/i,
    name: "Mid-Century Modern",
    qualifiedForms: [/\bretro\s+mid[-\s]?century(?:\s+modern)?\b/i],
    replacement: "warm retro modernism",
  },
  {
    pattern: /\bminimalist\b/i,
    name: "Minimalist",
    qualifiedForms: [],
    replacement: "purposeful restraint",
  },
  {
    pattern: /\bscandinavian\b/i,
    name: "Scandinavian",
    qualifiedForms: [],
    replacement: "light Nordic simplicity",
  },
];

/**
 * Replace every qualified-form occurrence in `text` with a unique placeholder.
 * Returns the guarded string plus a restoration map. This lets downstream
 * forbidden-token detection/replacement operate on only the bare occurrences.
 */
function guardQualifiedForms(text: string): { guarded: string; restore: (s: string) => string } {
  const placeholders: Array<{ ph: string; original: string }> = [];
  let result = text;
  let counter = 0;
  for (const spec of FORBIDDEN_TOKENS) {
    for (const qf of spec.qualifiedForms) {
      const re = new RegExp(qf.source, "gi");
      result = result.replace(re, (match) => {
        const ph = `\u0000QF${counter++}\u0000`;
        placeholders.push({ ph, original: match });
        return ph;
      });
    }
  }
  const restore = (s: string): string => {
    let out = s;
    for (const { ph, original } of placeholders) {
      out = out.split(ph).join(original);
    }
    return out;
  };
  return { guarded: result, restore };
}

/**
 * Returns list of forbidden standalone tokens present in `text`. Qualified
 * forms ("Warm Japandi", "Coastal Bright") are NOT reported. Returns empty
 * array if text is clean.
 */
export function findForbiddenStyleNames(text: string): string[] {
  if (!text) return [];
  const { guarded } = guardQualifiedForms(text);
  const found = new Set<string>();
  for (const { pattern, name } of FORBIDDEN_TOKENS) {
    if (new RegExp(pattern.source, "i").test(guarded)) {
      found.add(name);
    }
  }
  return Array.from(found);
}

/** True if `text` contains any standalone forbidden style name. */
export function containsForbiddenStyleName(text: string): boolean {
  return findForbiddenStyleNames(text).length > 0;
}

/**
 * Replace standalone forbidden style names in a string with neutral
 * descriptive phrases. Qualified forms are preserved verbatim.
 *
 * This is the runtime-sanitizer layer (Layer 3 from research §7.4).
 * Idempotent: running twice produces the same output.
 */
export function sanitizeForbiddenNames(text: string): string {
  if (!text) return text;
  const { guarded, restore } = guardQualifiedForms(text);

  let result = guarded;
  for (const { pattern, replacement } of FORBIDDEN_TOKENS) {
    result = result.replace(new RegExp(pattern.source, "gi"), replacement);
  }

  return restore(result);
}
