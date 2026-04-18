import type { User } from "@supabase/supabase-js";
import { getSupabaseUserFromCookies } from "@/lib/auth/getSupabaseUserFromCookies";
import { getActivityFeed } from "@/lib/nexus/getActivityFeed";
import type { NexusEcosystem } from "@/lib/nexus/getNexusData";
import { getLiveGames } from "@/lib/nexus/getLiveGames";
import { getRecentWinners } from "@/lib/nexus/getRecentWinners";
import { getStandings } from "@/lib/nexus/getStandings";
import {
  buildNexusHubActionCards,
  mapActivityFeedToRows,
  mapTournamentRows,
  mapWinnersToRecentRows,
  scoreAndSortTournamentRows,
} from "@/lib/nexus/nexusHubMapping";
import { acclRatingFromP1, formatRatingDisplay, parseP1FromSnapshotPayload } from "@/lib/p1PublicRatingRead";
import { identityPreviewFromUser } from "@/lib/profileIdentity";
import { createServiceRoleClient } from "@/lib/supabaseServiceRoleClient";
import type {
  NexusHubPayload,
  NexusIdentitySummaryData,
  NexusStandingContextState,
  NexusSystemActivityState,
  NexusTournamentRow,
} from "@/lib/nexus/types";

export type { HubActionCardsParams } from "@/lib/nexus/nexusHubMapping";

export {
  buildNexusHubActionCards,
  formatRelativeTimeUtc,
  isSafeHubDocumentId,
  isValidNexusHubHref,
  mapActivityFeedToRows,
  mapTournamentRows,
  mapWinnersToRecentRows,
  NEXUS_HUB_LOGIN_HREF,
  pickActiveGameForUser,
  scoreAndSortTournamentRows,
  shouldHighlightResultTier,
  stageLabelFromStatus,
} from "@/lib/nexus/nexusHubMapping";

const TOURNAMENT_QUERY_LIMIT = 20;
const TOURNAMENT_CAP = 12;

async function fetchTournamentEntryIdsForUser(
  userId: string,
  tournamentIds: string[],
): Promise<Set<string>> {
  if (tournamentIds.length === 0) return new Set();
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("tournament_entries")
    .select("tournament_id")
    .eq("user_id", userId)
    .in("tournament_id", tournamentIds);
  if (error) return new Set();
  return new Set((data ?? []).map((r) => String(r.tournament_id ?? "").trim()).filter(Boolean));
}

function enrichTournamentUserContext(
  rows: NexusTournamentRow[],
  userId: string | null,
  liveGames: import("@/lib/nexus/getNexusData").NexusLiveGame[],
  entryIds: Set<string>,
): NexusTournamentRow[] {
  return rows.map((row) => {
    if (!userId) return row;
    const userParticipating = entryIds.has(row.id);
    const userHasActiveGame = liveGames.some(
      (lg) =>
        String(lg.tournament_id ?? "") === row.id &&
        (lg.white_player_id === userId || lg.black_player_id === userId),
    );
    return {
      ...row,
      ...(userParticipating ? { userParticipating: true } : {}),
      ...(userHasActiveGame ? { userHasActiveGame: true } : {}),
    };
  });
}

async function fetchHonestActiveTournaments(ecosystem: NexusEcosystem): Promise<NexusTournamentRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("id,name,status,created_at,sponsor_label")
    .eq("ecosystem_scope", ecosystem)
    .order("created_at", { ascending: false })
    .limit(TOURNAMENT_QUERY_LIMIT);
  if (error) return [];
  const active = (data ?? []).filter((r) =>
    ["active", "in_progress", "live"].includes(String(r.status ?? "").toLowerCase()),
  );
  const mapped: NexusTournamentRow[] = active.map((r) => {
    const sl = (r as { sponsor_label?: string | null }).sponsor_label;
    const tierLabel = sl && String(sl).trim() ? String(sl).trim() : undefined;
    return {
      id: String(r.id ?? "").trim(),
      name: String(r.name ?? "Tournament").trim() || "Tournament",
      status: String(r.status ?? "—").trim() || "—",
      updatedAt: String((r as { created_at?: string }).created_at ?? ""),
      href: "",
      ...(tierLabel ? { tierLabel } : {}),
    };
  });
  return mapTournamentRows(mapped, TOURNAMENT_QUERY_LIMIT);
}

function toIdentitySummary(user: User | null, prev: ReturnType<typeof identityPreviewFromUser>): NexusIdentitySummaryData {
  const hasSession = Boolean(user?.id);
  return {
    displayName: hasSession ? prev.displayName : "—",
    elo: hasSession ? prev.elo : "—",
    rank: hasSession ? prev.rank : "—",
    gamesPlayed: hasSession ? prev.gamesPlayed : "—",
    wins: hasSession ? prev.wins : "—",
    streak: hasSession ? prev.streak : "—",
    isAnonymous: !hasSession,
  };
}

const MSG = {
  activeTournaments: "Active tournament snapshot not available yet.",
  recentResults: "No recent results available.",
  standingSignedOut: "Standing context not available.",
  standingOutOfRange: "You are currently outside the visible standings range.",
  systemActivity: "Activity feed not connected.",
} as const;

