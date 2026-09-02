import type { SupabaseClient } from '@supabase/supabase-js';

type StorageCleanupJob = {
  id: number;
  bucket: 'image-generation-candidates';
  storage_path: string;
  attempt_count: number;
};

export type StorageCleanupSummary = {
  claimed: number;
  completed: number;
  failed: number;
  claim_error: string | null;
  finalize_errors: string[];
};

function parseStorageCleanupJob(value: unknown): StorageCleanupJob | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<StorageCleanupJob>;
  if (
    typeof row.id !== 'number' ||
    row.bucket !== 'image-generation-candidates' ||
    typeof row.storage_path !== 'string' ||
    row.storage_path.length === 0 ||
    typeof row.attempt_count !== 'number'
  ) {
    return null;
  }
  return row as StorageCleanupJob;
}

export async function processImageGenerationStorageCleanup(
  supabase: SupabaseClient,
  limit = 20
): Promise<StorageCleanupSummary> {
  const claimed = await supabase.rpc('claim_image_generation_storage_cleanup_jobs', {
    p_limit: Math.max(1, Math.min(100, Math.trunc(limit))),
    p_stale_after_seconds: 600,
  });
  if (claimed.error) {
    return {
      claimed: 0,
      completed: 0,
      failed: 0,
      claim_error: claimed.error.message,
      finalize_errors: [],
    };
  }

  const jobs = (Array.isArray(claimed.data) ? claimed.data : [])
    .map(parseStorageCleanupJob)
    .filter((job): job is StorageCleanupJob => job !== null);
  let completed = 0;
  let failed = 0;
  const finalizeErrors: string[] = [];

  for (const job of jobs) {
    const removed = await supabase.storage.from(job.bucket).remove([job.storage_path]);
    const succeeded = !removed.error;
    const finalized = await supabase.rpc('finalize_image_generation_storage_cleanup_job', {
      p_job_id: job.id,
      p_succeeded: succeeded,
      p_error: removed.error?.message ?? null,
    });
    if (finalized.error || finalized.data !== true) {
      finalizeErrors.push(finalized.error?.message ?? `cleanup_job_${job.id}_not_running`);
    }
    if (succeeded) completed += 1;
    else failed += 1;
  }

  return {
    claimed: jobs.length,
    completed,
    failed,
    claim_error: null,
    finalize_errors: finalizeErrors,
  };
}
