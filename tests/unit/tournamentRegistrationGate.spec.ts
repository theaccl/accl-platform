import { test, expect } from '@playwright/test';

import {
  TOURNAMENT_REGISTRATION_CLOSED_CODE,
  TOURNAMENT_REGISTRATION_CLOSED_MESSAGE,
  checkTournamentRegistrationOpen,
} from '../../lib/server/tournamentRegistrationGate';

function mockSupabase(count: number | null, error: { message: string } | null = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () =>
          Promise.resolve(
            error ? { count: null, error } : { count, error: null },
          ),
      }),
    }),
  } as never;
}

test('registration open when no tournament_matches', async () => {
  const result = await checkTournamentRegistrationOpen(mockSupabase(0), 't-id');
  expect(result).toEqual({ open: true });
});

test('registration closed when tournament_matches exist', async () => {
  const result = await checkTournamentRegistrationOpen(mockSupabase(2), 't-id');
  expect(result).toEqual({
    open: false,
    code: TOURNAMENT_REGISTRATION_CLOSED_CODE,
    message: TOURNAMENT_REGISTRATION_CLOSED_MESSAGE,
  });
});

test('match count query failure returns MATCH_COUNT_FAILED', async () => {
  const result = await checkTournamentRegistrationOpen(
    mockSupabase(null, { message: 'PGRST timeout' }),
    't-id',
  );
  expect(result.open).toBe(false);
  if (!result.open) {
    expect(result.code).toBe('MATCH_COUNT_FAILED');
  }
});
