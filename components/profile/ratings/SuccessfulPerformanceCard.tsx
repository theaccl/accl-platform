'use client';

/**
 * Successful Performance — presentational card (frontend foundation).
 *
 * This component is PURE presentation. It:
 *  - accepts a fully resolved `SuccessfulPerformanceView` only,
 *  - performs no data fetching, no aggregation, no fallback calculation,
 *  - renders no mock values and no animation,
 *  - never renders a percentage for locked/progress/unavailable/invalid states,
 *  - renders a percentage only when the resolved view supplies a valid one
 *    (state 'unlocked' with an authoritative percentage), and
 *  - communicates state in text, not by color alone.
 *
 * All render decisions come from the pure `successfulPerformanceCardModel`. It is
 * intentionally NOT wired into ProfileRatingsDashboard or any live route here.
 */

import { successfulPerformanceCardModel } from '@/lib/profile/successfulPerformanceCardModel';
import type { SuccessfulPerformanceView } from '@/lib/profile/successfulPerformanceTypes';

type Props = {
  view: SuccessfulPerformanceView;
};

export function SuccessfulPerformanceCard({ view }: Props) {
  const model = successfulPerformanceCardModel(view);

  return (
    <section
      data-testid="successful-performance-card"
      data-state={view.state}
      data-scope={view.scope}
      data-color={view.color}
      aria-label={`${model.title}: ${model.stateLabel}`}
      className="flex flex-col gap-2 rounded-lg border border-[#2f3f54] bg-[#0f1723] px-3 py-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
          {model.title}
        </span>
        <span data-testid="sp-state-label" className="text-xs font-semibold text-gray-300">
          {model.stateLabel}
        </span>
      </div>

      {model.showPercentage && model.percentageText ? (
        <span
          data-testid="sp-percentage"
          className="tabular-nums text-2xl font-semibold text-gray-100"
        >
          {model.percentageText}
        </span>
      ) : null}

      {model.showProgressBar && model.threshold != null && model.progressCount != null ? (
        <div
          data-testid="sp-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={model.threshold}
          aria-valuenow={model.progressCount}
          aria-label={`${model.progressCount} of ${model.threshold} eligible games toward unlock`}
          className="h-2 w-full overflow-hidden rounded-full bg-[#1a2332]"
        >
          <div
            className="h-full rounded-full bg-sky-600/80"
            style={{ width: `${model.progressPct ?? 0}%` }}
          />
        </div>
      ) : null}

      {model.supportText ? (
        <p data-testid="sp-support-text" className="m-0 text-xs text-gray-500">
          {model.supportText}
        </p>
      ) : null}
    </section>
  );
}
