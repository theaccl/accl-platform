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
const ENDGAME_ALT_WINDOW_CP: Record<BotDifficultyLevel, number> = {
  1: 60,
  2: 45,
  3: 30,
  4: 24,
  5: 18,
  6: 12,
};
const DEFENSIVE_ALT_WINDOW_CP: Record<BotDifficultyLevel, number> = {
  1: 60,
  2: 45,
  3: 30,
  4: 24,
  5: 18,
  6: 12,
};
const TRAP_ALT_WINDOW_CP: Record<BotDifficultyLevel, number> = {
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
    const top = [...engineLines].sort(engineOrder)[0];
    // The legacy engine boundary represents mate scores as null. Numeric
    // alternatives cannot establish equivalence to that rank-one line, even
    // when mate is several plies away and the static mate-in-one flag is false.
    if (top?.engineRank === 1 && engineScore(top) === null) return [top];
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

function trapPlanStrength(line: BotCandidateLine): number {
  const evidence = line.trapEvidence;
  if (
    !evidence ||
    evidence.observedPlies < 3 ||
    !evidence.opponentReply ||
    !evidence.continuation ||
    !evidence.materialPreserved
  ) return 0;
  if (!evidence.tacticalGain && !(evidence.forcingContinuation && evidence.sustainedKingPressure)) {
    return 0;
  }
  return (
    (evidence.tacticalGain ? 4 : 0) +
    (evidence.forcingContinuation ? 2 : 0) +
    (evidence.sustainedKingPressure ? 1 : 0)
  );
}

function trapSelectionPool(
  lines: BotCandidateLine[],
  difficulty: BotDifficultyLevel,
): BotCandidateLine[] {
  const engineOrdered = [...lines].sort(engineOrder);
  const top = engineOrdered[0];
  if (!top) return [];
  // Preserve deterministic fallback order and safe alternatives so lower
  // strengths can still apply their configured intentional inaccuracy.
  if (top.source !== 'engine' && top.engineRank == null) return engineOrdered;

  const topStrength = trapPlanStrength(top);
  const alternatives = engineOrdered
    .slice(1)
    .filter((line) =>
      (line.lossFromBestCp ?? Number.POSITIVE_INFINITY) <= TRAP_ALT_WINDOW_CP[difficulty] &&
      trapPlanStrength(line) > topStrength
    )
    .sort((a, b) => {
      const preference = trapPlanStrength(b) - trapPlanStrength(a);
      return preference !== 0 ? preference : engineOrder(a, b);
    });

  const preferred = alternatives[0];
  return preferred ? [preferred, top, ...alternatives.slice(1)] : [top];
}

function defensivePlanStrength(line: BotCandidateLine): number {
  const evidence = line.defensiveEvidence;
  if (!evidence || evidence.observedReplies < 1) return 0;
  return (
    Math.max(0, 6 - evidence.checkingReplies) * 3 +
    Math.max(0, 6 - evidence.winningCaptureReplies) * 2 +
    (evidence.soundExchange ? 7 : 0) +
    (evidence.safeDevelopment ? 5 : 0) +
    (evidence.materialPreserved ? 1 : 0)
  );
}

function defensiveSelectionPool(
  lines: BotCandidateLine[],
  difficulty: BotDifficultyLevel,
): BotCandidateLine[] {
  const engineOrdered = [...lines].sort(engineOrder);
  const top = engineOrdered[0];
  if (!top) return [];
  const topStrength = defensivePlanStrength(top);
  const alternatives = engineOrdered
    .slice(1)
    .filter((line) =>
      (line.lossFromBestCp ?? Number.POSITIVE_INFINITY) <= DEFENSIVE_ALT_WINDOW_CP[difficulty] &&
      defensivePlanStrength(line) > topStrength
    )
    .sort((a, b) => {
      const preference = defensivePlanStrength(b) - defensivePlanStrength(a);
      return preference !== 0 ? preference : engineOrder(a, b);
    });
  const preferred = alternatives[0];
  return preferred ? [preferred, top, ...alternatives.slice(1)] : engineOrdered;
}

function endgamePlanStrength(line: BotCandidateLine): number {
  const evidence = line.endgameEvidence;
  if (!evidence?.isEndgame) return 0;
  return (
    (line.features?.promotion ? 12 : 0) +
    (evidence.promotionPrevention ? 9 : 0) +
    (evidence.passedPawnAdvance ? 7 : 0) +
    (evidence.favorableSimplification ? 5 : 0) +
    Math.max(0, evidence.kingActivityDelta) * 3 +
    (evidence.materialPreserved ? 1 : 0)
  );
}

function endgameSelectionPool(
  lines: BotCandidateLine[],
  difficulty: BotDifficultyLevel,
): BotCandidateLine[] {
  const engineOrdered = [...lines].sort(engineOrder);
  const top = engineOrdered[0];
  if (!top) return [];

  // No endgame-specific evidence means Endgame is deliberately identical to
  // the neutral Balanced baseline rather than stylistically distorted.
  if (!engineOrdered.some((line) => line.endgameEvidence?.isEndgame)) return engineOrdered;

  const topStrength = endgamePlanStrength(top);
  const alternatives = engineOrdered
    .slice(1)
    .filter((line) =>
      line.endgameEvidence?.isEndgame &&
      // Endgame evidence may reorder only engine-proven near-equals. A static
      // fallback has no numeric equivalence proof, so degraded play remains on
      // the same neutral order as Balanced.
      (line.lossFromBestCp ?? Number.POSITIVE_INFINITY) <= ENDGAME_ALT_WINDOW_CP[difficulty] &&
      endgamePlanStrength(line) > topStrength
    )
    .sort((a, b) => {
      const preference = endgamePlanStrength(b) - endgamePlanStrength(a);
      return preference !== 0 ? preference : engineOrder(a, b);
    });

  const preferred = alternatives[0];
  return preferred ? [preferred, top, ...alternatives.slice(1)] : engineOrdered;
}

function styleOrder(
  style: BotPersonalityStyle,
  lines: BotCandidateLine[],
  difficulty: BotDifficultyLevel,
): BotCandidateLine[] {
  if (style === 'balanced') return [...lines].sort(engineOrder);
  if (style === 'endgame') return endgameSelectionPool(lines, difficulty);
  if (style === 'aggressive') return aggressiveSelectionPool(lines, difficulty);
  if (style === 'defensive') return defensiveSelectionPool(lines, difficulty);
  return trapSelectionPool(lines, difficulty);
}

/** Apply intentional inaccuracy inside the hard-safe shortlist only. */
export function maybeBlunderPick(
  safeLines: BotCandidateLine[],
  blunderProbability: number,
  random: () => number = Math.random,
): BotCandidateLine | null {
  if (safeLines.length < 2) return null;
  const preferredScore = engineScore(safeLines[0]);
  const staticFallback = safeLines[0].source !== 'engine' && safeLines[0].engineRank == null;
  // Personality ordering can place the engine's better line after its chosen
  // near-equal alternative. Only a proven score loss is an engine inaccuracy;
  // retain the existing heuristic fallback pool when no engine score exists.
  const pool = safeLines.slice(1).filter((line) => {
    if (preferredScore === null) return staticFallback;
    const score = engineScore(line);
    return score !== null && score < preferredScore;
  });
  if (pool.length === 0 || random() >= blunderProbability) return null;
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

  // Trap evidence chooses the preferred head; intentional strength variation
  // may still use worse moves from the shared safe shortlist. Preserve the
  // existing eligibility requirements of the other personalities.
  const inaccuracyPool = style === 'trap'
    ? [ordered[0], ...safe.filter((line) => line.move !== ordered[0].move)]
    : ordered;
  const inaccuracy = maybeBlunderPick(inaccuracyPool, blunderProbability, random);
  const picked = inaccuracy ?? (style === 'chaos' ? ordered[Math.floor(random() * ordered.length)] : ordered[0]);
  if (!picked) return null;

  const evidence = picked.source === 'engine' ? 'engine-safe' : 'static-fallback';
  const aggressiveReason =
    style === 'aggressive' && picked.source === 'engine'
      ? (picked.engineRank ?? 999) === 1
        ? `aggressive-master-top-line-l${difficulty}`
        : `aggressive-pv-plan-l${difficulty}`
      : `${style}-l${difficulty}`;
  const styleReason =
    style === 'trap' && picked.source === 'engine' && (picked.engineRank ?? 999) > 1
      ? `trap-pv-plan-l${difficulty}`
      : aggressiveReason;
  const reason = inaccuracy ? `humanized-inaccuracy-l${difficulty}` : styleReason;
  return { move: picked.move, rationale: `${evidence}:${reason}` };
}
