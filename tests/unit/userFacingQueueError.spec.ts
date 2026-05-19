import { expect, test } from '@playwright/test';

import {
  formatCreateSeatedGameGuardError,
  formatMatchRequestApiError,
  formatUserFacingQueueError,
} from '@/lib/userFacingQueueError';

test.describe('userFacingQueueError', () => {
  test('maps guard RPC errors to stable copy', () => {
    expect(formatUserFacingQueueError('free_play_joiner_busy')).toContain('live game');
    expect(formatCreateSeatedGameGuardError('seat already taken')).toContain('just taken');
    expect(formatMatchRequestApiError('free_play_host_busy')).toContain('host is already');
  });

  test('does not leak internal postgres errors', () => {
    const raw = 'PGRST116: JSON object requested, multiple (or no) rows returned';
    expect(formatUserFacingQueueError(raw)).toBe('Something went wrong. Try again.');
    expect(formatUserFacingQueueError(raw)).not.toContain('PGRST');
  });

  test('passes through short stable messages', () => {
    expect(formatUserFacingQueueError('Match request not found')).toBe('Match request not found');
  });
});
