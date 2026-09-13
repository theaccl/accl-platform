import { expect, test } from '@playwright/test';

import { lastMoveMatchesAuthoritativePosition } from '@/lib/coherentGamePresentation';
import { selectReplayHighlight } from '@/lib/replay/selectReplayHighlight';

const e2e4 = { san: 'e4', from_sq: 'e2', to_sq: 'e4' };
const e7e5 = { san: 'e5', from_sq: 'e7', to_sq: 'e5' };
const frozenLogs = [e2e4, e7e5] as const;

const before = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

function selectedSquares(
  step: number | null,
  logs: readonly {
    san: string;
    from_sq?: string | null;
    to_sq?: string | null;
    fen_after?: string | null;
  }[] = [...frozenLogs]
) {
  const selected = selectReplayHighlight(logs, step);
  return [selected.from, selected.to].filter((square): square is string => Boolean(square));
}

test.describe('finished replay highlight selection', () => {
  test('empty logs plus any step return no selected move or squares', () => {
    for (const step of [0, 1, 2, 99, null] as const) {
      const selected = selectReplayHighlight([], step);
      expect(selected.move).toBeUndefined();
      expect(selected.from).toBeNull();
      expect(selected.to).toBeNull();
    }
  });

  test('step 0 returns no selected move or squares', () => {
    const selected = selectReplayHighlight(frozenLogs, 0);
    expect(selected.move).toBeUndefined();
    expect(selectedSquares(0)).toEqual([]);
  });

  test('step 1 selects only e2 and e4', () => {
    const selected = selectReplayHighlight(frozenLogs, 1);
    expect(selected.move).toBe(e2e4);
    expect(selectedSquares(1)).toEqual(['e2', 'e4']);
  });

  test('step 2 selects only e7 and e5; e2 and e4 are absent', () => {
    const selected = selectReplayHighlight(frozenLogs, 2);
    expect(selected.move).toBe(e7e5);
    expect(selectedSquares(2)).toEqual(['e7', 'e5']);
    expect(selectedSquares(2)).not.toContain('e2');
    expect(selectedSquares(2)).not.toContain('e4');
  });

  test('direct jump from step 2 back to step 1 restores only move 1', () => {
    expect(selectedSquares(2)).toEqual(['e7', 'e5']);
    const restored = selectReplayHighlight(frozenLogs, 1);
    expect(restored.move).toBe(e2e4);
    expect(selectedSquares(1)).toEqual(['e2', 'e4']);
    expect(selectedSquares(1)).not.toContain('e7');
    expect(selectedSquares(1)).not.toContain('e5');
  });

  test('replayStep === null selects the final stored move', () => {
    const selected = selectReplayHighlight(frozenLogs, null);
    expect(selected.move).toBe(e7e5);
    expect(selectedSquares(null)).toEqual(['e7', 'e5']);
  });

  test('a step above the available length clamps to the final stored move', () => {
    const selected = selectReplayHighlight(frozenLogs, 9);
    expect(selected.move).toBe(e7e5);
    expect(selectedSquares(9)).toEqual(['e7', 'e5']);
  });

  test('a move with only to_sq selects only the destination', () => {
    const selected = selectReplayHighlight([{ san: 'e4', from_sq: null, to_sq: 'e4' }], 1);
    expect(selected.from).toBeNull();
    expect(selected.to).toBe('e4');
    expect([selected.from, selected.to].filter(Boolean)).toEqual(['e4']);
  });

  test('a move with neither square selects nothing and does not throw', () => {
    expect(() => selectReplayHighlight([{ san: 'e4', from_sq: null, to_sq: null }], 1)).not.toThrow();
    const selected = selectReplayHighlight([{ san: 'e4' }], 1);
    expect(selected.move).toEqual({ san: 'e4' });
    expect(selected.from).toBeNull();
    expect(selected.to).toBeNull();
  });

  test('authoritative-position mismatch still suppresses the selected live highlight', () => {
    const selected = selectReplayHighlight(
      [{ san: 'e4', from_sq: 'e2', to_sq: 'e4', fen_after: afterE4 }],
      null
    );
    expect(selectedSquares(null, [{ san: 'e4', from_sq: 'e2', to_sq: 'e4', fen_after: afterE4 }])).toEqual([
      'e2',
      'e4',
    ]);
    expect(lastMoveMatchesAuthoritativePosition(selected.move, before)).toBe(false);
  });
});
