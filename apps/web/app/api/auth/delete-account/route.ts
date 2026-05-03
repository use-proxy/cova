// P01b — POST /api/auth/delete-account
// Invokes the delete-user-cascade Edge Function with the caller's session.
// Failure categories emitted: auth.delete.confirm_mismatch, auth.delete.cascade_fail,
// auth.session.expired.

import { type NextRequest } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  checkPerUserLockout,
  setPerUserLockout,
} from "@/lib/rate-limit/upstash";
import { authFailure, authSuccess } from "@/lib/auth/responses";
import { sendAuthEmail } from "@/lib/email/resend";
import { DeletionConfirmationEmail } from "@/emails/deletion-confirmation";
import { redactLogPayload } from "@/lib/log/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  confirmText: z.literal("DELETE"),
  confirmEmail: z.string().email(),
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return authFailure(
      "auth.delete.confirm_mismatch",
      "Type DELETE to confirm.",
      400,
      "schema-validation-failed",
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return authFailure(
      "auth.session.expired",
      "Your session expired. Please sign in again.",
      401,
      userError?.message ?? "no-user",
    );
  }

  if (body.confirmEmail.toLowerCase() !== (user.email ?? "").toLowerCase()) {
    return authFailure(
      "auth.delete.confirm_mismatch",
      "Email doesn't match. Type your account email to confirm.",
      400,
      "email-mismatch",
    );
  }

  // 1-hour lockout on previous failure.
  const lock = await checkPerUserLockout("delete-account", user.id, 3600);
  if (!lock.ok) {
    return authFailure(
      "auth.delete.cascade_fail",
      "We couldn't delete your account. Try again later.",
      429,
      `retry-after-${lock.retryAfterSec}s`,
    );
  }

  // Get the user's access token to authenticate the Edge Function call.
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    return authFailure(
      "auth.session.expired",
      "Your session expired. Please sign in again.",
      401,
      "no-access-token",
    );
  }

  try {
    const url = `${SUPABASE_URL}/functions/v1/delete-user-cascade`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok !== true) {
      await setPerUserLockout("delete-account", user.id, 3600);
      // eslint-disable-next-line no-console
      console.warn("[auth/delete-account] cascade failed", redactLogPayload({ detail: json?.detail ?? `status-${res.status}` }));
      return authFailure(
        "auth.delete.cascade_fail",
        "We couldn't delete your account. Please try again.",
        500,
        json?.detail ?? `status-${res.status}`,
      );
    }
  } catch (err) {
    await setPerUserLockout("delete-account", user.id, 3600);
    const detail = err instanceof Error ? err.message : "unknown";
    return authFailure(
      "auth.delete.cascade_fail",
      "We couldn't delete your account. Please try again.",
      500,
      detail,
    );
  }

  // Fire-and-forget deletion-confirmation email (short-circuits when email off).
  void sendAuthEmail({
    to: user.email!,
    subject: "Your Cova account has been deleted",
    react: DeletionConfirmationEmail(),
    costCategory: "auth.email.deletion_confirmation",
  });

  await supabase.auth.signOut();
  return authSuccess({ redirectTo: "/account-deleted" });
}
