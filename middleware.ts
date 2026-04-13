import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isNexusPath(pathname: string): boolean {
  return pathname === "/nexus" || pathname.startsWith("/nexus/");
}

export async function middleware(request: NextRequest) {
  if (!isNexusPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

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
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", "/nexus");
    return NextResponse.redirect(url);
  }

  supabaseResponse.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
  return supabaseResponse;
}

export const config = {
  matcher: ["/nexus", "/nexus/:path*"],
};
