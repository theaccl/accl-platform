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
    const normalizedEmail = user.email?.trim().toLowerCase() ?? '';
    const [entitlement, internalGrant, tokenAccount] = await Promise.all([
      supabase
        .from('membership_entitlements')
        .select('status,valid_until')
        .eq('user_id', user.id)
        .eq('entitlement', 'image_generator')
        .maybeSingle(),
      supabase
        .from('internal_generator_unlimited_grants')
        .select('status,user_id')
        .eq('email_normalized', normalizedEmail)
        .eq('status', 'active')
        .maybeSingle(),
      supabase
        .from('generation_token_accounts')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);
    const active =
      (!entitlement.error &&
        entitlement.data?.status === 'active' &&
        (!entitlement.data.valid_until || new Date(entitlement.data.valid_until).getTime() > Date.now())) ||
      (!internalGrant.error &&
        normalizedEmail.length > 0 &&
        Boolean(user.email_confirmed_at) &&
        internalGrant.data?.status === 'active' &&
        (internalGrant.data.user_id === null || internalGrant.data.user_id === user.id)) ||
      (!tokenAccount.error && (tokenAccount.data?.balance ?? 0) > 0);
    if (!active) return jsonResponse({ error: 'Image Generator access is required' }, 403);

    let sanitized;
    try {
      sanitized = await sanitizeReferenceImage(new Uint8Array(await file.arrayBuffer()), file.type);
    } catch {
      return jsonResponse({ error: 'The reference image could not be safely processed' }, 422);
    }

    const id = randomUUID();
    const storagePath = `${user.id}/${id}-${sanitized.sha256.slice(0, 16)}.webp`;
    const pendingUploadExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const inserted = await supabase
      .from('image_generation_references')
      .insert({
        id,
        owner_id: user.id,
        status: 'pending_upload',
        storage_path: storagePath,
        mime_type: sanitized.mimeType,
        byte_size: sanitized.bytes.byteLength,
        width: sanitized.width,
        height: sanitized.height,
        sha256: sanitized.sha256,
        expires_at: pendingUploadExpiresAt,
      })
      .select('id')
      .single();
    if (inserted.error) {
      return jsonResponse({ error: 'Could not register the private reference image' }, 500);
    }

    const uploaded = await supabase.storage
      .from('image-generation-references')
      .upload(storagePath, sanitized.bytes, {
        contentType: sanitized.mimeType,
        cacheControl: '0',
        upsert: false,
      });
    if (uploaded.error) {
      const removed = await supabase.storage.from('image-generation-references').remove([storagePath]);
      await supabase
        .from('image_generation_references')
        .update({
          status: removed.error ? 'cleanup_pending' : 'deleted',
          expires_at: new Date().toISOString(),
          deleted_at: removed.error ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('owner_id', user.id)
        .eq('status', 'pending_upload');
      return jsonResponse({ error: 'Could not store the private reference image' }, 500);
    }

    const ready = await supabase
      .from('image_generation_references')
      .update({
        status: 'ready',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('owner_id', user.id)
      .eq('status', 'pending_upload')
      .select('id,mime_type,byte_size,width,height,expires_at')
      .single();
    if (ready.error) {
      const removed = await supabase.storage.from('image-generation-references').remove([storagePath]);
      await supabase
        .from('image_generation_references')
        .update({
          status: removed.error ? 'cleanup_pending' : 'deleted',
          expires_at: new Date().toISOString(),
          deleted_at: removed.error ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('owner_id', user.id);
      return jsonResponse({ error: 'Could not activate the private reference image' }, 500);
    }

    return jsonResponse(
      { reference: ready.data },
      201,
      { 'Cache-Control': 'private, no-store' }
    );
  } finally {
    guard.release();
  }
}
