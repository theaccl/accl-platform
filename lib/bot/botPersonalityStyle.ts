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

const ENGINE_LOSS_WINDOW_CP: Record<BotDifficultyLevel, number> = {
  1: 350,
  2: 250,
  3: 150,
  4: 100,
  5: 60,
  6: 30,
};

const STATIC_HARD_RISK_CP = 350;
const AGGRESSIVE_ALT_WINDOW_CP: Record<BotDifficultyLevel, number> = {
  1: 60,
  2: 45,
  3: 30,
  4: 24,
  5: 18,
  6: 12,
};

export function normalizeBotPersonalityStyle(raw: unknown): BotPersonalityStyle {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if ((BOT_PERSONALITY_STYLES as readonly string[]).includes(s)) return s as BotPersonalityStyle;
  return 'balanced';
}

function engineScore(line: BotCandidateLine): number | null {
  if (typeof line.engineScoreCp === 'number') return line.engineScoreCp;
  if (line.source === 'engine' && typeof line.scoreCp === 'number') return line.scoreCp;
  return null;
}

function engineOrder(a: BotCandidateLine, b: BotCandidateLine): number {
  if ((a.source === 'engine' || a.engineRank != null) && (b.source === 'engine' || b.engineRank != null)) {
    const rank = (a.engineRank ?? 999) - (b.engineRank ?? 999);
    if (rank !== 0) return rank;
  }
  const aScore = engineScore(a);
  const bScore = engineScore(b);
  if (aScore !== null || bScore !== null) return (bScore ?? -100_000) - (aScore ?? -100_000);
  const staticScore = (b.scoreCp ?? -100_000) - (a.scoreCp ?? -100_000);
  return staticScore !== 0 ? staticScore : a.move.localeCompare(b.move);
}

export function annotateEngineLossFromBest(lines: BotCandidateLine[]): BotCandidateLine[] {
  const engineLines = lines.filter((line) => line.source === 'engine' || line.engineRank != null);
  const scored = engineLines.filter((line) => engineScore(line) !== null);
  const bestScore = scored.length > 0 ? Math.max(...scored.map((line) => engineScore(line)!)) : null;
  return lines.map((line) => {
    if (line.source !== 'engine' && line.engineRank == null) return line;
    const score = engineScore(line);
    const lossFromBestCp = bestScore === null || score === null ? null : Math.max(0, bestScore - score);
    return { ...line, lossFromBestCp };
  });
}

export function buildSafeBotShortlist(
  lines: BotCandidateLine[],
  difficulty: BotDifficultyLevel,
): BotCandidateLine[] {
  const valid = lines.filter((line) => line.move.trim().length > 0);
  if (valid.length === 0) return [];

  const engineLines = valid.filter((line) => line.source === 'engine' || line.engineRank != null);
  if (engineLines.length > 0) {
    const assessed = annotateEngineLossFromBest(engineLines);
    const safe = assessed
      .filter((line) => {
        if (line.allowsForcedMate) return false;
        // Rank one remains authoritative even when the intentionally
        // pessimistic one-reply static pass dislikes an engine-approved
        // sacrifice. The static veto only prevents personality/noise from
        // selecting a catastrophic lower-ranked alternative such as Qxc7.
        if (
          (line.engineRank ?? 999) > 1 &&
          (line.staticRiskCp ?? 100_000) > STATIC_HARD_RISK_CP &&
          line.features?.movedPieceEnPrise
        ) return false;
        if (typeof line.lossFromBestCp === 'number') {
          return line.lossFromBestCp <= ENGINE_LOSS_WINDOW_CP[difficulty];
        }
        // Mate scores are represented as null by the legacy engine boundary. Only
        // the engine's first line is trusted when a numeric loss cannot be computed.
        return (line.engineRank ?? 999) === 1;
      })
      .sort(engineOrder);
    if (safe.length > 0) return safe;
    // A legal game must continue even when every MultiPV line is losing or the
    // static guard sees an unavoidable mate. Fall back to the engine's least-bad
    // first line instead of returning no candidate.
    const leastBad = [...assessed].sort(engineOrder)[0];
    return leastBad ? [leastBad] : [];
  }

  const staticSafe = valid
    .filter((line) => !line.allowsForcedMate && (line.staticRiskCp ?? 100_000) <= STATIC_HARD_RISK_CP)
    .sort(engineOrder);
  if (staticSafe.length > 0) return staticSafe;
  return [...valid]
    .sort((a, b) => {
      const risk = (a.staticRiskCp ?? 100_000) - (b.staticRiskCp ?? 100_000);
      return risk !== 0 ? risk : engineOrder(a, b);
    })
    .slice(0, 1);
}

