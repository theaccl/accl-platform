import type { EligibilityDecision } from '@/lib/eligibilityPolicy';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NexusEcosystem } from '@/lib/nexus/getNexusData';
import { checkTournamentRegistrationOpen } from '@/lib/server/tournamentRegistrationGate';
import { tournamentApiErrorPayload } from '@/lib/server/tournamentUserFacingError';
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
      payload: tournamentApiErrorPayload('INVALID_TOURNAMENT_ID'),
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
        payload: { ...tournamentApiErrorPayload(e.code, e.message), eligibility: e.decision },
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
      payload: tournamentApiErrorPayload('PROFILE_LOOKUP_FAILED', pErr.message),
    };
  }
  if (!profile) {
    return {
      ok: false,
      status: 404,
      payload: tournamentApiErrorPayload('PROFILE_NOT_FOUND'),
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
      payload: tournamentApiErrorPayload('TOURNAMENT_LOOKUP_FAILED', tErr.message),
    };
  }
  if (!tournament) {
    return {
      ok: false,
      status: 404,
      payload: tournamentApiErrorPayload('TOURNAMENT_NOT_FOUND'),
    };
  }

  const st = String(tournament.status ?? '').toLowerCase();
  if (st !== 'pending') {
    return {
      ok: false,
      status: 400,
      payload: tournamentApiErrorPayload('TOURNAMENT_NOT_JOINABLE', null, {
        tournamentStatus: tournament.status ?? null,
      }),
    };
  }

  const fee = tournament.entry_fee_cents;
  if (fee != null && fee > 0) {
    return {
      ok: false,
      status: 400,
      payload: tournamentApiErrorPayload('PAID_ENTRY_REQUIRED'),
    };
  }

  const tEco = tournamentRowEcosystem(tournament.ecosystem_scope);
  if (userEcosystem !== tEco) {
    return {
      ok: false,
      status: 403,
      payload: tournamentApiErrorPayload('ECOSYSTEM_MISMATCH', null, {
        tournamentEcosystem: tEco,
        userEcosystem,
      }),
    };
  }

  const registration = await checkTournamentRegistrationOpen(supabase, tournamentId);
  if (!registration.open) {
    return {
      ok: false,
      status: registration.code === 'MATCH_COUNT_FAILED' ? 502 : 400,
      payload: tournamentApiErrorPayload(registration.code),
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
      payload: tournamentApiErrorPayload('ENTRANT_COUNT_FAILED', ecErr.message),
    };
  }
  if ((entrantCount ?? 0) >= maxEntrants) {
    return {
      ok: false,
      status: 400,
      payload: tournamentApiErrorPayload('TOURNAMENT_FULL', null, { maxEntrants }),
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
      payload: tournamentApiErrorPayload('ENTRY_LOOKUP_FAILED', exErr.message),
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
      payload: tournamentApiErrorPayload('ENTRY_INSERT_FAILED', insErr.message),
    };
  }

  return { ok: true, alreadyJoined: false, eligibility: decision };
}
