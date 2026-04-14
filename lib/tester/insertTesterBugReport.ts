import type { SupabaseClient } from '@supabase/supabase-js';

export type TesterBugReportCategory = 'bug' | 'ux' | 'suggestion' | 'suspicious';

export async function insertTesterBugReport(
  supabase: SupabaseClient,
  reporterId: string,
  fields: {
    body: string;
    category: TesterBugReportCategory | null;
    route: string;
  },
): Promise<boolean> {
  const { error } = await supabase.from('tester_bug_reports').insert({
    reporter_id: reporterId,
    body: fields.body.trim(),
    category: fields.category,
    route: fields.route.slice(0, 2048),
  });
  return !error;
}
