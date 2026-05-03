// P01b — POST /api/auth/sign-out
// No failure categories emitted in normal path; auth.session.expired only if
// session check fails.

import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { authSuccess } from "@/lib/auth/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(_req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  return authSuccess({ redirectTo: "/" });
}
