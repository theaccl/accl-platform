import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { extensionForMimeType, type ImageGenerationCandidateRow } from '@/lib/imageGenerator/domain';
import type { ImageGenerationProvider } from '@/lib/imageGenerator/provider';
import { moderateImagePrompt, validateGeneratedCandidateSafety } from '@/lib/imageGenerator/safety';
import { imageGenerationRetryDelaySeconds, isTransientImageGenerationError } from '@/lib/imageGenerator/worker';

type ClaimedRefinement = {
  id: string;
  request_id: string;
  owner_id: string;
  source_candidate_id: string;
  guidance: string;
  candidate_ordinal_start: number;
  attempt_count: number;
};

export type ImageRefinementProcessResult = {
  claimed: boolean;
  refinement_id?: string;
  final_status?: 'queued' | 'review' | 'failed';
  error?: string;
};

function parseClaimedRefinement(value: unknown): ClaimedRefinement | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<ClaimedRefinement>;
  return typeof row.id === 'string' && typeof row.request_id === 'string' &&
    typeof row.owner_id === 'string' && typeof row.source_candidate_id === 'string' &&
    typeof row.guidance === 'string' && typeof row.candidate_ordinal_start === 'number' &&
    typeof row.attempt_count === 'number'
    ? (row as ClaimedRefinement)
    : null;
}

export async function processOneImageRefinement(
  supabase: SupabaseClient,
  provider: ImageGenerationProvider
): Promise<ImageRefinementProcessResult> {
  const claim = await supabase.rpc('claim_next_image_generation_refinement');
  if (claim.error) return { claimed: false, error: claim.error.message };
  const refinement = parseClaimedRefinement(claim.data);
  if (!refinement) return { claimed: false };

  const uploadedPaths: string[] = [];
  try {
    const guidanceSafety = moderateImagePrompt(refinement.guidance);
    if (!guidanceSafety.allowed) throw new Error(`prompt_safety_rejected:${guidanceSafety.code}`);
    const [requestResult, candidateResult] = await Promise.all([
      supabase.from('image_generation_requests').select('prompt,membership_tier').eq('id', refinement.request_id).single(),
      supabase
        .from('image_generation_candidates')
        .select('id,request_id,owner_id,ordinal,status,storage_path,mime_type,byte_size,width,height,moderation_status,created_at')
        .eq('id', refinement.source_candidate_id)
        .eq('request_id', refinement.request_id)
        .eq('owner_id', refinement.owner_id)
        .eq('status', 'review')
        .single(),
    ]);
    if (requestResult.error || !requestResult.data) throw new Error('refinement_request_unavailable');
    if (candidateResult.error || !candidateResult.data) throw new Error('refinement_source_unavailable');
    const sourceCandidate = candidateResult.data as ImageGenerationCandidateRow;
    const downloaded = await supabase.storage
      .from('image-generation-candidates')
      .download(sourceCandidate.storage_path);
    if (downloaded.error) throw new Error(`refinement_source_download_failed:${downloaded.error.message}`);

    const prompt = [
      `Original commission direction: ${requestResult.data.prompt}`,
      `Guided refinement: ${refinement.guidance}`,
      'Preserve the selected identity direction while applying only the requested refinement.',
    ].join('\n\n');
    const generated = await provider.generate({
      prompt,
      candidateCount: 2,
      requestId: refinement.request_id,
      ownerId: refinement.owner_id,
      membershipTier: requestResult.data.membership_tier,
      operation: 'refinement',
      attemptNumber: refinement.attempt_count,
      refinementId: refinement.id,
      referenceImages: [{
        bytes: new Uint8Array(await downloaded.data.arrayBuffer()),
        mimeType: sourceCandidate.mime_type,
      }],
    });

    for (let index = 0; index < generated.length; index++) {
      const candidate = generated[index];
      validateGeneratedCandidateSafety(candidate);
      const digest = createHash('sha256').update(candidate.bytes).digest('hex');
      const ordinal = refinement.candidate_ordinal_start + index;
      const storagePath = `${refinement.owner_id}/${refinement.request_id}/refinement-${refinement.id}-${ordinal}-${digest.slice(0, 16)}.${extensionForMimeType(candidate.mimeType)}`;
      const uploaded = await supabase.storage.from('image-generation-candidates').upload(
        storagePath,
        candidate.bytes,
        { contentType: candidate.mimeType, cacheControl: '0', upsert: false }
      );
      if (uploaded.error) throw new Error(`candidate_upload_failed:${uploaded.error.message}`);
      uploadedPaths.push(storagePath);
      const registered = await supabase.rpc('register_image_generation_refinement_candidate', {
        p_refinement_id: refinement.id,
        p_ordinal: ordinal,
        p_storage_path: storagePath,
        p_mime_type: candidate.mimeType,
        p_byte_size: candidate.bytes.byteLength,
        p_width: candidate.width ?? null,
        p_height: candidate.height ?? null,
        p_sha256: digest,
        p_moderation_status: 'approved',
      });
      if (registered.error) throw new Error(`candidate_register_failed:${registered.error.message}`);
    }

    const finalized = await supabase.rpc('finalize_image_generation_refinement', {
      p_refinement_id: refinement.id,
      p_succeeded: true,
      p_failure_code: null,
      p_failure_detail: null,
    });
    if (finalized.error || finalized.data !== true) {
      throw new Error(`refinement_finalize_failed:${finalized.error?.message ?? 'not_running'}`);
    }
    return { claimed: true, refinement_id: refinement.id, final_status: 'review' };
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await supabase.storage.from('image-generation-candidates').remove(uploadedPaths);
    }
    const message = error instanceof Error ? error.message : String(error);
    const retryable = isTransientImageGenerationError(error) && refinement.attempt_count < 3;
    const finalized = await supabase.rpc('retry_or_fail_image_generation_refinement', {
      p_refinement_id: refinement.id,
      p_failure_code: message.split(':', 1)[0].slice(0, 100),
      p_failure_detail: message.slice(0, 2000),
      p_retryable: retryable,
      p_retry_after_seconds: imageGenerationRetryDelaySeconds(refinement.attempt_count),
    });
    const finalStatus = finalized.data && typeof finalized.data === 'object' &&
      finalized.data.status === 'queued' ? 'queued' : 'failed';
    return {
      claimed: true,
      refinement_id: refinement.id,
      final_status: finalStatus,
      error: finalized.error ? `${message}; retry_finalize_failed:${finalized.error.message}` : message,
    };
  }
}

export async function processImageRefinementBatch(
  supabase: SupabaseClient,
  provider: ImageGenerationProvider,
  batch: number
): Promise<ImageRefinementProcessResult[]> {
  const results: ImageRefinementProcessResult[] = [];
  for (let index = 0; index < Math.min(10, Math.max(1, batch)); index++) {
    const result = await processOneImageRefinement(supabase, provider);
    results.push(result);
    if (!result.claimed) break;
  }
  return results;
}
