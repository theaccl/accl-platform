'use client';

import type { BadgeTickerPayload } from '@/lib/badgeSettlement';
import { formatBadgeTickerLine } from '@/lib/badgeSettlementRead';

export type RatingBadgeTickerProps = {
  ticker: BadgeTickerPayload;
};

/** Renders backend-provided badge settlement status (no client-side badge math). */
export default function RatingBadgeTicker({ ticker }: RatingBadgeTickerProps) {
  return (
    <div
      data-testid="rating-badge-ticker"
      data-badge-track={ticker.track_key}
      data-badge-visual={ticker.visual_state}
      data-badge-pressure={ticker.pressure_state}
      data-badge-event={ticker.event_type}
      style={{
        marginBottom: 16,
        maxWidth: 560,
        fontSize: 12,
        lineHeight: 1.45,
        color: '#e2e8f0',
        background: '#0f172a',
        border: '1px solid #475569',
        borderRadius: 8,
        padding: '10px 12px',
      }}
    >
      <p style={{ margin: 0, fontWeight: 600, marginBottom: 4 }}>Badge settlement</p>
      <p style={{ margin: 0, color: '#94a3b8' }}>{formatBadgeTickerLine(ticker)}</p>
    </div>
  );
}
