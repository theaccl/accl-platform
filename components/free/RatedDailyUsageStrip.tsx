'use client';

import {
  carryoverHeading,
  formatCarryoverExpireHint,
  formatRatedDailyResetHint,
  freeTodaySummary,
  ongoingHeading,
  orderedFreePositions,
  orderedPaidQueueSlots,
  paidTodayQueueSummary,
  paidUnlockBody,
  paidUnlockHeading,
  pendingHeading,
  positionDotGlyph,
  positionDotLabel,
  queueSlotDotGlyph,
  shouldShowCarryoverStripe,
  shouldShowLegacyNotice,
  shouldShowOngoingCount,
  shouldShowPendingChallenges,
  stripHeading,
} from '@/lib/ratedDailyUsageStripPresentation';
import {
  isPaidRatedDailyUsageSnapshot,
  type RatedDailyUsageStripSnapshot,
  type RatedDailyUsageStripVariant,
} from '@/lib/ratedDailyUsageStripTypes';

type Props = {
  snapshot: RatedDailyUsageStripSnapshot;
  variant?: RatedDailyUsageStripVariant;
};

/**
 * Pure Rated Daily usage strip (Phase A presentation only).
 * Not wired to production surfaces yet — pass snapshot from read RPC in future phases.
 * ACCL_RATED_TICKET_PUNCH_VISUAL_UPGRADE_REQUIRED
 */
export function RatedDailyUsageStrip({ snapshot, variant = 'full' }: Props) {
  const paid = isPaidRatedDailyUsageSnapshot(snapshot);
  const showCarryover = shouldShowCarryoverStripe(snapshot.carryover_waiting_count, variant);
  const showOngoing = shouldShowOngoingCount(snapshot.ongoing_seated_rated_daily_count, variant);
  const showPending = shouldShowPendingChallenges(variant);
  const compact = variant === 'compact';
  const chip = variant === 'chip';

  return (
    <section
      className={`rounded-xl border border-slate-700/60 bg-slate-950/50 ${
        chip ? 'p-2 text-[10px]' : compact ? 'p-3 text-xs' : 'p-4 text-sm'
      }`}
      data-testid="rated-daily-usage-strip"
      data-variant={variant}
      data-entitlement={paid ? 'paid' : 'free'}
      aria-label="Rated Daily usage"
    >
      <div className="space-y-1">
        <h3 className={`font-semibold tracking-wide text-slate-100 ${chip ? 'text-[10px]' : 'text-xs uppercase'}`}>
          {stripHeading(snapshot)}
        </h3>
        {paid ? (
          <>
            <div
              className="flex flex-wrap gap-1 font-mono text-base leading-none text-amber-200/95"
              aria-hidden
              data-testid="rated-daily-paid-queue-dots"
            >
              {orderedPaidQueueSlots(snapshot.today_queue_slots).map((slot) => (
                <span key={slot.slot_no} title={slot.state === 'waiting' ? 'Waiting queue slot' : 'Available queue slot'}>
                  {queueSlotDotGlyph(slot.state)}
                </span>
              ))}
            </div>
            {!chip ? (
              <p className="text-slate-400" data-testid="rated-daily-paid-queue-summary">
                {paidTodayQueueSummary(snapshot)}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <div
              className="flex flex-wrap gap-1 font-mono text-base leading-none text-sky-200/95"
              aria-hidden
              data-testid="rated-daily-free-today-dots"
            >
              {orderedFreePositions(snapshot.today_positions).map((position) => (
                <span
                  key={position.position_no}
                  title={positionDotLabel(position.state)}
                  aria-label={positionDotLabel(position.state)}
                >
                  {positionDotGlyph(position.state)}
                </span>
              ))}
            </div>
            {!chip ? (
              <p className="text-slate-400" data-testid="rated-daily-free-today-summary">
                {freeTodaySummary(snapshot)}
              </p>
            ) : null}
          </>
        )}
        {!chip ? (
          <p className="text-[11px] text-slate-500" data-testid="rated-daily-reset-hint">
            {formatRatedDailyResetHint(snapshot.reset_at)}
          </p>
        ) : null}
      </div>

      {showCarryover ? (
        <div className="mt-3 space-y-1 opacity-70" data-testid="rated-daily-carryover-stripe">
          <h4 className={`font-semibold text-slate-300 ${chip ? 'text-[10px]' : 'text-xs uppercase'}`}>
            {carryoverHeading()}
          </h4>
          <div className="flex flex-wrap gap-1 font-mono text-base leading-none text-slate-400" aria-hidden>
            {Array.from({ length: snapshot.carryover_waiting_count }, (_, index) => (
              <span key={index} aria-label="Carryover waiting rated Daily seat">
                ◐
              </span>
            ))}
          </div>
          {!chip ? (
            <p className="text-[11px] text-slate-500">
              {snapshot.carryover_waiting_count} waiting · {formatCarryoverExpireHint(snapshot.carryover_expires_at)}
            </p>
          ) : null}
        </div>
      ) : null}

      {showOngoing ? (
        <div className="mt-3" data-testid="rated-daily-ongoing-count">
          <h4 className={`font-semibold text-slate-300 ${chip ? 'text-[10px]' : 'text-xs uppercase'}`}>
            {ongoingHeading()}
          </h4>
          <p className="text-slate-400">{snapshot.ongoing_seated_rated_daily_count} active</p>
        </div>
      ) : null}

      {showPending ? (
        <div className="mt-3" data-testid="rated-daily-pending-challenges">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{pendingHeading()}</h4>
          <p className="text-slate-400">
            {snapshot.pending_sent_rated_daily_challenge_count} of {snapshot.pending_sent_rated_daily_challenge_cap}{' '}
            sent
          </p>
        </div>
      ) : null}

      {paid && variant === 'full' ? (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2" data-testid="rated-daily-paid-unlock-badge">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/90">{paidUnlockHeading()}</p>
          <p className="text-sm text-amber-100/90">{paidUnlockBody()}</p>
        </div>
      ) : null}

      {shouldShowLegacyNotice(snapshot.legacy_unclassified_rated_daily_count) ? (
        <p className="mt-3 text-[11px] text-amber-200/80" data-testid="rated-daily-legacy-notice">
          {snapshot.legacy_unclassified_rated_daily_count} existing rated Daily rows are not yet classified in the new
          ledger.
        </p>
      ) : null}
    </section>
  );
}
