import { expect, test } from '@playwright/test';
import {
  canAccessPlayerChat,
  canPostPlayerChat,
  canPostSpectatorChat,
  canReadSpectatorChat,
  isGameParticipant,
} from '../../lib/chat/chatPolicy';

const baseGame = {
  status: 'active',
  white_player_id: 'w1',
  black_player_id: 'b1',
};

test.describe('chatPolicy (tester channels)', () => {
  test('participant vs spectator membership', () => {
    expect(isGameParticipant(baseGame, 'w1')).toBe(true);
    expect(isGameParticipant(baseGame, 'b1')).toBe(true);
    expect(isGameParticipant(baseGame, 'x')).toBe(false);
  });

  test('player chat is participants only', () => {
    expect(canAccessPlayerChat(baseGame, 'w1')).toBe(true);
    expect(canPostPlayerChat(baseGame, 'w1')).toBe(true);
    expect(canAccessPlayerChat(baseGame, 'x')).toBe(false);
    expect(canPostPlayerChat(baseGame, 'x')).toBe(false);
  });

  test('spectator read: players hidden during active play; open after finish', () => {
    expect(canReadSpectatorChat(baseGame, 'w1')).toBe(false);
    expect(canReadSpectatorChat({ ...baseGame, status: 'finished' }, 'w1')).toBe(true);
    expect(canReadSpectatorChat(baseGame, 'x')).toBe(true);
  });

  test('spectator post: non-participants anytime; participants only after finish', () => {
    expect(canPostSpectatorChat(baseGame, 'x')).toBe(true);
    expect(canPostSpectatorChat(baseGame, 'w1')).toBe(false);
    expect(canPostSpectatorChat({ ...baseGame, status: 'finished' }, 'w1')).toBe(true);
  });
});
