import type { User } from "@supabase/supabase-js";

export function pickMeta(meta: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = meta[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

function formatStat(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  const s = String(v).trim();
  return s === "" ? "—" : s;
}

/** Session / user_metadata only — no API calls. Used by NavigationBar and /profile. */
export function identityPreviewFromUser(user: User | null) {
  if (!user) {
    return {
      displayName: "—",
      rank: "—",
      elo: "—",
      gamesPlayed: "—",
      wins: "—",
      streak: "—",
      record: "—",
    };
  }
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    pickMeta(meta, ["full_name", "name", "username", "display_name", "preferred_username"]) ??
    user.email?.split("@")[0] ??
    "—";
  const rank = pickMeta(meta, ["rank", "tier", "accl_rank", "accl_tier"]) ?? "—";
  const elo = pickMeta(meta, ["elo", "rating", "accl_rating", "accl_elo"]) ?? "—";
  const gamesPlayed = formatStat(meta.games_played ?? meta.gamesPlayed);
  const wins = formatStat(meta.wins);
  const streak = formatStat(meta.streak ?? meta.win_streak);

  let record = "—";
  const w = meta.wins;
  const l = meta.losses;
  if (typeof w === "number" && typeof l === "number") {
    record = `${w}–${l}`;
  } else if (meta.streak != null && String(meta.streak).trim() !== "") {
    record = `Streak ${meta.streak}`;
  } else if (pickMeta(meta, ["record", "win_loss", "wl"])) {
    record = pickMeta(meta, ["record", "win_loss", "wl"])!;
  }

  return { displayName, rank, elo, gamesPlayed, wins, streak, record };
}
