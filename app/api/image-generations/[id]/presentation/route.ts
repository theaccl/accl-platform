import { imageGenerationReviewExpired, type ImageGenerationStatus } from '@/lib/imageGenerator/domain';
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
    const supabase = createServiceRoleClient();
    const generationResult = await supabase
      .from('image_generation_requests')
      .select('id,status,review_expires_at')
      .eq('id', id)
      .eq('owner_id', user.id)
      .maybeSingle();

    if (generationResult.error) {
      return jsonResponse({ error: 'Could not prepare candidate presentation' }, 500);
    }
    if (!generationResult.data) return jsonResponse({ error: 'Generation not found' }, 404);
    if (
      imageGenerationReviewExpired(
        generationResult.data.status as ImageGenerationStatus,
        generationResult.data.review_expires_at
      )
    ) {
      return jsonResponse({ error: 'Review window expired' }, 410);
    }
    if (generationResult.data.status !== 'review') {
      return jsonResponse({ error: 'Generation is not available for presentation' }, 409);
    }

    const presentedAt = new Date().toISOString();
    const claimResult = await supabase
      .from('image_generation_candidates')
      .update({ first_presented_at: presentedAt })
      .eq('request_id', id)
      .eq('owner_id', user.id)
      .eq('status', 'review')
      .is('first_presented_at', null)
      .select('id');

    if (claimResult.error) {
      return jsonResponse({ error: 'Could not prepare candidate presentation' }, 500);
    }

    return jsonResponse(
      {
        first_presentation_candidate_ids: (claimResult.data ?? []).map((candidate) => candidate.id),
        presented_at: presentedAt,
      },
      200,
      { 'Cache-Control': 'private, no-store' }
    );
  } finally {
    guard.release();
  }
}
