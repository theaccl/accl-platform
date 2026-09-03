import {
  landscapeTickerRatingTicks,
  toLandscapeTickerXMs,
  toLandscapeTickerY,
  type LandscapeTickerPlotGeometry,
} from '@/lib/profile/landscapeTickerPath';
import { ticksForLaneWindow, type RatingLaneWindow } from '@/lib/profile/ratingTickerCalendar';
import type { RatingLane } from '@/lib/ratingHistoryMetrics';

type Props = {
  geometry: LandscapeTickerPlotGeometry;
  lane: RatingLane;
  window: RatingLaneWindow;
  testIdPrefix: 'compact-rating' | 'compact-comparison';
};

export function CompactRatingTickerAxes({ geometry, lane, window, testIdPrefix }: Props) {
  const ratingTicks = landscapeTickerRatingTicks(geometry.minR, geometry.maxR);
  const timeTicks = ticksForLaneWindow(window, geometry.width - geometry.pad * 2);
  const yTop = geometry.topAxisBand ?? geometry.pad;
  const yBottom = geometry.height - geometry.pad - (geometry.axisBand ?? 0);

  return (
    <>
      <g data-testid={`${testIdPrefix}-y-axis`} aria-hidden="true">
        <text x={4} y={10} fill="#94a3b8" fontSize="8" fontWeight="600">
          ELO
        </text>
        {ratingTicks.map((rating, index) => {
          const y = toLandscapeTickerY(rating, geometry);
          return (
            <g key={rating}>
              <line
                x1={geometry.pad}
                x2={geometry.width - geometry.pad}
                y1={y}
                y2={y}
                stroke="#1e293b"
                strokeWidth="1"
                opacity={index === 0 || index === ratingTicks.length - 1 ? 0.5 : 0.35}
              />
              <text x={4} y={y + 3} fill="#9ca3af" fontSize="8" className="tabular-nums">
                {rating}
              </text>
            </g>
          );
        })}
      </g>

      <g data-testid={`${testIdPrefix}-x-axis`} aria-hidden="true">
        {timeTicks.map((tick) => {
          const x = toLandscapeTickerXMs(tick.t, geometry);
          const emphasizedWeek = lane === 'month' && tick.priority === 'primary';
          return (
            <g key={`${tick.priority}-${tick.t}`}>
              {tick.priority !== 'endpoint' ? (
                <line
                  x1={x}
                  x2={x}
                  y1={yTop}
                  y2={yBottom}
                  stroke={emphasizedWeek ? '#64748b' : '#1e293b'}
                  strokeWidth={emphasizedWeek ? 1.75 : 1}
                  opacity={emphasizedWeek ? 0.9 : tick.priority === 'secondary' ? 0.35 : 0.5}
                  data-time-boundary={emphasizedWeek ? 'iso-week' : tick.priority}
                />
              ) : null}
              <text
                x={x}
                y={26}
                fill="#9ca3af"
                fontSize="8"
                textAnchor="middle"
                className="tabular-nums"
                data-testid={`${testIdPrefix}-x-tick-${tick.priority}`}
                data-tick-priority={tick.priority}
              >
                {tick.label}
              </text>
            </g>
          );
        })}
      </g>

      <text
        x={geometry.width / 2}
        y={10}
        fill="#94a3b8"
        fontSize="9"
        textAnchor="middle"
        data-testid={`${testIdPrefix}-time-caption`}
      >
        {window.caption}
      </text>
      <desc data-testid={`${testIdPrefix}-axis-description`}>
        {`Time axis, ${lane} lane, timezone ${window.timeZone}, ${window.caption}. Only real rating events receive markers; inactive time is held horizontally.`}
      </desc>
    </>
  );
}
