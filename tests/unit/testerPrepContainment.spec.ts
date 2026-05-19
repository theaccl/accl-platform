import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TESTER_FEEDBACK_OBSERVATIONAL_INVARIANT } from '@/lib/tester/observationalFeedback';

const testerPaths = [
  join(process.cwd(), 'app', 'api', 'tester', 'bug-report', 'route.ts'),
  join(process.cwd(), 'lib', 'tester', 'insertTesterBugReport.ts'),
  join(process.cwd(), 'components', 'TesterBugReportDialog.tsx'),
];

const FORBIDDEN = [
  /auto-remediat/i,
  /auto-requeue/i,
  /\.from\(['"]games['"]\)\.(update|delete|upsert)/,
  /moderation/i,
  /apply_bot_game_turn/i,
  /BOT_MOVE_QUEUE_ENABLED/,
];

test.describe('tester prep containment', () => {
  test('documents observational-only invariant', () => {
    expect(TESTER_FEEDBACK_OBSERVATIONAL_INVARIANT).toContain('observational only');
    expect(TESTER_FEEDBACK_OBSERVATIONAL_INVARIANT).toContain('mutate gameplay');
  });

  test('tester feedback paths do not mutate gameplay or bot authority', () => {
    for (const path of testerPaths) {
      const src = readFileSync(path, 'utf8');
      for (const pattern of FORBIDDEN) {
        expect(src, `${path} must not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  test('bug-report API returns stable client codes only', () => {
    const src = readFileSync(testerPaths[0], 'utf8');
    expect(src).toContain('testerBugReportClientMessage');
    expect(src).toContain('parseGameIdFromRoute');
    expect(src).not.toMatch(/return json\(\{ error: fetchErr\.message/);
  });
});
