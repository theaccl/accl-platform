import { getSupabaseUserFromCookies } from '@/lib/auth/getSupabaseUserFromCookies';
import { resolveAuthenticatedUser } from '@/lib/requestAuth';

export type TournamentJoinActor = {
  id: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
};

export async function resolveTournamentJoinActorCookieOnly(): Promise<TournamentJoinActor | null> {
  const u = await getSupabaseUserFromCookies();
  if (!u?.id) return null;
  return {
    id: u.id,
    app_metadata: (u.app_metadata ?? {}) as Record<string, unknown>,
    user_metadata: (u.user_metadata ?? {}) as Record<string, unknown>,
  };
}

/** @deprecated Prefer cookie session (`/api/tournaments/join`); kept for legacy API clients. */
export async function resolveTournamentJoinActorCookieOrBearer(
  request: Request
): Promise<TournamentJoinActor | null> {
  const cookie = await resolveTournamentJoinActorCookieOnly();
  if (cookie) return cookie;
  const b = await resolveAuthenticatedUser(request);
  if (!b?.id) return null;
  return { id: b.id, app_metadata: b.app_metadata, user_metadata: b.user_metadata };
}
