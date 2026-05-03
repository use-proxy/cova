// P01b — POST /api/auth/signin
// Failure categories emitted: auth.signin.invalid_credentials,
// auth.signin.silent_lockout (internal log only — user sees invalid_credentials),
// auth.signup.rate_limit.

import { type NextRequest } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  checkPerIp,
  incrSigninLockout,
  isSigninLockedOut,
  clearSigninLockout,
} from "@/lib/rate-limit/upstash";
import { authFailure, authSuccess, getClientIp } from "@/lib/auth/responses";
import { redactLogPayload } from "@/lib/log/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(256),
});

const INVALID_CREDS_MESSAGE = "That email and password don't match.";

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return authFailure(
      "auth.signin.invalid_credentials",
      INVALID_CREDS_MESSAGE,
      400,
      "schema-validation-failed",
    );
  }

  const ip = getClientIp(req);
  const rl = await checkPerIp("signin", ip);
  if (!rl.ok) {
    const minutes = Math.ceil((rl.retryAfterSec ?? 60) / 60);
    return authFailure(
      "auth.signup.rate_limit",
      `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      429,
      `retry-after-${rl.retryAfterSec}s`,
    );
  }

  // Silent lockout (option γ): if locked, return invalid_credentials to user;
  // log silent_lockout internally.
  if (await isSigninLockedOut(body.email)) {
    // eslint-disable-next-line no-console
    console.info("[auth/signin] silent_lockout", redactLogPayload({ failure_category: "auth.signin.silent_lockout" }));
    return authFailure(
      "auth.signin.invalid_credentials",
      INVALID_CREDS_MESSAGE,
      401,
      "silent-lockout",
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  });

  if (error || !data.user) {
    const lockout = await incrSigninLockout(body.email);
    if (lockout.lockedUntilTs) {
      // eslint-disable-next-line no-console
      console.info("[auth/signin] silent_lockout entered", redactLogPayload({ failure_category: "auth.signin.silent_lockout" }));
    }
    return authFailure(
      "auth.signin.invalid_credentials",
      INVALID_CREDS_MESSAGE,
      401,
      error?.message ?? "no-user",
    );
  }

  await clearSigninLockout(body.email);
  return authSuccess({ redirectTo: "/dashboard" });
}
