import type { User } from '@supabase/supabase-js';

import { getSupabaseUserFromCookies } from '@/lib/auth/getSupabaseUserFromCookies';
import type { EmailVerificationUser } from '@/lib/emailVerificationGate';
import { resolveAuthenticatedUser, type AuthenticatedUser } from '@/lib/requestAuth';

export type TournamentJoinActor = EmailVerificationUser & {
  id: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
};

function mapTournamentJoinActor(user: User | AuthenticatedUser): TournamentJoinActor {
  return {
    id: user.id,
    email: user.email,
    email_confirmed_at: user.email_confirmed_at,
    confirmed_at: user.confirmed_at,
    identities: user.identities?.map((identity) => ({ provider: identity.provider })) ?? null,
    app_metadata: (user.app_metadata ?? {}) as Record<string, unknown>,
    user_metadata: (user.user_metadata ?? {}) as Record<string, unknown>,
  };
}

export async function resolveTournamentJoinActorCookieOnly(): Promise<TournamentJoinActor | null> {
  const u = await getSupabaseUserFromCookies();
  if (!u?.id) return null;
  return mapTournamentJoinActor(u);
}

/** @deprecated Prefer cookie session (`/api/tournaments/join`); kept for legacy API clients. */
export async function resolveTournamentJoinActorCookieOrBearer(
  request: Request,
): Promise<TournamentJoinActor | null> {
  const cookie = await resolveTournamentJoinActorCookieOnly();
  if (cookie) return cookie;
  const bearer = await resolveAuthenticatedUser(request);
  if (!bearer?.id) return null;
  return mapTournamentJoinActor(bearer);
}
