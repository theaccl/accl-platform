import {
  getNexusData,
  type NexusActivityItem,
  type NexusData,
  type NexusEcosystem,
  type NexusStanding,
  type NexusWinner,
} from '@/lib/nexus/getNexusData';
import { getComplianceBranding } from '@/lib/payments/complianceConfig';
import { countGamesUpdatedToday } from '@/lib/nexus/getEngagementMetrics';
import type { NexusSocialLayer } from '@/lib/social/buildNexusSocialLayer';
import type { NexusNarrativeBundle } from '@/lib/nexus/buildNexusSeasonNarrative';
import type { NexusGlobalEvent } from '@/lib/events/globalEventBuilder';
import type { NexusSeasonContext } from '@/lib/nexus/buildNexusSeasonNarrative';

const PUBLIC_ACTIVITY_BLOCK = new Set(['analysis', 'game']);

/**
 * Read-only slice for public marketing surfaces (landing, share, unauthenticated Nexus public mode).
 * No synthetic stats — all data derived from the same Nexus pipeline as authenticated views.
 */
export type PublicNexusData = {
  ecosystem: NexusEcosystem;
  generated_at: string;
  leaders: NexusData['leaders'];
  live_games: NexusData['live_games'];
  active_tournaments: NexusData['active_tournaments'];
  global_events: NexusGlobalEvent[];
  narrative: NexusNarrativeBundle;
  season: NexusSeasonContext;
  standings_preview: NexusStanding[];
  activity_feed_public: NexusActivityItem[];
  recent_winners_preview: NexusWinner[];
  announcements: NexusData['announcements'];
  upcoming_events: NexusData['upcoming_events'];
  counts: {
    live_games: number;
    active_tournaments: number;
  };
  /** Derived engagement — same source as Nexus counts + games touched today. */
  engagement: {
    ranked_players: number;
    games_today: number;
    active_tournaments: number;
    live_games: number;
  };
};

function filterPublicActivity(feed: NexusActivityItem[]): NexusActivityItem[] {
  return feed
    .filter((a) => !PUBLIC_ACTIVITY_BLOCK.has(a.kind))
    .slice(0, 36);
}

export async function getPublicNexusData(ecosystem: NexusEcosystem): Promise<PublicNexusData> {
  const [data, gamesToday] = await Promise.all([
    getNexusData({ ecosystem, currentUserId: null }),
    countGamesUpdatedToday(ecosystem),
  ]);
  const standings_preview = data.standings.slice(0, 24);
  const recent_winners_preview = data.recent_winners.slice(0, 8);
  const rankedPlayers = data.standings.length;
  const liveGames = data.live_games.length;
  const activeTournaments = data.active_tournaments.length;
  return {
    ecosystem: data.ecosystem,
    generated_at: data.generated_at,
    leaders: data.leaders,
    live_games: data.live_games,
    active_tournaments: data.active_tournaments,
    global_events: data.global_events,
    narrative: data.narrative,
    season: data.season,
    standings_preview,
    activity_feed_public: filterPublicActivity(data.activity_feed),
    recent_winners_preview,
    announcements: data.announcements,
    upcoming_events: data.upcoming_events,
    counts: {
      live_games: liveGames,
      active_tournaments: activeTournaments,
    },
    engagement: {
      ranked_players: rankedPlayers,
      games_today: gamesToday,
      active_tournaments: activeTournaments,
      live_games: liveGames,
    },
  };
}

const emptySocial: NexusSocialLayer = { head_to_head: {}, rival_adjacency: {}, presence: {} };

/** Feeds NexusShell read-only public mode without personal/social enrichment. */
export function nexusDataFromPublicSlice(p: PublicNexusData): NexusData {
  const pubBrand = p.ecosystem === 'k12' ? null : getComplianceBranding();
  return {
    ecosystem: p.ecosystem,
    generated_at: p.generated_at,
    leaders: p.leaders,
    personal_hook: {
      user_id: null,
      rank: null,
      tier: '—',
      streak: 0,
      total_earned: 0,
      next_event: p.upcoming_events[0]?.title ?? '—',
      wallet_balance_cents: null,
      payout_profile_status: null,
      payout_profile_message: null,
      payout_amount_ytd_cents: null,
      tax_notice: false,
    },
    live_games: p.live_games,
    social: emptySocial,
    season: p.season,
    narrative: p.narrative,
    global_events: p.global_events,
    active_tournaments: p.active_tournaments,
    announcements: p.announcements,
    upcoming_events: p.upcoming_events,
    recent_winners: p.recent_winners_preview,
    chess_news: [],
    activity_feed: p.activity_feed_public,
    standings: p.standings_preview,
    payout_trust: {
      recent_count: 0,
      total_recent_amount_usd: 0,
      last_payout_at: null,
      ledger: [],
      platform_entity_name: pubBrand?.platform_entity_name ?? null,
      payout_descriptor: pubBrand?.payout_descriptor ?? null,
    },
    engagement_metrics: {
      games_today: p.engagement.games_today,
      ranked_players: p.engagement.ranked_players,
    },
  };
}
