import { test, expect } from '@playwright/test';

import {
  finishedGameResultBannerText,
  formatEndReasonLabel,
  formatFinishedAtLocal,
  isGameRecordFinished,
  opponentUserIdForViewer,
  viewerOutcomeShortLabel,
} from '../../lib/finishedGame';

const baseGame = {
  white_player_id: 'w1',
  black_player_id: 'b1',
};

test.describe('finishedGame helpers', () => {
  test('isGameRecordFinished matches status token only', () => {
    expect(isGameRecordFinished({ status: 'finished' })).toBe(true);
    expect(isGameRecordFinished({ status: 'FINISHED' })).toBe(true);
    expect(isGameRecordFinished({ status: 'active' })).toBe(false);
    expect(isGameRecordFinished({ status: null })).toBe(false);
  });

  test('finishedGameResultBannerText covers common outcomes', () => {
    expect(
      finishedGameResultBannerText({ ...baseGame, result: 'white_win', end_reason: 'checkmate' })
    ).toBe('Checkmate - White wins');
    expect(
      finishedGameResultBannerText({ ...baseGame, result: 'black_win', end_reason: 'resign' })
    ).toBe('Resignation - Black wins');
    expect(
      finishedGameResultBannerText({ ...baseGame, result: 'draw', end_reason: 'draw_agreement' })
    ).toBe('Draw by agreement');
    expect(
      finishedGameResultBannerText({ ...baseGame, result: 'draw', end_reason: 'fifty_move_rule' })
    ).toBe('Fifty-move rule - Draw');
  });

  test('viewerOutcomeShortLabel is relative to seat', () => {
    expect(viewerOutcomeShortLabel({ ...baseGame, result: 'white_win' }, 'w1')).toBe(
      'You won · White'
    );
    expect(viewerOutcomeShortLabel({ ...baseGame, result: 'white_win' }, 'b1')).toBe(
      'You lost · White won'
    );
  });

  test('opponentUserIdForViewer', () => {
    expect(opponentUserIdForViewer(baseGame, 'w1')).toBe('b1');
    expect(opponentUserIdForViewer(baseGame, 'b1')).toBe('w1');
    expect(opponentUserIdForViewer(baseGame, 'spec')).toBeNull();
  });

  test('formatEndReasonLabel normalizes snake_case', () => {
    expect(formatEndReasonLabel('draw_agreement')).toBe('draw agreement');
    expect(formatEndReasonLabel(null)).toBe('');
  });

  test('formatFinishedAtLocal returns em dash for missing', () => {
    expect(formatFinishedAtLocal(null)).toBe('—');
  });
});
