import type { EligibilityDecision } from '@/lib/eligibilityPolicy';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NexusEcosystem } from '@/lib/nexus/getNexusData';
import {
  EligibilityEnforcementError,
  enforceFreeTournamentJoin,
  resolveEligibilityDecisionForUser,
} from '@/lib/tournamentEligibilityEnforcement';

/** T1-D MVP cap until `tournaments.max_entrants` (or similar) exists. */
export const DEFAULT_FREE_TOURNAMENT_MAX_ENTRANTS = 8;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTournamentJoinUuid(v: string): boolean {
  return UUID_RE.test(v);
}

function tournamentRowEcosystem(raw: string | null | undefined): NexusEcosystem {
  return String(raw ?? 'adult')
    .trim()
    .toLowerCase() === 'k12'
    ? 'k12'
    : 'adult';
}

export type FreePendingTournamentJoinResult =
  | { ok: true; alreadyJoined: boolean; eligibility: EligibilityDecision }
  | { ok: false; status: number; payload: Record<string, unknown> };

/**
 * Service-role path: insert `tournament_entries` for free pending tournaments while RLS stays strict for clients.
 */
export async function executeFreePendingTournamentJoin(params: {
  supabase: SupabaseClient;
  userId: string;
  tournamentId: string;
  userEcosystem: NexusEcosystem;
}): Promise<FreePendingTournamentJoinResult> {
  const { supabase, userId, tournamentId, userEcosystem } = params;

  if (!isTournamentJoinUuid(tournamentId)) {
    return {
      ok: false,
      status: 400,
      payload: { error: 'tournamentId must be a UUID', code: 'INVALID_TOURNAMENT_ID' },
    };
  }

  const decision = await resolveEligibilityDecisionForUser(supabase, userId);
  try {
    enforceFreeTournamentJoin(decision);
  } catch (e) {
    if (e instanceof EligibilityEnforcementError) {
      return {
        ok: false,
        status: 403,
        payload: { error: e.message, code: e.code, eligibility: e.decision },
      };
    }
    throw e;
  }

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (pErr) {
    return {
      ok: false,
      status: 502,
      payload: { error: pErr.message, code: 'PROFILE_LOOKUP_FAILED' },
    };
  }
  if (!profile) {
    return {
      ok: false,
      status: 404,
      payload: { error: 'Profile not found for this account.', code: 'PROFILE_NOT_FOUND' },
    };
  }

  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select('id, status, ecosystem_scope, entry_fee_cents')
    .eq('id', tournamentId)
    .maybeSingle();

  if (tErr) {
    return {
      ok: false,
      status: 502,
      payload: { error: tErr.message, code: 'TOURNAMENT_LOOKUP_FAILED' },
    };
  }
  if (!tournament) {
    return {
      ok: false,
      status: 404,
      payload: { error: 'Tournament not found.', code: 'TOURNAMENT_NOT_FOUND' },
    };
  }

  const st = String(tournament.status ?? '').toLowerCase();
  if (st !== 'pending') {
    return {
      ok: false,
      status: 400,
      payload: {
        error: 'Tournament is not open for self-serve join (must be pending).',
        code: 'TOURNAMENT_NOT_JOINABLE',
        tournamentStatus: tournament.status ?? null,
      },
    };
  }

  const fee = tournament.entry_fee_cents;
  if (fee != null && fee > 0) {
    return {
      ok: false,
      status: 400,
      payload: {
        error:
          'This tournament requires a paid entry. Complete payment checkout when that flow is available for your account.',
        code: 'PAID_ENTRY_REQUIRED',
      },
    };
  }

  const tEco = tournamentRowEcosystem(tournament.ecosystem_scope);
  if (userEcosystem !== tEco) {
    return {
      ok: false,
      status: 403,
      payload: {
        error: 'This tournament is not available in your ecosystem.',
        code: 'ECOSYSTEM_MISMATCH',
        tournamentEcosystem: tEco,
        userEcosystem,
      },
    };
  }

  const { count: matchCount, error: mcErr } = await supabase
    .from('tournament_matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);
  if (mcErr) {
    return {
      ok: false,
      status: 502,
      payload: { error: mcErr.message, code: 'MATCH_COUNT_FAILED' },
    };
  }
  if ((matchCount ?? 0) > 0) {
    return {
      ok: false,
      status: 400,
      payload: {
        error: 'Bracket matches already exist for this tournament; registration is closed.',
        code: 'REGISTRATION_CLOSED',
      },
    };
  }

  const maxEntrants = DEFAULT_FREE_TOURNAMENT_MAX_ENTRANTS;
  const { count: entrantCount, error: ecErr } = await supabase
    .from('tournament_entries')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);
  if (ecErr) {
    return {
      ok: false,
      status: 502,
      payload: { error: ecErr.message, code: 'ENTRANT_COUNT_FAILED' },
    };
  }
  if ((entrantCount ?? 0) >= maxEntrants) {
    return {
      ok: false,
      status: 400,
      payload: {
        error: 'Tournament is full.',
        code: 'TOURNAMENT_FULL',
        maxEntrants,
      },
    };
  }

  const { data: existing, error: exErr } = await supabase
    .from('tournament_entries')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .maybeSingle();
  if (exErr) {
    return {
      ok: false,
      status: 502,
      payload: { error: exErr.message, code: 'ENTRY_LOOKUP_FAILED' },
    };
  }
  if (existing) {
    return { ok: true, alreadyJoined: true, eligibility: decision };
  }

  const { error: insErr } = await supabase.from('tournament_entries').insert({
    tournament_id: tournamentId,
    user_id: userId,
  });
  if (insErr) {
    if (insErr.code === '23505') {
      return { ok: true, alreadyJoined: true, eligibility: decision };
    }
    return {
      ok: false,
      status: 502,
      payload: { error: insErr.message, code: 'ENTRY_INSERT_FAILED' },
    };
  }

  return { ok: true, alreadyJoined: false, eligibility: decision };
}
