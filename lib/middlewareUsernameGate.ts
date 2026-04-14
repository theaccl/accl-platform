/**
 * Routes where a signed-in user must have claimed a public username before access.
 * Keep in sync with middleware.ts matcher + pathname exceptions.
 */
export function pathnameRequiresUsernameClaim(pathname: string): boolean {
  if (pathname.startsWith('/onboarding')) return false;
  if (pathname.startsWith('/login')) return false;
  if (pathname.startsWith('/api')) return false;
  if (pathname.startsWith('/_next')) return false;
  if (pathname.startsWith('/share')) return false;
  if (pathname === '/') return false;
  if (pathname.startsWith('/account/configuration-required')) return false;
  // Other people's public profiles — readable without completing own username
  if (/^\/profile\/[0-9a-f-]{36}(\/|$)/i.test(pathname)) return false;

  if (pathname === '/profile') return true;

  return (
    pathname.startsWith('/tester') ||
    pathname.startsWith('/nexus') ||
    pathname.startsWith('/modes') ||
    pathname.startsWith('/game') ||
    pathname.startsWith('/free') ||
    pathname.startsWith('/requests') ||
    pathname.startsWith('/players') ||
    pathname.startsWith('/tournaments') ||
    pathname.startsWith('/finished') ||
    pathname.startsWith('/vault') ||
    pathname.startsWith('/trainer') ||
    pathname.startsWith('/moderator')
  );
}
