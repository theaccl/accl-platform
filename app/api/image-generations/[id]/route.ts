import { publicCandidate, type ImageGenerationCandidateRow } from '@/lib/imageGenerator/domain';
import { resolveAuthenticatedUser } from '@/lib/requestAuth';
import { jsonResponse } from '@/lib/server/httpJson';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await resolveAuthenticatedUser(_request);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const { id } = await context.params;
  const supabase = createServiceRoleClient();
  const generationResult = await supabase
    .from('image_generation_requests')
    .select('id,owner_id,status,provider,model,candidate_count,attempt_count,review_expires_at,created_at,updated_at,failure_code')
    .eq('id', id)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (generationResult.error) return jsonResponse({ error: 'Could not load generation' }, 500);
  if (!generationResult.data) return jsonResponse({ error: 'Generation not found' }, 404);
  const candidatesResult = await supabase
    .from('image_generation_candidates')
    .select('id,request_id,owner_id,ordinal,status,storage_path,mime_type,byte_size,width,height,moderation_status,created_at')
    .eq('request_id', id)
    .eq('owner_id', user.id)
    .order('ordinal');
  if (candidatesResult.error) return jsonResponse({ error: 'Could not load candidates' }, 500);
  return jsonResponse({
    generation: generationResult.data,
    candidates: ((candidatesResult.data ?? []) as ImageGenerationCandidateRow[]).map(publicCandidate),
  });
}
