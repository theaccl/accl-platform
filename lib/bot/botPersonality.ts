/** Legacy bot display names (profile seats). Prefer `BotPersonalityStyle` for move weighting. */

export type BotName = 'Cardi Bot' | 'Aggro Bot' | 'Endgame Bot';

export type BotCandidateLine = {
  move: string;
  /** @deprecated Compatibility score for the legacy selector. */
  scoreCp: number | null;
  /** Raw Stockfish score from the side-to-move point of view. */
  engineScoreCp?: number | null;
  engineRank?: number | null;
  /** Difference from the best engine candidate; populated by the safety layer. */
  lossFromBestCp?: number | null;
  source?: 'engine' | 'static-fallback';
  openingReference?: boolean;
  /** Stockfish principal variation beginning with this candidate move. */
  enginePv?: string[];
  /** Concrete continuation evidence derived through the opponent's best PV reply. */
  planEvidence?: {
    opponentReply: string | null;
    continuation: string | null;
    observedPlies: number;
    materialDeltaAfterPvCp: number | null;
    concreteCompensation: boolean;
    sustainedInitiative: boolean;
    initiativeReasons: string[];
  };
  /** Best-reply continuation evidence used only to order safe Trap candidates. */
  trapEvidence?: {
    opponentReply: string | null;
    continuation: string | null;
    observedPlies: number;
    materialDeltaAfterPvCp: number | null;
    tacticalGain: boolean;
    forcingContinuation: boolean;
    sustainedKingPressure: boolean;
    materialPreserved: boolean;
    reasons: string[];
  };
  /** Deterministic, position-derived evidence used only by the Endgame ordering pass. */
  endgameEvidence?: {
    isEndgame: boolean;
    kingActivityDelta: number;
    passedPawnAdvance: boolean;
    promotionPrevention: boolean;
    favorableSimplification: boolean;
    materialPreserved: boolean;
    reasons: string[];
  };
  /** Opponent-reply evidence used only to order safe Defensive candidates. */
  defensiveEvidence?: {
    observedReplies: number;
    checkingReplies: number;
    winningCaptureReplies: number;
    soundExchange: boolean;
    safeDevelopment: boolean;
    materialPreserved: boolean;
    reasons: string[];
  };
  staticRiskCp?: number;
  allowsForcedMate?: boolean;
  features?: {
    capture: boolean;
    check: boolean;
    mate: boolean;
    promotion: boolean;
    development: boolean;
    centerControl: boolean;
    kingPressure: boolean;
    movedPieceEnPrise: boolean;
    opponentReplyCount: number;
    materialDeltaAfterMoveCp: number;
  };
};

export type BotSelection = {
  move: string;
  bot: BotName;
  rationale: string;
};

function sortedByScore(lines: BotCandidateLine[]): BotCandidateLine[] {
  return [...lines]
    .filter((l) => typeof l.move === 'string' && l.move.trim().length > 0)
    .sort((a, b) => (b.scoreCp ?? -99999) - (a.scoreCp ?? -99999));
}

/** @deprecated Use `selectBotMoveForStyle` — kept for `/api/bot/select-move` compatibility. */
export function selectBotMove(bot: BotName, lines: BotCandidateLine[]): BotSelection | null {
  const sorted = sortedByScore(lines);
  if (sorted.length === 0) return null;
  const best = sorted[0]!;

  if (bot === 'Cardi Bot') {
    return { move: sorted[Math.min(1, sorted.length - 1)]!.move, bot, rationale: 'balanced-second-line' };
  }
  if (bot === 'Aggro Bot') {
    const tactical = sorted.find((l) => (l.scoreCp ?? 0) >= 55);
    return { move: tactical?.move ?? best.move, bot, rationale: 'aggressive-tactical-preference' };
  }
  return { move: best.move, bot, rationale: 'endgame-best-eval-discipline' };
}
