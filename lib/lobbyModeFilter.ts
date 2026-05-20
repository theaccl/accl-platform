import type { PlatMode } from '@/lib/freePlayModeTimeControl';
import { PLAT_MODE_ORDER } from '@/lib/freePlayModeTimeControl';
import { isLobbyYourMove, type LobbyObligationRow } from '@/lib/lobbyObligationPresentation';
import { platBucketForOpenSeat } from '@/lib/platOpenSeatBucket';

export type LobbyHubModeFilter = PlatMode | null;

export function isPlatMode(value: string | null | undefined): value is PlatMode {
  return PLAT_MODE_ORDER.includes(value as PlatMode);
}

export function platModeForLobbyRow(
  row: Pick<LobbyObligationRow, 'tempo' | 'live_time_control'>,
): PlatMode | null {
  return platBucketForOpenSeat(row.tempo, row.live_time_control ?? null);
}

export function filterRowsByLobbyMode<T extends Pick<LobbyObligationRow, 'tempo' | 'live_time_control'>>(
  rows: T[],
  mode: LobbyHubModeFilter,
): T[] {
  if (!mode) return rows;
  return rows.filter((r) => platModeForLobbyRow(r) === mode);
}

export function emptyPlatModeCounts(): Record<PlatMode, number> {
  return { bullet: 0, blitz: 0, rapid: 0, daily: 0 };
}

export function countYourMoveByPlatMode(
  rows: LobbyObligationRow[],
  uid: string | null,
): Record<PlatMode, number> {
  const out = emptyPlatModeCounts();
  if (!uid) return out;
  for (const row of rows) {
    if (!isLobbyYourMove(row, uid)) continue;
    const m = platModeForLobbyRow(row);
    if (m) out[m] += 1;
  }
  return out;
}
