/**
 * Successful Performance — pure presenter model (frontend foundation).
 *
 * PURITY CONTRACT: imports only the type contract. No JSX, no data access, no
 * calculation of the metric itself (that lives in the scoring/unlock modules).
 * This turns a resolved `SuccessfulPerformanceView` into the exact rendering
 * decisions the card must make, so those decisions are testable without a DOM.
 *
 * Percentage exposure rule: `showPercentage` is true ONLY for state 'unlocked'
 * with an authoritative percentage present. Locked / progress / insufficient_data
 * / unavailable / invalid never expose a percentage.
 */

import type {
  PlayerColor,
  RatingModeName,
  SuccessfulPerformanceState,
  SuccessfulPerformanceView,
} from '@/lib/profile/successfulPerformanceTypes';

const MODE_LABELS: Record<RatingModeName, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  daily: 'Daily',
};

const COLOR_LABELS: Record<PlayerColor, string> = {
  white: 'White',
  black: 'Black',
  combined: 'Overall',
};

export const SUCCESSFUL_PERFORMANCE_STATE_LABELS: Record<SuccessfulPerformanceState, string> = {
  locked: 'Locked',
  progress: 'In progress',
  unlocked: 'Unlocked',
  insufficient_data: 'Not enough data',
  unavailable: 'Not available',
  invalid: 'Data error',
};

export type SuccessfulPerformanceCardModel = {
  title: string;
  stateLabel: string;
  supportText: string | null;
  showPercentage: boolean;
  percentageText: string | null;
  showProgressBar: boolean;
  progressPct: number | null;
  progressCount: number | null;
  threshold: number | null;
};

function titleFor(view: SuccessfulPerformanceView): string {
  const modeLabel = view.mode ? MODE_LABELS[view.mode] : null;
  const colorSuffix = view.color === 'combined' ? '' : ` — ${COLOR_LABELS[view.color]}`;

  switch (view.scope) {
    case 'exact_control':
      return `${modeLabel ?? 'Control'} ${view.exactControl ?? ''}`.trim() + colorSuffix;
    case 'mode':
      return `${modeLabel ?? 'Mode'} Overall${colorSuffix}`;
    case 'battlefield':
      return 'Battlefield Overall';
    case 'tournament':
      return view.exactControl ? `Tournament — ${view.exactControl}` : 'Tournament Overall';
    case 'overall':
    default:
      return `Successful Performance${colorSuffix}`;
  }
}

export function formatSuccessfulPerformancePercentage(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

function supportTextFor(view: SuccessfulPerformanceView): string | null {
  switch (view.state) {
    case 'locked':
      if (view.threshold != null) {
        const have = view.progressCount ?? 0;
        const remaining = Math.max(0, view.threshold - have);
        return `Play ${remaining} more eligible game${remaining === 1 ? '' : 's'} to unlock.`;
      }
      return 'Locked.';
    case 'progress':
      if (view.threshold != null) {
        return `${view.progressCount ?? 0} of ${view.threshold} eligible games toward unlock.`;
      }
      return 'In progress.';
    case 'unlocked':
      return 'Successful Performance';
    case 'insufficient_data':
      return 'Not enough eligible completed games yet.';
    case 'unavailable':
      return 'Authoritative performance data is not available.';
    case 'invalid':
      return view.invalidReason ?? 'Performance data could not be resolved.';
    default:
      return null;
  }
}

/** Pure mapping from a resolved view to concrete card-render decisions. */
export function successfulPerformanceCardModel(
  view: SuccessfulPerformanceView,
): SuccessfulPerformanceCardModel {
  const showPercentage = view.state === 'unlocked' && view.percentage != null;
  const showProgressBar =
    view.state === 'progress' && view.threshold != null && view.progressCount != null;
  const progressPct = showProgressBar
    ? Math.max(
        0,
        Math.min(100, ((view.progressCount as number) / (view.threshold as number)) * 100),
      )
    : null;

  return {
    title: titleFor(view),
    stateLabel: SUCCESSFUL_PERFORMANCE_STATE_LABELS[view.state],
    supportText: supportTextFor(view),
    showPercentage,
    percentageText: showPercentage
      ? formatSuccessfulPerformancePercentage(view.percentage as number)
      : null,
    showProgressBar,
    progressPct,
    progressCount: view.progressCount,
    threshold: view.threshold,
  };
}
