// P01b — typed failure-envelope helpers. Every auth route's error path emits
// `{ ok: false, failure_category, user_message, detail? }` per D-012.

import { NextResponse } from "next/server";
import type { AuthFailure } from "@/lib/errors/categories";

export interface FailureEnvelope {
  ok: false;
  failure_category: AuthFailure;
  user_message: string;
  detail?: string;
}

export function authFailure(
  category: AuthFailure,
  user_message: string,
  status: number,
  detail?: string,
): NextResponse<FailureEnvelope> {
  return NextResponse.json<FailureEnvelope>(
    { ok: false, failure_category: category, user_message, detail },
    { status },
  );
}

export function authSuccess<T extends Record<string, unknown>>(
  body: T,
  status = 200,
): NextResponse<{ ok: true } & T> {
  return NextResponse.json({ ok: true as const, ...body }, { status });
}

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "0.0.0.0";
}
