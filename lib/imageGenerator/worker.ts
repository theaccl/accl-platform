import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  extensionForMimeType,
  type ImageGenerationReferenceRow,
} from '@/lib/imageGenerator/domain';
import { parseClaimedRequest, type ImageGenerationProvider } from '@/lib/imageGenerator/provider';
import {
  moderateImagePrompt,
  validateGeneratedCandidateSafety,
} from '@/lib/imageGenerator/safety';

export type ImageGenerationProcessResult = {
  claimed: boolean;
  request_id?: string;
  final_status?: 'queued' | 'review' | 'failed';
  candidate_count?: number;
  retry_after_seconds?: number;
  error?: string;
};

const MAX_QUEUE_ATTEMPTS = 3;

async function disposeReferenceImages(
  supabase: SupabaseClient,
  references: Array<{ id: string; storagePath: string }>
): Promise<void> {
  if (references.length === 0) return;
  const removed = await supabase.storage
    .from('image-generation-references')
    .remove(references.map((reference) => reference.storagePath));
  await supabase
    .from('image_generation_references')
    .update({
      status: removed.error ? 'cleanup_pending' : 'deleted',
      deleted_at: removed.error ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('id', references.map((reference) => reference.id));
}

export function isTransientImageGenerationError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return [
    'timeout',
    'timed out',
    'rate limit',
    '429',
    '500',
    '502',
    '503',
    '504',
    'fetch failed',
    'network',
    'socket',
    'overloaded',
    'temporarily unavailable',
  ].some((signal) => message.includes(signal));
}

export function imageGenerationRetryDelaySeconds(attemptCount: number): number {
  return Math.min(300, 30 * 2 ** Math.max(0, attemptCount - 1));
}

export async function processOneImageGeneration(
  supabase: SupabaseClient,
  provider: ImageGenerationProvider
): Promise<ImageGenerationProcessResult> {
  const claim = await supabase.rpc('claim_next_image_generation_request');
  if (claim.error) return { claimed: false, error: claim.error.message };
  const request = parseClaimedRequest(claim.data);
  if (!request) return { claimed: false };

  const uploadedPaths: string[] = [];
  const consumedReferences: Array<{ id: string; storagePath: string }> = [];
  try {
    const promptSafety = moderateImagePrompt(request.prompt);
    if (!promptSafety.allowed) throw new Error(`prompt_safety_rejected:${promptSafety.code}`);

    const referenceImages: Array<{
      bytes: Uint8Array;
      mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
    }> = [];
    const referenceIds = [request.reference_id, request.reference_id_2].filter(
      (id): id is string => Boolean(id)
    );
    for (const referenceId of referenceIds) {
      const referenceResult = await supabase
        .from('image_generation_references')
        .select('id,owner_id,status,storage_path,mime_type,byte_size,width,height,sha256,expires_at,deleted_at,created_at,updated_at')
        .eq('id', referenceId)
        .eq('owner_id', request.owner_id)
        .eq('status', 'ready')
        .maybeSingle();
      const reference = referenceResult.data as ImageGenerationReferenceRow | null;
      if (referenceResult.error || !reference || new Date(reference.expires_at).getTime() <= Date.now()) {
        throw new Error('reference_image_unavailable');
      }
      consumedReferences.push({ id: reference.id, storagePath: reference.storage_path });
      const downloaded = await supabase.storage
        .from('image-generation-references')
        .download(reference.storage_path);
      if (downloaded.error) throw new Error(`reference_download_failed:${downloaded.error.message}`);
      referenceImages.push({
        bytes: new Uint8Array(await downloaded.data.arrayBuffer()),
        mimeType: reference.mime_type,
      });
    }

    const generated = await provider.generate({
      prompt: request.prompt,
      candidateCount: request.candidate_count,
      requestId: request.id,
      ownerId: request.owner_id,
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
    });
    for (let index = 0; index < generated.length; index++) {
      const candidate = generated[index];
      validateGeneratedCandidateSafety(candidate);
      const digest = createHash('sha256').update(candidate.bytes).digest('hex');
      const storagePath = `${request.owner_id}/${request.id}/${index + 1}-${digest.slice(0, 16)}.${extensionForMimeType(
        candidate.mimeType
      )}`;
      const uploaded = await supabase.storage
        .from('image-generation-candidates')
        .upload(storagePath, candidate.bytes, {
          contentType: candidate.mimeType,
          cacheControl: '0',
          upsert: false,
        });
      if (uploaded.error) throw new Error(`candidate_upload_failed:${uploaded.error.message}`);
      uploadedPaths.push(storagePath);

      const registered = await supabase.rpc('register_image_generation_candidate', {
        p_request_id: request.id,
        p_ordinal: index + 1,
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

    const finalized = await supabase.rpc('finalize_image_generation_request', {
      p_request_id: request.id,
      p_succeeded: true,
      p_failure_code: null,
      p_failure_detail: null,
    });
    if (finalized.error || finalized.data !== true) {
      throw new Error(`request_finalize_failed:${finalized.error?.message ?? 'not_running'}`);
    }
    await disposeReferenceImages(supabase, consumedReferences);
    return {
      claimed: true,
      request_id: request.id,
      final_status: 'review',
      candidate_count: generated.length,
    };
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await supabase.storage.from('image-generation-candidates').remove(uploadedPaths);
    }
    const message = error instanceof Error ? error.message : String(error);
    const retryable = isTransientImageGenerationError(error) && request.attempt_count < MAX_QUEUE_ATTEMPTS;
    const retryAfterSeconds = imageGenerationRetryDelaySeconds(request.attempt_count);
    const finalized = await supabase.rpc('retry_or_fail_image_generation_request', {
      p_request_id: request.id,
      p_failure_code: message.split(':', 1)[0].slice(0, 100),
      p_failure_detail: message.slice(0, 2000),
      p_retryable: retryable,
      p_retry_after_seconds: retryAfterSeconds,
    });
    const finalStatus =
      finalized.data && typeof finalized.data === 'object' && finalized.data.status === 'queued'
        ? 'queued'
        : 'failed';
    if (finalStatus === 'failed') {
      await disposeReferenceImages(supabase, consumedReferences);
    }
    return {
      claimed: true,
      request_id: request.id,
      final_status: finalStatus,
      retry_after_seconds: finalStatus === 'queued' ? retryAfterSeconds : undefined,
      error: finalized.error ? `${message}; retry_finalize_failed:${finalized.error.message}` : message,
    };
  }
}

export async function processImageGenerationBatch(
  supabase: SupabaseClient,
  provider: ImageGenerationProvider,
  batch: number
): Promise<ImageGenerationProcessResult[]> {
  const results: ImageGenerationProcessResult[] = [];
  for (let index = 0; index < Math.min(10, Math.max(1, batch)); index++) {
    const result = await processOneImageGeneration(supabase, provider);
    results.push(result);
    if (!result.claimed) break;
  }
  return results;
}
