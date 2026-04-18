import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeAcclUsername } from '@/lib/usernameRules';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Route param is a Postgres profile id (UUID), not an ACCL username. */
export function isProfileRouteUuid(segment: string): boolean {
  return UUID_RE.test(segment.trim());
}

export async function resolvePublicProfileIdFromRoute(
  supabase: SupabaseClient,
  routeSegment: string,
): Promise<{ ok: true; profileId: string } | { ok: false; message: string }> {
  const trimmed = routeSegment.trim();
  if (!trimmed) {
    return { ok: false, message: 'Invalid profile id.' };
  }
  if (isProfileRouteUuid(trimmed)) {
    return { ok: true, profileId: trimmed };
  }

  const normalized = normalizeAcclUsername(trimmed);
  if (normalized.length < 2) {
    return { ok: false, message: 'User not found.' };
  }

  const { data, error } = await supabase.rpc('search_public_profiles', {
    p_query: normalized,
    p_limit: 50,
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  const rows = Array.isArray(data) ? data : [];
  const hit = rows.find(
    (r: { id?: unknown; username?: string | null }) =>
      typeof r.id === 'string' && normalizeAcclUsername(r.username ?? '') === normalized,
  );
  if (hit && typeof hit.id === 'string') {
    return { ok: true, profileId: hit.id };
  }
  return { ok: false, message: 'User not found.' };
}
