import { test, expect } from '@playwright/test';

import {
  TOURNAMENT_REGISTRATION_CLOSED_CODE,
} from '../../lib/server/tournamentRegistrationGate';
import {
  tournamentApiErrorPayload,
  tournamentUserFacingMessage,
} from '../../lib/server/tournamentUserFacingError';

test('sanitizes internal postgres errors', () => {
  const msg = tournamentUserFacingMessage('ENTRY_INSERT_FAILED', 'PGRST116: duplicate key value');
  expect(msg).toBe('Could not complete registration. Try again.');
  expect(msg).not.toContain('PGRST');
});

test('uses stable copy for registration closed code', () => {
  expect(tournamentUserFacingMessage(TOURNAMENT_REGISTRATION_CLOSED_CODE)).toContain(
    'Registration is closed',
  );
});

test('tournamentApiErrorPayload includes code and sanitized error', () => {
  const payload = tournamentApiErrorPayload('TOURNAMENT_NOT_FOUND');
  expect(payload.code).toBe('TOURNAMENT_NOT_FOUND');
  expect(payload.error).toBe('Tournament not found.');
});
