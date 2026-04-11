/**
 * Manual verification script for fingerprint save.
 *
 * This script is for manual verification only — it does not run in CI.
 *
 * Usage:
 *   npx ts-node scripts/test-fingerprint-save.ts --token=<JWT>
 *
 * How to get a JWT token for testing:
 *   1. Log in to the app at http://localhost:3000
 *   2. Open DevTools > Application > Cookies
 *   3. Find the sb-*-auth-token cookie, decode its base64 value,
 *      and copy the access_token field from the JSON.
 *
 * The script calls POST /api/quiz/fingerprint with a mock fingerprint
 * payload using the provided JWT as a session cookie, then logs whether
 * the insert succeeded and the returned row ID.
 *
 * Set FINGERPRINT_SAVE_VERIFIED=true in .env.local.example after a
 * successful run with a real auth session.
 */

const args = process.argv.slice(2);
const tokenArg = args.find((a) => a.startsWith("--token="));
const token = tokenArg?.split("=")[1];

if (!token) {
  console.error(
    "Usage: npx ts-node scripts/test-fingerprint-save.ts --token=<JWT>",
  );
  process.exit(1);
}

// Extract user ID from JWT payload for logging.
try {
  const [, payloadB64] = token.split(".");
  const payload = JSON.parse(
    Buffer.from(payloadB64!, "base64url").toString("utf8"),
  );
  console.log(
    `[test-fingerprint-save] Token subject: ${payload.sub ?? "(unknown)"}`,
  );
} catch {
  console.warn(
    "[test-fingerprint-save] Could not decode JWT payload — continuing anyway",
  );
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// Supabase SSR auth reads from the sb-<project>-auth-token cookie.
// Pass the raw JWT as that cookie value for local testing.
const SUPABASE_PROJECT = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]
  : "xdeacbmkdwqrwxonqaqh";

const cookieHeader = `sb-${SUPABASE_PROJECT}-auth-token=${encodeURIComponent(JSON.stringify({ access_token: token, token_type: "bearer" }))}`;

const mockPayload = {
  phase_a_selections: [],
  phase_b_responses: [],
  room_type: "living_room",
  budget_tier: "mid",
};

async function main() {
  console.log(
    `[test-fingerprint-save] Calling POST ${APP_URL}/api/quiz/fingerprint`,
  );

  const res = await fetch(`${APP_URL}/api/quiz/fingerprint`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: JSON.stringify(mockPayload),
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    console.error(
      `[test-fingerprint-save] FAILED: HTTP ${res.status} (non-JSON response)`,
    );
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`[test-fingerprint-save] FAILED: HTTP ${res.status}`, data);
    process.exit(1);
  }

  const body = data as Record<string, unknown>;
  const fp = body["fingerprint"] as Record<string, unknown> | undefined;
  console.log(`[test-fingerprint-save] SUCCESS: HTTP ${res.status}`);
  console.log("[test-fingerprint-save] style_name:", body["style_name"]);
  console.log("[test-fingerprint-save] style_tags:", body["style_tags"]);
  console.log(
    "[test-fingerprint-save] fingerprint.confidence:",
    fp?.["confidence"],
  );
  console.log(
    "[test-fingerprint-save] Done. Set FINGERPRINT_SAVE_VERIFIED=true in .env.local.example",
  );
}

main().catch((e) => {
  console.error("[test-fingerprint-save] Unexpected error:", e);
  process.exit(1);
});
