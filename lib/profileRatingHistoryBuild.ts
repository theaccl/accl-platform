import { timeControlByBadgeTrackKey, timeControlByRatingTrackId } from '@/lib/acclTimeControls';
import { badgeEventFromSettlementEvent, badgeStateFromVisual } from '@/lib/profileBadgeBoundary';
import type { BadgeTickerPayload } from '@/lib/badgeSettlement';
import { parseBadgeBlockFromRatingUpdate } from '@/lib/badgeSettlementRead';
import { classifyFreeBadgeTrackKey } from '@/lib/badgeTracks';
import { classifyP1RatingBucket } from '@/lib/p1RatingClassifier';
import type { P1RatingBucket } from '@/lib/p1RatingsSpec';
import { P1_TOURNAMENT_BUCKET } from '@/lib/p1RatingsSpec';
import type {
  RatingHistoryEcosystem,
  RatingHistoryMode,
  RatingHistoryPoint,
  RatingHistoryResult,
} from '@/lib/ratingHistoryTypes';

export type ProfileHistoryGameRow = {
  id: string;
  finished_at: string | null;
  created_at?: string | null;
  white_player_id: string | null;
  black_player_id: string | null;
  play_context: string | null;
  tempo: string | null;
  live_time_control: string | null;
  rated: boolean | null;
  rating_applied: boolean | null;
  rating_last_update: unknown;
  result: string | null;
};

type SideSnapshot = {
  before: number;
  after: number;
  delta: number;
};

function parseSide(raw: unknown): SideSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const before = o.before;
  const after = o.after;
  const delta = o.delta;
  if (typeof before !== 'number' || typeof after !== 'number') return null;
  return {
    before,
    after,
    delta: typeof delta === 'number' ? delta : after - before,
  };
}

function ecosystemForContext(playContext: string | null): RatingHistoryEcosystem {
  return playContext === 'tournament' ? 'tournament' : 'free';
}

function resultForUser(
  gameResult: string | null,
  userId: string,
  whiteId: string | null,
  blackId: string | null,
): RatingHistoryResult {
  void blackId;
  const isWhite = whiteId === userId;
  if (gameResult === 'draw' || gameResult === '1/2-1/2') return 'draw';
  if (gameResult === 'white_win') return isWhite ? 'win' : 'loss';
  if (gameResult === 'black_win') return isWhite ? 'loss' : 'win';
  return 'draw';
}

function p1BucketToMode(bucket: P1RatingBucket): RatingHistoryMode | null {
  if (bucket === 'free_bullet') return 'bullet';
  if (bucket === 'free_blitz') return 'blitz';
  if (bucket === 'free_rapid') return 'rapid';
  if (bucket === 'free_day') return 'daily';
  return null;
}

function trackMatchesP1Bucket(ratingTrackId: string, bucket: P1RatingBucket): boolean {
  if (ratingTrackId === 'accl') {
    // accl_overall game history not wired until O2; never alias tournament_unified as ACCL Overall.
    return false;
  }
  if (ratingTrackId === 'tournament') {
    return bucket === P1_TOURNAMENT_BUCKET;
  }
  return ratingTrackId === bucket;
}

function trackMatchesExact(ratingTrackId: string, tempo: string | null, lc: string | null): boolean {
  const def = timeControlByRatingTrackId(ratingTrackId);
  if (!def?.badgeTrackKey) return false;
  const classified = classifyFreeBadgeTrackKey(tempo, lc);
  return classified === def.badgeTrackKey;
}

function tickerForUser(
  payload: ReturnType<typeof parseBadgeBlockFromRatingUpdate>,
  userId: string,
  whiteId: string | null,
  blackId: string | null,
): BadgeTickerPayload | null {
  if (!payload) return null;
  if (whiteId === userId) return payload.white ?? null;
  if (blackId === userId) return payload.black ?? null;
  return null;
}

/**
 * Build authoritative history points for one track from finished games that applied ratings.
 * Never fabricates points — only games with numeric before/after for the viewer.
 */
export function buildRatingHistoryPointsForTrack(
  games: ProfileHistoryGameRow[],
  playerId: string,
  ratingTrackId: string,
): RatingHistoryPoint[] {
  const points: RatingHistoryPoint[] = [];
  const def = timeControlByRatingTrackId(ratingTrackId);
  const isExact = Boolean(def?.badgeTrackKey);

  for (const g of games) {
    if (!g.rating_applied || !g.rated) continue;
    const upd = g.rating_last_update;
    if (!upd || typeof upd !== 'object') continue;

    const whiteId = g.white_player_id;
    const blackId = g.black_player_id;
    if (whiteId !== playerId && blackId !== playerId) continue;

    const occurredAt = g.finished_at ?? g.created_at ?? null;
    if (!occurredAt) continue;

    const p1Bucket = classifyP1RatingBucket(g.play_context, g.tempo, g.live_time_control);
    const eco = ecosystemForContext(g.play_context);
    const badgeBlock = parseBadgeBlockFromRatingUpdate(upd);
    const ticker = tickerForUser(badgeBlock, playerId, whiteId, blackId);

    if (isExact) {
      if (!trackMatchesExact(ratingTrackId, g.tempo, g.live_time_control)) continue;
      if (!ticker || ticker.track_key !== def?.badgeTrackKey) continue;
      points.push({
        id: `${g.id}:badge`,
        playerId,
        ratingTrackId,
        ecosystem: 'free',
        mode: def?.mode ?? null,
        timeControl: def?.displayValue ?? null,
        eventType: 'game',
        gameId: g.id,
        result: resultForUser(g.result, playerId, whiteId, blackId),
        ratingBefore: ticker.rating_before,
        ratingAfter: ticker.rating_after,
        ratingDelta: ticker.rating_delta,
        occurredAt,
        badgeStateAfter: badgeStateFromVisual(ticker.visual_state),
        badgeEvent: badgeEventFromSettlementEvent(ticker.event_type),
        streakAfter: ticker.win_streak,
      });
      continue;
    }

    if (!p1Bucket || !trackMatchesP1Bucket(ratingTrackId, p1Bucket)) continue;

    const o = upd as Record<string, unknown>;
    const side =
      whiteId === playerId
        ? parseSide(o.p1_white) ?? parseSide(o.white)
        : parseSide(o.p1_black) ?? parseSide(o.black);
    if (!side) continue;

    const mode = p1BucketToMode(p1Bucket);
    points.push({
      id: `${g.id}:p1`,
      playerId,
      ratingTrackId:
        ratingTrackId === 'accl' || ratingTrackId === 'tournament' ? ratingTrackId : ratingTrackId,
      ecosystem: eco,
      mode,
      timeControl: g.live_time_control,
      eventType: 'game',
      gameId: g.id,
      result: resultForUser(g.result, playerId, whiteId, blackId),
      ratingBefore: side.before,
      ratingAfter: side.after,
      ratingDelta: side.delta,
      occurredAt,
      badgeEvent: ticker && def?.badgeTrackKey === ticker.track_key ? badgeEventFromSettlementEvent(ticker.event_type) : 'none',
      badgeStateAfter: ticker ? badgeStateFromVisual(ticker.visual_state) : null,
      streakAfter: ticker?.win_streak ?? null,
    });
  }

  return points.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

export function exactTrackIdFromGame(tempo: string | null, liveTimeControl: string | null): string | null {
  const key = classifyFreeBadgeTrackKey(tempo, liveTimeControl);
  if (!key) return null;
  const def = timeControlByBadgeTrackKey(key);
  return def?.ratingTrackId ?? null;
}
