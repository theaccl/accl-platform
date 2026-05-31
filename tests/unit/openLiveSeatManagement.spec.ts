import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  NEUTRAL_OPEN_SEAT_CANCEL_FINISH,
  continuityRowActionLabel,
  splitLiveContinuityRows,
} from '@/lib/gameContinuityPresentation';
import {
  NEUTRAL_OPEN_SEAT_CANCELLED_BANNER,
  finishedGameResultBannerText,
  isNeutralPreStartOpenSeatEndReason,
} from '@/lib/finishedGame';

const root = process.cwd();
function src(rel: string): string {
  return readFileSync(join(root, ...rel.split('/')), 'utf8');
}

test.describe('open live seat management — presentation & sections', () => {
  test('FreeActiveGamesList renders LIVE NOW (seated) and OPEN LIVE SEATS as siblings', () => {
    const list = src('components/free/FreeActiveGamesList.tsx');
    expect(list).toContain('splitLiveContinuityRows');
    expect(list).toContain('seatedLive');
    expect(list).toContain('openLive');
    expect(list).toContain('free-active-live-now');
    expect(list).toContain('free-active-open-live-seats');
    expect(list).toContain('OPEN_LIVE_SEATS_SECTION_TITLE');
    expect(list.indexOf('free-active-live-now')).toBeLessThan(list.indexOf('free-active-open-live-seats'));
    expect(list.indexOf('free-active-open-live-seats')).toBeLessThan(list.indexOf('free-active-daily-async'));
  });

  test('splitLiveContinuityRows separates open vs seated', () => {
    const { openLive, seatedLive } = splitLiveContinuityRows([
      { id: 'a', status: 'active', tempo: 'live', white_player_id: 'u1', black_player_id: null },
      { id: 'b', status: 'active', tempo: 'live', white_player_id: 'u1', black_player_id: 'u2' },
    ]);
    expect(openLive.map((r) => r.id)).toEqual(['a']);
    expect(seatedLive.map((r) => r.id)).toEqual(['b']);
  });

  test('open live seat label is Waiting for opponent', () => {
    expect(
      continuityRowActionLabel({ tempo: 'live', live_time_control: '10m', black_player_id: null })
    ).toBe('Waiting for opponent');
  });
});

test.describe('inline open-seat management (static)', () => {
  test('live open seats use expandable inline card, not whole-row Link', () => {
    const rows = src('components/free/GameContinuityGameRows.tsx');
    expect(rows).toContain('OpenLiveSeatInlineCard');
    expect(rows).toContain('<details');
    expect(rows).toContain('Return to waiting seat');
    expect(rows).toContain('Cancel open seat');
    expect(rows).toContain('-open-return-');
    expect(rows).toContain('-open-cancel-');
    expect(rows).toContain('NEUTRAL_OPEN_SEAT_CANCEL_FINISH');
    // Return link targets board; cancel uses RPC only (no navigation wrapper on cancel).
    expect(rows).toContain('href={`/game/${g.id}`}');
    expect(rows).not.toMatch(/Cancel open seat[\s\S]{0,80}<Link/);
  });
});

test.describe('neutral pre-start cancellation', () => {
  test('shared finish_game args use draw + abandoned_before_move', () => {
    expect(NEUTRAL_OPEN_SEAT_CANCEL_FINISH).toEqual({
      p_result: 'draw',
      p_end_reason: 'abandoned_before_move',
    });
  });

  test('all three cancel call sites use neutral args', () => {
    const page = src('app/game/[id]/page.tsx');
    const panel = src('components/FreePlayMatchPanel.tsx');
    const rows = src('components/free/GameContinuityGameRows.tsx');
    for (const s of [page, panel, rows]) {
      expect(s).toContain('NEUTRAL_OPEN_SEAT_CANCEL_FINISH');
    }
    expect(page).toContain('handleAbandonOpenSeat');
    expect(page).not.toMatch(
      /handleAbandonOpenSeat[\s\S]{0,500}p_result:\s*'black_win'/
    );
    expect(panel).not.toMatch(/cancelWaitingSeat[\s\S]{0,400}p_end_reason:\s*'resign'/);
  });

  test('finished banner for neutral reasons', () => {
    expect(isNeutralPreStartOpenSeatEndReason('abandoned_before_move')).toBe(true);
    expect(isNeutralPreStartOpenSeatEndReason('superseded')).toBe(true);
    expect(isNeutralPreStartOpenSeatEndReason('resign')).toBe(false);
    expect(
      finishedGameResultBannerText({
        white_player_id: 'w',
        black_player_id: null,
        result: 'draw',
        end_reason: 'abandoned_before_move',
      })
    ).toBe(NEUTRAL_OPEN_SEAT_CANCELLED_BANNER);
    expect(
      finishedGameResultBannerText({
        white_player_id: 'w',
        black_player_id: null,
        result: 'draw',
        end_reason: 'superseded',
      })
    ).toBe(NEUTRAL_OPEN_SEAT_CANCELLED_BANNER);
    expect(
      finishedGameResultBannerText({
        white_player_id: 'w',
        black_player_id: 'b',
        result: 'black_win',
        end_reason: 'resign',
      })
    ).toBe('Resignation - Black wins');
  });

  test('PGN termination omits resignation tag for neutral pre-start cancellation', () => {
    const page = src('app/game/[id]/page.tsx');
    expect(page).toContain('isNeutralPreStartOpenSeatEndReason');
    expect(page).toMatch(/terminationPgnTag[\s\S]{0,220}isNeutralPreStartOpenSeatEndReason/);
  });

  test('SQL lifecycle void list includes abandoned_before_move', () => {
    const sql = src('supabase/migrations/20260619180000_free_play_true_elo_rating.sql');
    expect(sql).toContain("'abandoned_before_move'");
    expect(sql).toContain('lifecycle_void_finish');
  });
});
