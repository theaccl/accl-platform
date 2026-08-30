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
    const { id } = await context.params;
    const result = await createServiceRoleClient().rpc('cancel_image_generation_request', {
      p_owner_id: user.id,
      p_request_id: id,
    });
    if (result.error) return jsonResponse({ error: 'Could not cancel generation' }, 500);
    if (result.data !== true) return jsonResponse({ error: 'Generation cannot be cancelled' }, 409);
    return jsonResponse({ cancelled: true });
  } finally {
    guard.release();
  }
}
