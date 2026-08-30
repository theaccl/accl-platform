import { approveCandidateSchema, parseJsonBody } from '@/lib/imageGenerator/api';
import { resolveAuthenticatedUser } from '@/lib/requestAuth';
import { jsonResponse } from '@/lib/server/httpJson';
import { guardRequest } from '@/lib/server/requestGuard';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const guard = guardRequest(request, 'image_generation');
  if (!guard.ok) return guard.response;
  try {
    const user = await resolveAuthenticatedUser(request);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
    const parsed = approveCandidateSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) return jsonResponse({ error: 'Invalid candidate approval' }, 400);
    const { id } = await context.params;
    const result = await createServiceRoleClient().rpc('approve_image_generation_candidate', {
      p_owner_id: user.id,
      p_request_id: id,
      p_candidate_id: parsed.data.candidate_id,
    });
    if (result.error) {
      if (result.error.message.includes('not found')) return jsonResponse({ error: 'Generation not found' }, 404);
      return jsonResponse({ error: 'Candidate cannot be approved' }, 409);
    }
    if (
      result.data &&
      typeof result.data === 'object' &&
      'error' in result.data &&
      result.data.error === 'review_window_expired'
    ) {
      return jsonResponse({ error: 'Review window expired' }, 409);
    }
    return jsonResponse({ candidate: result.data });
  } finally {
    guard.release();
  }
}
