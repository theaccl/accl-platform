/** Legacy bot display names (profile seats). Prefer `BotPersonalityStyle` for move weighting. */

export type BotName = 'Cardi Bot' | 'Aggro Bot' | 'Endgame Bot';

export type BotCandidateLine = {
  move: string;
  scoreCp: number | null;
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
