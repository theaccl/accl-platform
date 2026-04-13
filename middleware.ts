import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { NEXUS_LOGIN_ENTRY_HREF } from "@/lib/nexus/nexusRouteHelpers";

function hasSupabaseSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => /^sb-.*-auth-token$/.test(c.name) && Boolean(c.value?.trim()));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname !== "/nexus" && !pathname.startsWith("/nexus/")) {
    return NextResponse.next();
  }

  if (!hasSupabaseSessionCookie(request)) {
    return NextResponse.redirect(new URL(NEXUS_LOGIN_ENTRY_HREF, request.url));
  }

  const res = NextResponse.next();
  res.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
  return res;
}

export const config = {
  matcher: ["/nexus", "/nexus/:path*"],
};
