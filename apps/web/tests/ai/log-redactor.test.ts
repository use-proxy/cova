import { describe, it, expect, vi } from "vitest";
import {
  redactLogString,
  redactLogPayload,
  wrapLogger,
} from "@/lib/logging/redactor";

// Phase 3 F6.5 — log redactor unit tests. Covers all 5 canonical forbidden
// tokens (Japandi, Bohemian, Coastal, Mid-Century Modern, Minimalist,
// Scandinavian — 6 total).

describe("redactLogString — canonical token coverage", () => {
  it("redacts bare Japandi", () => {
    expect(redactLogString("japandi room")).not.toMatch(/\bjapandi\b/i);
  });
  it("preserves qualified Warm Japandi", () => {
    expect(redactLogString("Warm Japandi room")).toMatch(/Warm Japandi/i);
  });
  it("redacts bare Bohemian", () => {
    expect(redactLogString("a bohemian vibe")).not.toMatch(/\bbohemian\b/i);
  });
  it("redacts bare Coastal but preserves Coastal Bright", () => {
    expect(redactLogString("coastal vibe")).not.toMatch(/\bcoastal\b/i);
    expect(redactLogString("Coastal Bright palette")).toMatch(/Coastal Bright/i);
  });
  it("redacts bare Mid-Century Modern but preserves Retro Mid-Century", () => {
    expect(redactLogString("mid-century modern couch")).not.toMatch(
      /\bmid[-\s]?century\s+modern\b/i,
    );
    expect(redactLogString("Retro Mid-Century")).toMatch(/Retro Mid-Century/i);
  });
  it("redacts bare Minimalist", () => {
    expect(redactLogString("minimalist loft")).not.toMatch(/\bminimalist\b/i);
  });
  it("redacts bare Scandinavian", () => {
    expect(redactLogString("scandinavian oak")).not.toMatch(/\bscandinavian\b/i);
  });
});

describe("redactLogString — edge cases", () => {
  it("handles empty / null / undefined", () => {
    expect(redactLogString("")).toBe("");
    expect(redactLogString(null)).toBe("");
    expect(redactLogString(undefined)).toBe("");
  });
  it("is idempotent", () => {
    const once = redactLogString("a japandi and bohemian room");
    const twice = redactLogString(once);
    expect(once).toBe(twice);
  });
});

describe("redactLogPayload — deep redaction", () => {
  it("redacts nested string values in objects", () => {
    const out = redactLogPayload({
      event: "render_failed",
      meta: { reason: "japandi prompt too long", room: "bohemian bedroom" },
    });
    expect(JSON.stringify(out)).not.toMatch(/\bjapandi\b/i);
    expect(JSON.stringify(out)).not.toMatch(/\bbohemian\b/i);
  });

  it("redacts strings in arrays", () => {
    const out = redactLogPayload(["minimalist", "Warm Japandi", 42, null]);
    expect(out[0]).not.toMatch(/\bminimalist\b/i);
    expect(out[1]).toMatch(/Warm Japandi/i);
    expect(out[2]).toBe(42);
    expect(out[3]).toBe(null);
  });

  it("leaves non-string primitives untouched", () => {
    expect(redactLogPayload(42)).toBe(42);
    expect(redactLogPayload(true)).toBe(true);
    expect(redactLogPayload(null)).toBe(null);
  });

  it("handles circular references without infinite recursion", () => {
    const obj: Record<string, unknown> = { msg: "bohemian" };
    obj.self = obj;
    const out = redactLogPayload(obj) as Record<string, unknown>;
    expect(out.msg).not.toMatch(/\bbohemian\b/i);
  });
});

describe("wrapLogger — integration", () => {
  it("wraps a logger function, redacting each arg", () => {
    const inner = vi.fn();
    const safe = wrapLogger(inner);
    safe("render for japandi room", { meta: "bohemian details" });
    expect(inner).toHaveBeenCalledTimes(1);
    const [msg, meta] = inner.mock.calls[0]!;
    expect(msg).not.toMatch(/\bjapandi\b/i);
    expect(JSON.stringify(meta)).not.toMatch(/\bbohemian\b/i);
  });

  it("passes through non-string args unchanged", () => {
    const inner = vi.fn();
    const safe = wrapLogger(inner);
    safe(42, null, true);
    expect(inner).toHaveBeenCalledWith(42, null, true);
  });
});
