// P01b — POST /api/auth/forgot-password
// Anti-enumeration: identical { ok: true } response and timing for both
// registered + unregistered email. Resend send happens inside waitUntil() so
// the user-visible response time is constant.
// Failure categories emitted: auth.forgot.send_fail (Sentry only — never user-visible).

import { type NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  checkPerIp,
  checkPerEmailCooldown,
} from "@/lib/rate-limit/upstash";
import { authFailure, authSuccess, getClientIp } from "@/lib/auth/responses";
import { sendAuthEmail } from "@/lib/email/resend";
import { ForgotPasswordEmail } from "@/emails/forgot-password";
import { redactLogPayload } from "@/lib/log/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ email: z.string().email() });
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://covainterior.com";

async function backgroundSend(email: string) {
  try {
    const admin = createAdminSupabaseClient();
    const { data: link, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${APP_URL}/auth/reset-password`,
      },
    });
    if (error || !link?.properties?.action_link) {
      // eslint-disable-next-line no-console
      console.warn("[auth/forgot] generateLink failed", redactLogPayload({ detail: error?.message ?? "no-link" }));
      return;
    }
    const send = await sendAuthEmail({
      to: email,
      subject: "Reset your Cova password",
      react: ForgotPasswordEmail({ resetUrl: link.properties.action_link }),
      costCategory: "auth.email.reset",
    });
    if (!send.ok) {
      // eslint-disable-next-line no-console
      console.warn("[auth/forgot] send failed", redactLogPayload({ failure_category: send.failure_category, detail: send.detail }));
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    // eslint-disable-next-line no-console
    console.warn("[auth/forgot] background error", redactLogPayload({ detail }));
  }
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    // Anti-enumeration: still return ok:true on schema fail so timing/body
    // don't differ. We log internally.
    // eslint-disable-next-line no-console
    console.info("[auth/forgot] schema-validation-failed");
    return authSuccess({});
  }

  const ip = getClientIp(req);
  const rl = await checkPerIp("forgot-password", ip);
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
    "forgot-password",
    body.email,
    60,
  );
  if (!cooldown.ok) {
    // Same anti-enumeration response. Internal log only.
    // eslint-disable-next-line no-console
    console.info("[auth/forgot] cooldown-active");
    return authSuccess({});
  }

  waitUntil(backgroundSend(body.email));

  return authSuccess({});
}
