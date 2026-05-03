// P01b — POST /api/auth/signup
// Failure categories emitted: auth.signup.email_taken, auth.signup.password_weak,
// auth.signup.turnstile_fail, auth.signup.rate_limit, auth.signup.resend_send_fail.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { checkPasswordStrength } from "@/lib/auth/password";
import { verifyTurnstile } from "@/lib/auth/turnstile";
import { checkPerIp } from "@/lib/rate-limit/upstash";
import { authFailure, authSuccess, getClientIp } from "@/lib/auth/responses";
import { sendAuthEmail } from "@/lib/email/resend";
import { SignupVerifyEmail } from "@/emails/signup-verify";
import { redactLogPayload } from "@/lib/log/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  turnstileToken: z.string().min(1),
});

const EMAIL_SENDING_ENABLED = process.env.EMAIL_SENDING_ENABLED === "true";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://covainterior.com";

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return authFailure(
      "auth.signup.password_weak",
      "Please check your email and password, then try again.",
      400,
      "schema-validation-failed",
    );
  }

  const ip = getClientIp(req);
  const rl = await checkPerIp("signup", ip);
  if (!rl.ok) {
    const minutes = Math.ceil((rl.retryAfterSec ?? 60) / 60);
    return authFailure(
      "auth.signup.rate_limit",
      `Too many signup attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      429,
      `retry-after-${rl.retryAfterSec}s`,
    );
  }

  const turnstile = await verifyTurnstile(body.turnstileToken, ip);
  if (!turnstile.ok) {
    return authFailure(
      "auth.signup.turnstile_fail",
      "Couldn't verify you're human. Please try again.",
      400,
      turnstile.errorCodes?.join(",") ?? "unknown",
    );
  }

  const pw = checkPasswordStrength(body.password);
  if (!pw.ok) {
    return authFailure(
      "auth.signup.password_weak",
      pw.warning ?? "Choose a stronger password.",
      400,
      `score-${pw.score}`,
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: signupData, error: signupError } = await supabase.auth.signUp({
    email: body.email,
    password: body.password,
    options: {
      emailRedirectTo: `${APP_URL}/auth/callback?next=/auth/verify-email-success`,
    },
  });

  if (signupError) {
    if (/already.*registered|already.*exists/i.test(signupError.message)) {
      return authFailure(
        "auth.signup.email_taken",
        "An account already exists for that email. Try signing in instead.",
        409,
        "email-taken",
      );
    }
    // eslint-disable-next-line no-console
    console.warn("[auth/signup] supabase.auth.signUp failed", redactLogPayload({ message: signupError.message }));
    return authFailure(
      "auth.signup.password_weak",
      "We couldn't create your account. Please try again.",
      400,
      signupError.message,
    );
  }

  const userId = signupData.user?.id;

  // V1 deferral: when email is off, auto-verify server-side via admin API.
  if (userId && !EMAIL_SENDING_ENABLED) {
    try {
      const admin = createAdminSupabaseClient();
      await admin.auth.admin.updateUserById(userId, { email_confirm: true });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "unknown";
      // eslint-disable-next-line no-console
      console.warn("[auth/signup] auto-verify failed", redactLogPayload({ detail }));
    }
  }

  // sendAuthEmail handles EMAIL_SENDING_ENABLED short-circuit internally.
  const verifyUrl = `${APP_URL}/auth/verify-email-success`;
  const sendResult = await sendAuthEmail({
    to: body.email,
    subject: "Verify your Cova account",
    react: SignupVerifyEmail({ verifyUrl }),
    costCategory: "auth.email.verification",
  });

  if (!sendResult.ok) {
    // Don't fail signup on email-send failure; user can request resend.
    // eslint-disable-next-line no-console
    console.warn("[auth/signup] email send failed", redactLogPayload({ detail: sendResult.detail }));
  }

  return authSuccess({ redirectTo: "/auth/verify-email-sent" });
}

void NextResponse;
