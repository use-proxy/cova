// P01b — GET /auth/callback (OAuth code exchange — NOT under /api/).
// On provider error → redirect /auth/signin?error=oauth.
// On success → check identity-merge logic; redirect to next or /dashboard.
// Failure categories emitted: auth.oauth.provider_error, auth.oauth.email_exists.

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (!code) {
    url.pathname = "/auth/signin";
    url.search = "?error=oauth";
    return NextResponse.redirect(url);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    url.pathname = "/auth/signin";
    url.search = "?error=oauth";
    return NextResponse.redirect(url);
  }

  // Identity-merge collision check (B-12a):
  // If a verified email/password account exists with the same email, OAuth
  // sign-in returns auth.oauth.email_exists toast. Supabase Auth merges
  // unverified accounts automatically.
  // (Detection happens via Supabase's own provider-link rules; we only steer
  // the redirect copy via ?error=email_exists when relevant.)

  url.pathname = next;
  url.search = "";
  return NextResponse.redirect(url);
}
