import { nextPowerOf2 } from '@/lib/tournamentBracket';
import { DEFAULT_FREE_TOURNAMENT_MAX_ENTRANTS } from '@/lib/server/tournamentFreeJoin';

export type TournamentEntryOrderInput = {
  userId: string;
  seed: number | null;
};

/** Smallest power-of-2 bracket that fits current entrants (min 2, capped at free-tournament max). */
export function tournamentBracketTargetSize(entrantCount: number): number {
  const n = Math.max(0, Math.floor(entrantCount));
  if (n < 2) return 2;
  return Math.min(DEFAULT_FREE_TOURNAMENT_MAX_ENTRANTS, nextPowerOf2(n));
}

/** Entrants fill the bracket slot count (no empty bye slots before start). */
export function isTournamentBracketFull(entrantCount: number): boolean {
  const n = Math.max(0, Math.floor(entrantCount));
  if (n < 2) return false;
  return n === tournamentBracketTargetSize(n);
}

export function orderedUserIdsFromTournamentEntries(entries: TournamentEntryOrderInput[]): string[] {
  const sorted = [...entries].sort((a, b) => {
    if (a.seed != null && b.seed != null && a.seed !== b.seed) return a.seed - b.seed;
    if (a.seed != null && b.seed == null) return -1;
    if (a.seed == null && b.seed != null) return 1;
    return a.userId.localeCompare(b.userId);
  });
  return sorted.map((e) => e.userId);
}

export function canUserOperateTournament(input: {
  userId: string;
  createdById: string | null;
  isModerator: boolean;
}): boolean {
  if (input.isModerator) return true;
  return Boolean(input.createdById && input.createdById === input.userId);
}

export type TournamentPhaseStatus =
  | 'waiting_for_players'
  | 'ready_to_start'
  | 'underway'
  | 'completed';

export function tournamentPhaseStatus(input: {
  status: string;
  entrantCount: number;
  matchCount: number;
}): TournamentPhaseStatus {
  const st = String(input.status ?? '').toLowerCase();
  if (st === 'completed') return 'completed';
  if (st === 'active' || input.matchCount > 0) return 'underway';
  if (isTournamentBracketFull(input.entrantCount)) return 'ready_to_start';
  return 'waiting_for_players';
}

export function tournamentPhaseStatusLabel(phase: TournamentPhaseStatus): string {
  switch (phase) {
    case 'waiting_for_players':
      return 'Waiting for players';
    case 'ready_to_start':
      return 'Ready to start';
    case 'underway':
      return 'Tournament underway';
    case 'completed':
      return 'Tournament complete';
    default:
      return 'Tournament';
  }
}
