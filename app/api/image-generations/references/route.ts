import { randomUUID } from 'node:crypto';

import { REFERENCE_IMAGE_MAX_BYTES } from '@/lib/imageGenerator/domain';
import { acceptedReferenceImageMimeType, sanitizeReferenceImage } from '@/lib/imageGenerator/referenceImage';
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
    const formData = await request.formData().catch(() => null);
    const file = formData?.get('reference');
    if (!(file instanceof File)) return jsonResponse({ error: 'Reference image is required' }, 400);
    if (!acceptedReferenceImageMimeType(file.type) || file.size < 8 || file.size > REFERENCE_IMAGE_MAX_BYTES) {
      return jsonResponse({ error: 'Use a PNG, JPEG, or WebP image up to 4 MB' }, 400);
    }

    const supabase = createServiceRoleClient();
    const entitlement = await supabase
      .from('membership_entitlements')
      .select('status,valid_until')
      .eq('user_id', user.id)
      .eq('entitlement', 'image_generator')
      .maybeSingle();
    const active =
      !entitlement.error &&
      entitlement.data?.status === 'active' &&
      (!entitlement.data.valid_until || new Date(entitlement.data.valid_until).getTime() > Date.now());
    if (!active) return jsonResponse({ error: 'Image Generator requires an active Pro entitlement' }, 403);

    let sanitized;
    try {
      sanitized = await sanitizeReferenceImage(new Uint8Array(await file.arrayBuffer()), file.type);
    } catch {
      return jsonResponse({ error: 'The reference image could not be safely processed' }, 422);
    }

    const id = randomUUID();
    const storagePath = `${user.id}/${id}-${sanitized.sha256.slice(0, 16)}.webp`;
    const uploaded = await supabase.storage
      .from('image-generation-references')
      .upload(storagePath, sanitized.bytes, {
        contentType: sanitized.mimeType,
        cacheControl: '0',
        upsert: false,
      });
    if (uploaded.error) return jsonResponse({ error: 'Could not store the private reference image' }, 500);

    const inserted = await supabase
      .from('image_generation_references')
      .insert({
        id,
        owner_id: user.id,
        storage_path: storagePath,
        mime_type: sanitized.mimeType,
        byte_size: sanitized.bytes.byteLength,
        width: sanitized.width,
        height: sanitized.height,
        sha256: sanitized.sha256,
      })
      .select('id,mime_type,byte_size,width,height,expires_at')
      .single();
    if (inserted.error) {
      await supabase.storage.from('image-generation-references').remove([storagePath]);
      return jsonResponse({ error: 'Could not register the private reference image' }, 500);
    }

    return jsonResponse(
      { reference: inserted.data },
      201,
      { 'Cache-Control': 'private, no-store' }
    );
  } finally {
    guard.release();
  }
}
