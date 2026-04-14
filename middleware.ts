import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { pathnameRequiresUsernameClaim } from "@/lib/middlewareUsernameGate";
import {
  fetchProfileUsernameGateStatus,
  logUsernameGateFailClosed,
} from "@/lib/middlewareUsernameLookup";

function isNexusPath(pathname: string): boolean {
  return pathname === "/nexus" || pathname.startsWith("/nexus/");
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
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

  if (isNexusPath(pathname) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", "/nexus");
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/tester") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (user && pathnameRequiresUsernameClaim(pathname)) {
    const lookup = await fetchProfileUsernameGateStatus(user.id);

    if (lookup.status === "unverified") {
      logUsernameGateFailClosed(lookup);
      const url = request.nextUrl.clone();
      url.pathname = "/account/configuration-required";
      const dest = `${pathname}${request.nextUrl.search}`;
      url.searchParams.set("next", dest || "/tester/welcome");
      return NextResponse.redirect(url);
    }

    if (lookup.needsUsernameClaim) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding/username";
      const dest = `${pathname}${request.nextUrl.search}`;
      url.searchParams.set("next", dest || "/tester/welcome");
      return NextResponse.redirect(url);
    }
  }

  if (isNexusPath(pathname)) {
    supabaseResponse.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
  }
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/nexus",
    "/nexus/:path*",
    "/modes",
    "/modes/:path*",
    "/game",
    "/game/:path*",
    "/free",
    "/free/:path*",
    "/requests",
    "/requests/:path*",
    "/profile",
    "/players",
    "/players/:path*",
    "/tournaments",
    "/tournaments/:path*",
    "/finished",
    "/finished/:path*",
    "/vault",
    "/vault/:path*",
    "/trainer",
    "/trainer/:path*",
    "/moderator",
    "/moderator/:path*",
    "/tester",
    "/tester/:path*",
  ],
};