function aggressivePlanStrength(line: BotCandidateLine): number {
  const evidence = line.planEvidence;
  if (!evidence || evidence.observedPlies < 3 || !evidence.opponentReply || !evidence.continuation) return 0;
  return (evidence.concreteCompensation ? 2 : 0) + (evidence.sustainedInitiative ? 1 : 0);
}

function aggressiveSelectionPool(
  lines: BotCandidateLine[],
  difficulty: BotDifficultyLevel,
): BotCandidateLine[] {
  const engineOrdered = [...lines].sort(engineOrder);
  const top = engineOrdered[0];
  if (!top) return [];
  if (top.source !== 'engine' && top.engineRank == null) return [top];

  const topPlanStrength = aggressivePlanStrength(top);
  const alternatives = engineOrdered
    .slice(1)
    .filter((line) =>
      (line.lossFromBestCp ?? Number.POSITIVE_INFINITY) <= AGGRESSIVE_ALT_WINDOW_CP[difficulty] &&
      aggressivePlanStrength(line) > topPlanStrength
    )
    .sort((a, b) => {
      const plan = aggressivePlanStrength(b) - aggressivePlanStrength(a);
      if (plan !== 0) return plan;
      // Book identity is guidance only: it may break a tie between equally
      // engine-safe, PV-proven plans, but cannot make a line eligible.
      const reference = Number(Boolean(b.openingReference)) - Number(Boolean(a.openingReference));
      return reference !== 0 ? reference : engineOrder(a, b);
    });

  const preferred = alternatives[0];
  return preferred ? [preferred, top, ...alternatives.slice(1)] : [top];
}

function defensiveScore(line: BotCandidateLine): number {
  const f = line.features;
  return -Math.min(500, line.staticRiskCp ?? 500) + (f?.development ? 18 : 0) - (f?.movedPieceEnPrise ? 45 : 0);
}

function trapScore(line: BotCandidateLine): number {
  const f = line.features;
  return (f?.kingPressure ? 30 : 0) + (f?.check ? 18 : 0) + Math.max(0, 28 - (f?.opponentReplyCount ?? 28));
}

function styleOrder(
  style: BotPersonalityStyle,
  lines: BotCandidateLine[],
  difficulty: BotDifficultyLevel,
): BotCandidateLine[] {
  if (style === 'balanced' || style === 'endgame') return [...lines].sort(engineOrder);
  if (style === 'aggressive') return aggressiveSelectionPool(lines, difficulty);
  const score = style === 'defensive' ? defensiveScore : trapScore;
  return [...lines].sort((a, b) => {
    const preference = score(b) - score(a);
    return preference !== 0 ? preference : engineOrder(a, b);
  });
}

/** Apply intentional inaccuracy inside the hard-safe shortlist only. */
export function maybeBlunderPick(
  safeLines: BotCandidateLine[],
  blunderProbability: number,
  random: () => number = Math.random,
): BotCandidateLine | null {
  if (safeLines.length < 2 || random() >= blunderProbability) return null;
  const pool = safeLines.slice(1);
  return pool[Math.floor(random() * pool.length)] ?? null;
}

export function selectBotMoveForStyle(
  style: BotPersonalityStyle,
  lines: BotCandidateLine[],
  difficulty: BotDifficultyLevel,
  blunderProbability: number,
  random: () => number = Math.random,
): { move: string; rationale: string } | null {
  const safe = buildSafeBotShortlist(lines, difficulty);
  if (safe.length === 0) return null;

  // Checkmate ends the game, so it must remain authoritative before any
  // personality preference or intentional inaccuracy can reorder the safe
  // shortlist. Mate scores cross the legacy engine boundary as null and
  // therefore cannot rely on centipawn ordering alone.
  const forcedMate = [...safe]
    .filter((line) => line.features?.mate)
    .sort(engineOrder)[0];
  if (forcedMate) {
    const evidence = forcedMate.source === 'engine' ? 'engine-safe' : 'static-fallback';
    return {
      move: forcedMate.move,
      rationale: `${evidence}:forced-mate-l${difficulty}`,
    };
  }

  const ordered = style === 'chaos' ? safe : styleOrder(style, safe, difficulty);

  const inaccuracy = maybeBlunderPick(ordered, blunderProbability, random);
  const picked = inaccuracy ?? (style === 'chaos' ? ordered[Math.floor(random() * ordered.length)] : ordered[0]);
  if (!picked) return null;

  const evidence = picked.source === 'engine' ? 'engine-safe' : 'static-fallback';
  const aggressiveReason =
    style === 'aggressive' && picked.source === 'engine'
      ? (picked.engineRank ?? 999) === 1
        ? `aggressive-master-top-line-l${difficulty}`
        : `aggressive-pv-plan-l${difficulty}`
      : `${style}-l${difficulty}`;
  const reason = inaccuracy ? `humanized-inaccuracy-l${difficulty}` : aggressiveReason;
  return { move: picked.move, rationale: `${evidence}:${reason}` };
}
