export type MergePointerCandidate = {
  x: number;
  y: number;
  series: { rank: number };
};

/**
 * Select the closest plotted event across every merged series. Rank resolves
 * exact distance ties only, so a wide hit target cannot claim a closer event
 * from another series.
 */
export function nearestMergePoint<T extends MergePointerCandidate>(
  points: T[],
  x: number,
  y: number,
): T | null {
  let best: T | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const distance = (point.x - x) ** 2 + (point.y - y) ** 2;
    if (
      distance < bestDistance
      || (distance === bestDistance && best != null && point.series.rank < best.series.rank)
    ) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}
