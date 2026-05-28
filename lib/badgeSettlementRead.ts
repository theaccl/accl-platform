/**
 * Read helpers for backend badge settlement payload on `games.rating_last_update`.
 */

import type { BadgeTickerPayload } from '@/lib/badgeSettlement';
import type { FreeBadgeTrackKey } from '@/lib/badgeTracks';

export type GameBadgeSettlementPayload = {
  applied?: boolean;
  track_key?: FreeBadgeTrackKey;
  white?: BadgeTickerPayload;
  black?: BadgeTickerPayload;
};

function parseTicker(raw: unknown): BadgeTickerPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.track_key !== 'string' || typeof o.status_label !== 'string') return null;
  return o as unknown as BadgeTickerPayload;
}

export function parseBadgeBlockFromRatingUpdate(
  ratingLastUpdate: unknown,
): GameBadgeSettlementPayload | null {
  if (!ratingLastUpdate || typeof ratingLastUpdate !== 'object') return null;
  const badge = (ratingLastUpdate as { badge?: unknown }).badge;
  if (!badge || typeof badge !== 'object') return null;
  const b = badge as Record<string, unknown>;
  return {
    applied: b.applied === true,
    track_key: typeof b.track_key === 'string' ? (b.track_key as FreeBadgeTrackKey) : undefined,
    white: parseTicker(b.white) ?? undefined,
    black: parseTicker(b.black) ?? undefined,
  };
}

export function badgeTickerForUser(
  payload: GameBadgeSettlementPayload | null,
  userId: string | null | undefined,
  whiteId: string | null | undefined,
  blackId: string | null | undefined,
): BadgeTickerPayload | null {
  if (!payload || !userId) return null;
  if (whiteId && userId === whiteId) return payload.white ?? null;
  if (blackId && userId === blackId) return payload.black ?? null;
  return null;
}

export function formatBadgeTickerLine(ticker: BadgeTickerPayload): string {
  const parts = [
    `Track: ${ticker.track_key}`,
    `Rating: ${ticker.rating_before} → ${ticker.rating_after} (${ticker.rating_delta >= 0 ? '+' : ''}${ticker.rating_delta})`,
    `Band: ${ticker.active_rank_band}`,
    `Badge: ${ticker.visual_state}`,
    `Status: ${ticker.status_label}`,
  ];
  if (ticker.next_step_text) parts.push(ticker.next_step_text);
  return parts.join(' · ');
}
