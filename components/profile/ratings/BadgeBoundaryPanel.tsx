'use client';

import type { PlayerBadgeStateRow } from '@/lib/badgeSettlement';
import {
  badgeStateDisplayLabel,
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
  const shiny = visual === 'shiny';
  const downgraded = visual === 'downgraded';

  return (
    <div
      data-testid="badge-boundary-panel"
      data-boundary-status={boundary}
      data-badge-visual={visual ?? 'unknown'}
      className="rounded-lg border border-[#2f3f54] bg-[#0f1723] px-3 py-2 text-sm"
    >
      <p className="m-0 font-semibold text-gray-100">Badge & boundary</p>
      <dl className="mt-2 mb-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-gray-500">Badge</dt>
        <dd className="m-0 text-gray-200" data-testid="badge-panel-state">
          {badgeStateDisplayLabel(visual)}
        </dd>
        <dt className="text-gray-500">Boundary</dt>
        <dd className="m-0 text-gray-300" data-testid="badge-panel-boundary">
          {boundaryStatusLabel(boundary)}
        </dd>
        <dt className="text-gray-500">Streak</dt>
        <dd className="m-0 tabular-nums text-gray-200">{badge.win_streak}</dd>
        <dt className="text-gray-500">Band</dt>
        <dd className="m-0 text-gray-200">{badge.active_rank_band}</dd>
      </dl>
      {shiny ? (
        <p className="mt-2 mb-0 text-xs text-amber-200/90" data-testid="badge-panel-shiny">
          Shiny badge active on this exact track.
        </p>
      ) : null}
      {downgraded ? (
        <p className="mt-2 mb-0 text-xs text-rose-200/90" data-testid="badge-panel-recovery">
          Downgraded badge — win in this exact track to recover to normal.
        </p>
      ) : null}
      {badge.pressure_border != null ? (
        <p className="mt-2 mb-0 text-xs text-gray-500">
          Pressure border: {badge.pressure_border} · Settlement {badge.settlement_rating}
        </p>
      ) : null}
    </div>
  );
}
