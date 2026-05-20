import { nextPowerOf2 } from '@/lib/tournamentBracket';

export const LIVE_LAUNCH_COUNTDOWN_SEC = 20;
export const LAUNCH_PRESENCE_WINDOW_MS = 10 * 60 * 1000;

export type TournamentEntryRole = 'entrant' | 'standby';

export type LaunchEntryRow = {
  userId: string;
  seed: number | null;
  entryRole: TournamentEntryRole;
  checkedInAt: string | null;
  lastSeenAt: string | null;
};

export type LiveLaunchResolveResult =
  | {
      ok: true;
      orderedUserIds: string[];
      presentUserIds: string[];
      skippedUserIds: string[];
      promotedStandbyUserIds: string[];
    }
  | {
      ok: false;
      code: 'not_enough_present';
      presentCount: number;
      requiredCount: number;
      skippedUserIds: string[];
      standbyAvailable: number;
      detail: string;
    };

/** Live same-session tournaments (bullet/blitz/rapid live tempo). */
export function isLiveTournamentForLaunch(tempo: string | null | undefined): boolean {
  const t = String(tempo ?? '')
    .trim()
    .toLowerCase();
  return t === 'live';
}

/** Daily / correspondence — no launch attendance gate. */
export function isAsyncTournamentForLaunch(tempo: string | null | undefined): boolean {
  const t = String(tempo ?? '')
    .trim()
    .toLowerCase();
  return t === 'daily' || t === 'correspondence';
}

export function isEntrantPresentAtLaunch(
  row: Pick<LaunchEntryRow, 'checkedInAt' | 'lastSeenAt'>,
  nowMs: number,
  windowMs: number = LAUNCH_PRESENCE_WINDOW_MS,
): boolean {
  const checked = row.checkedInAt ? Date.parse(row.checkedInAt) : NaN;
  const seen = row.lastSeenAt ? Date.parse(row.lastSeenAt) : NaN;
  if (Number.isFinite(checked) && nowMs - checked <= windowMs) return true;
  if (Number.isFinite(seen) && nowMs - seen <= windowMs) return true;
  return false;
}

export function launchCountdownRemainingSec(
  launchScheduledAt: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  const at = launchScheduledAt ? Date.parse(launchScheduledAt) : NaN;
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.ceil((at - nowMs) / 1000));
}

export function isLaunchCountdownComplete(
  launchScheduledAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const rem = launchCountdownRemainingSec(launchScheduledAt, nowMs);
  return rem !== null && rem <= 0;
}

/**
 * Build final entrant list for live launch: present registered entrants + standby fill-ins.
 * Does not mutate DB — caller marks skipped / promotes.
 */
export function resolveLiveLaunchEntrantIds(
  entries: LaunchEntryRow[],
  bracketTargetSize: number,
  nowMs: number = Date.now(),
): LiveLaunchResolveResult {
  const required = Math.max(2, bracketTargetSize);
  const registered = entries.filter((e) => e.entryRole === 'entrant');
  const standby = entries
    .filter((e) => e.entryRole === 'standby')
    .sort((a, b) => {
      if (a.seed != null && b.seed != null && a.seed !== b.seed) return a.seed - b.seed;
      if (a.seed != null && b.seed == null) return -1;
      if (a.seed == null && b.seed != null) return 1;
      return a.userId.localeCompare(b.userId);
    });

  const present = registered.filter((e) => isEntrantPresentAtLaunch(e, nowMs));
  const skipped = registered.filter((e) => !isEntrantPresentAtLaunch(e, nowMs)).map((e) => e.userId);

  const finalRows: LaunchEntryRow[] = [...present];
  const promoted: string[] = [];
  for (const s of standby) {
    if (finalRows.length >= required) break;
    finalRows.push(s);
    promoted.push(s.userId);
  }

  if (finalRows.length < required) {
    return {
      ok: false,
      code: 'not_enough_present',
      presentCount: finalRows.length,
      requiredCount: required,
      skippedUserIds: skipped,
      standbyAvailable: standby.length,
      detail: `Only ${finalRows.length} present player(s) after replacements; need ${required} to start.`,
    };
  }

  const orderedUserIds = orderLaunchEntrantUserIds(
    finalRows.slice(0, required).map((e) => ({ userId: e.userId, seed: e.seed })),
  );

  return {
    ok: true,
    orderedUserIds,
    presentUserIds: present.map((e) => e.userId),
    skippedUserIds: skipped,
    promotedStandbyUserIds: promoted,
  };
}

function orderLaunchEntrantUserIds(
  entries: Array<{ userId: string; seed: number | null }>,
): string[] {
  const sorted = [...entries].sort((a, b) => {
    if (a.seed != null && b.seed != null && a.seed !== b.seed) return a.seed - b.seed;
    if (a.seed != null && b.seed == null) return -1;
    if (a.seed == null && b.seed != null) return 1;
    return a.userId.localeCompare(b.userId);
  });
  return sorted.map((e) => e.userId);
}

export function bracketTargetSizeForEntrantCount(entrantCount: number): number {
  const n = Math.max(0, Math.floor(entrantCount));
  if (n < 2) return 2;
  return Math.min(8, nextPowerOf2(n));
}
