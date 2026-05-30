import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function src(rel: string): string {
  return readFileSync(join(root, ...rel.split('/')), 'utf8');
}

test.describe('waiting-seat queue conflict UX (static)', () => {
  test('queue helper chain returns an enriched conflict, not just an id', () => {
    const guard = src('lib/hasActiveWaitingLiveFreeGame.ts');
    expect(guard).toContain('Promise<QueueConflict | null | { queryError: true }>');
    expect(guard).toContain('classifyFreePlayQueueConflict');
    expect(guard).toContain('gameId: g.id');

    const find = src('lib/freePlayFindMatch.ts');
    // Result + gate carry the conflict through to callers.
    expect(find).toContain('conflict?: QueueConflict');
    expect(find).toContain('resumeGameId: hit.gameId, conflict: hit');
  });

  test('FreePlayMatchPanel branches copy + actions by conflict kind', () => {
    const s = src('components/FreePlayMatchPanel.tsx');

    // Waiting seat: dedicated copy + Return + Cancel, no live-resume link.
    expect(s).toContain("conflictKind === 'waiting_seat'");
    expect(s).toContain('data-testid="free-plat-return-waiting-seat"');
    expect(s).toContain('Return to waiting seat');
    expect(s).toContain('data-testid="free-plat-cancel-waiting-seat"');
    expect(s).toContain('Cancel waiting seat');

    // Seated live game: keeps Return to live game, no cancel in that branch.
    expect(s).toContain('Return to live game');
    expect(s).toContain('data-testid="free-plat-resume-game-link"');

    // The waiting-seat actions block precedes the seated-live resume link in source,
    // confirming the seated link only renders in the else branch.
    const waitingIdx = s.indexOf('data-testid="free-plat-waiting-seat-actions"');
    const liveLinkIdx = s.indexOf('data-testid="free-plat-resume-game-link"');
    expect(waitingIdx).toBeGreaterThan(-1);
    expect(liveLinkIdx).toBeGreaterThan(waitingIdx);
  });

  test('cancel reuses the authenticated finish_game RPC (not service-role)', () => {
    const s = src('components/FreePlayMatchPanel.tsx');
    expect(s).toContain("supabase.rpc('finish_game'");
    expect(s).toContain("p_result: 'black_win'");
    expect(s).toContain("p_end_reason: 'resign'");
    expect(s).not.toContain('finish_game_system');
    // After a successful cancel, conflict state clears so the next Create/Find re-checks.
    expect(s).toContain('setResumeGameId(null)');
    expect(s).toContain('setConflictKind(null)');
  });

  test('Leave waiting seat lives in the visible compact action row, not the shell tail', () => {
    const s = src('app/game/[id]/page.tsx');

    const actionsIdx = s.indexOf('data-testid="game-actions"');
    const abandonIdx = s.indexOf('data-testid="game-abandon-open-seat"');
    const tailIdx = s.indexOf('accl-game-shell-tail');

    expect(actionsIdx).toBeGreaterThan(-1);
    expect(abandonIdx).toBeGreaterThan(-1);
    expect(tailIdx).toBeGreaterThan(-1);

    // Abandon button is inside the actions row (after game-actions, before the tail).
    expect(abandonIdx).toBeGreaterThan(actionsIdx);
    expect(abandonIdx).toBeLessThan(tailIdx);

    // It is gated by showAbandonOpenSeat and reuses the existing handler.
    expect(s).toContain('showAbandonOpenSeat');
    expect(s).toContain('handleAbandonOpenSeat');
    expect(s).toContain('Leave waiting seat');

    // Exactly one abandon control remains (no duplicate legacy placement).
    const occurrences = s.split('data-testid="game-abandon-open-seat"').length - 1;
    expect(occurrences).toBe(1);
  });
});
