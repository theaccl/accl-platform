import { getActivityFeed } from '@/lib/nexus/getActivityFeed';
import { getAnnouncements } from '@/lib/nexus/getAnnouncements';
import { getLiveGames } from '@/lib/nexus/getLiveGames';
import { getRecentWinners } from '@/lib/nexus/getRecentWinners';
import { getStandings } from '@/lib/nexus/getStandings';
import { getSystemLeaders } from '@/lib/nexus/getSystemLeaders';
import { getUpcomingEvents } from '@/lib/nexus/getUpcomingEvents';
import type { TournamentEconomicsSnapshot } from '@/lib/nexus/tournamentEconomics';
import { getAdultFinancialHookSnapshot } from '@/lib/payments/complianceSnapshot';
import { getComplianceBranding } from '@/lib/payments/complianceConfig';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import {
  buildNexusSocialLayer,
  enrichLiveGamesForSocial,
  type NexusSocialLayer,
} from '@/lib/social/buildNexusSocialLayer';
import {
  buildNexusSeasonNarrative,
  enrichLiveGamesNarrative,
  type NexusNarrativeBundle,
  type NexusSeasonContext,
} from '@/lib/nexus/buildNexusSeasonNarrative';
import type { NarrativeEventKind } from '@/lib/narrative/narrativeDetection';
import { getSeasonMeta } from '@/lib/season/seasonManager';
import {
  buildGlobalEventFeedItems,
  buildGlobalEvents,
  enrichLiveGamesWithGlobalEvents,
  type NexusGlobalEvent,
} from '@/lib/events/globalEventBuilder';
import { buildGlobalEventLifecycleFeedItems, enrichGlobalEventsWithLifecycle } from '@/lib/events/eventLifecycle';
import { orderGlobalEventsForLaunch } from '@/lib/events/launchSequence';
import type { LifecycleState } from '@/lib/events/globalEventTypes';

export type NexusEcosystem = 'adult' | 'k12';

export type NexusLeader = {
  user_id: string | null;
  label: string;
  username: string;
  value: string;
  tier: string | null;
  flag: string;
};

export type NexusPersonalHook = {
  user_id: string | null;
  rank: number | null;
  tier: string;
  streak: number;
  total_earned: number;
  next_event: string;
  /** Most recent recorded finish in the winners feed (adult USD; K–12 may be null). */
  recent_payout_amount_usd?: number | null;
  recent_payout_at?: string | null;
  economic_milestone_hint?: string | null;
  buy_in_eligible_event_label?: string | null;
  /** Phase 27 — USD cents, derived from payment_transactions (adult only). */
  wallet_balance_cents?: number | null;
  /** Phase 28 — payout / compliance (adult only). */
  payout_profile_status?: 'eligible' | 'action_required' | 'restricted' | null;
  payout_profile_message?: string | null;
  payout_amount_ytd_cents?: number | null;
  tax_notice?: boolean;
};

export type NexusLiveGame = {
  id: string;
  white_label: string;
  black_label: string;
  white_player_id: string | null;
  black_player_id: string | null;
  white_rating: number | null;
  black_rating: number | null;
  white_tier: string | null;
  black_tier: string | null;
  time_control: string;
  status: string;
  is_live: boolean;
  fen: string;
  move_count: number;
  white_clock_ms: number | null;
  black_clock_ms: number | null;
  tournament_id: string | null;
  tournament_name: string | null;
  tournament_status: string | null;
  /** Phase 21 — derived spectator interest (non-identifying). */
  approx_spectators?: number;
  trending_match?: boolean;
  rivalry_match?: boolean;
  /** Phase 22 — short labels from season / rivalry (derived). */
  narrative_tags?: string[];
  /** Phase 23 — global event framing when a live game maps to a structured major event */
  global_event_id?: string | null;
  global_event_chip?: string | null;
  global_event_mega?: boolean;
  /** Phase 24 — championship context on live boards */
  is_championship_match?: boolean;
  championship_lifecycle?: LifecycleState;
};

