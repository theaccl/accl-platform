'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/** Session key for `/modes` to lightly highlight where the user last was (UX only). */
export const ACCL_SHELL_CONTEXT_KEY = 'accl_shell_context';

/** Maps last stored path to a mode card id for `/modes` highlighting (best-effort). */
export function shellContextCardId(pathname: string | null): 'home' | 'free' | 'tournaments' | 'finished' | 'profile' | 'vault' | null {
  if (!pathname) return null;
  if (pathname === '/') return 'home';
  if (pathname === '/free' || pathname.startsWith('/free/')) return 'free';
  if (pathname.startsWith('/tournaments')) return 'tournaments';
  if (pathname.startsWith('/finished')) return 'finished';
  if (pathname.startsWith('/profile')) return 'profile';
  if (pathname.startsWith('/vault')) return 'vault';
  return null;
}

const defaultStyle: CSSProperties = {
  color: '#fde047',
  fontWeight: 700,
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
};

type Props = {
  style?: CSSProperties;
};

/**
 * Persistent entry to the canonical mode selector (`/modes`).
 * Records the current pathname so `/modes` can hint at the last shell context.
 */
export function SwitchModeLink({ style }: Props) {
  const pathname = usePathname() ?? '';

  useEffect(() => {
    if (!pathname || pathname === '/login') return;
    try {
      sessionStorage.setItem(ACCL_SHELL_CONTEXT_KEY, pathname);
    } catch {
      /* ignore */
    }
  }, [pathname]);

  return (
    <Link
      href="/modes"
      data-testid="switch-mode-link"
      style={{ ...defaultStyle, ...style }}
    >
      Switch mode
    </Link>
  );
}
