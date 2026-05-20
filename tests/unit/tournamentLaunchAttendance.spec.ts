import { test, expect } from '@playwright/test';

import {
  isAsyncTournamentForLaunch,
  isEntrantPresentAtLaunch,
  isLiveTournamentForLaunch,
  launchCountdownRemainingSec,
  resolveLiveLaunchEntrantIds,
} from '@/lib/tournamentLaunchAttendance';

test.describe('live tournament launch attendance (unit)', () => {
  const now = Date.parse('2026-05-19T12:00:00.000Z');

  test('live vs async tempo gate', () => {
    expect(isLiveTournamentForLaunch('live')).toBe(true);
    expect(isAsyncTournamentForLaunch('daily')).toBe(true);
    expect(isAsyncTournamentForLaunch('correspondence')).toBe(true);
    expect(isLiveTournamentForLaunch('daily')).toBe(false);
  });

  test('presence uses check-in or recent last_seen', () => {
    expect(
      isEntrantPresentAtLaunch(
        { checkedInAt: '2026-05-19T11:58:00.000Z', lastSeenAt: null },
        now,
      ),
    ).toBe(true);
    expect(
      isEntrantPresentAtLaunch(
        { checkedInAt: null, lastSeenAt: '2026-05-19T11:59:00.000Z' },
        now,
      ),
    ).toBe(true);
    expect(
      isEntrantPresentAtLaunch(
        { checkedInAt: '2026-05-19T10:00:00.000Z', lastSeenAt: null },
        now,
      ),
    ).toBe(false);
  });

  test('all present launches with four entrants', () => {
    const r = resolveLiveLaunchEntrantIds(
      [
        { userId: 'a', seed: 1, entryRole: 'entrant', checkedInAt: '2026-05-19T11:59:00.000Z', lastSeenAt: null },
        { userId: 'b', seed: 2, entryRole: 'entrant', checkedInAt: '2026-05-19T11:59:00.000Z', lastSeenAt: null },
        { userId: 'c', seed: 3, entryRole: 'entrant', checkedInAt: '2026-05-19T11:59:00.000Z', lastSeenAt: null },
        { userId: 'd', seed: 4, entryRole: 'entrant', checkedInAt: '2026-05-19T11:59:00.000Z', lastSeenAt: null },
      ],
      4,
      now,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.orderedUserIds).toHaveLength(4);
  });

  test('absent entrant is skipped and standby replaces', () => {
    const r = resolveLiveLaunchEntrantIds(
      [
        { userId: 'a', seed: 1, entryRole: 'entrant', checkedInAt: '2026-05-19T11:59:00.000Z', lastSeenAt: null },
        { userId: 'b', seed: 2, entryRole: 'entrant', checkedInAt: null, lastSeenAt: null },
        { userId: 'c', seed: 3, entryRole: 'entrant', checkedInAt: '2026-05-19T11:59:00.000Z', lastSeenAt: null },
        { userId: 'd', seed: 4, entryRole: 'entrant', checkedInAt: '2026-05-19T11:59:00.000Z', lastSeenAt: null },
        { userId: 's1', seed: 5, entryRole: 'standby', checkedInAt: '2026-05-19T11:59:00.000Z', lastSeenAt: null },
      ],
      4,
      now,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.skippedUserIds).toContain('b');
      expect(r.promotedStandbyUserIds).toContain('s1');
      expect(r.orderedUserIds).toHaveLength(4);
      expect(r.orderedUserIds).not.toContain('b');
    }
  });

  test('not enough present players blocks launch', () => {
    const r = resolveLiveLaunchEntrantIds(
      [
        { userId: 'a', seed: 1, entryRole: 'entrant', checkedInAt: '2026-05-19T11:59:00.000Z', lastSeenAt: null },
        { userId: 'b', seed: 2, entryRole: 'entrant', checkedInAt: null, lastSeenAt: null },
        { userId: 'c', seed: 3, entryRole: 'entrant', checkedInAt: null, lastSeenAt: null },
        { userId: 'd', seed: 4, entryRole: 'entrant', checkedInAt: null, lastSeenAt: null },
      ],
      4,
      now,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not_enough_present');
  });

  test('launch countdown remaining', () => {
    const rem = launchCountdownRemainingSec('2026-05-19T12:00:20.000Z', now);
    expect(rem).toBe(20);
  });
});
