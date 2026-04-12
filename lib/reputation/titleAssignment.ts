/**
 * Phase 20 — competitive identity derived from standings, rating, and recorded finishes.
 * No purchases; no API contract changes — pure presentation logic from existing fields.
 */

export type TitleIdentity = {
  title: string;
  /** 1 (low) … 7 (apex) adult; 1…4 K–12 */
  titleLevel: number;
  shortBadge: string;
  rankIcon: string;
  legacyMarkers: string[];
  /** Secondary signal 0–100, subtle display only */
  reputationScore: number;
};

export type TitleAssignmentInput = {
  k12: boolean;
  standingRank?: number | null;
  rating?: number | null;
  tier?: string | null;
  streak?: number | null;
  /** Count of recorded tournament-style wins in current feed window (approximate) */
  tournamentWins?: number;
  seasonalChampion?: boolean;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function adultTitleFromRank(rank: number): Pick<TitleIdentity, "title" | "titleLevel" | "shortBadge" | "rankIcon"> {
  if (rank <= 1) return { title: "Apex", titleLevel: 7, shortBadge: "APX", rankIcon: "👑" };
  if (rank <= 3) return { title: "Grandmaster", titleLevel: 6, shortBadge: "GM", rankIcon: "♛" };
  if (rank <= 7) return { title: "Master", titleLevel: 5, shortBadge: "M", rankIcon: "♜" };
  if (rank <= 15) return { title: "Elite", titleLevel: 4, shortBadge: "EL", rankIcon: "♞" };
  if (rank <= 30) return { title: "Challenger", titleLevel: 3, shortBadge: "CH", rankIcon: "♗" };
  if (rank <= 55) return { title: "Contender", titleLevel: 2, shortBadge: "CT", rankIcon: "♘" };
  return { title: "Recruit", titleLevel: 1, shortBadge: "RC", rankIcon: "♟" };
}

function adultTitleFromRating(rating: number): Pick<TitleIdentity, "title" | "titleLevel" | "shortBadge" | "rankIcon"> {
  if (rating >= 2100) return { title: "Apex", titleLevel: 7, shortBadge: "APX", rankIcon: "👑" };
  if (rating >= 1950) return { title: "Grandmaster", titleLevel: 6, shortBadge: "GM", rankIcon: "♛" };
  if (rating >= 1800) return { title: "Master", titleLevel: 5, shortBadge: "M", rankIcon: "♜" };
  if (rating >= 1650) return { title: "Elite", titleLevel: 4, shortBadge: "EL", rankIcon: "♞" };
  if (rating >= 1500) return { title: "Challenger", titleLevel: 3, shortBadge: "CH", rankIcon: "♗" };
  if (rating >= 1300) return { title: "Contender", titleLevel: 2, shortBadge: "CT", rankIcon: "♘" };
  return { title: "Recruit", titleLevel: 1, shortBadge: "RC", rankIcon: "♟" };
}

function k12TitleFromRank(rank: number): Pick<TitleIdentity, "title" | "titleLevel" | "shortBadge" | "rankIcon"> {
  if (rank <= 1) return { title: "Top Performer", titleLevel: 4, shortBadge: "★", rankIcon: "⭐" };
  if (rank <= 8) return { title: "Advanced", titleLevel: 3, shortBadge: "AD", rankIcon: "📘" };
  if (rank <= 22) return { title: "Rising Player", titleLevel: 2, shortBadge: "↑", rankIcon: "🌱" };
  return { title: "Beginner", titleLevel: 1, shortBadge: "BG", rankIcon: "♟" };
}

function k12TitleFromRating(rating: number): Pick<TitleIdentity, "title" | "titleLevel" | "shortBadge" | "rankIcon"> {
  if (rating >= 1700) return { title: "Top Performer", titleLevel: 4, shortBadge: "★", rankIcon: "⭐" };
  if (rating >= 1500) return { title: "Advanced", titleLevel: 3, shortBadge: "AD", rankIcon: "📘" };
  if (rating >= 1200) return { title: "Rising Player", titleLevel: 2, shortBadge: "↑", rankIcon: "🌱" };
  return { title: "Beginner", titleLevel: 1, shortBadge: "BG", rankIcon: "♟" };
}

function buildLegacyMarkers(input: TitleAssignmentInput): string[] {
  const out: string[] = [];
  if ((input.tournamentWins ?? 0) >= 1) out.push("Tournament victor");
  if (input.seasonalChampion) out.push("Season recognition");
  if (typeof input.streak === "number" && input.streak >= 6) out.push("Streak recognition");
  if (typeof input.standingRank === "number" && input.standingRank === 1) out.push("Standings leader");
  return out.slice(0, 4);
}

function reputationScore(input: TitleAssignmentInput, titleLevel: number): number {
  const rank = input.standingRank ?? 60;
  const rankPart = clamp(55 - Math.min(rank, 55) * 0.8, 0, 55);
  const levelPart = titleLevel * 4;
  const tw = clamp((input.tournamentWins ?? 0) * 4, 0, 16);
  const st = clamp((input.streak ?? 0) * 1.2, 0, 12);
  return Math.round(clamp(rankPart + levelPart * 0.35 + tw + st, 12, 100));
}

/**
 * Derive visible title, badges, and legacy markers from performance fields only.
 */
export function assignPlayerIdentity(input: TitleAssignmentInput): TitleIdentity {
  const k12 = input.k12;
  const rating = typeof input.rating === "number" && Number.isFinite(input.rating) ? input.rating : null;
  const rank = typeof input.standingRank === "number" && input.standingRank > 0 ? input.standingRank : null;

  let core: Pick<TitleIdentity, "title" | "titleLevel" | "shortBadge" | "rankIcon">;
  if (k12) {
    if (rank != null) core = k12TitleFromRank(rank);
    else if (rating != null) core = k12TitleFromRating(rating);
    else core = { title: "Beginner", titleLevel: 1, shortBadge: "BG", rankIcon: "♟" };
  } else if (rank != null) {
    core = adultTitleFromRank(rank);
  } else if (rating != null) {
    core = adultTitleFromRating(rating);
  } else {
    core = { title: "Recruit", titleLevel: 1, shortBadge: "RC", rankIcon: "♟" };
  }

  const legacyMarkers = buildLegacyMarkers(input);
  const rep = reputationScore(input, core.titleLevel);

  return {
    ...core,
    legacyMarkers,
    reputationScore: rep,
  };
}
