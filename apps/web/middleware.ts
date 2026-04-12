import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Public routes: no auth required (page redirects)
// /                      landing page
// /auth                  sign-in page
// /design/step-1         welcome screen (public — no data entry yet)
// /api/auth/callback     OAuth code exchange
// /api/quiz/fingerprint  quiz fingerprint computation (public API)

const PROTECTED_PAGE_ROUTES = [
  "/design/step-2",
  "/design/step-3",
  "/design/step-4",
  "/design/step-5",
  "/design/step-6",
  "/design/step-7",
  "/design/step-7b",
  "/design/step-7c",
  "/design/step-7d",
  "/design/step-8a",
  "/design/step-8b",
  "/design/step-9",
  "/dashboard",
];

// API routes that are public (no auth check)
const PUBLIC_API_ROUTES = [
  "/api/auth/callback",
  "/api/quiz/fingerprint",
  "/api/quiz/next-pair",
  "/api/quiz/next-card",
  "/api/quiz/mood-strip",
  "/api/quiz/mood-board",
  "/api/quiz/validation-renders",
  "/api/style-references/match",
  "/api/rooms/public-count",
  "/api/test-pipeline",
  "/api/pipeline",  // Pipeline routes have their own auth + dev bypass
];

export async function middleware(request: NextRequest) {
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

  const pathname = request.nextUrl.pathname;

  // Authenticated user hitting exactly / → redirect to /dashboard
  if (user && pathname === "/") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  // Protected page routes → redirect unauthenticated users to /auth
  const isProtectedPage = PROTECTED_PAGE_ROUTES.some((route) =>
    pathname.startsWith(route),
  );
  if (isProtectedPage && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth";
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
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
