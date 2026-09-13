import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hookPath = join(process.cwd(), 'hooks', 'useReplayState.ts');
const gamePagePath = join(process.cwd(), 'app', 'game', '[id]', 'page.tsx');

test.describe('shared replay playback contract', () => {
  test('shared replay state owns timed playback and pauses on manual navigation', () => {
    const src = readFileSync(hookPath, 'utf8');
    expect(src).toContain('DEFAULT_REPLAY_INTERVAL_MS = 850');
    expect(src).toContain('window.setTimeout');
    expect(src).toContain('window.clearTimeout');
    expect(src).toContain('toggleReplayPlayback');
    expect(src).not.toContain('setMoveLogsState');
    expect(src).toContain('setReplayStepState(next);');
  });

  test('generic game page only offers autoplay after the game is finished', () => {
    const src = readFileSync(gamePagePath, 'utf8');
    expect(src).toContain("game.status === 'finished'");
    expect(src).toContain('data-testid="game-replay-playback"');
    expect(src).toContain("isReplayPlaying ? 'Pause' : 'Play'");
  });
});
