import { createGenerationSchema, parseJsonBody } from '@/lib/imageGenerator/api';
import {
  DEFAULT_IMAGE_GENERATION_MODEL,
  IMAGE_GENERATION_PROVIDER,
} from '@/lib/imageGenerator/provider';
import { moderateImagePrompt } from '@/lib/imageGenerator/safety';
import { resolveAuthenticatedUser } from '@/lib/requestAuth';
import { jsonResponse } from '@/lib/server/httpJson';
import { guardRequest } from '@/lib/server/requestGuard';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const guard = guardRequest(request, 'image_generation');
  if (!guard.ok) return guard.response;
  try {
    const user = await resolveAuthenticatedUser(request);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
    const parsed = createGenerationSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) return jsonResponse({ error: 'Invalid generation request' }, 400);
    const promptSafety = moderateImagePrompt(parsed.data.prompt);
    if (!promptSafety.allowed) {
      return jsonResponse(
        { error: 'This prompt cannot be used for ACCL profile imagery', code: promptSafety.code },
        422
      );
    }
    const idempotencyKey = request.headers.get('idempotency-key')?.trim() ?? '';
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      return jsonResponse({ error: 'Idempotency-Key header must be 8–200 characters' }, 400);
    }

    const supabase = createServiceRoleClient();
    const provider = IMAGE_GENERATION_PROVIDER;
    const model = process.env.ACCL_IMAGE_GENERATION_MODEL?.trim() || DEFAULT_IMAGE_GENERATION_MODEL;
    const result = await supabase.rpc('create_image_generation_request', {
      p_owner_id: user.id,
      p_prompt: parsed.data.prompt,
      p_candidate_count: parsed.data.candidate_count,
      p_idempotency_key: idempotencyKey,
      p_reference_id: parsed.data.reference_id ?? null,
      p_provider: provider,
      p_model: model,
    });
    if (result.error) {
      if (result.error.code === '42501' || result.error.message.includes('entitlement required')) {
        return jsonResponse({ error: 'Image Generator requires an active Pro entitlement' }, 403);
      }
      if (result.error.message.includes('idempotency key reused')) {
        return jsonResponse({ error: 'Idempotency-Key was already used for a different request' }, 409);
      }
      return jsonResponse({ error: 'Could not queue image generation' }, 500);
    }
    return jsonResponse({ generation: result.data }, 202);
  } finally {
    guard.release();
  }
}
