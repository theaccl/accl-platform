/**
 * Phase 1A — style hooks for computer move selection (independent of profile seat UUID).
 * Full behavioral tuning can extend these weights later without changing game routes.
 */

import type { BotDifficultyLevel } from '@/lib/bot/botDifficulty';
import type { BotCandidateLine } from '@/lib/bot/botPersonality';

export const BOT_PERSONALITY_STYLES = [
  'balanced',
  'aggressive',
  'defensive',
  'trap',
  'endgame',
  'chaos',
] as const;

export type BotPersonalityStyle = (typeof BOT_PERSONALITY_STYLES)[number];

export const BOT_PERSONALITY_LABELS: Record<BotPersonalityStyle, string> = {
  balanced: 'Balanced',
  aggressive: 'Aggressive',
  defensive: 'Defensive',
  trap: 'Trap',
  endgame: 'Endgame',
  chaos: 'Chaos',
};

export function normalizeBotPersonalityStyle(raw: unknown): BotPersonalityStyle {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if ((BOT_PERSONALITY_STYLES as readonly string[]).includes(s)) return s as BotPersonalityStyle;
  return 'balanced';
}

function sortedByScore(lines: BotCandidateLine[]): BotCandidateLine[] {
  return [...lines].filter((l) => l.move.trim().length > 0).sort((a, b) => (b.scoreCp ?? -99999) - (a.scoreCp ?? -99999));
}

function pickIndex(style: BotPersonalityStyle, sorted: BotCandidateLine[]): number {
  if (sorted.length === 0) return -1;
  if (style === 'chaos') {
    return Math.floor(Math.random() * sorted.length);
  }
  if (style === 'balanced') {
    return Math.min(1, sorted.length - 1);
  }
  if (style === 'aggressive') {
    const tactical = sorted.findIndex((l) => (l.scoreCp ?? 0) >= 55);
    return tactical >= 0 ? tactical : 0;
  }
  if (style === 'defensive') {
    const quiet = [...sorted].reverse().find((l) => (l.scoreCp ?? 0) <= 20);
    return quiet ? sorted.indexOf(quiet) : Math.min(sorted.length - 1, 2);
  }
  if (style === 'trap') {
    const mid = sorted[Math.min(2, sorted.length - 1)];
    const bait = sorted.find((l) => l.move !== mid?.move && (l.scoreCp ?? 0) >= 40);
    return bait ? sorted.indexOf(bait) : Math.min(1, sorted.length - 1);
  }
  if (style === 'endgame') {
    return 0;
  }
  return Math.min(1, sorted.length - 1);
}

/** Apply intentional inaccuracy for lower difficulties. */
export function maybeBlunderPick(
  sorted: BotCandidateLine[],
  blunderProbability: number,
): BotCandidateLine | null {
  if (sorted.length === 0) return null;
  if (Math.random() >= blunderProbability) return null;
  const pool = sorted.slice(Math.max(0, Math.floor(sorted.length / 3)));
  if (pool.length === 0) return sorted[sorted.length - 1] ?? null;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

export function selectBotMoveForStyle(
  style: BotPersonalityStyle,
  lines: BotCandidateLine[],
  difficulty: BotDifficultyLevel,
  blunderProbability: number,
): { move: string; rationale: string } | null {
  const sorted = sortedByScore(lines);
  if (sorted.length === 0) return null;

  const blunder = maybeBlunderPick(sorted, blunderProbability);
  if (blunder) {
    return { move: blunder.move, rationale: `humanized-inaccuracy-l${difficulty}` };
  }

  const idx = pickIndex(style, sorted);
  if (idx < 0) return null;
  const pick = sorted[idx];
  return { move: pick.move, rationale: `${style}-l${difficulty}` };
}