const RECENT_LIMIT = 8;
const ACTIVITY_LIMIT = 10;

export async function getNexusHubData(ecosystem: NexusEcosystem): Promise<NexusHubPayload> {
  const placeholdersUsed: string[] = [];
  const generatedAt = new Date().toISOString();

  const user = await getSupabaseUserFromCookies();
  let profileUsername: string | null = null;
  let profileRating: number | null = null;
  if (user?.id) {
    const supabase = createServiceRoleClient();
    const { data: prof } = await supabase
      .from("profiles")
      .select("username,rating")
      .eq("id", user.id)
      .maybeSingle();
    const u = (prof as { username?: string | null } | null)?.username;
    profileUsername = typeof u === "string" && u.trim() ? u.trim() : null;
    const r = (prof as { rating?: unknown } | null)?.rating;
    profileRating = typeof r === "number" && Number.isFinite(r) ? r : null;
  }
  const prev = identityPreviewFromUser(user, { profileUsername });
  let identity = toIdentitySummary(user, prev);
  if (user?.id) {
    const supabaseSnap = createServiceRoleClient();
    const { data: snap } = await supabaseSnap.rpc("get_public_profile_snapshot", {
      p_profile_id: user.id,
    });
    const p1 = parseP1FromSnapshotPayload(snap);
    const accl = acclRatingFromP1(p1, profileRating);
    if (accl != null) {
      identity = { ...identity, elo: formatRatingDisplay(accl) };
    }
  }

  const [recentWinners, activityFeed, liveGames, standings, tournamentRowsRaw] = await Promise.all([
    getRecentWinners(ecosystem),
    getActivityFeed(ecosystem),
    getLiveGames(ecosystem),
    getStandings(ecosystem),
    fetchHonestActiveTournaments(ecosystem),
  ]);

  const tournamentIds = tournamentRowsRaw.map((r) => r.id);
  const entrySet =
    user?.id && tournamentIds.length > 0
      ? await fetchTournamentEntryIdsForUser(user.id, tournamentIds)
      : new Set<string>();

  const tournamentRows = scoreAndSortTournamentRows(
    enrichTournamentUserContext(tournamentRowsRaw, user?.id ?? null, liveGames, entrySet),
    TOURNAMENT_CAP,
  );

  const activeTournaments =
    tournamentRows.length > 0
      ? { state: "ready" as const, items: tournamentRows }
      : (placeholdersUsed.push("active_tournaments_empty"),
        {
          state: "placeholder" as const,
          message: MSG.activeTournaments,
        });

  const recentRows = mapWinnersToRecentRows(recentWinners, RECENT_LIMIT);
  const hasRecentFinishedWins = recentRows.length > 0;
  const recentResults =
    hasRecentFinishedWins
      ? { state: "ready" as const, items: recentRows }
      : (placeholdersUsed.push("recent_results_empty"),
        {
          state: "placeholder" as const,
          message: MSG.recentResults,
        });

  let standingContext: NexusStandingContextState;
  if (!user?.id) {
    standingContext = {
      state: "placeholder",
      message: MSG.standingSignedOut,
    };
    placeholdersUsed.push("standing_signed_out");
  } else {
    const me = standings.find((s) => s.user_id === user.id);
    if (me) {
      const tierLabel = String(me.tier ?? "—").trim() || "—";
      const message = `You are ranked #${me.rank} in ${tierLabel}.`;
      const emphasis: "strong" | "neutral" = me.rank <= 10 ? "strong" : "neutral";
      const hint =
        me.rank > 1 && me.games > 0 ? "Win your next game to improve your position." : undefined;
      standingContext = {
        state: "ready",
        message,
        hint,
        emphasis,
        rank: me.rank,
        tier: tierLabel,
        streak: me.streak,
        rating: me.rating,
        earned: me.earned,
        gamesPlayed: me.games,
      };
    } else {
      standingContext = {
        state: "placeholder",
        message: MSG.standingOutOfRange,
      };
      placeholdersUsed.push("standing_out_of_range");
    }
  }

  const activityItems = mapActivityFeedToRows(activityFeed, ACTIVITY_LIMIT, {
    nowMs: Date.now(),
    userParticipatingTournamentIds: entrySet,
    liveGames,
    userId: user?.id ?? null,
  });

  const systemActivity: NexusSystemActivityState =
    activityItems.length > 0
      ? { state: "ready", items: activityItems }
      : (placeholdersUsed.push("system_activity_empty"),
        { state: "placeholder", message: MSG.systemActivity });

  const userTournamentEntryIds = user?.id ? tournamentIds.filter((id) => entrySet.has(id)) : [];

  const actionCards = buildNexusHubActionCards({
    userId: user?.id ?? null,
    liveGames,
    userTournamentEntryIds,
    hasRecentFinishedWins,
  });

  return {
    identity,
    activeTournaments,
    recentResults,
    standingContext,
    systemActivity,
    actionCards,
    meta: {
      placeholdersUsed,
      generatedAt,
      ecosystem,
      isLoggedIn: Boolean(user?.id),
    },
  };
}
