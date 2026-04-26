import { expect, test } from '@playwright/test';
import {
  assertChannelPayload,
  canAccessPlayerChat,
  canPostPlayerChat,
  canPostSpectatorChat,
  canReadSpectatorChat,
  isGameParticipant,
  isLiveTempoGame,
} from '../../lib/chat/chatPolicy';
import { isAllowedLobbyRoom } from '../../lib/chat/chatChannels';

const baseGame = {
  status: 'active',
  white_player_id: 'w1',
  black_player_id: 'b1',
  tempo: 'live' as string | null,
};

test.describe('chatPolicy (P2 separation)', () => {
  test('participant vs spectator membership', () => {
    expect(isGameParticipant(baseGame, 'w1')).toBe(true);
    expect(isGameParticipant(baseGame, 'b1')).toBe(true);
    expect(isGameParticipant(baseGame, 'x')).toBe(false);
  });

  test('live tempo gate', () => {
    expect(isLiveTempoGame(baseGame)).toBe(true);
    expect(isLiveTempoGame({ ...baseGame, tempo: 'daily' })).toBe(false);
    expect(isLiveTempoGame({ ...baseGame, tempo: null })).toBe(false);
  });

  test('player chat: participants during live play and after finish', () => {
    expect(canAccessPlayerChat(baseGame, 'w1')).toBe(true);
    expect(canPostPlayerChat(baseGame, 'w1')).toBe(true);
    expect(canAccessPlayerChat({ ...baseGame, status: 'finished' }, 'w1')).toBe(true);
    expect(canPostPlayerChat({ ...baseGame, status: 'finished' }, 'w1')).toBe(true);
    expect(canAccessPlayerChat(baseGame, 'x')).toBe(false);
    expect(canPostPlayerChat(baseGame, 'x')).toBe(false);
  });

  test('player chat: daily and correspondence in play', () => {
    const daily = { ...baseGame, tempo: 'daily' as string | null };
    expect(canAccessPlayerChat({ ...daily, status: 'active' }, 'w1')).toBe(true);
    expect(canPostPlayerChat({ ...daily, status: 'waiting' }, 'b1')).toBe(true);
    expect(canAccessPlayerChat({ ...daily, status: 'active' }, 'x')).toBe(false);
    const corr = { ...baseGame, tempo: 'correspondence' as string | null };
    expect(canAccessPlayerChat({ ...corr, status: 'waiting' }, 'w1')).toBe(true);
  });

  test('spectator chat: live games only, not seated players', () => {
    expect(canReadSpectatorChat(baseGame, 'w1')).toBe(false);
    expect(canPostSpectatorChat(baseGame, 'w1')).toBe(false);
    expect(canReadSpectatorChat(baseGame, 'x')).toBe(true);
    expect(canPostSpectatorChat(baseGame, 'x')).toBe(true);
    const daily = { ...baseGame, tempo: 'daily' as string | null };
    expect(canReadSpectatorChat(daily, 'w1')).toBe(false);
    expect(canPostSpectatorChat(daily, 'x')).toBe(false);
  });

  test('lobby room allow list', () => {
    expect(isAllowedLobbyRoom('free_lobby_general')).toBe(true);
    expect(isAllowedLobbyRoom('free_lobby_blitz')).toBe(true);
    expect(isAllowedLobbyRoom('global')).toBe(true);
    expect(isAllowedLobbyRoom('random_room')).toBe(false);
    expect(isAllowedLobbyRoom('')).toBe(false);
  });

  test('assertChannelPayload rejects unknown lobby room', () => {
    expect(() => assertChannelPayload('lobby', null, 'bad', null)).toThrow();
    expect(() => assertChannelPayload('lobby', null, 'free_lobby_rapid', null)).not.toThrow();
  });
});
