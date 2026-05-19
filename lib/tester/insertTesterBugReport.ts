import type { SupabaseClient } from '@supabase/supabase-js';

/** Intake categories for new tester reports (observational only — no gameplay mutation). */
export const TESTER_BUG_REPORT_CATEGORIES = [
  'bug',
  'confusion',
  'match_issue',
  'ui_issue',
  'cheating_concern',
  'other',
] as const;

export type TesterBugReportCategory = (typeof TESTER_BUG_REPORT_CATEGORIES)[number];

// Observational only — see TESTER_FEEDBACK_OBSERVATIONAL_INVARIANT in observationalFeedback.ts
export async function insertTesterBugReport(
  supabase: SupabaseClient,
  reporterId: string,
  fields: {
    body: string;
    category: TesterBugReportCategory;
    route: string;
    gameId?: string | null;
  },
): Promise<boolean> {
  const row: {
    reporter_id: string;
    body: string;
    category: TesterBugReportCategory;
    route: string;
    game_id?: string | null;
  } = {
    reporter_id: reporterId,
    body: fields.body.trim(),
    category: fields.category,
    route: fields.route.slice(0, 2048),
  };
  if (fields.gameId) {
    row.game_id = fields.gameId;
  }
  const { error } = await supabase.from('tester_bug_reports').insert(row);
  return !error;
}
