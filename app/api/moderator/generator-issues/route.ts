import { requireModerator } from '@/lib/moderatorAuth';
import { jsonResponse } from '@/lib/server/httpJson';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export async function GET(request: Request) {
  const guard = await requireModerator(request);
  if (!guard.ok) return jsonResponse({ error: guard.error }, guard.status);
  const db = createServiceRoleClient();
  const result = await db.from('image_generation_issue_reports')
    .select('id,request_id,category,details,review_method,status,created_at,resolution_note')
    .in('status', ['pending_ai', 'reviewing_ai', 'pending_manual']).order('created_at').limit(50);
  return jsonResponse(result.error ? { error: 'Could not load reports' } : { reports: result.data }, result.error ? 503 : 200,
    { 'Cache-Control': 'private, no-store' });
}
