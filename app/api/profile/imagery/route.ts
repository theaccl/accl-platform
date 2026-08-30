import { placeProfileImageSchema, parseJsonBody } from '@/lib/imageGenerator/api';
import { createProfileStillDerivative } from '@/lib/imageGenerator/derivatives';
import type { ImageGenerationCandidateRow } from '@/lib/imageGenerator/domain';
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
    const parsed = placeProfileImageSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) return jsonResponse({ error: 'Invalid profile imagery placement' }, 400);
    const supabase = createServiceRoleClient();
    const candidateResult = await supabase
      .from('image_generation_candidates')
      .select('id,request_id,owner_id,ordinal,status,storage_path,mime_type,byte_size,width,height,moderation_status,created_at')
      .eq('id', parsed.data.candidate_id)
      .eq('owner_id', user.id)
      .eq('status', 'approved')
      .maybeSingle();
    if (candidateResult.error) return jsonResponse({ error: 'Could not load approved candidate' }, 500);
    if (!candidateResult.data) return jsonResponse({ error: 'Approved candidate not found' }, 404);
    const candidate = candidateResult.data as ImageGenerationCandidateRow;
    const downloaded = await supabase.storage
      .from('image-generation-candidates')
      .download(candidate.storage_path);
    if (downloaded.error) return jsonResponse({ error: 'Could not read private candidate' }, 500);

    let derivative;
    try {
      derivative = await createProfileStillDerivative(
        new Uint8Array(await downloaded.data.arrayBuffer()),
        parsed.data.surface
      );
    } catch {
      return jsonResponse({ error: 'Could not create a safe profile still image' }, 422);
    }

    const bucket = parsed.data.surface === 'profile_image' ? 'profile-avatars' : 'profile-backgrounds';
    const path = `${user.id}/generated/${candidate.id}/${derivative.version}-${parsed.data.surface}.${derivative.extension}`;
    const published = await supabase.storage.from(bucket).upload(path, derivative.bytes, {
      contentType: derivative.mimeType,
      cacheControl: '31536000',
      upsert: true,
    });
    if (published.error) return jsonResponse({ error: 'Could not publish profile still image' }, 500);

    const placed = await supabase.rpc('place_approved_profile_image', {
      p_owner_id: user.id,
      p_candidate_id: candidate.id,
      p_surface: parsed.data.surface,
      p_published_storage_path: path,
      p_derivative_format: derivative.extension,
      p_derivative_width: derivative.width,
      p_derivative_height: derivative.height,
      p_derivative_byte_size: derivative.byteSize,
      p_derivative_version: derivative.version,
    });
    if (placed.error) {
      return jsonResponse({ error: 'Could not finish profile imagery placement' }, 409);
    }
    return jsonResponse({ placement: placed.data });
  } finally {
    guard.release();
  }
}
