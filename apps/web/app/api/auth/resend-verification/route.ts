// P01b — POST /api/auth/resend-verification
// Failure categories emitted: auth.signup.rate_limit, auth.signup.resend_send_fail.

import { type NextRequest } from "next/server";
import { z } from "zod";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  checkPerIp,
  checkPerEmailCooldown,
} from "@/lib/rate-limit/upstash";
import { authFailure, authSuccess, getClientIp } from "@/lib/auth/responses";
import { sendAuthEmail } from "@/lib/email/resend";
import { SignupVerifyEmail } from "@/emails/signup-verify";
import { redactLogPayload } from "@/lib/log/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ email: z.string().email() });
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://covainterior.com";

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    // Anti-enumeration: ok response on schema fail
    return authSuccess({});
  }

  const ip = getClientIp(req);
  const rl = await checkPerIp("resend-verification", ip);
  if (!rl.ok) {
    const minutes = Math.ceil((rl.retryAfterSec ?? 60) / 60);
    return authFailure(
      "auth.signup.rate_limit",
      `Too many requests. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      429,
      `retry-after-${rl.retryAfterSec}s`,
    );
  }

  const cooldown = await checkPerEmailCooldown(
    "resend-verification",
    body.email,
    60,
  );
  if (!cooldown.ok) {
    return authSuccess({});
  }

  try {
    const admin = createAdminSupabaseClient();
    // For users who signed up but didn't verify, "magiclink" type re-sends a
    // link that completes their first session and marks email_confirmed.
    const { data: link, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: body.email,
      options: {
        redirectTo: `${APP_URL}/auth/callback?next=/auth/verify-email-success`,
      },
    });
    if (!error && link?.properties?.action_link) {
      const send = await sendAuthEmail({
        to: body.email,
        subject: "Verify your Cova account",
        react: SignupVerifyEmail({ verifyUrl: link.properties.action_link }),
        costCategory: "auth.email.verification",
      });
      if (!send.ok) {
        // eslint-disable-next-line no-console
        console.warn("[auth/resend-verification] send failed", redactLogPayload({ failure_category: send.failure_category, detail: send.detail }));
      }
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    // eslint-disable-next-line no-console
    console.warn("[auth/resend-verification] error", redactLogPayload({ detail }));
  }

  return authSuccess({});
}
