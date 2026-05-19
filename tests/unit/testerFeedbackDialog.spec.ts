import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseGameIdFromRoute } from '@/lib/tester/parseGameIdFromRoute';
import { TESTER_BUG_REPORT_CATEGORIES } from '@/lib/tester/insertTesterBugReport';

const dialogPath = join(process.cwd(), 'components', 'TesterBugReportDialog.tsx');

test.describe('tester feedback dialog', () => {
  test('parseGameIdFromRoute extracts game id from game pages', () => {
    expect(parseGameIdFromRoute('/game/550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
    expect(parseGameIdFromRoute('/free/lobby')).toBeNull();
    expect(parseGameIdFromRoute('/game/not-a-uuid')).toBeNull();
  });

  test('dialog requires categories and supports game attach', () => {
    const src = readFileSync(dialogPath, 'utf8');
    expect(src).toContain('TESTER_BUG_REPORT_CATEGORIES');
    expect(src).toContain('tester-bug-report-attach-game');
    expect(src).toContain('do not change games');
    expect(src).not.toContain("'suspicious'");
    expect(TESTER_BUG_REPORT_CATEGORIES).toContain('cheating_concern');
    expect(src).toContain('cheating_concern');
  });
});
