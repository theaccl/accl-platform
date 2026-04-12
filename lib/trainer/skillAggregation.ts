/**
 * Phase 19 — lightweight skill & coaching signals from finished-game patterns + trainer sessions.
 * No live game data; aggregates only. Client may merge local trainer rollups from localStorage.
 */

export type SkillCategoryId =
  | "opening_consistency"
  | "tactical_awareness"
  | "blunder_frequency"
  | "endgame_conversion"
  | "time_management"
  | "streak_stability";

export type Trend = "improving" | "stable" | "declining";

export type SkillCategoryScore = {
  id: SkillCategoryId;
  label: string;
  /** 0–100 */
  score: number;
  trend: Trend;
};

export type PlayerSkillSummary = {
  skill_category_scores: SkillCategoryScore[];
  primary_strength: SkillCategoryId | null;
  primary_weakness: SkillCategoryId | null;
  last_updated: string | null;
  /** Rolling window hint (games / sessions counted) */
  sample_label: string;
};

export type DevelopmentInsight = {
  id: string;
  text: string;
};

export type ImprovementSuggestion = {
  id: string;
  text: string;
};

/** Client-only rolling aggregate from Phase 18B trainer analyze calls */
export type LocalTrainerRollup = {
  version: 1;
  user_id: string;
  session_count: number;
  /** Running averages 0–1 */
  avg_spread_excellent_ratio: number;
  avg_alternatives_considered: number;
  last_session_at: string | null;
};

const CATEGORIES: Array<{ id: SkillCategoryId; label: string }> = [
  { id: "opening_consistency", label: "Opening consistency" },
  { id: "tactical_awareness", label: "Tactical awareness" },
  { id: "blunder_frequency", label: "Blunder frequency" },
  { id: "endgame_conversion", label: "Endgame conversion" },
  { id: "time_management", label: "Time management" },
  { id: "streak_stability", label: "Streak stability" },
];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function hashToJitter(s: string, max: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ((h % 1000) / 1000) * max;
}

/**
 * Derive category scores from pattern_tags / suggested_themes (finished-game pipeline) plus optional stats.
 */
export function buildSkillSummaryFromSignals(input: {
  pattern_tags: string[];
  suggested_themes: string[];
  trainer_position_count: number;
  profile_updated_at: string | null;
}): PlayerSkillSummary {
  const tags = input.pattern_tags.map((t) => t.toLowerCase());
  const themes = input.suggested_themes.map((t) => t.toLowerCase());
  const joined = [...tags, ...themes].join(" ");

  const base = (id: SkillCategoryId): number => {
    switch (id) {
      case "opening_consistency":
        return joined.includes("opening") || joined.includes("discipline") ? 72 : 58;
      case "tactical_awareness":
        return joined.includes("tactical") || joined.includes("fork") || joined.includes("capture") ? 75 : 60;
      case "blunder_frequency":
        return joined.includes("mistake") || joined.includes("blunder") ? 45 : 70;
      case "endgame_conversion":
        return joined.includes("endgame") || joined.includes("conversion") ? 68 : 55;
      case "time_management":
        return joined.includes("time") || joined.includes("pressure") ? 62 : 58;
      case "streak_stability":
        return joined.includes("stable") || joined.includes("streak") ? 65 : 60;
      default:
        return 55;
    }
  };

  const activityBoost = clamp(Math.log10(10 + input.trainer_position_count) * 8, 0, 12);

  const scores: SkillCategoryScore[] = CATEGORIES.map((c) => {
    const s = clamp(base(c.id) + activityBoost * 0.25 + hashToJitter(c.id + joined, 8), 35, 92);
    const trend: Trend = s >= 68 ? "improving" : s <= 52 ? "declining" : "stable";
    return { id: c.id, label: c.label, score: Math.round(s), trend };
  });

  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const primary_strength = sorted[0]?.id ?? null;
  const primary_weakness = sorted[sorted.length - 1]?.id ?? null;

  return {
    skill_category_scores: scores,
    primary_strength,
    primary_weakness,
    last_updated: input.profile_updated_at,
    sample_label:
      input.trainer_position_count > 0
        ? `~${Math.min(50, input.trainer_position_count)} recent training samples`
        : "Pattern profile from finished games",
  };
}

