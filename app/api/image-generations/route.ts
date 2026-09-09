import { composePlayerPrompt } from '@/lib/imageGenerator/promptOptions';
import { GENERATOR_TIER_CONTRACTS, isGeneratorMembershipTier } from '@/lib/imageGenerator/membership';
import { createGenerationSchema, parseJsonBody } from '@/lib/imageGenerator/api';
import {
  DEFAULT_IMAGE_GENERATION_MODEL,
  IMAGE_GENERATION_PROVIDER,
  configuredImageGenerationProvider,
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
    const playerPrompt = composePlayerPrompt(parsed.data.prompt, parsed.data.style, false);
    const promptSafety = moderateImagePrompt(playerPrompt);
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
    const tierResult = await supabase.rpc('effective_image_generator_tier', {
      p_user_id: user.id,
    });
    if (tierResult.error) return jsonResponse({ error: 'Could not verify generator access' }, 500);
    if (!isGeneratorMembershipTier(tierResult.data)) return jsonResponse({ error: 'Unrecognized membership tier' }, 503);
    const candidateCount = GENERATOR_TIER_CONTRACTS[tierResult.data].initialCandidates;
    const referenceIds = parsed.data.reference_ids ??
      (parsed.data.reference_id ? [parsed.data.reference_id] : []);
    const configuredProvider = configuredImageGenerationProvider();
    const provider = configuredProvider?.name ?? IMAGE_GENERATION_PROVIDER;
    const model = configuredProvider?.model ?? (process.env.ACCL_IMAGE_GENERATION_MODEL?.trim() || DEFAULT_IMAGE_GENERATION_MODEL);
    const result = await supabase.rpc('create_image_generation_request_with_references', {
      p_owner_id: user.id,
      p_prompt: playerPrompt,
      p_candidate_count: candidateCount,
      p_idempotency_key: idempotencyKey,
      p_reference_ids: referenceIds,
      p_provider: provider,
      p_model: model,
    });
    if (result.error) {
      if (result.error.code === '42501' || result.error.message.includes('entitlement required')) {
        return jsonResponse({ error: 'Image Generator access is required' }, 403);
      }
      if (result.error.message.includes('insufficient generation tokens')) {
        return jsonResponse(
          { error: 'You need one ACCL Generation Token to begin this commission', code: 'insufficient_generation_tokens' },
          409
        );
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
