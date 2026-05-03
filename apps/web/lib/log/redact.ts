import { createHash } from "node:crypto";
import { sanitizeForbiddenNames } from "@/lib/ai/forbidden-names";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /\+?\d[\d\s\-().]{7,}\d/g;
const ADDRESS_RE = /\b\d{1,5}\s+[A-Za-z0-9.\s]+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Lane|Ln|Drive|Dr|Court|Ct|Way)\b/gi;

const FORBIDDEN_KEYS = new Set<string>([
  "password",
  "apiKey",
  "accessToken",
  "refreshToken",
  "secretKey",
  "creditCard",
  "cvv",
  "ssn",
  "dob",
  "authToken",
  "magicLinkToken",
]);

const TRANSFORM_KEYS: Record<string, (v: unknown) => unknown> = {
  userId: (v) => (typeof v === "string" ? createHash("sha256").update(v).digest("hex").slice(0, 8) : "[invalid]"),
  sessionId: () => "[redacted]",
  ipAddress: () => "[redacted]",
  userAgent: (v) => (typeof v === "string" ? v.slice(0, 64) : "[invalid]"),
};

const redactString = (s: string): string =>
  // PII strip first, then forbidden-name scrub (D-008 layer 5; preserves Phase 3 defense).
  sanitizeForbiddenNames(
    s
      .replace(EMAIL_RE, "[email]")
      .replace(PHONE_RE, "[phone]")
      .replace(ADDRESS_RE, "[address]")
  );

export function redactLogPayload<T>(input: T): T {
  if (input == null) return input;
  if (typeof input === "string") return redactString(input) as unknown as T;
  if (typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map((x) => redactLogPayload(x)) as unknown as T;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(k)) {
      out[k] = "[redacted]";
      continue;
    }
    if (k in TRANSFORM_KEYS) {
      out[k] = TRANSFORM_KEYS[k](v);
      continue;
    }
    out[k] = redactLogPayload(v);
  }
  return out as T;
}

export const _internals = { EMAIL_RE, PHONE_RE, ADDRESS_RE, FORBIDDEN_KEYS, TRANSFORM_KEYS };
