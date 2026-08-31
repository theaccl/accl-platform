import { resolveCosmeticMotion, type CosmeticMotionContext, type CosmeticMotionSurface } from '@/lib/imageGenerator/motionPolicy';
import { resolveAuthenticatedUser } from '@/lib/requestAuth';
import { jsonResponse } from '@/lib/server/httpJson';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

const surfaces = new Set<CosmeticMotionSurface>(['profile_icon', 'profile_background', 'badge', 'relic', 'reward']);
const contexts = new Set<CosmeticMotionContext>(['owner_profile', 'visitor_profile', 'community', 'chat', 'game']);

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const url = new URL(request.url);
  const surface = url.searchParams.get('surface') as CosmeticMotionSurface | null;
  const requestedContext = url.searchParams.get('context') as CosmeticMotionContext | null;
  if (!surface || !surfaces.has(surface) || !requestedContext || !contexts.has(requestedContext)) {
    return jsonResponse({ error: 'Invalid motion-policy request' }, 400);
  }
  const { id: profileId } = await context.params;
  const viewer = await resolveAuthenticatedUser(request);
  const effectiveContext = requestedContext === 'owner_profile' && viewer?.id !== profileId
    ? 'visitor_profile'
    : requestedContext;
  const tierResult = await createServiceRoleClient().rpc('effective_image_generator_tier', {
    p_user_id: profileId,
  });
  if (tierResult.error || typeof tierResult.data !== 'string') {
    return jsonResponse({ error: 'Could not resolve motion policy' }, 404);
  }
  const decision = resolveCosmeticMotion({
    tier: tierResult.data as 'free' | 'plus' | 'pro' | 'internal_unlimited',
    surface,
    context: effectiveContext,
    reducedMotion: url.searchParams.get('reduced_motion') === 'true',
    // Public motion stays off until a trusted per-surface authorization record exists.
    explicitlyAuthorizedPublicSurface: false,
  });
  return jsonResponse({ ...decision, surface, context: effectiveContext }, 200, {
    'Cache-Control': 'private, no-store',
  });
}
