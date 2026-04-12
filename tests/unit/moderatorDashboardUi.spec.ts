import { expect, test } from '@playwright/test';

import {
  MODERATOR_QUEUE_PAGE_SIZE,
  buildQueueQuery,
  canGoToNextPage,
  canGoToPreviousPage,
  isResolutionNoteRequired,
} from '../../lib/moderatorDashboardModel';
import { extractSupabaseAccessTokenFromCookieValue } from '../../lib/moderatorPageAuth';

test.describe('Moderator dashboard UI model', () => {
  test('queue list query includes filters and pagination values', async () => {
    const query = buildQueueQuery(
      {
        queueStatus: 'OPEN',
        suspicionTier: 'ESCALATE_REVIEW',
        recommendedAction: 'SEND_TO_MODERATOR_QUEUE',
        userId: '00000000-0000-0000-0000-000000000001',
      },
      { total: 0, limit: MODERATOR_QUEUE_PAGE_SIZE, offset: 40 }
    );
    expect(query).toContain('limit=20');
    expect(query).toContain('offset=40');
    expect(query).toContain('queue_status=OPEN');
    expect(query).toContain('suspicion_tier=ESCALATE_REVIEW');
    expect(query).toContain('recommended_action=SEND_TO_MODERATOR_QUEUE');
    expect(query).toContain('user_id=00000000-0000-0000-0000-000000000001');
  });

  test('pagination guard logic tracks previous/next availability', async () => {
    expect(canGoToPreviousPage({ total: 100, limit: 20, offset: 0 })).toBe(false);
    expect(canGoToPreviousPage({ total: 100, limit: 20, offset: 20 })).toBe(true);
    expect(canGoToNextPage({ total: 40, limit: 20, offset: 0 })).toBe(true);
    expect(canGoToNextPage({ total: 40, limit: 20, offset: 20 })).toBe(false);
  });

  test('action note requirements align with backend action semantics', async () => {
    expect(isResolutionNoteRequired('MARK_IN_REVIEW')).toBe(false);
    expect(isResolutionNoteRequired('MARK_RESOLVED')).toBe(true);
    expect(isResolutionNoteRequired('MARK_DISMISSED')).toBe(true);
  });

  test('access token extraction reads supabase auth cookie payload', async () => {
    const cookie = JSON.stringify({
      currentSession: {
        access_token: 'abc123',
      },
    });
    expect(extractSupabaseAccessTokenFromCookieValue(cookie)).toBe('abc123');
    expect(extractSupabaseAccessTokenFromCookieValue('invalid-json')).toBeNull();
  });
});
