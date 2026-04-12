import { expect, test } from '@playwright/test';

import { runEngineComputeService } from '../../lib/analysis/engineComputeService';

test('engineComputeService returns UCI-backed best move and multipv', async () => {
  const result = await runEngineComputeService({
    gameId: 'proof-game',
    intake: {
      schema_version: 'proof.1',
      game: {
        id: 'proof-game',
        status: 'finished',
        analysis_partition: 'free',
        play_context: 'free',
        rated: false,
        tempo: 'live',
        live_time_control: '5m',
        source_type: 'challenge',
        tournament_id: null,
        mode: 'PIT',
        white_player_id: 'w',
        black_player_id: 'b',
        winner_id: null,
        result: 'draw',
        end_reason: 'draw_agreement',
        finished_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        final_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        final_turn: 'white',
      },
      players: {
        white: { id: 'w', username: 'w' },
        black: { id: 'b', username: 'b' },
      },
      move_logs: [],
    },
  });

  expect(result.provider).toBe('stockfish');
  expect(result.evaluation.bestMove).toBeTruthy();
  expect(result.evaluation.multiPv.length).toBeGreaterThan(0);
});
