import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { checkPerIp, type RouteKey } from "@/lib/rate-limit/upstash";

// Public routes: no auth required (page redirects)
// /                                   landing page
// /auth                               redirects to /auth/signin
// /auth/{signin,signup,...}           luxury auth flow (P01b)
// /auth/callback                      OAuth code exchange (canonical callback — see app/auth/callback/route.ts)
// /design/step-1                      welcome screen (public — no data entry yet)
// /api/quiz/fingerprint               quiz fingerprint computation (public API)

const PROTECTED_PAGE_ROUTES = [
  "/design/step-2",
  "/design/step-3",
  "/design/step-4",
  "/design/step-5",
  "/design/step-6",
  "/design/step-7",
  "/design/step-7p",
  "/design/step-8a",
  "/design/step-8b",
  "/design/step-9",
  "/dashboard",
];

// Public auth pages — never redirect to /auth even when unauthenticated.
const PUBLIC_AUTH_PAGES = [
  "/auth",
  "/auth/signin",
  "/auth/signup",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-email-sent",
  "/auth/verify-email-success",
  "/auth/verify-email-invalid",
  "/auth/callback",
  "/account-deleted",
  "/terms",
  "/privacy",
];

// API routes that are public (no auth check)
// Note: /auth/callback is NOT an API route and needs no entry here — it is not
// protected by the PROTECTED_PAGE_ROUTES list and will pass through automatically.
const PUBLIC_API_ROUTES = [
  "/api/quiz/fingerprint",
  "/api/quiz/next-pair",
  "/api/quiz/next-card",
  "/api/quiz/mood-strip",
  "/api/quiz/mood-board",
  "/api/quiz/validation-renders",
  "/api/style-references/match",
  "/api/rooms/public-count",
  "/api/pipeline", // Pipeline routes have their own auth + dev bypass
  // P01b — auth bootstrap routes (no session yet)
  "/api/auth/signup",
  "/api/auth/signin",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/resend-verification",
  "/api/auth/sign-out",
  // P01b — Vercel cron, bearer-token-authenticated (NOT session)
  "/api/cron/purge-deletion-audit",
  "/api/cron/cost-monitor",
];

// P01b — per-IP rate limit map for /api/auth/* + /api/users/export.
// Per-email and per-user limits enforced inside route handlers (require parsed body).
const RATE_LIMITED_API: Array<{ prefix: string; route: RouteKey }> = [
  { prefix: "/api/auth/signup", route: "signup" },
  { prefix: "/api/auth/signin", route: "signin" },
  { prefix: "/api/auth/forgot-password", route: "forgot-password" },
  { prefix: "/api/auth/reset-password", route: "reset-password" },
  { prefix: "/api/auth/resend-verification", route: "resend-verification" },
  { prefix: "/api/users/export", route: "users-export" },
];

function getMiddlewareIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.ip ?? "0.0.0.0";
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // P01b — per-IP rate-limit insertion BEFORE session refresh, so brute-force
  // floods don't cost us a Supabase session call.
  const rlMatch = RATE_LIMITED_API.find((r) => pathname.startsWith(r.prefix));
  if (rlMatch) {
    const ip = getMiddlewareIp(request);
    const result = await checkPerIp(rlMatch.route, ip);
    if (!result.ok) {
      const minutes = Math.ceil((result.retryAfterSec ?? 60) / 60);
      return NextResponse.json(
        {
          ok: false,
          failure_category: "auth.signup.rate_limit",
          user_message: `Too many requests. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
          detail: `retry-after-${result.retryAfterSec}s`,
        },
        { status: 429, headers: { "Retry-After": String(result.retryAfterSec ?? 60) } },
      );
    }
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Authenticated user hitting exactly / → redirect to /dashboard
  if (user && pathname === "/") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  // Public auth pages: no auth gate.
  const isPublicAuthPage = PUBLIC_AUTH_PAGES.some((route) =>
    pathname === route || pathname.startsWith(route + "/"),
  );

  // Protected page routes → redirect unauthenticated users to /auth/signin
  const isProtectedPage = PROTECTED_PAGE_ROUTES.some((route) =>
    pathname.startsWith(route),
  );
  if (isProtectedPage && !user && !isPublicAuthPage) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/signin";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Protected API routes → return 401 JSON for unauthenticated requests
  const isPublicApi = PUBLIC_API_ROUTES.some((route) =>
    pathname.startsWith(route),
  );
  const isApiRoute = pathname.startsWith("/api/");

  if (isApiRoute && !isPublicApi && !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/dev|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