export function mergeLocalTrainerRollup(
  summary: PlayerSkillSummary,
  rollup: LocalTrainerRollup | null
): PlayerSkillSummary {
  if (!rollup || rollup.session_count === 0) return summary;
  const tacticalBoost = rollup.avg_spread_excellent_ratio * 6;
  const blunderPenalty = (1 - rollup.avg_spread_excellent_ratio) * 5;
  const next = summary.skill_category_scores.map((row) => {
    if (row.id === "tactical_awareness") {
      return {
        ...row,
        score: clamp(row.score + tacticalBoost, 35, 95),
        trend: tacticalBoost > 2 ? "improving" : row.trend,
      };
    }
    if (row.id === "blunder_frequency") {
      return {
        ...row,
        score: clamp(row.score - blunderPenalty, 35, 95),
        trend: blunderPenalty > 2 ? "declining" : row.trend,
      };
    }
    return row;
  });
  const sorted = [...next].sort((a, b) => b.score - a.score);
  return {
    ...summary,
    skill_category_scores: next,
    primary_strength: sorted[0]?.id ?? summary.primary_strength,
    primary_weakness: sorted[sorted.length - 1]?.id ?? summary.primary_weakness,
    sample_label: `${summary.sample_label} · ${rollup.session_count} trainer session(s)`,
  };
}

export function generateDevelopmentInsights(summary: PlayerSkillSummary, k12: boolean): DevelopmentInsight[] {
  const weak = summary.skill_category_scores.find((s) => s.id === summary.primary_weakness);
  const strong = summary.skill_category_scores.find((s) => s.id === summary.primary_strength);
  const out: DevelopmentInsight[] = [];
  if (k12) {
    if (weak) {
      out.push({
        id: "w1",
        text: `Try improving ${weak.label.toLowerCase()} — practice helps with steady progress.`,
      });
    }
    if (strong) {
      out.push({
        id: "s1",
        text: `You're doing well with ${strong.label.toLowerCase()} — keep a calm pace.`,
      });
    }
    return out.slice(0, 3);
  }
  if (weak?.id === "endgame_conversion") {
    out.push({ id: "e1", text: "You may lose advantage after the middlegame — endgames decide many results." });
  }
  if (weak?.id === "blunder_frequency") {
    out.push({ id: "b1", text: "Frequent sharp swings suggest blunder risk — slow down when positions sharpen." });
  }
  if (weak?.id === "time_management") {
    out.push({ id: "t1", text: "Time pressure patterns show up — consider simpler plans in crunch moments." });
  }
  if (weak?.id === "opening_consistency") {
    out.push({ id: "o1", text: "Opening consistency varies — one reliable setup can stabilize the first phase." });
  }
  if (out.length === 0 && weak) {
    out.push({
      id: "d1",
      text: `Focus area: ${weak.label} — small drills beat one-off engine dumps.`,
    });
  }
  if (strong && out.length < 3) {
    out.push({
      id: "st1",
      text: `Strength: ${strong.label} — build plans that lean on what already works.`,
    });
  }
  return out.slice(0, 3);
}

export function generateImprovementSuggestions(summary: PlayerSkillSummary, k12: boolean): ImprovementSuggestion[] {
  const weak = summary.primary_weakness;
  const s: ImprovementSuggestion[] = [];
  if (k12) {
    s.push({
      id: "k1",
      text: "Try short practice sessions and review one finished game at a time.",
    });
    if (weak === "endgame_conversion") {
      s.push({ id: "k2", text: "Practice helps with basic endgame puzzles when you have time." });
    }
    return s.slice(0, 3);
  }
  if (weak === "endgame_conversion") {
    s.push({ id: "i1", text: "Focus on endgame practice — king activity and pawn races first." });
  }
  if (weak === "tactical_awareness" || weak === "blunder_frequency") {
    s.push({ id: "i2", text: "Review games where advantage was lost; note the move before the slip." });
  }
  if (weak === "opening_consistency") {
    s.push({ id: "i3", text: "Pick one opening pair and replay model games — fewer trees, deeper comfort." });
  }
  s.push({
    id: "i4",
    text: "Use Trainer lab for post-game positions only — never during live play.",
  });
  return s.slice(0, 4);
}

export function updateLocalRollupFromTrainer(
  prev: LocalTrainerRollup | null,
  userId: string,
  trainerResult: { evaluation?: { spreadClassification?: string; alternatives?: unknown[] } | null }
): LocalTrainerRollup {
  const spread = String(trainerResult.evaluation?.spreadClassification ?? "");
  const excellentLike = spread === "Excellent" || spread === "Good" ? 1 : 0.4;
  const altN = Array.isArray(trainerResult.evaluation?.alternatives)
    ? trainerResult.evaluation.alternatives.length
    : 0;
  const now = new Date().toISOString();
  if (!prev || prev.user_id !== userId) {
    return {
      version: 1,
      user_id: userId,
      session_count: 1,
      avg_spread_excellent_ratio: excellentLike,
      avg_alternatives_considered: altN,
      last_session_at: now,
    };
  }
  const n = prev.session_count + 1;
  return {
    version: 1,
    user_id: userId,
    session_count: n,
    avg_spread_excellent_ratio: (prev.avg_spread_excellent_ratio * prev.session_count + excellentLike) / n,
    avg_alternatives_considered:
      (prev.avg_alternatives_considered * prev.session_count + altN) / n,
    last_session_at: now,
  };
}
