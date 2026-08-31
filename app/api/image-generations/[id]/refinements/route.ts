import { createRefinementSchema, parseJsonBody } from '@/lib/imageGenerator/api';
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
    const idempotencyKey = request.headers.get('idempotency-key')?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      return jsonResponse({ error: 'A valid idempotency key is required' }, 400);
    }
    const parsed = createRefinementSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) return jsonResponse({ error: 'Invalid guided refinement' }, 400);
    const { id } = await context.params;
    const result = await createServiceRoleClient().rpc('create_image_generation_refinement', {
      p_owner_id: user.id,
      p_request_id: id,
      p_source_candidate_id: parsed.data.source_candidate_id,
      p_guidance: parsed.data.guidance,
      p_idempotency_key: idempotencyKey,
    });
    if (result.error) {
      if (result.error.message.includes('not found')) {
        return jsonResponse({ error: 'Generation not found' }, 404);
      }
      if (result.error.message.includes('requires Plus or Pro')) {
        return jsonResponse({ error: 'Guided refinement requires Plus or Pro' }, 403);
      }
      if (result.error.message.includes('allowance exhausted')) {
        return jsonResponse({ error: 'Guided refinement allowance exhausted' }, 409);
      }
      if (result.error.message.includes('already processing')) {
        return jsonResponse({ error: 'Another guided refinement is already processing' }, 409);
      }
      return jsonResponse({ error: 'Could not begin guided refinement' }, 409);
    }
    return jsonResponse({ refinement: result.data }, 201, { 'Cache-Control': 'private, no-store' });
  } finally {
    guard.release();
  }
}
