import { isSafeHubDocumentId } from '@/lib/nexus/nexusHubMapping';

const GAME_ROUTE_RE = /^\/game\/([^/?#]+)/;

/** Extract a game id from `/game/{id}` routes for observational bug-report context only. */
export function parseGameIdFromRoute(route: string | null | undefined): string | null {
  const m = GAME_ROUTE_RE.exec(String(route ?? '').trim());
  if (!m) return null;
  const id = (m[1] ?? '').trim();
  return isSafeHubDocumentId(id) ? id : null;
}
