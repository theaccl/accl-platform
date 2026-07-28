/**
 * Free-play badge settlement (Phase 1) — mirror of SQL `settle_player_badge_state`.
 * Backend SQL is authoritative; keep logic aligned for unit tests.
 */

import {
  BADGE_RANK_BAND_ORDER,
  type BadgePressureState,
  type BadgeRankBand,
  type BadgeVisualState,
  type FreeBadgeTrackKey,
  defaultSettlementRatingForNewTrack,
  demotionDangerThreshold,
  hasRecoveredFromDemotion,
  isInDemotionDanger,
  lowerBorderForRankBand,
  rankBandFromSettlementRating,
} from '@/lib/badgeTracks';

export type PlayerBadgeStateRow = {
  track_key: FreeBadgeTrackKey;
  settlement_rating: number;
  active_rank_band: BadgeRankBand;
  visual_state: BadgeVisualState;
  pressure_state: BadgePressureState;
  pressure_border: number | null;
  win_streak: number;
};

export type BadgeSettlementEventType =
  | 'none'
  | 'demotion_armed'
  | 'demotion_confirmed'
  | 'demotion_pressure_cleared'
  | 'downgrade_repaired'
  | 'streak_upgrade'
  | 'promotion_upgrade'
  | 'upgrade_lost_on_defeat';

export type BadgeTickerPayload = {
  track_key: FreeBadgeTrackKey;
  rating_before: number;
  rating_after: number;
  rating_delta: number;
  active_rank_band: BadgeRankBand;
  visual_state: BadgeVisualState;
  pressure_state: BadgePressureState;
  pressure_border: number | null;
  danger_threshold: number | null;
  recovery_border: number | null;
  win_streak: number;
  status_label: string;
  next_step_text: string | null;
  event_type: BadgeSettlementEventType;
};

export type BadgeSettlementResult = {
  state: PlayerBadgeStateRow;
  ticker: BadgeTickerPayload;
};

export function defaultPlayerBadgeState(trackKey: FreeBadgeTrackKey): PlayerBadgeStateRow {
  const rating = defaultSettlementRatingForNewTrack();
  return {
    track_key: trackKey,
    settlement_rating: rating,
    active_rank_band: rankBandFromSettlementRating(rating),
    visual_state: 'normal',
    pressure_state: 'stable',
    pressure_border: null,
    win_streak: 0,
  };
};

function bandRank(band: BadgeRankBand): number {
  return BADGE_RANK_BAND_ORDER[band];
}

function buildTicker(
  state: PlayerBadgeStateRow,
  ratingBefore: number,
  ratingAfter: number,
  delta: number,
  eventType: BadgeSettlementEventType,
  statusLabel: string,
  nextStep: string | null,
): BadgeTickerPayload {
  const recovery = state.pressure_border;
  const borderForDanger = recovery ?? lowerBorderForRankBand(state.active_rank_band);
  const dangerThreshold =
    borderForDanger != null ? demotionDangerThreshold(borderForDanger) : null;

  return {
    track_key: state.track_key,
    rating_before: ratingBefore,
    rating_after: ratingAfter,
    rating_delta: delta,
    active_rank_band: state.active_rank_band,
    visual_state: state.visual_state,
    pressure_state: state.pressure_state,
    pressure_border: state.pressure_border,
    danger_threshold: dangerThreshold,
    recovery_border: recovery,
    win_streak: state.win_streak,
    status_label: statusLabel,
    next_step_text: nextStep,
    event_type: eventType,
  };
}

/**
 * Apply one finished-game rating delta to per-track badge state.
 * `delta === 0` does not confirm promotion/demotion and does not advance streak.
 */
