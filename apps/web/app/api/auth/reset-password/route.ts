// P01b — POST /api/auth/reset-password
// Failure categories emitted: auth.reset.token_expired, auth.reset.token_used,
// auth.reset.password_weak, auth.signup.rate_limit.

import { type NextRequest } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { checkPasswordStrength } from "@/lib/auth/password";
import { checkPerIp } from "@/lib/rate-limit/upstash";
import { authFailure, authSuccess, getClientIp } from "@/lib/auth/responses";
import { redactLogPayload } from "@/lib/log/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  newPassword: z.string().min(8).max(128),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return authFailure(
      "auth.reset.password_weak",
      "Choose a stronger password.",
      400,
      "schema-validation-failed",
    );
  }

  const ip = getClientIp(req);
  const rl = await checkPerIp("reset-password", ip);
  if (!rl.ok) {
    const minutes = Math.ceil((rl.retryAfterSec ?? 60) / 60);
    return authFailure(
      "auth.signup.rate_limit",
      `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      429,
      `retry-after-${rl.retryAfterSec}s`,
    );
  }

  const pw = checkPasswordStrength(body.newPassword);
  if (!pw.ok) {
    return authFailure(
      "auth.reset.password_weak",
      pw.warning ?? "Choose a stronger password.",
      400,
      `score-${pw.score}`,
    );
  }

  // Reset-password runs after the user clicked the recovery link, which
  // exchanged the recovery token for a session via /auth/callback. Now
  // updateUser() with the new password is bound to that session.
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return authFailure(
      "auth.reset.token_expired",
      "This reset link expired. Request a new one.",
      401,
      "no-session",
    );
  }

  const { error } = await supabase.auth.updateUser({ password: body.newPassword });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[auth/reset] updateUser failed", redactLogPayload({ detail: error.message }));
    if (/expired|invalid/i.test(error.message)) {
      return authFailure(
        "auth.reset.token_expired",
        "This reset link expired. Request a new one.",
        401,
        error.message,
      );
    }
    return authFailure(
      "auth.reset.token_used",
      "This reset link has already been used.",
      400,
      error.message,
    );
  }

  return authSuccess({ redirectTo: "/auth/signin" });
}
