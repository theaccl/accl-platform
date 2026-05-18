import { expect, test } from '@playwright/test';

import { buildMoveIdempotencyKey, isValidClientMoveId } from '@/lib/replay/moveIdempotencyKey';
import { committedLogMatchesPayload } from '@/lib/replay/idempotentMoveRecovery';

const GAME_ID = '00000000-0000-0000-0000-000000000099';
const PLAYER_ID = '00000000-0000-0000-0000-000000000001';
const CLIENT_MOVE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const FEN_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FEN_AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

test.describe('move idempotency key', () => {
  test('client_move_id produces cm: prefix key', () => {
    const key = buildMoveIdempotencyKey({
      gameId: GAME_ID,
      fenBefore: FEN_START,
      playerId: PLAYER_ID,
      fromSq: 'e2',
      toSq: 'e4',
      clientMoveId: CLIENT_MOVE_ID,
    });
    expect(key).toBe(`cm:${CLIENT_MOVE_ID}`);
    expect(isValidClientMoveId(CLIENT_MOVE_ID)).toBe(true);
  });

  test('deterministic key encodes position and squares', () => {
    const a = buildMoveIdempotencyKey({
      gameId: GAME_ID,
      fenBefore: FEN_START,
      playerId: PLAYER_ID,
      fromSq: 'e2',
      toSq: 'e4',
    });
    const b = buildMoveIdempotencyKey({
      gameId: GAME_ID,
      fenBefore: FEN_START,
      playerId: PLAYER_ID,
      fromSq: 'e2',
      toSq: 'e4',
    });
    expect(a).toBe(b);
    expect(a.startsWith('mv:')).toBe(true);
  });

  test('same squares from repeated position later get different keys when fen_before differs', () => {
    const laterFen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const keyEarly = buildMoveIdempotencyKey({
      gameId: GAME_ID,
      fenBefore: FEN_START,
      playerId: PLAYER_ID,
      fromSq: 'e2',
      toSq: 'e4',
    });
    const keyLater = buildMoveIdempotencyKey({
      gameId: GAME_ID,
      fenBefore: laterFen,
      playerId: PLAYER_ID,
      fromSq: 'e2',
      toSq: 'e4',
    });
    expect(keyEarly).not.toBe(keyLater);
  });

  test('committedLogMatchesPayload rejects mismatched fen_after', () => {
    const match = committedLogMatchesPayload(
      {
        id: '1',
        game_id: GAME_ID,
        player_id: PLAYER_ID,
        san: 'e4',
        from_sq: 'e2',
        to_sq: 'e4',
        fen_before: FEN_START,
        fen_after: FEN_AFTER_E4,
        idempotency_key: 'cm:test',
      },
      {
        playerId: PLAYER_ID,
        fromSq: 'e2',
        toSq: 'e4',
        fenBefore: FEN_START,
        fenAfter: FEN_START,
      },
    );
    expect(match.ok).toBe(false);
  });
});
