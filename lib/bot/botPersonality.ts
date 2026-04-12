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

function byBestScore(lines: BotCandidateLine[]): BotCandidateLine | null {
  const filtered = lines.filter((l) => typeof l.move === 'string' && l.move.trim().length > 0);
  if (filtered.length === 0) return null;
  return [...filtered].sort((a, b) => (b.scoreCp ?? -99999) - (a.scoreCp ?? -99999))[0] ?? null;
}

export function selectBotMove(bot: BotName, lines: BotCandidateLine[]): BotSelection | null {
  const filtered = lines.filter((l) => l.move.trim().length > 0);
  if (filtered.length === 0) return null;
  const best = byBestScore(filtered);
  if (!best) return null;

  if (bot === 'Cardi Bot') {
    const idx = Math.min(1, filtered.length - 1);
    return { move: filtered[idx].move, bot, rationale: 'balanced-style-second-line-when-available' };
  }
  if (bot === 'Aggro Bot') {
    const tactical = filtered.find((l) => /x|[+#]/i.test(l.move));
    return { move: tactical?.move ?? best.move, bot, rationale: 'aggressive-tactical-preference' };
  }
  return { move: best.move, bot, rationale: 'endgame-best-eval-discipline' };
}
