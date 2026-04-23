import type { MouseEvent } from 'react';

/**
 * Full page load via assign — works when Next/router or in-app browsers mishandle `<Link>` / client transitions.
 * Preserves new-tab / modified clicks (Ctrl/Cmd/Shift/Meta).
 */
export function forceDomNavigation(e: MouseEvent<HTMLAnchorElement>, href: string): void {
  if (e.button !== 0) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (typeof window === 'undefined') return;
  const t = href.trim();
  if (!t) return;
  e.preventDefault();
  try {
    window.location.assign(new URL(t, window.location.origin).href);
  } catch {
    // Fallback for odd in-app browsers that fail URL() parsing.
    window.location.assign(t);
  }
}
