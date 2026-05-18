/** Phase 1A — six selectable computer strength tiers (heuristic + optional engine). */

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
  /** UCI search depth when engine is used (levels 4+). */
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
    useEngine: false,
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

export function randomThinkTimeMs(profile: BotDifficultyProfile): number {
  const span = profile.thinkTimeMaxMs - profile.thinkTimeMinMs;
  return profile.thinkTimeMinMs + Math.floor(Math.random() * (span + 1));
}
