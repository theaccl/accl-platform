import { z } from 'zod';
import { parseJsonBody } from '@/lib/imageGenerator/api';
import { handOffExpiredIssue, reviewIssueWithAi } from '@/lib/imageGenerator/issueReview';
import { issueReportSchema, publicIssueReport, type IssueReport } from '@/lib/imageGenerator/issueReviewPolicy';
import { resolveAuthenticatedUser } from '@/lib/requestAuth';
import { jsonResponse } from '@/lib/server/httpJson';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'private, no-store' };
type Context = { params: Promise<{ id: string }> };

async function handle(request: Request, context: Context, submit: boolean): Promise<Response> {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, headers);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return jsonResponse({ error: 'Invalid generation' }, 400, headers);
  const db = createServiceRoleClient();
  const generation = await db.from('image_generation_requests').select('id').eq('id', id).eq('owner_id', user.id).maybeSingle();
  if (generation.error) return jsonResponse({ error: 'Could not load generation' }, 503, headers);
  if (!generation.data) return jsonResponse({ error: 'Generation not found' }, 404, headers);
  try {
    let report: IssueReport | null;
    if (submit) {
      const input = issueReportSchema.safeParse(await parseJsonBody(request));
      if (!input.success) return jsonResponse({ error: 'Choose a review method and describe the issue in 10–2000 characters.' }, 400, headers);
      const result = await db.rpc('submit_image_generation_issue', { p_request_id: id, p_owner_id: user.id,
        p_category: input.data.category, p_details: input.data.details, p_review_method: input.data.review_method });
      if (result.error?.code === 'P0001') return jsonResponse({ error: 'Reports are available after commission processing begins.' }, 409, headers);
      if (result.error) throw new Error('submit_failed');
      report = result.data as IssueReport;
      if (report.status === 'pending_ai') report = await reviewIssueWithAi(db, report);
    } else {
      const result = await db.from('image_generation_issue_reports').select('*').eq('request_id', id).eq('owner_id', user.id).maybeSingle();
      if (result.error) throw new Error('load_failed');
      report = result.data as IssueReport | null;
    }
    if (report) report = await handOffExpiredIssue(db, report);
    return jsonResponse({ report: report ? publicIssueReport(report) : null }, 200, headers);
  } catch {
    return jsonResponse({ error: 'Could not load or save the report. Retry to check its status safely.' }, 503, headers);
  }
}
export async function GET(request: Request, context: Context) { return handle(request, context, false); }
export async function POST(request: Request, context: Context) { return handle(request, context, true); }
