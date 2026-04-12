/**
 * Persist a planned bracket to Supabase: insert matches, wire next_match_id, then
 * resolve R1 byes and spawn games via DB RPCs (see migration).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  getBracketSizeFromPlans,
  matchKey,
  planSingleEliminationBracket,
  totalRoundsForBracketSize,
} from '@/lib/tournamentBracket';
import type { BracketMatchPlan, SeededParticipant } from '@/lib/tournamentTypes';

/** Invalid or unsafe bracket persistence (state machine / idempotency). */
export class TournamentBracketPersistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TournamentBracketPersistError';
  }
}

export type BracketPersistPrecheck =
  | { action: 'insert_new' }
  | { action: 'idempotent_return' }
  | { action: 'reject'; code: 'completed' | 'incomplete' | 'wrong_status_for_new'; detail: string };

/** Pure guard for bracket persistence (mirrors `persistTournamentBracket` state checks). */
export function precheckBracketPersist(tournamentStatus: string, existingMatchCount: number): BracketPersistPrecheck {
  const t = String(tournamentStatus ?? '');
  if (t === 'completed') {
    return { action: 'reject', code: 'completed', detail: 'Tournament is completed' };
  }
  if (existingMatchCount > 0) {
    if (t === 'pending') {
      return {
        action: 'reject',
        code: 'incomplete',
        detail: 'Matches exist while tournament still pending',
      };
    }
    return { action: 'idempotent_return' };
  }
  if (t !== 'pending') {
    return {
      action: 'reject',
      code: 'wrong_status_for_new',
      detail: `Expected pending for first bracket (got ${t})`,
    };
  }
  return { action: 'insert_new' };
}

export type TournamentMatchRow = {
  id: string;
  tournament_id: string;
  round_number: number;
  match_number: number;
  player1_id: string | null;
  player2_id: string | null;
  game_id: string | null;
  winner_id: string | null;
  next_match_id: string | null;
  advance_winner_as: string | null;
};

/** Write `seed` on `tournament_entries` (1 = best). Call after entries exist and bracket order is known. */
export async function applyTournamentEntrySeeds(
  client: SupabaseClient,
  tournamentId: string,
  seeded: SeededParticipant[]
): Promise<void> {
  for (const s of seeded) {
    const { error } = await client
      .from('tournament_entries')
      .update({ seed: s.seed })
      .eq('tournament_id', tournamentId)
      .eq('user_id', s.userId);
    if (error) throw error;
  }
}

/** Sort order in `seeded` must match `orderedUserIds` passed to `persistTournamentBracket`. */
export async function persistTournamentBracketFromSeeds(
  client: SupabaseClient,
  tournamentId: string,
  seeded: SeededParticipant[]
): Promise<{ plans: BracketMatchPlan[]; matchRows: TournamentMatchRow[]; idempotentReplay?: true }> {
  await applyTournamentEntrySeeds(client, tournamentId, seeded);
  const orderedUserIds = seeded.map((s) => s.userId);
  return persistTournamentBracket(client, tournamentId, orderedUserIds);
}

/** Insert plans, link next_match_id, set tournament active, process byes + initial games. */
export async function persistTournamentBracket(
  client: SupabaseClient,
  tournamentId: string,
  orderedUserIds: string[]
): Promise<{ plans: BracketMatchPlan[]; matchRows: TournamentMatchRow[]; idempotentReplay?: true }> {
  const { data: tMeta, error: tMetaErr } = await client
    .from('tournaments')
    .select('status')
    .eq('id', tournamentId)
    .single();
  if (tMetaErr) throw tMetaErr;
  const tStatus = String(tMeta?.status ?? '');

  const { count: existingMatchCount, error: cntErr } = await client
    .from('tournament_matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);
  if (cntErr) throw cntErr;

  const gate = precheckBracketPersist(tStatus, existingMatchCount ?? 0);
  if (gate.action === 'reject') {
    throw new TournamentBracketPersistError(
      gate.code === 'completed'
        ? 'Tournament is completed; cannot persist bracket.'
        : gate.code === 'incomplete'
          ? 'Bracket rows exist but tournament is still pending (incomplete persist). Repair or delete matches before retrying.'
          : `Expected status 'pending' to create a new bracket (current: '${tStatus}').`,
    );
  }
  if (gate.action === 'idempotent_return') {
    const { data: full, error: fetchErr } = await client
      .from('tournament_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('round_number', { ascending: true })
      .order('match_number', { ascending: true });
    if (fetchErr) throw fetchErr;
    return {
      plans: planSingleEliminationBracket(orderedUserIds),
      matchRows: (full ?? []) as TournamentMatchRow[],
      idempotentReplay: true,
    };
  }

  const plans = planSingleEliminationBracket(orderedUserIds);

  const insertPayload = plans.map((p) => ({
    tournament_id: tournamentId,
    round_number: p.roundNumber,
    match_number: p.matchNumber,
    player1_id: p.player1Id,
    player2_id: p.player2Id,
    advance_winner_as: p.advanceWinnerAs,
    next_match_id: null as string | null,
  }));

  const { data: inserted, error: insErr } = await client
    .from('tournament_matches')
    .insert(insertPayload)
    .select('id, round_number, match_number');

  if (insErr) throw insErr;
  const rows = (inserted ?? []) as Pick<TournamentMatchRow, 'id' | 'round_number' | 'match_number'>[];
  const idMap = new Map<string, string>();
  for (const r of rows) {
    idMap.set(matchKey(r.round_number, r.match_number), r.id);
  }

  const bracketSize = getBracketSizeFromPlans(plans);
  const totalRounds = totalRoundsForBracketSize(bracketSize);

  for (const r of rows) {
    if (r.round_number >= totalRounds) continue;
    const parentR = r.round_number + 1;
    const parentM = Math.floor(r.match_number / 2);
    const nextId = idMap.get(matchKey(parentR, parentM));
    if (!nextId) continue;
    const { error: upErr } = await client
      .from('tournament_matches')
      .update({ next_match_id: nextId })
      .eq('id', r.id);
    if (upErr) throw upErr;
  }

  const { error: stErr } = await client
    .from('tournaments')
    .update({ status: 'active' })
    .eq('id', tournamentId)
    .eq('status', 'pending');
  if (stErr) throw stErr;

  const { error: procErr } = await client.rpc('tournament_bootstrap_round', {
    p_tournament_id: tournamentId,
  });
  if (procErr) throw procErr;

  const { data: full, error: fetchErr } = await client
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('round_number', { ascending: true })
    .order('match_number', { ascending: true });
  if (fetchErr) throw fetchErr;

  return { plans, matchRows: (full ?? []) as TournamentMatchRow[] };
}
