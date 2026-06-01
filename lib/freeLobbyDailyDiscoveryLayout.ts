import type { PlatMode } from '@/lib/freePlayModeTimeControl';
import type { OpenSeatClockLaneCounts } from '@/lib/lobbyModeClockActivity';

/** Daily room shows rated and unrated public discovery sections at once. */
export function dailyRoomUsesDualDiscoverySections(mode: PlatMode): boolean {
  return mode === 'daily';
}

/** Per-clock open-seat counts for one discovery lane (rated or unrated only). */
export function openByClockForDiscoveryLane(
  openByClock: Record<string, OpenSeatClockLaneCounts> | undefined,
  laneRated: boolean,
): Record<string, OpenSeatClockLaneCounts> | undefined {
  if (!openByClock) return undefined;
  return Object.fromEntries(
    Object.entries(openByClock).map(([clockId, lanes]) => [
      clockId,
      laneRated
        ? { rated: lanes.rated, unrated: 0, total: lanes.rated }
        : { rated: 0, unrated: lanes.unrated, total: lanes.unrated },
    ]),
  );
}
