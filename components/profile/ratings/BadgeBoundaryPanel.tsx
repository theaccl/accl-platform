'use client';

import type { PlayerBadgeStateRow } from '@/lib/badgeSettlement';
import {
  badgeStateFromVisual,
  boundaryStatusFromBadgeRow,
  boundaryStatusLabel,
} from '@/lib/profileBadgeBoundary';
import { RATING_BADGE_UNAVAILABLE } from '@/components/profile/ratings/ratingTickerEmptyStates';

type Props = {
  badge: PlayerBadgeStateRow | null | undefined;
  showUnavailable: boolean;
};

export function BadgeBoundaryPanel({ badge, showUnavailable }: Props) {
  if (!badge) {
    if (!showUnavailable) return null;
    return (
      <div
        data-testid="badge-boundary-panel-empty"
        className="rounded-lg border border-dashed border-[#38506e] px-3 py-2 text-sm text-gray-500"
      >
        {RATING_BADGE_UNAVAILABLE}
      </div>
    );
  }

  const boundary = boundaryStatusFromBadgeRow(badge);
  const visual = badgeStateFromVisual(badge.visual_state);

  return (
    <div
      data-testid="badge-boundary-panel"
      data-boundary-status={boundary}
      data-badge-visual={visual ?? 'unknown'}
      className="rounded-lg border border-[#2f3f54] bg-[#0f1723] px-3 py-2 text-sm"
    >
      <p className="m-0 font-semibold text-gray-100">Badge & boundary</p>
      <p className="mt-1 mb-0 text-gray-300">
        Badge: {visual ?? '—'} · Band {badge.active_rank_band} · Streak {badge.win_streak}
      </p>
      <p className="mt-1 mb-0 text-xs text-gray-400">{boundaryStatusLabel(boundary)}</p>
      {badge.pressure_border != null ? (
        <p className="mt-1 mb-0 text-xs text-gray-500">
          Pressure border: {badge.pressure_border} · Settlement {badge.settlement_rating}
        </p>
      ) : null}
    </div>
  );
}
