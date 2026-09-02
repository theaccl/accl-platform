import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { recordPlacementDerivativeSetCosts } from '@/lib/imageGenerator/costAccounting';
import { createProfileStillDerivative } from '@/lib/imageGenerator/derivatives';
import type { ImageGenerationCandidateRow } from '@/lib/imageGenerator/domain';
import { resolveAuthenticatedUser } from '@/lib/requestAuth';
import { jsonResponse } from '@/lib/server/httpJson';
import { guardRequest } from '@/lib/server/requestGuard';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

const placementSetSchema = z.object({ candidate_id: z.string().uuid() });

export async function POST(request: Request): Promise<Response> {
  const guard = guardRequest(request, 'image_generation');
  if (!guard.ok) return guard.response;
  try {
    const user = await resolveAuthenticatedUser(request);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
    const parsed = placementSetSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonResponse({ error: 'Invalid matching-set placement' }, 400);

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
    const source = new Uint8Array(await downloaded.data.arrayBuffer());

    let iconResult;
    let backgroundResult;
    try {
      [iconResult, backgroundResult] = await Promise.all([
        (async () => {
          const startedAt = Date.now();
          const derivative = await createProfileStillDerivative(source, 'profile_image');
          return { derivative, measuredDurationMs: Math.max(0, Date.now() - startedAt) };
        })(),
        (async () => {
          const startedAt = Date.now();
          const derivative = await createProfileStillDerivative(source, 'profile_background');
          return { derivative, measuredDurationMs: Math.max(0, Date.now() - startedAt) };
        })(),
      ]);
    } catch {
      return jsonResponse({ error: 'Could not create the coordinated profile set' }, 422);
    }

    const placementId = randomUUID();
    const icon = iconResult.derivative;
    const background = backgroundResult.derivative;
    try {
      await recordPlacementDerivativeSetCosts(supabase, {
        requestId: candidate.request_id,
        candidateId: candidate.id,
        runId: placementId,
        derivatives: [
          {
            surface: 'profile_image',
            derivativeVersion: icon.version,
            measuredDurationMs: iconResult.measuredDurationMs,
            outputBytes: icon.byteSize,
          },
          {
            surface: 'profile_background',
            derivativeVersion: background.version,
            measuredDurationMs: backgroundResult.measuredDurationMs,
            outputBytes: background.byteSize,
          },
        ],
      });
    } catch {
      return jsonResponse({ error: 'Could not audit coordinated profile processing' }, 500);
    }

    const iconPath = `${user.id}/generated/${candidate.id}/${icon.version}-profile_image-${placementId}.${icon.extension}`;
    const backgroundPath = `${user.id}/generated/${candidate.id}/${background.version}-profile_background-${placementId}.${background.extension}`;
    const [iconUpload, backgroundUpload] = await Promise.all([
      supabase.storage.from('profile-avatars').upload(iconPath, icon.bytes, {
        contentType: icon.mimeType,
        cacheControl: '31536000',
        upsert: true,
      }),
      supabase.storage.from('profile-backgrounds').upload(backgroundPath, background.bytes, {
        contentType: background.mimeType,
        cacheControl: '31536000',
        upsert: true,
      }),
    ]);
    if (iconUpload.error || backgroundUpload.error) {
      await Promise.all([
        iconUpload.error ? Promise.resolve() : supabase.storage.from('profile-avatars').remove([iconPath]),
        backgroundUpload.error
          ? Promise.resolve()
          : supabase.storage.from('profile-backgrounds').remove([backgroundPath]),
      ]);
      return jsonResponse({ error: 'Could not publish the coordinated profile set' }, 500);
    }

    const placed = await supabase.rpc('place_approved_profile_image_set', {
      p_owner_id: user.id,
      p_candidate_id: candidate.id,
      p_icon_storage_path: iconPath,
      p_icon_byte_size: icon.byteSize,
      p_background_storage_path: backgroundPath,
      p_background_byte_size: background.byteSize,
    });
    if (placed.error) {
      await Promise.all([
        supabase.storage.from('profile-avatars').remove([iconPath]),
        supabase.storage.from('profile-backgrounds').remove([backgroundPath]),
      ]);
      if (placed.error.message.includes('requires Pro')) {
        return jsonResponse({ error: 'Matching icon and background placement requires Pro' }, 403);
      }
      return jsonResponse({ error: 'Could not finish the coordinated profile set' }, 409);
    }

    return jsonResponse({ placements: placed.data });
  } finally {
    guard.release();
  }
}
