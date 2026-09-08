import { z } from 'zod';
import { parseJsonBody } from '@/lib/imageGenerator/api';
import { resolveIssue } from '@/lib/imageGenerator/issueReview';
import { manualIssueDecisionSchema, publicIssueReport } from '@/lib/imageGenerator/issueReviewPolicy';
import { requireModerator } from '@/lib/moderatorAuth';
import { jsonResponse } from '@/lib/server/httpJson';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

type Context = { params: Promise<{ id: string }> };
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request, context: Context) {
  const guard = await requireModerator(request);
  if (!guard.ok) return jsonResponse({ error: guard.error }, guard.status, headers);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return jsonResponse({ error: 'Invalid report' }, 400, headers);
  const db = createServiceRoleClient();
  const report = await db.from('image_generation_issue_reports').select('*').eq('id', id).maybeSingle();
  if (report.error) return jsonResponse({ error: 'Could not load report' }, 503, headers);
  if (!report.data) return jsonResponse({ error: 'Report not found' }, 404, headers);
  const [generation, candidates, refinements] = await Promise.all([
    db.from('image_generation_requests').select('prompt,status,reference_id,reference_id_2,parent_saved_creation_id')
      .eq('id', report.data.request_id).eq('owner_id', report.data.owner_id).single(),
    db.from('image_generation_candidates').select('id,ordinal,status,storage_path')
      .eq('request_id', report.data.request_id).eq('owner_id', report.data.owner_id).order('ordinal'),
    db.from('image_generation_refinements').select('guidance,status')
      .eq('request_id', report.data.request_id).eq('owner_id', report.data.owner_id),
  ]);
  if (generation.error || candidates.error || refinements.error) return jsonResponse({ error: 'Could not load review evidence' }, 503, headers);
  const images = await Promise.all((candidates.data ?? []).map(async (candidate) => {
    const allowed = !['deleted', 'expired'].includes(candidate.status)
      && candidate.storage_path.startsWith(`${report.data.owner_id}/${report.data.request_id}/`);
    const signed = allowed ? await db.storage.from('image-generation-candidates').createSignedUrl(candidate.storage_path, 60) : null;
    return { id: candidate.id, ordinal: candidate.ordinal, status: candidate.status, url: signed?.data?.signedUrl ?? null };
  }));
  return jsonResponse({ report: publicIssueReport(report.data), generation: generation.data, refinements: refinements.data,
    images, ai_assessment: report.data.ai_assessment }, 200, headers);
}

export async function POST(request: Request, context: Context) {
  const guard = await requireModerator(request);
  if (!guard.ok) return jsonResponse({ error: guard.error }, guard.status, headers);
  const { id } = await context.params;
  const input = manualIssueDecisionSchema.safeParse(await parseJsonBody(request));
  if (!z.string().uuid().safeParse(id).success || !input.success) return jsonResponse({ error: 'Provide a decision and a reason in 10–1000 characters.' }, 400, headers);
  try {
    const report = await resolveIssue(createServiceRoleClient(), id, input.data.decision, 'manual', guard.userId, input.data.note);
    return jsonResponse({ report: publicIssueReport(report) }, 200, headers);
  } catch {
    return jsonResponse({ error: 'Could not save the decision. Retry safely.' }, 503, headers);
  }
}