export function settlePlayerBadgeState(input: {
  previous: PlayerBadgeStateRow | null;
  trackKey: FreeBadgeTrackKey;
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
}): BadgeSettlementResult {
  const base = input.previous ?? defaultPlayerBadgeState(input.trackKey);
  const bandBefore = rankBandFromSettlementRating(input.ratingBefore);
  const bandAfter = rankBandFromSettlementRating(input.ratingAfter);

  let visual = base.visual_state;
  let pressure = base.pressure_state;
  let pressureBorder = base.pressure_border;
  let streak = base.win_streak;
  let eventType: BadgeSettlementEventType = 'none';
  let statusLabel = 'Stable';
  let nextStep: string | null = null;

  const borderBefore = lowerBorderForRankBand(bandBefore);

  if (input.delta > 0) {
    streak = base.win_streak + 1;
    if (visual === 'downgraded') {
      visual = 'normal';
      eventType = 'downgrade_repaired';
      statusLabel = 'Downgrade repaired';
      nextStep = 'Win restored normal badge. Three wins in this track earn upgraded.';
    } else if (visual === 'normal' && streak >= 3) {
      visual = 'upgraded';
      eventType = 'streak_upgrade';
      statusLabel = 'Upgraded (win streak)';
      nextStep = 'One loss in this track returns to normal badge.';
    }

    if (pressure === 'demotion_armed' && pressureBorder != null) {
      if (hasRecoveredFromDemotion(input.ratingAfter, pressureBorder)) {
        pressure = 'stable';
        pressureBorder = null;
        eventType = eventType === 'none' ? 'demotion_pressure_cleared' : eventType;
        statusLabel = 'Recovered';
        nextStep = 'Demotion pressure cleared.';
      }
    }

    if (bandRank(bandAfter) > bandRank(bandBefore) && base.pressure_state !== 'demotion_armed') {
      visual = 'upgraded';
      eventType = 'promotion_upgrade';
      statusLabel = 'Promotion upgrade';
      nextStep = 'One loss in this track returns to normal badge.';
      pressure = 'stable';
      pressureBorder = null;
    }
  } else if (input.delta < 0) {
    streak = 0;
    if (visual === 'upgraded') {
      visual = 'normal';
      eventType = 'upgrade_lost_on_defeat';
      statusLabel = 'Upgrade lost';
      nextStep = 'Win three games in this track to earn upgraded again.';
    }

    if (pressure === 'demotion_armed' && pressureBorder != null) {
      if (!hasRecoveredFromDemotion(input.ratingAfter, pressureBorder) && input.delta < 0) {
        visual = 'downgraded';
        pressure = 'stable';
        pressureBorder = null;
        eventType = 'demotion_confirmed';
        statusLabel = 'Demotion confirmed';
        nextStep = 'One win in this track repairs to normal badge.';
      }
    }
  }

  if (borderBefore != null) {
    const enteredDanger =
      isInDemotionDanger(input.ratingAfter, borderBefore) &&
      !isInDemotionDanger(input.ratingBefore, borderBefore);
    if (enteredDanger && pressure !== 'demotion_armed') {
      pressure = 'demotion_armed';
      pressureBorder = borderBefore;
      if (eventType === 'none') {
        eventType = 'demotion_armed';
        statusLabel = 'Demotion armed';
        nextStep = `Another rating loss while below ${borderBefore} confirms downgrade. Reach ${borderBefore}+ to clear.`;
      }
    }
  }

  if (pressure === 'demotion_armed' && pressureBorder != null && eventType === 'none') {
    statusLabel = 'Demotion armed';
    nextStep = `Another rating loss while below ${pressureBorder} confirms downgrade. Reach ${pressureBorder}+ to clear.`;
  }

  const state: PlayerBadgeStateRow = {
    track_key: input.trackKey,
    settlement_rating: input.ratingAfter,
    active_rank_band: bandAfter,
    visual_state: visual,
    pressure_state: pressure,
    pressure_border: pressureBorder,
    win_streak: streak,
  };

  return {
    state,
    ticker: buildTicker(state, input.ratingBefore, input.ratingAfter, input.delta, eventType, statusLabel, nextStep),
  };
}
