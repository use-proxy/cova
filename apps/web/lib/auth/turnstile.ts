// P01b — Cloudflare Turnstile siteverify. Halts at first call if secret missing
// (lazy halt rather than module-load halt so Next.js build can run without
// the env var).

function getTurnstileSecret(): string {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    throw new Error("[lib/auth/turnstile] TURNSTILE_SECRET_KEY must be set");
  }
  return secret;
}

interface TurnstileResponse {
  success: boolean;
  "error-codes"?: string[];
  hostname?: string;
  challenge_ts?: string;
  action?: string;
}

export interface TurnstileResult {
  ok: boolean;
  errorCodes?: string[];
}

export async function verifyTurnstile(
  token: string,
  remoteip?: string,
): Promise<TurnstileResult> {
  try {
    const params = new URLSearchParams();
    params.set("secret", getTurnstileSecret());
    params.set("response", token);
    if (remoteip) params.set("remoteip", remoteip);

    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      },
    );

    if (!res.ok) {
      return { ok: false, errorCodes: [`http-${res.status}`] };
    }

    const data = (await res.json()) as TurnstileResponse;
    return data.success
      ? { ok: true }
      : { ok: false, errorCodes: data["error-codes"] ?? ["unknown"] };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    return { ok: false, errorCodes: [`fetch-failed:${detail}`] };
  }
}
