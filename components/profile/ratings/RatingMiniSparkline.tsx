import type { RatingPoint } from '@/lib/profile/ratingDashboardTypes';

type Props = {
  points?: RatingPoint[];
  color: string;
  height?: number;
};

/** Tiny sparkline — empty when fewer than 2 points (no fake data). */
export function RatingMiniSparkline({ points, color, height = 28 }: Props) {
  const data = points?.filter((p) => Number.isFinite(p.rating)) ?? [];
  if (data.length < 2) {
    return (
      <div
        className="rounded bg-[#141c28]/80"
        style={{ height }}
        aria-hidden
      />
    );
  }

  const w = 120;
  const ratings = data.map((p) => p.rating);
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const span = max - min || 1;
  const coords = data.map((p, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - ((p.rating - min) / span) * (height - 4) - 2;
    return `${x},${y}`;
  });

  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      className="w-full"
      style={{ height }}
      aria-hidden
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={coords.join(' ')}
      />
    </svg>
  );
}
