import type { SupabaseClient } from '@supabase/supabase-js';

/** Stable code when `tournament_matches` rows exist — registration must not add entrants. */
export const TOURNAMENT_REGISTRATION_CLOSED_CODE = 'REGISTRATION_CLOSED' as const;

export const TOURNAMENT_REGISTRATION_CLOSED_MESSAGE =
  'Registration is closed — the bracket has already been created for this tournament.';

export type TournamentRegistrationGateResult =
  | { open: true }
  | {
      open: false;
      code: typeof TOURNAMENT_REGISTRATION_CLOSED_CODE;
      message: string;
    };

/**
 * Invariant: if any `tournament_matches` exist for this tournament, registration is closed.
 * Used by free join, paid entry, ops add-entrants, and payment webhook entry grant.
 */
export async function checkTournamentRegistrationOpen(
  supabase: SupabaseClient,
  tournamentId: string,
): Promise<TournamentRegistrationGateResult | { open: false; code: 'MATCH_COUNT_FAILED'; message: string }> {
  const { count, error } = await supabase
    .from('tournament_matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);

  if (error) {
    return {
      open: false,
      code: 'MATCH_COUNT_FAILED',
      message: 'Could not verify tournament registration status.',
    };
  }
  if ((count ?? 0) > 0) {
    return {
      open: false,
      code: TOURNAMENT_REGISTRATION_CLOSED_CODE,
      message: TOURNAMENT_REGISTRATION_CLOSED_MESSAGE,
    };
  }
  return { open: true };
}