export type NexusTournament = {
  id: string;
  name: string;
  tier: string;
  round_status: string;
  participants: number;
  stage: string;
  start_utc: string | null;
  economics?: TournamentEconomicsSnapshot | null;
  /** Phase 26 — optional sponsor placeholders (from tournaments row). */
  sponsor_tag?: string | null;
  sponsor_label?: string | null;
};

export type NexusAnnouncement = {
  id: string;
  title: string;
  body: string;
  utc: string;
};

export type NexusUpcomingEvent = {
  id: string;
  title: string;
  event_type: string;
  utc_start: string;
  economics?: TournamentEconomicsSnapshot | null;
};

export type NexusPayoutCategory = 'tournament_win' | 'advancement' | 'free_finish' | 'seasonal' | 'recognition';

export type NexusWinner = {
  id: string;
  player_label: string;
  tier: string;
  amount_won: number;
  event_name: string;
  utc: string;
  winner_user_id?: string | null;
  payout_category?: NexusPayoutCategory;
};

export type NexusPayoutTrust = {
  recent_count: number;
  total_recent_amount_usd: number;
  last_payout_at: string | null;
  ledger: Array<{
    id: string;
    label: string;
    amount_usd: number;
    category: string;
    utc: string;
  }>;
  platform_entity_name?: string | null;
  payout_descriptor?: string | null;
};

export type NexusActivityItem = {
  id: string;
  kind: string;
  message: string;
  utc: string;
  game_id?: string | null;
  /** Phase 22 — when kind is narrative */
  narrative_kind?: NarrativeEventKind;
  /** Phase 23 — system-generated major-event lines */
  global_event_priority?: boolean;
  feed_priority?: 'global' | 'normal';
};

export type NexusStanding = {
  rank: number;
  user_id: string;
  username: string;
  tier: string;
  rating: number;
  wins: number;
  games: number;
  streak: number;
  earned: number;
  flag: string;
};

export type NexusData = {
  ecosystem: NexusEcosystem;
  generated_at: string;
  leaders: {
    number_one: NexusLeader;
    top_earner: NexusLeader;
    streak_leader: NexusLeader;
  };
  personal_hook: NexusPersonalHook;
  live_games: NexusLiveGame[];
  active_tournaments: NexusTournament[];
  announcements: NexusAnnouncement[];
  upcoming_events: NexusUpcomingEvent[];
  recent_winners: NexusWinner[];
  chess_news: Array<{ id: string; title: string; blurb: string; utc: string }>;
  activity_feed: NexusActivityItem[];
  standings: NexusStanding[];
  payout_trust: NexusPayoutTrust;
  /** Head-to-head and presence derived from finished games — optional social layer. */
  social: NexusSocialLayer;
  /** Phase 22 — seasons and champion context from results feed. */
  season: NexusSeasonContext;
  narrative: NexusNarrativeBundle;
  /** Phase 23 — derived global / major event structures (no synthetic competitions). */
  global_events: NexusGlobalEvent[];
  /** Phase 26 — optional public engagement snapshot (filled when serving public Nexus slice). */
  engagement_metrics?: {
    games_today: number;
    ranked_players: number;
  };
};

