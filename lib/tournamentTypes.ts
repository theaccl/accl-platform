/** Tournament domain types (Pass #8 bracket foundation). */

export type TournamentStatus = 'pending' | 'active' | 'completed';
export type TournamentFormat = 'single_elimination';

export type AdvanceWinnerSlot = 'player1' | 'player2';

export type BracketMatchPlan = {
  roundNumber: number;
  matchNumber: number;
  player1Id: string | null;
  player2Id: string | null;
  nextRound: number | null;
  nextMatchNumber: number | null;
  advanceWinnerAs: AdvanceWinnerSlot | null;
};

export type SeededParticipant = {
  userId: string;
  /** 1 = best */
  seed: number;
  ratingUsed: number;
  createdAtMs: number;
};
