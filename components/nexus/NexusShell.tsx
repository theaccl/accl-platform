"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { NexusData, NexusEcosystem, NexusLiveGame, NexusSeasonContext } from "@/lib/nexus/getNexusData";
import type { NexusGlobalEvent } from "@/lib/events/globalEventBuilder";
import {
  getCachedNexusOverview,
  nexusOverviewCacheKey,
  setCachedNexusOverview,
} from "@/lib/nexus/nexusOverviewClientCache";
import { nexusDataFromPublicSlice } from "@/lib/nexus/getPublicNexusData";
import type { PublicNexusData } from "@/lib/nexus/getPublicNexusData";
import NexusHeader from "@/components/nexus/NexusHeader";
import QuickNav from "@/components/nexus/QuickNav";
import SystemLeaders from "@/components/nexus/SystemLeaders";
import PersonalHook from "@/components/nexus/PersonalHook";
import OnboardingPanel from "@/components/nexus/OnboardingPanel";
import InvitePanel from "@/components/nexus/InvitePanel";
import LiveGamesModule from "@/components/nexus/LiveGamesModule";
import ActiveTournamentsModule from "@/components/nexus/ActiveTournamentsModule";
import AnnouncementsModule from "@/components/nexus/AnnouncementsModule";
import UpcomingEventsModule from "@/components/nexus/UpcomingEventsModule";
import RecentWinnersModule from "@/components/nexus/RecentWinnersModule";
import ChessNewsModule from "@/components/nexus/ChessNewsModule";
import ActivityFeedModule from "@/components/nexus/ActivityFeedModule";
import StandingsPreview from "@/components/nexus/StandingsPreview";
import StandingsExpanded from "@/components/nexus/StandingsExpanded";
import RecordsModule from "@/components/nexus/RecordsModule";
import SeasonalArchiveModule from "@/components/nexus/SeasonalArchiveModule";
import LegacyMemorialModule from "@/components/nexus/LegacyMemorialModule";
import MetaInsightsModule from "@/components/nexus/MetaInsightsModule";
import RecapModule from "@/components/nexus/RecapModule";
import Link from "next/link";
import { Chessboard } from "react-chessboard";
import PlayerIdentityCard from "@/components/nexus/PlayerIdentityCard";
import PayoutStructureCard from "@/components/nexus/PayoutStructureCard";
import PayoutTrustModule from "@/components/nexus/PayoutTrustModule";
import IntegrityStatusBar from "@/components/nexus/IntegrityStatusBar";
import GovernanceModule from "@/components/nexus/GovernanceModule";
import DevelopmentModule from "@/components/nexus/DevelopmentModule";
import ConnectionsPanel from "@/components/social/ConnectionsPanel";
import NarrativeModule from "@/components/nexus/NarrativeModule";
import GlobalEventsModule from "@/components/nexus/GlobalEventsModule";
import ChampionshipPanel from "@/components/nexus/ChampionshipPanel";
import ChampionshipCountdown from "@/components/nexus/ChampionshipCountdown";
import { inferEconomicsFromEventTitle } from "@/lib/nexus/tournamentEconomics";
import {
  inferChampionshipContextLabel,
  inferEventContextLabel,
  pickChampionshipSpotlight,
  type SpotlightKind,
} from "@/lib/events/globalEventBuilder";
import { socialLineForPair } from "@/lib/social/buildNexusSocialLayer";
import { pairKey } from "@/lib/social/rivalryDetection";

function championBadgeFor(uid: string | null, season: NexusSeasonContext): "current" | "defending" | "former" | null {
  if (!uid) return null;
  if (season.current_champion_user_id === uid) return "current";
  if (season.defending_champion_user_id === uid) return "defending";
  if (season.former_champion_user_ids.includes(uid)) return "former";
  return null;
}

function LoadingCard() {
  return <div className="h-24 rounded-xl border border-[#273246] bg-[#151d2c] animate-pulse" />;
}

