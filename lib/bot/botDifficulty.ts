/** Phase 1A — six selectable computer strength tiers (heuristic + optional engine). */

import { clockBudgetMsForGame } from '@/lib/gameTimeControl';
import { normalizeGameTempo } from '@/lib/gameTempo';

export const BOT_DIFFICULTY_LEVELS = [1, 2, 3, 4, 5, 6] as const;
export type BotDifficultyLevel = (typeof BOT_DIFFICULTY_LEVELS)[number];

export const BOT_DIFFICULTY_LABELS: Record<BotDifficultyLevel, string> = {
  1: 'Beginner',
  2: 'Casual',
  3: 'Club',
  4: 'Strong',
  5: 'Advanced',
  6: 'Master',
};

export type BotDifficultyProfile = {
  level: BotDifficultyLevel;
  label: string;
  /** UCI search depth when engine is used. */
  engineDepth: number;
  engineMultiPv: number;
  engineTimeoutMs: number;
  /** Simulated think time before committing bot move (ms). */
  thinkTimeMinMs: number;
  thinkTimeMaxMs: number;
  /** Chance to deliberately pick a suboptimal candidate (0–1). */
  blunderProbability: number;
  /** Max legal moves considered in heuristic pass. */
  maxCandidates: number;
  useEngine: boolean;
};

const PROFILES: Record<BotDifficultyLevel, BotDifficultyProfile> = {
  1: {
    level: 1,
    label: 'Beginner',
    engineDepth: 6,
    engineMultiPv: 2,
    engineTimeoutMs: 4_000,
    thinkTimeMinMs: 450,
    thinkTimeMaxMs: 1_100,
    blunderProbability: 0.38,
    maxCandidates: 16,
    useEngine: false,
  },
  2: {
    level: 2,
    label: 'Casual',
    engineDepth: 7,
    engineMultiPv: 2,
    engineTimeoutMs: 5_000,
    thinkTimeMinMs: 550,
    thinkTimeMaxMs: 1_400,
    blunderProbability: 0.24,
    maxCandidates: 18,
    useEngine: false,
  },
  3: {
    level: 3,
    label: 'Club',
    engineDepth: 9,
    engineMultiPv: 3,
    engineTimeoutMs: 6_000,
    thinkTimeMinMs: 700,
    thinkTimeMaxMs: 1_800,
    blunderProbability: 0.14,
    maxCandidates: 22,
    useEngine: true,
  },
  4: {
    level: 4,
    label: 'Strong',
    engineDepth: 10,
    engineMultiPv: 3,
    engineTimeoutMs: 8_000,
    thinkTimeMinMs: 900,
    thinkTimeMaxMs: 2_200,
    blunderProbability: 0.07,
    maxCandidates: 24,
    useEngine: true,
  },
  5: {
    level: 5,
    label: 'Advanced',
    engineDepth: 12,
    engineMultiPv: 3,
    engineTimeoutMs: 10_000,
    thinkTimeMinMs: 1_100,
    thinkTimeMaxMs: 2_800,
    blunderProbability: 0.03,
    maxCandidates: 28,
    useEngine: true,
  },
  6: {
    level: 6,
    label: 'Master',
    engineDepth: 14,
    engineMultiPv: 3,
    engineTimeoutMs: 12_000,
    thinkTimeMinMs: 1_300,
    thinkTimeMaxMs: 3_500,
    blunderProbability: 0.01,
    maxCandidates: 32,
    useEngine: true,
  },
};

export function normalizeBotDifficultyLevel(raw: unknown): BotDifficultyLevel {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  if (n >= 1 && n <= 6) return n as BotDifficultyLevel;
  return 3;
}

export function getBotDifficultyProfile(level: BotDifficultyLevel): BotDifficultyProfile {
  return PROFILES[level];
}

/** Keep short live games responsive without changing the chosen strength tier for longer games. */
export function botProfileForClock(
  profile: BotDifficultyProfile,
  tempo: string | null | undefined,
  liveTimeControl: string | null | undefined,
  botClockMs: number | null | undefined,
): BotDifficultyProfile {
  if (normalizeGameTempo(tempo) !== 'live') return profile;

  const initialMs = clockBudgetMsForGame(tempo, liveTimeControl);
  const remainingMs = Number.isFinite(botClockMs)
    ? Math.max(0, Number(botClockMs))
    : initialMs;
  if (initialMs > 120_000 && remainingMs > 60_000) return profile;

  // Two-minute play can still benefit from a shallow bounded search while
  // there is time. One-minute play and a low remaining clock must avoid the
  // engine process and its queue altogether.
  if (initialMs > 60_000 && initialMs <= 120_000 && remainingMs > 60_000) {
    return {
      ...profile,
      engineDepth: Math.min(profile.engineDepth, 8),
      engineTimeoutMs: Math.min(profile.engineTimeoutMs, 3_000),
      thinkTimeMinMs: 200,
      thinkTimeMaxMs: 750,
    };
  }

  // A fresh Stockfish process can use most of a bullet clock on a single move.
  // The static safety pass keeps a legal reply available without engine startup
  // or waiting behind other engine evaluations. Spend at most 10% of the bot's
  // remaining time on the visible pause, with a tighter cap for one-minute play.
  const pauseCapMs = initialMs <= 60_000 ? 500 : initialMs <= 120_000 ? 750 : 400;
  const thinkTimeMaxMs = Math.min(pauseCapMs, Math.floor(remainingMs / 10));
  return {
    ...profile,
    useEngine: false,
    thinkTimeMinMs: Math.min(200, thinkTimeMaxMs),
    thinkTimeMaxMs,
  };
}

export function randomThinkTimeMs(profile: BotDifficultyProfile): number {
  const span = profile.thinkTimeMaxMs - profile.thinkTimeMinMs;
  return profile.thinkTimeMinMs + Math.floor(Math.random() * (span + 1));
}
