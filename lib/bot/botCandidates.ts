import { Chess } from 'chess.js';

import { evaluateTrainerPositionUci } from '@/lib/analysis/engineComputeService';
import type { BotDifficultyProfile } from '@/lib/bot/botDifficulty';
import type { BotCandidateLine } from '@/lib/bot/botPersonality';

/** Legal UCI from chess.js verbose move (never append bogus capture suffixes). */
export function uciFromVerboseMove(mv: { from: string; to: string; promotion?: string }): string {
  return `${mv.from}${mv.to}${(mv.promotion ?? '').toLowerCase()}`.toLowerCase();
}

function heuristicScoreCp(mv: { san: string; flags: string; promotion?: string }): number {
  const capture = mv.flags.includes('c') || mv.flags.includes('e');
  const check = mv.san.includes('+') || mv.san.includes('#');
  const promotion = Boolean(mv.promotion);
  return (capture ? 60 : 0) + (check ? 45 : 0) + (promotion ? 25 : 0) + Math.floor(Math.random() * 8);
}

function buildHeuristicCandidates(fen: string, maxCandidates: number): BotCandidateLine[] {
  const board = new Chess(fen);
  const legal = board.moves({ verbose: true });
  const scored = legal.map((mv) => ({
    move: uciFromVerboseMove(mv),
    scoreCp: heuristicScoreCp(mv),
  }));
  scored.sort((a, b) => b.scoreCp - a.scoreCp);
  return scored.slice(0, maxCandidates);
}

async function mergeEngineLines(
  fen: string,
  profile: BotDifficultyProfile,
  base: BotCandidateLine[],
): Promise<BotCandidateLine[]> {
  if (!profile.useEngine) return base;
  try {
    const evalResult = await evaluateTrainerPositionUci(fen, {
      depth: profile.engineDepth,
      multiPv: profile.engineMultiPv,
      timeoutMs: profile.engineTimeoutMs,
    });
    const byMove = new Map<string, BotCandidateLine>();
    for (const line of base) byMove.set(line.move, line);
    for (const line of evalResult.lines) {
      const rankBoost = (profile.engineMultiPv - line.rank + 1) * 120;
      const cp = line.scoreCp ?? 0;
      const existing = byMove.get(line.move);
      if (existing) {
        existing.scoreCp = Math.max(existing.scoreCp ?? 0, cp + rankBoost);
      } else {
        byMove.set(line.move, { move: line.move, scoreCp: cp + rankBoost });
      }
    }
    if (evalResult.bestMove && !byMove.has(evalResult.bestMove)) {
      byMove.set(evalResult.bestMove, { move: evalResult.bestMove, scoreCp: 10_000 });
    }
    return [...byMove.values()].sort((a, b) => (b.scoreCp ?? -99999) - (a.scoreCp ?? -99999));
  } catch {
    return base;
  }
}

export async function buildBotCandidatesFromFen(
  fen: string,
  profile: BotDifficultyProfile,
): Promise<BotCandidateLine[]> {
  const heuristic = buildHeuristicCandidates(fen, profile.maxCandidates);
  return mergeEngineLines(fen, profile, heuristic);
}