export default function NexusShell({
  initialEcosystem,
  publicMode = false,
}: {
  initialEcosystem: NexusEcosystem;
  /** Read-only Nexus for anonymous visitors — hides personal, social, and vault surfaces. */
  publicMode?: boolean;
}) {
  const [activeNav, setActiveNav] = useState("standings");
  const [data, setData] = useState<NexusData | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [ecosystem] = useState<NexusEcosystem>(initialEcosystem);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    const run = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const uid = publicMode ? null : sessionData.session?.user?.id ?? null;
      if (!cancelled) setUserId(uid);
      const key = publicMode ? `public:${ecosystem}` : nexusOverviewCacheKey(ecosystem, uid);
      const cached = getCachedNexusOverview(key, publicMode ? 25_000 : 20_000);
      if (cached && !cancelled) {
        setData(cached);
        setLoadError(false);
      }
      const t0 = typeof performance !== "undefined" ? performance.now() : 0;
      try {
        const url = publicMode
          ? `/api/nexus/public?ecosystem=${ecosystem}`
          : `/api/nexus/overview?ecosystem=${ecosystem}`;
        const res = await fetch(url, {
          headers: !publicMode && token ? { Authorization: `Bearer ${token}` } : {},
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const payload = (await res.json().catch(() => ({}))) as { data?: NexusData | PublicNexusData };
        if (cancelled) return;
        if (payload.data) {
          const normalized: NexusData = publicMode
            ? nexusDataFromPublicSlice(payload.data as PublicNexusData)
            : (payload.data as NexusData);
          setCachedNexusOverview(key, normalized);
          setData(normalized);
          setLoadError(false);
        } else if (!cached) {
          setData(null);
          setLoadError(true);
        }
      } catch (e) {
        const aborted = e instanceof Error && e.name === "AbortError";
        if (cancelled || aborted) return;
        if (!cached) {
          setData(null);
          setLoadError(true);
        } else {
          setLoadError(true);
        }
      } finally {
        if (process.env.NODE_ENV === "development" && typeof performance !== "undefined") {
          console.info(`[nexus] client overview ${(performance.now() - t0).toFixed(0)}ms`);
        }
      }
    };
    void run();
    const intervalMs = publicMode ? 45_000 : 30_000;
    const iv = window.setInterval(() => void run(), intervalMs);
    const onVis = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      ac.abort();
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ecosystem, publicMode]);

  const championshipSpot = useMemo((): {
    game: NexusLiveGame | null;
    event: NexusGlobalEvent | null;
    spotlightKind: SpotlightKind;
  } => {
    if (!data) return { game: null, event: null, spotlightKind: "standard" };
    return pickChampionshipSpotlight(data.live_games, data.global_events ?? []);
  }, [data]);

  const spotlight = championshipSpot.game;
  const spotlightGlobalEvent = championshipSpot.event;
  const spotlightKind = championshipSpot.spotlightKind;

  const recapSpotlight = useMemo(() => {
    if (!data || spotlight || spotlightKind === "championship_countdown") return null;
    return data.recent_winners.find((w) => w.tier === "Tournament") ?? data.recent_winners[0] ?? null;
  }, [data, spotlight, spotlightKind]);

  const activeMatchId = useMemo(() => {
    if (!data || !userId) return null;
    return data.live_games.find((g) => g.white_player_id === userId || g.black_player_id === userId)?.id ?? null;
  }, [data, userId]);

  const engagement = useMemo(
    () => ({
      rankedPlayers: data?.standings.length ?? 0,
      liveGames: data?.live_games.length ?? 0,
      activeTournaments: data?.active_tournaments.length ?? 0,
    }),
    [data]
  );

  if (!data) {
    if (loadError) {
      return (
        <main className="min-h-screen bg-[#0D1117] text-white p-3 sm:p-4 md:p-6 overflow-x-hidden">
          <div className="max-w-7xl mx-auto">
            <p className="text-sm text-gray-400">Data unavailable.</p>
          </div>
        </main>
      );
    }
    return (
      <main className="min-h-screen bg-[#0D1117] text-white p-3 sm:p-4 md:p-6 overflow-x-hidden">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-5">
          <LoadingCard />
          <LoadingCard />
          <div className="grid sm:grid-cols-3 gap-3">
            <LoadingCard />
            <LoadingCard />
            <LoadingCard />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5">
            <div className="xl:col-span-2 space-y-4 sm:space-y-5">
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
            </div>
            <div className="space-y-4 sm:space-y-5">
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
            </div>
          </div>
          <LoadingCard />
        </div>
      </main>
    );
  }

  const k12 = data.ecosystem === "k12";

  const nextUp = data.upcoming_events[0];
  const economyFunnelHint =
    !k12 && nextUp?.economics
      ? `Qualify for the next paid bracket · ~$${nextUp.economics.entry_fee_usd} entry · ${nextUp.title} advances toward larger pools`
      : undefined;

  const spotlightEcon =
    spotlight && !k12
      ? (spotlight.tournament_id
          ? data.active_tournaments.find((t) => t.id === spotlight.tournament_id)?.economics
          : null) ??
        (spotlight.tournament_name
          ? inferEconomicsFromEventTitle(spotlight.tournament_name, new Date().toISOString(), "adult")
          : null)
      : null;

  const spotlightGlobalMeta =
    data && spotlight
      ? spotlightGlobalEvent ??
        data.global_events.find((e) => e.event_id === spotlight.global_event_id) ??
        null
      : data && spotlightKind === "championship_countdown" && spotlightGlobalEvent
        ? spotlightGlobalEvent
        : null;

  const recentFinishes14d = data.recent_winners.filter(
    (w) => Date.parse(w.utc) >= Date.now() - 14 * 24 * 3600 * 1000
  ).length;
  const meStanding = userId ? data.standings.find((s) => s.user_id === userId) : undefined;

  return (
    <div className={`min-h-screen text-white overflow-x-hidden ${k12 ? "bg-[#0b1524]" : "bg-[#0D1117]"}`}>
      <div className="max-w-7xl mx-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-5">
        <NexusHeader
          ecosystem={data.ecosystem}
          engagement={engagement}
          seasonHighlight={`Season ${data.season.current_season.season_id} · ${data.season.current_season.status}`}
          gamesToday={data.engagement_metrics?.games_today}
        />
        <IntegrityStatusBar
          k12={k12}
          generatedAt={data.generated_at}
          activeTournamentsCount={data.active_tournaments.length}
          liveGamesCount={data.live_games.length}
        />
        {loadError ? (
          <p className="text-xs text-amber-200/90 px-1" role="status">
            Couldn&apos;t refresh — showing last saved view.
          </p>
        ) : null}
        {publicMode ? (
          <div className="rounded-xl border border-slate-600/50 bg-slate-900/35 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-gray-200">
              Public Nexus — live activity and standings only. Sign in for your personal dashboard.
            </p>
            <Link
              href="/login?intent=signup&next=/nexus"
              className={`text-sm font-semibold shrink-0 ${k12 ? "text-cyan-200" : "text-sky-300"}`}
            >
              Sign up / Sign in
            </Link>
          </div>
        ) : null}
        {!publicMode ? <OnboardingPanel hook={data.personal_hook} userId={userId} k12={k12} /> : null}
        {!publicMode ? <QuickNav active={activeNav} onSelect={setActiveNav} /> : null}
        <SystemLeaders leaders={data.leaders} k12={k12} social={data.social} />
        <NarrativeModule narrative={data.narrative} season={data.season} k12={k12} globalEvents={data.global_events} />
        {data.global_events.length > 0 ? <GlobalEventsModule events={data.global_events} k12={k12} /> : null}
        {data.global_events.some((e) => e.is_championship) ? (
          <ChampionshipPanel events={data.global_events} liveGames={data.live_games} winners={data.recent_winners} k12={k12} />
        ) : null}
        {!publicMode ? (
          <PersonalHook
            hook={data.personal_hook}
            k12={k12}
            activeMatchId={activeMatchId}
            nextEvent={data.upcoming_events[0] ?? null}
            liveGamesCount={data.live_games.length}
            activeTournamentsCount={data.active_tournaments.length}
            rankedPlayersCount={data.standings.length}
            standingsGames={meStanding?.games ?? null}
          />
        ) : null}
        {spotlightKind === "championship_countdown" && spotlightGlobalEvent && spotlightGlobalEvent.countdown_at && !spotlight ? (
          <Link
            href="/tournaments/active"
            prefetch
            className={`block rounded-2xl border p-4 sm:p-5 transition touch-manipulation active:opacity-95 ${
              k12 ? "border-cyan-500/45 bg-[#0c2838] hover:border-cyan-300" : "border-amber-500/40 bg-[#1a120e] hover:border-amber-300"
            }`}
          >
            <p className="text-xs text-gray-300">{k12 ? "Season showcase" : "Championship"}</p>
            <p className={`text-lg font-semibold mt-1 ${k12 ? "text-cyan-50" : "text-amber-50"}`}>
              {k12 ? spotlightGlobalEvent.title_k12 : spotlightGlobalEvent.title}
            </p>
            <ChampionshipCountdown targetIso={spotlightGlobalEvent.countdown_at} k12={k12} />
            <p className="text-[10px] text-gray-500 mt-2">{k12 ? "Structured school-safe event" : "Structured event · integrity monitored"}</p>
            <div
              className={`mt-4 w-full rounded-xl border px-4 py-3.5 text-center text-sm font-semibold min-h-[48px] flex items-center justify-center ${
                k12 ? "border-cyan-500/50 bg-cyan-950/40 text-cyan-100" : "border-amber-500/50 bg-amber-950/30 text-amber-100"
              }`}
            >
              View
            </div>
          </Link>
        ) : null}
        {spotlight ? (
          <Link
            href={k12 ? `/game/${spotlight.id}?spectate=1&eco=k12` : `/game/${spotlight.id}?spectate=1`}
            prefetch
            className={`block rounded-2xl border p-4 sm:p-5 transition touch-manipulation active:opacity-95 ${
              k12
                ? "border-cyan-500/40 bg-[#10283a] hover:border-cyan-300"
                : "border-red-500/40 bg-[#20141a] hover:border-red-300"
            }`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs text-gray-300">
                  {spotlightGlobalMeta || spotlight.global_event_mega ? "Major event" : "Event Spotlight"}
                </p>
                {spotlightGlobalMeta ? (
                  <p className="text-[10px] mt-0.5">
                    <span
                      className={`inline-flex items-center rounded px-2 py-0.5 font-medium border ${
                        k12 ? "border-cyan-500/45 text-cyan-100 bg-cyan-950/35" : "border-amber-500/35 text-amber-100 bg-amber-950/25"
                      }`}
                    >
                      {spotlightGlobalMeta.event_type === "season_finale"
                        ? k12
                          ? "Season showcase"
                          : "Season finale"
                        : spotlightGlobalMeta.event_type === "championship_event"
                          ? k12
                            ? "Showcase"
                            : "Championship"
                          : spotlightGlobalMeta.event_type === "cross_tier_showcase"
                            ? "Showcase"
                            : spotlightGlobalMeta.event_type === "redemption_spotlight"
                              ? k12
                                ? "Qualifier"
                                : "Redemption"
                              : spotlightGlobalMeta.event_type === "special_invitational"
                                ? k12
                                  ? "Invited"
                                  : "Invitational"
                                : "Major event"}
                    </span>
                  </p>
                ) : spotlight.global_event_chip ? (
                  <p className="text-[10px] mt-0.5">
                    <span
                      className={`inline-flex rounded px-2 py-0.5 border ${
                        k12 ? "border-cyan-500/40 text-cyan-100" : "border-amber-500/35 text-amber-100"
                      }`}
                    >
                      {spotlight.global_event_chip}
                    </span>
                  </p>
                ) : null}
                <p className="text-lg sm:text-xl text-white font-semibold leading-snug break-words">
                  {spotlight.tournament_name ?? "Major Event"}
                </p>
                <p className="text-[11px] text-gray-400 mt-1 line-clamp-2">
                  {k12 ? data.narrative.headline.headline_k12 : data.narrative.headline.headline}
                  {data.narrative.headline.subline ? ` · ${data.narrative.headline.subline}` : ""}
                </p>
                {spotlightGlobalMeta ? (
                  <p className={`text-[10px] mt-1 ${k12 ? "text-cyan-200/90" : "text-amber-200/85"}`}>
                    {k12 ? "State" : "Lifecycle"}: {spotlightGlobalMeta.lifecycle_state}
                    {spotlightGlobalMeta.is_championship
                      ? k12
                        ? ` · ${spotlightGlobalMeta.championship_tier === "finale" ? "Final round" : "Showcase stage"}`
                        : ` · ${spotlightGlobalMeta.championship_tier}`
                      : ""}
                  </p>
                ) : null}
                <p className={`text-xs mt-1 ${k12 ? "text-cyan-200" : "text-red-300"}`}>
                  Stage: {String(spotlight.tournament_status ?? "Final").toUpperCase()}
                </p>
                {spotlightEcon ? (
                  <p className="text-xs text-gray-400 mt-2 break-words hidden sm:block">
                    Entry ${spotlightEcon.entry_fee_usd} · Pool ${spotlightEcon.prize_pool_usd} ·{" "}
                    {String(spotlight.tournament_status ?? "Live")} · {spotlightEcon.reward_type_label}
                  </p>
                ) : null}
                {spotlightEcon ? (
                  <p className="text-[11px] text-gray-400 mt-2 sm:hidden break-words">
                    ${spotlightEcon.entry_fee_usd} entry · ${spotlightEcon.prize_pool_usd} pool
                  </p>
                ) : null}
              </div>
              <p
                className={`text-xs flex items-center gap-1.5 shrink-0 sm:self-center ${k12 ? "text-cyan-200" : "text-red-300"}`}
              >
                <span className={`inline-block w-2 h-2 rounded-full animate-pulse ${k12 ? "bg-cyan-300" : "bg-red-400"}`} />
                LIVE
              </p>
            </div>
            <p className="text-[10px] text-gray-500 mt-2">
              {k12 ? "Fair play monitoring" : "Under active monitoring"}
            </p>
            {spotlight.trending_match ? (
              <p className="text-[10px] text-amber-200/85 mt-1">Trending match</p>
            ) : null}
            {typeof spotlight.approx_spectators === "number" ? (
              <p className="text-[10px] text-gray-500 mt-0.5">~{spotlight.approx_spectators} spectators (approx.)</p>
            ) : null}
            {spotlight.rivalry_match ? (
              <p className={`text-[10px] mt-0.5 ${k12 ? "text-cyan-200/85" : "text-violet-200/85"}`}>
                {k12 ? "Frequent-opponent pairing" : "Rivalry pairing"}
              </p>
            ) : null}
            {spotlight.narrative_tags && spotlight.narrative_tags.length > 0 ? (
              <p className="text-[10px] text-gray-500 mt-1">{spotlight.narrative_tags.join(" · ")}</p>
            ) : null}
            <div className="mt-4 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,300px)_1fr] lg:items-start lg:gap-4">
              <div
                className="rounded-lg overflow-hidden border border-black/30 mx-auto lg:mx-0 shrink-0"
                style={{ width: "min(100%, 300px)" }}
              >
                <Chessboard options={{ id: `spotlight-${spotlight.id}`, position: spotlight.fen || "start" }} />
              </div>
              <div className="space-y-3 min-w-0 w-full">
                {(() => {
                  const wId = spotlight.white_player_id;
                  const bId = spotlight.black_player_id;
                  const pk = wId && bId ? pairKey(wId, bId) : null;
                  const h2h = pk ? data.social.head_to_head[pk] : undefined;
                  return (
                    <>
                      <PlayerIdentityCard
                        label={spotlight.white_label}
                        rating={spotlight.white_rating}
                        tier={spotlight.white_tier}
                        achievement={`Time: ${spotlight.time_control}`}
                        compact
                        k12={k12}
                        showVault={false}
                        emphasis="high"
                        rivalryBadge={Boolean(h2h?.is_rival)}
                        presenceHint={wId ? data.social.presence[wId] : undefined}
                        socialContextLine={
                          userId && wId && bId ? socialLineForPair(userId, bId, k12, h2h) : null
                        }
                        championRole={championBadgeFor(wId, data.season)}
                        eventContextLabel={
                          inferChampionshipContextLabel(wId, spotlight, spotlightGlobalMeta, data.recent_winners, k12) ??
                          inferEventContextLabel(wId, spotlight, spotlightGlobalMeta, data.season)
                        }
                      />
                      <PlayerIdentityCard
                        label={spotlight.black_label}
                        rating={spotlight.black_rating}
                        tier={spotlight.black_tier}
                        achievement={`Move ${spotlight.move_count}`}
                        compact
                        k12={k12}
                        showVault={false}
                        emphasis="high"
                        rivalryBadge={Boolean(h2h?.is_rival)}
                        presenceHint={bId ? data.social.presence[bId] : undefined}
                        socialContextLine={
                          userId && wId && bId ? socialLineForPair(userId, wId, k12, h2h) : null
                        }
                        championRole={championBadgeFor(bId, data.season)}
                        eventContextLabel={
                          inferChampionshipContextLabel(bId, spotlight, spotlightGlobalMeta, data.recent_winners, k12) ??
                          inferEventContextLabel(bId, spotlight, spotlightGlobalMeta, data.season)
                        }
                      />
                    </>
                  );
                })()}
              </div>
            </div>
            {spotlightEcon ? (
              <div className="mt-4">
                <PayoutStructureCard economics={spotlightEcon} k12={k12} title="Event economics" />
              </div>
            ) : null}
            <div
              className={`mt-4 w-full rounded-xl border px-4 py-3.5 text-center text-sm font-semibold min-h-[48px] flex items-center justify-center ${
                k12
                  ? "border-cyan-500/50 bg-cyan-950/40 text-cyan-100"
                  : "border-red-500/50 bg-red-950/30 text-red-100"
              }`}
            >
              Watch live
            </div>
          </Link>
        ) : recapSpotlight ? (
          <div
            key={`nexus-spotlight-recap-${recapSpotlight.id}`}
            className={`rounded-2xl border p-4 ${
              k12 ? "border-cyan-500/40 bg-[#10283a]" : "border-red-500/40 bg-[#20141a]"
            }`}
          >
            <Link
              href={`/finished/${recapSpotlight.id}`}
              className={`block transition rounded-lg -m-1 p-1 ${k12 ? "hover:border-cyan-300" : "hover:border-red-300"}`}
            >
              <p className="text-xs text-gray-300">Event Spotlight</p>
              <p className="text-lg text-white font-semibold">RESULT • {recapSpotlight.event_name}</p>
              <p className={`text-xs ${k12 ? "text-cyan-200" : "text-red-300"}`}>
                Winner: {recapSpotlight.player_label}
                {!k12 ? <> • ${recapSpotlight.amount_won} recorded</> : <> • Recognition result</>}
              </p>
              {!k12 ? (
                <p className="text-xs text-gray-400 mt-1">Structured event reward · confirmed payout record</p>
              ) : (
                <p className="text-xs text-cyan-200/80 mt-1">School-safe surface — no cash shown</p>
              )}
              <p className="text-[10px] text-gray-500 mt-1">
                {k12 ? "Results checked before they count" : "Verified match · recorded for standings"}
              </p>
            </Link>
            <Link
              href={k12 ? `/share/game/${recapSpotlight.id}?eco=k12` : `/share/game/${recapSpotlight.id}`}
              className={`mt-3 inline-block text-[11px] font-medium underline ${k12 ? "text-cyan-200/90" : "text-sky-300/90"}`}
            >
              {k12 ? "Share this match (school-safe link)" : "Share this match"}
            </Link>
          </div>
        ) : null}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5">
          <div className="xl:col-span-2 space-y-4 sm:space-y-5">
            <LiveGamesModule games={data.live_games} activeTournamentCount={data.active_tournaments.length} k12={k12} />
            <ActiveTournamentsModule tournaments={data.active_tournaments} k12={k12} />
            {publicMode ? (
              <StandingsPreview rows={data.standings} k12={k12} economyFunnelHint={undefined} />
            ) : (
              <StandingsExpanded
                rows={data.standings}
                currentUserId={userId}
                k12={k12}
                economyFunnelHint={economyFunnelHint}
                social={data.social}
              />
            )}
          </div>
          <div className="space-y-4 sm:space-y-5 min-w-0">
            <AnnouncementsModule items={data.announcements} />
            <UpcomingEventsModule items={data.upcoming_events} k12={k12} />
            {!publicMode ? (
              <StandingsPreview rows={data.standings} k12={k12} economyFunnelHint={economyFunnelHint} />
            ) : null}
            {!publicMode ? <DevelopmentModule k12={k12} /> : null}
            {!publicMode ? (
              <ConnectionsPanel
                ecosystem={data.ecosystem}
                userId={userId}
                k12={k12}
                presenceByUser={data.social.presence}
              />
            ) : null}
            {!publicMode ? <InvitePanel userId={userId} k12={k12} /> : null}
            {!publicMode ? (
              <GovernanceModule
                k12={k12}
                activeTournaments={data.active_tournaments.length}
                recentFinishes14d={recentFinishes14d}
                generatedAt={data.generated_at}
              />
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
          <RecentWinnersModule winners={data.recent_winners} k12={k12} globalEvents={data.global_events} />
          {!publicMode ? <PayoutTrustModule trust={data.payout_trust} k12={k12} /> : null}
          {!publicMode ? <RecordsModule standings={data.standings} winners={data.recent_winners} k12={k12} /> : null}
          {!publicMode ? <MetaInsightsModule standings={data.standings} winners={data.recent_winners} k12={k12} /> : null}
          {!publicMode ? (
            <RecapModule
              winners={data.recent_winners}
              k12={k12}
              championshipRecapAvailable={data.global_events.some((e) => e.recap_available)}
            />
          ) : null}
          {!publicMode ? (
            <SeasonalArchiveModule winners={data.recent_winners} k12={k12} seasonContext={data.season} globalEvents={data.global_events} />
          ) : null}
          {!publicMode ? <LegacyMemorialModule announcements={data.announcements} winners={data.recent_winners} k12={k12} /> : null}
          {!publicMode ? <ChessNewsModule items={data.chess_news} /> : null}
        </div>

        <ActivityFeedModule
          initial={data.activity_feed}
          ecosystem={data.ecosystem}
          generatedAt={data.generated_at}
          publicSurface={publicMode}
        />
      </div>
    </div>
  );
}

