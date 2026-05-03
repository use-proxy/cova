// P01b — Resend wrapper. EMAIL_SENDING_ENABLED short-circuit (V1 deferral
// pattern); paidCall<>() integration for D-011 cost telemetry.
//
// All routes call sendAuthEmail() unconditionally. The flag check happens
// inside this wrapper so the user-facing flow is identical whether email
// is enabled or not.

import { render } from "@react-email/render";
import { nanoid } from "nanoid";
import type { ReactElement } from "react";

import { paidCall } from "@/lib/paid/call";
import type { CostCategory } from "@/lib/cost/categories";
import { RESEND_BLENDED_RATE_USD } from "@/lib/cost/rates";
import type { AuthFailure } from "@/lib/errors/categories";
import { redactLogPayload } from "@/lib/log/redact";

function isEmailSendingEnabled(): boolean {
  return process.env.EMAIL_SENDING_ENABLED === "true";
}

function getResendApiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "[lib/email/resend] EMAIL_SENDING_ENABLED=true but RESEND_API_KEY is unset",
    );
  }
  return key;
}

export const RESEND_FROM = "Cova <auth@send.covainterior.com>";

export type AuthEmailCategory = Extract<CostCategory, `auth.email.${string}`>;

const CATEGORY_TO_FAILURE: Record<AuthEmailCategory, AuthFailure> = {
  "auth.email.verification": "auth.signup.resend_send_fail",
  "auth.email.reset": "auth.forgot.send_fail",
  "auth.email.export": "auth.export.zip_fail",
  "auth.email.deletion_confirmation": "auth.delete.cascade_fail",
};

export interface SendAuthEmailInput {
  to: string;
  subject: string;
  react: ReactElement;
  costCategory: AuthEmailCategory;
  tags?: Array<{ name: string; value: string }>;
}

export interface SendAuthEmailResult {
  ok: boolean;
  id?: string;
  failure_category?: AuthFailure;
  detail?: string;
}

interface ResendApiResponse {
  id?: string;
  message?: string;
  name?: string;
  statusCode?: number;
}

export async function sendAuthEmail(
  input: SendAuthEmailInput,
): Promise<SendAuthEmailResult> {
  if (!isEmailSendingEnabled()) {
    // V1 deferral pattern. Synthetic success; no Resend call; no cost row.
    // Single console.info so dev/staging makes it obvious email isn't sending.
    // eslint-disable-next-line no-console
    console.info("[email-disabled] Skipped send", redactLogPayload({ category: input.costCategory }));
    return { ok: true, id: `email-disabled-${nanoid(8)}` };
  }

  let html: string;
  try {
    html = await render(input.react);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "render-failed";
    return {
      ok: false,
      failure_category: CATEGORY_TO_FAILURE[input.costCategory],
      detail,
    };
  }

  const tags = (input.tags ?? []).concat([
    { name: "category", value: input.costCategory.replace(/\./g, "_") },
  ]);

  try {
    const resp = await paidCall<ResendApiResponse>({
      provider: "resend",
      url: "https://api.resend.com/emails",
      init: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getResendApiKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: input.to,
          subject: input.subject,
          html,
          tags,
        }),
      },
      costEstimate: {
        category: input.costCategory,
        costUsd: RESEND_BLENDED_RATE_USD,
        model: "resend",
      },
      failureCategoryOverride: CATEGORY_TO_FAILURE[input.costCategory],
    });

    if (resp.id) {
      return { ok: true, id: resp.id };
    }

    return {
      ok: false,
      failure_category: CATEGORY_TO_FAILURE[input.costCategory],
      detail: resp.message ?? resp.name ?? "no-id-returned",
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown-error";
    return {
      ok: false,
      failure_category: CATEGORY_TO_FAILURE[input.costCategory],
      detail,
    };
  }
}