export async function getNexusData(input: {
  ecosystem: NexusEcosystem;
  currentUserId: string | null;
}): Promise<NexusData> {
  const ecosystem = input.ecosystem;
  // Single parallel batch — no sequential awaits; upstream helpers stay isolated.
  const [leaders, liveGamesRaw, tournamentsRaw, announcements, upcomingRaw, winners, activity, standings, adultFinancial] =
    await Promise.all([
      getSystemLeaders(ecosystem),
      getLiveGames(ecosystem),
      getUpcomingEvents(ecosystem, 'active'),
      getAnnouncements(ecosystem),
      getUpcomingEvents(ecosystem, 'upcoming'),
      getRecentWinners(ecosystem),
      getActivityFeed(ecosystem),
      getStandings(ecosystem),
      ecosystem === 'adult' && input.currentUserId
        ? getAdultFinancialHookSnapshot(createServiceRoleClient(), input.currentUserId)
        : Promise.resolve(null),
    ]);

  const adultFin = adultFinancial as Awaited<ReturnType<typeof getAdultFinancialHookSnapshot>> | null;

  const social = await buildNexusSocialLayer(ecosystem, standings, liveGamesRaw);
  const liveGamesSocial = enrichLiveGamesForSocial(liveGamesRaw, social.head_to_head);
  const k12 = ecosystem === 'k12';
  const { season, narrative } = await buildNexusSeasonNarrative(ecosystem, k12, standings, winners, social);
  const tournaments = tournamentsRaw as NexusTournament[];
  const upcoming = upcomingRaw as NexusUpcomingEvent[];
  const global_events = orderGlobalEventsForLaunch(
    enrichGlobalEventsWithLifecycle(
      buildGlobalEvents({
        ecosystem,
        activeTournaments: tournaments,
        upcomingEvents: upcoming,
        season: getSeasonMeta(),
      }),
      { liveGames: liveGamesSocial, tournaments, winners, now: new Date() },
    ),
  );
  let liveGames = enrichLiveGamesNarrative(liveGamesSocial, season, social);
  liveGames = enrichLiveGamesWithGlobalEvents(liveGames, global_events);

  const narrativeFeedItems: NexusActivityItem[] = narrative.events.slice(0, 14).map((e) => ({
    id: e.id,
    kind: 'narrative',
    message: k12 ? e.message_k12 : e.message,
    utc: e.utc,
    game_id: e.game_id ?? null,
    narrative_kind: e.kind,
    feed_priority: 'normal',
  }));
  const genAt = new Date().toISOString();
  const lifecycleFeed = buildGlobalEventLifecycleFeedItems(global_events, k12, genAt);
  const globalFeedItems: NexusActivityItem[] = [...lifecycleFeed, ...buildGlobalEventFeedItems(global_events, k12, genAt)].map(
    (row) => ({
      id: row.id,
      kind: row.kind,
      message: row.message,
      utc: row.utc,
      global_event_priority: row.global_event_priority,
      feed_priority: row.feed_priority,
    }),
  );
  const activityMerged = [...globalFeedItems, ...narrativeFeedItems, ...activity]
    .sort((a, b) => {
      const ag = a.feed_priority === 'global' ? 1 : 0;
      const bg = b.feed_priority === 'global' ? 1 : 0;
      if (ag !== bg) return bg - ag;
      return Date.parse(b.utc) - Date.parse(a.utc);
    })
    .slice(0, 72);

  const me = standings.find((s) => s.user_id === input.currentUserId);
  const myFinishes = input.currentUserId
    ? winners.filter((w) => w.winner_user_id === input.currentUserId)
    : [];
  const latestFinish = myFinishes.sort((a, b) => Date.parse(b.utc) - Date.parse(a.utc))[0];
  let economic_milestone_hint: string | undefined;
  if (ecosystem === 'adult') {
    if (me && me.rank && me.rank <= 20 && me.streak >= 2) {
      economic_milestone_hint = 'One more deep run can align you with the next paid bracket.';
    } else if (me && me.rank && me.rank >= 8 && me.rank <= 14) {
      economic_milestone_hint = 'Eligible for higher-tier entry as standings hold.';
    } else if (latestFinish && latestFinish.amount_won > 0) {
      economic_milestone_hint = 'Recent cash finish recorded — build on it in the next event.';
    }
  } else {
    economic_milestone_hint = 'Progress and recognition stay in the school-safe track.';
  }

  const compliance = adultFin?.compliance;
  const personal_hook: NexusPersonalHook = {
    user_id: input.currentUserId,
    rank: me?.rank ?? null,
    tier: me?.tier ?? 'Unranked',
    streak: me?.streak ?? 0,
    total_earned: me?.earned ?? 0,
    next_event: upcoming[0]?.title ?? "No upcoming event",
    recent_payout_amount_usd:
      ecosystem === 'k12' ? null : latestFinish && latestFinish.amount_won > 0 ? latestFinish.amount_won : null,
    recent_payout_at:
      ecosystem === 'k12' ? null : latestFinish && latestFinish.amount_won > 0 ? latestFinish.utc : null,
    economic_milestone_hint,
    buy_in_eligible_event_label:
      ecosystem === 'adult' && upcoming[0]?.title ? upcoming[0].title : undefined,
    wallet_balance_cents: ecosystem === 'k12' ? null : adultFin?.wallet_balance_cents ?? null,
    payout_profile_status: ecosystem === 'k12' ? null : compliance?.payout_profile_status ?? null,
    payout_profile_message: ecosystem === 'k12' ? null : compliance?.payout_profile_message ?? null,
    payout_amount_ytd_cents: ecosystem === 'k12' ? null : compliance?.payout_amount_ytd_cents ?? null,
    tax_notice: ecosystem === 'k12' ? false : compliance?.tax_notice ?? false,
  };

  const trustWindowMs = 30 * 24 * 3600 * 1000;
  const trustCutoff = Date.now() - trustWindowMs;
  const trustWinners = ecosystem === 'k12' ? [] : winners.filter((w) => Date.parse(w.utc) >= trustCutoff);
  const branding = ecosystem === 'k12' ? null : getComplianceBranding();
  const payout_trust: NexusPayoutTrust =
    ecosystem === 'k12'
      ? {
          recent_count: 0,
          total_recent_amount_usd: 0,
          last_payout_at: null,
          ledger: [],
        }
      : {
          recent_count: trustWinners.length,
          total_recent_amount_usd: trustWinners.reduce((s, w) => s + w.amount_won, 0),
          last_payout_at: trustWinners.length
            ? [...trustWinners].sort((a, b) => Date.parse(b.utc) - Date.parse(a.utc))[0]?.utc ?? null
            : null,
          ledger: trustWinners.slice(0, 12).map((w) => ({
            id: w.id,
            label: w.player_label,
            amount_usd: w.amount_won,
            category:
              w.payout_category === 'tournament_win'
                ? 'Tournament win'
                : w.payout_category === 'free_finish'
                  ? 'Match finish'
                  : w.payout_category === 'advancement'
                    ? 'Advancement'
                    : w.payout_category === 'seasonal'
                      ? 'Seasonal'
                      : 'Recorded result',
            utc: w.utc,
          })),
          platform_entity_name: branding?.platform_entity_name ?? null,
          payout_descriptor: branding?.payout_descriptor ?? null,
        };

  return {
    ecosystem,
    generated_at: new Date().toISOString(),
    leaders,
    personal_hook,
    live_games: liveGames.slice(0, 24),
    social,
    season,
    narrative,
    global_events,
    active_tournaments: tournaments.slice(0, 32),
    announcements,
    upcoming_events: upcoming.slice(0, 24),
    recent_winners: winners.slice(0, 48),
    chess_news: [
      {
        id: 'news-1',
        title: 'Global chess highlight feed placeholder',
        blurb: 'Curated pro-level chess highlights will appear here.',
        utc: new Date().toISOString(),
      },
      {
        id: 'news-2',
        title: 'ACCL in-person event coverage placeholder',
        blurb: 'Future live over-the-board coverage can be surfaced here.',
        utc: new Date().toISOString(),
      },
    ],
    activity_feed: activityMerged,
    standings: standings.slice(0, 100),
    payout_trust,
  };
}

export type { NexusSocialLayer } from '@/lib/social/buildNexusSocialLayer';
export type { NexusSeasonContext, NexusNarrativeBundle } from '@/lib/nexus/buildNexusSeasonNarrative';
export type { NarrativeEventKind } from '@/lib/narrative/narrativeDetection';
export type { NexusGlobalEvent } from '@/lib/events/globalEventBuilder';
