import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { StyleFingerprint } from "@/types/fingerprint";

const COOKIE_NAME = "cova_anon_fingerprint";

/**
 * Parse the cova_anon_fingerprint cookie set by the Zustand fingerprint store.
 * The cookie value is base64(encodeURIComponent(JSON.stringify(zustandState))).
 * Returns the nested state object or null if anything is malformed.
 */
function parseAnonFingerprintCookie(raw: string | undefined): {
  fingerprint: StyleFingerprint;
  styleName: string | null;
  styleTags: string[];
  roomType: string | null;
  budgetTier: string | null;
  phaseBResponses: unknown[];
} | null {
  if (!raw) return null;
  try {
    const json = decodeURIComponent(atob(raw));
    const parsed = JSON.parse(json);
    const state = parsed?.state;
    if (!state?.fingerprint?.dimensions) return null;
    return {
      fingerprint: state.fingerprint as StyleFingerprint,
      styleName: state.styleName ?? null,
      styleTags: Array.isArray(state.styleTags) ? state.styleTags : [],
      roomType: state.roomType ?? null,
      budgetTier: state.budgetTier ?? null,
      phaseBResponses: Array.isArray(state.phaseBResponses) ? state.phaseBResponses : [],
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/design/step-4";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // ── Persist pre-auth fingerprint from cookie ──────────────────────
      // The quiz runs before auth. The computed fingerprint is stored in a
      // cookie by the Zustand fingerprint store. Now that we have an
      // authenticated user, persist it to the DB and clear the cookie.
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const cookieStore = await cookies();
          const rawCookie = cookieStore.get(COOKIE_NAME)?.value;
          const anonState = parseAnonFingerprintCookie(rawCookie);

          if (anonState?.fingerprint?.dimensions) {
            const admin = createAdminSupabaseClient();
            const fp = anonState.fingerprint;

            // Insert into style_fingerprints
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: insertErr } = await (admin.from("style_fingerprints") as any)
              .insert({
                user_id: user.id,
                dimensions: fp.dimensions,
                covariance: fp.covariance,
                confidence: fp.confidence,
                style_name: anonState.styleName ?? "Your Unique Style",
                room_type: anonState.roomType ?? "living_room",
                budget_tier: anonState.budgetTier ?? null,
                quiz_responses: anonState.phaseBResponses,
                entry_path: "pre_auth_quiz",
              });

            if (insertErr) {
              console.error("[auth-callback] fingerprint insert error:", insertErr.message);
            } else {
              console.log("[auth-callback] fingerprint persisted for user:", user.id);
            }

            // Mirror onto users row for downstream /api/render fallback
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: userErr } = await (admin.from("users") as any)
              .update({
                style_fingerprint: fp,
                style_blend: fp.dimensions,
              })
              .eq("id", user.id);

            if (userErr) {
              console.error("[auth-callback] users update error:", userErr.message);
            }

            // Clear the cookie — fingerprint is now in the DB
            cookieStore.set(COOKIE_NAME, "", { path: "/", maxAge: 0, sameSite: "lax" });
          }
        }
      } catch (e) {
        // Fingerprint persistence is best-effort — never block the auth flow
        console.error("[auth-callback] fingerprint persistence error:", e);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth_failed`);
}
