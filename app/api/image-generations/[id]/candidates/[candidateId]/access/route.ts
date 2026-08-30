import { CANDIDATE_SIGNED_URL_SECONDS } from '@/lib/imageGenerator/domain';
import { resolveAuthenticatedUser } from '@/lib/requestAuth';
import { jsonResponse } from '@/lib/server/httpJson';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; candidateId: string }> }
): Promise<Response> {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const { id, candidateId } = await context.params;
  const supabase = createServiceRoleClient();
  const candidateResult = await supabase
    .from('image_generation_candidates')
    .select('storage_path,status')
    .eq('id', candidateId)
    .eq('request_id', id)
    .eq('owner_id', user.id)
    .in('status', ['review', 'approved'])
    .maybeSingle();
  if (candidateResult.error) return jsonResponse({ error: 'Could not authorize candidate' }, 500);
  if (!candidateResult.data) return jsonResponse({ error: 'Candidate not found' }, 404);
  const signed = await supabase.storage
    .from('image-generation-candidates')
    .createSignedUrl(candidateResult.data.storage_path, CANDIDATE_SIGNED_URL_SECONDS);
  if (signed.error) return jsonResponse({ error: 'Could not create candidate access URL' }, 500);
  return jsonResponse(
    { url: signed.data.signedUrl, expires_in: CANDIDATE_SIGNED_URL_SECONDS },
    200,
    { 'Cache-Control': 'private, no-store' }
  );
}
