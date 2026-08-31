import { createGenerationSchema, parseJsonBody } from '@/lib/imageGenerator/api';
import { configuredImageGenerationProvider } from '@/lib/imageGenerator/provider';
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
    const parsed = createGenerationSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) return jsonResponse({ error: 'Invalid saved-creation evolution' }, 400);
    const provider = configuredImageGenerationProvider();
    const { id } = await context.params;
    const result = await createServiceRoleClient().rpc('create_saved_creation_evolution', {
      p_owner_id: user.id,
      p_saved_creation_id: id,
      p_prompt: parsed.data.prompt,
      p_idempotency_key: idempotencyKey,
      p_reference_ids: parsed.data.reference_ids ?? [],
      p_provider: provider?.name ?? 'vercel_ai_gateway',
      p_model: provider?.model ?? process.env.ACCL_IMAGE_GENERATION_MODEL?.trim() ?? 'openai/gpt-image-2',
    });
    if (result.error) {
      if (result.error.message.includes('requires Pro')) {
        return jsonResponse({ error: 'Further This Creation requires Pro' }, 403);
      }
      if (result.error.message.includes('insufficient generation tokens')) {
        return jsonResponse({ error: 'insufficient_generation_tokens' }, 409);
      }
      if (result.error.message.includes('not found')) {
        return jsonResponse({ error: 'Saved Creation not found' }, 404);
      }
      return jsonResponse({ error: 'Could not further this Saved Creation' }, 409);
    }
    return jsonResponse({ generation: result.data }, 201, { 'Cache-Control': 'private, no-store' });
  } finally {
    guard.release();
  }
}
