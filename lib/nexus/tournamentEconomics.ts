import type { NexusEcosystem } from "@/lib/nexus/getNexusData";

/**
 * Display-only economics for tournaments. When DB columns are not wired,
 * values are inferred from tier/bracket for transparency (source: inferred).
 */
export type TournamentEconomicsSnapshot = {
  entry_fee_usd: number;
  prize_pool_usd: number;
  first_advance_usd: number | null;
  lock_utc: string | null;
  bracket_size: number;
  payout_structure_label: string;
  incomplete_event_note: string;
  reward_type_label: string;
  source: "inferred" | "recorded";
};

/** When tournaments.entry_fee_cents / prize_pool_cents are set — display-only, auditable economics. */
export function economicsFromDbCents(
  entryFeeCents: number | null,
  prizePoolCents: number | null,
  ecosystem: NexusEcosystem,
  extras: { lock_utc?: string | null }
): TournamentEconomicsSnapshot | null {
  if (ecosystem === "k12") return null;
  if (entryFeeCents == null && prizePoolCents == null) return null;
  const entryUsd = Math.max(0, (entryFeeCents ?? 0) / 100);
  const poolUsd = Math.max(0, (prizePoolCents ?? 0) / 100);
  return {
    entry_fee_usd: entryUsd,
    prize_pool_usd: poolUsd,
    first_advance_usd: poolUsd > 0 ? Math.round(poolUsd * 0.35) : null,
    lock_utc: extras.lock_utc ?? null,
    bracket_size: 16,
    payout_structure_label: "Published pool — distribution follows verified results",
    incomplete_event_note:
      "If an event stops early, operator rules apply; refunds post to the ledger separately.",
    reward_type_label: "Tournament payout",
    source: "recorded",
  };
}

function tierBaseEntryUsd(tier: string): number {
  const t = tier.toLowerCase();
  if (t.includes("elite") || t.includes("tier a") || /^a\b/.test(t)) return 25;
  if (t.includes("tier b") || t.includes(" b")) return 10;
  if (t.includes("tier c") || t.includes(" c")) return 5;
  return 8;
}

function parseTierFromText(text: string): number {
  const m = /tier\s*([a-c])/i.exec(text);
  if (m) return tierBaseEntryUsd(`Tier ${m[1]}`);
  if (/elite/i.test(text)) return 25;
  return 8;
}

export function inferTournamentEconomics(
  input: { tier: string; participants: number; stage: string; start_utc: string | null },
  ecosystem: NexusEcosystem
): TournamentEconomicsSnapshot | null {
  if (ecosystem === "k12") return null;
  const entry = Math.max(5, tierBaseEntryUsd(input.tier));
  const n = Math.max(4, Math.min(64, input.participants || 16));
  const pool = Math.round(entry * n * 0.45);
  const firstAdvance = Math.round(pool * 0.35);
  return {
    entry_fee_usd: entry,
    prize_pool_usd: pool,
    first_advance_usd: firstAdvance,
    lock_utc: input.start_utc,
    bracket_size: n,
    payout_structure_label: "Winner 45% · Finalist 25% · Semis 20% · QF 10%",
    incomplete_event_note:
      "If an event stops early, standings and operator rules determine how recorded results apply. Details are shown before entry.",
    reward_type_label: input.stage.toLowerCase().includes("final")
      ? "Championship payout"
      : input.stage.toLowerCase().includes("semi")
        ? "Advancement toward final pool"
        : "Bracket progression",
    source: "inferred",
  };
}

/** Upcoming list rows — infer from title when tier is mentioned */
export function inferEconomicsFromEventTitle(title: string, utc_start: string, ecosystem: NexusEcosystem): TournamentEconomicsSnapshot | null {
  if (ecosystem === "k12") return null;
  const entry = parseTierFromText(title);
  const n = 16;
  const pool = Math.round(entry * n * 0.45);
  return {
    entry_fee_usd: entry,
    prize_pool_usd: pool,
    first_advance_usd: Math.round(pool * 0.35),
    lock_utc: utc_start,
    bracket_size: n,
    payout_structure_label: "Winner 45% · Finalist 25% · Semis 20% · QF 10%",
    incomplete_event_note:
      "If an event stops early, standings and operator rules determine how recorded results apply. Details are shown before entry.",
    reward_type_label: "Scheduled bracket",
    source: "inferred",
  };
}
