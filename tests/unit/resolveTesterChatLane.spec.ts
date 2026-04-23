import { expect, test } from '@playwright/test';
import { resolveTesterChatLane } from '../../lib/chat/resolveTesterChatLane';

test.describe('resolveTesterChatLane', () => {
  test('board spectator never gets table even if requested says table', () => {
    expect(resolveTesterChatLane('table', true, 'live', 'active')).toBe('spectator');
    expect(resolveTesterChatLane('postgame_player', true, 'live', 'finished')).toBe('spectator');
  });

  test('seated viewer never keeps spectator when live in play', () => {
    expect(resolveTesterChatLane('spectator', false, 'live', 'active')).toBe('table');
    expect(resolveTesterChatLane('spectator', false, 'live', 'finished')).toBe('postgame_player');
  });
});
