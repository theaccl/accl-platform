'use client';

import {
  buildFinishedGameRatingSummary,
  formatRatingSideLine,
  type FinishedGameRatingSummary as SummaryModel,
} from '@/lib/finishedGameRatingSummary';

export type FinishedGameRatingSummaryProps = {
  ratingLastUpdate: unknown;
  rated: boolean | null | undefined;
  tempo: string | null | undefined;
  liveTimeControl: string | null | undefined;
  ratingApplied?: boolean | null | undefined;
};

export function finishedGameRatingSummaryModel(
  props: FinishedGameRatingSummaryProps,
): SummaryModel {
  return buildFinishedGameRatingSummary(props);
}

export default function FinishedGameRatingSummary(props: FinishedGameRatingSummaryProps) {
  const summary = finishedGameRatingSummaryModel(props);

  return (
    <div
      data-testid="finished-game-rating-summary"
      style={{
        marginBottom: 16,
        maxWidth: 560,
        padding: '12px 14px',
        border: '1px solid #334155',
        borderRadius: 8,
        background: '#0f172a',
        lineHeight: 1.45,
      }}
    >
      <p
        data-testid="finished-game-rating-mode-line"
        style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}
      >
        {summary.modeLine}
      </p>
      {summary.white ? (
        <p style={{ margin: '0 0 6px 0', fontSize: 12, color: '#94a3b8' }}>
          <span style={{ fontWeight: 700, color: '#cbd5e1' }}>White</span>
          <br />
          <span
            data-testid="finished-game-rating-white-line"
            style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}
          >
            {formatRatingSideLine(summary.white)}
          </span>
        </p>
      ) : null}
      {summary.black ? (
        <p style={{ margin: summary.note ? '0 0 8px 0' : 0, fontSize: 12, color: '#94a3b8' }}>
          <span style={{ fontWeight: 700, color: '#cbd5e1' }}>Black</span>
          <br />
          <span
            data-testid="finished-game-rating-black-line"
            style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}
          >
            {formatRatingSideLine(summary.black)}
          </span>
        </p>
      ) : null}
      {summary.note ? (
        <p
          data-testid="finished-game-rating-note"
          style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}
        >
          {summary.note}
        </p>
      ) : null}
    </div>
  );
}
