import {
  imageGenerationWorkerConfigured,
  verifyImageGenerationWorkerRequest,
} from '@/lib/imageGenerator/internalAuth';
import { configuredImageGenerationProvider } from '@/lib/imageGenerator/provider';
import { processImageRefinementBatch } from '@/lib/imageGenerator/refinementWorker';
import { processImageGenerationBatch } from '@/lib/imageGenerator/worker';
import { jsonResponse } from '@/lib/server/httpJson';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function processRequest(request: Request, batch: number): Promise<Response> {
  if (!imageGenerationWorkerConfigured()) {
    return jsonResponse({ error: 'Image generation worker secret is not configured' }, 503);
  }
  if (!verifyImageGenerationWorkerRequest(request)) return jsonResponse({ error: 'Unauthorized' }, 401);
  const supabase = createServiceRoleClient();
  const [weeklyMints, anniversaryMints] = await Promise.all([
    supabase.rpc('mint_due_generation_token_allowances', { p_limit: 50 }),
    supabase.rpc('mint_due_pro_anniversary_generation_tokens', { p_limit: 50 }),
  ]);
  const mintSummary = {
    weekly_token_mints: Array.isArray(weeklyMints.data) ? weeklyMints.data.length : 0,
    weekly_token_mint_error: weeklyMints.error?.message ?? null,
    anniversary_token_mints: Array.isArray(anniversaryMints.data) ? anniversaryMints.data.length : 0,
    anniversary_token_mint_error: anniversaryMints.error?.message ?? null,
  };
  const expiredReferences = await supabase
    .from('image_generation_references')
    .select('id,storage_path')
    .in('status', ['ready', 'cleanup_pending'])
    .lte('expires_at', new Date().toISOString())
    .order('expires_at')
    .limit(20);
  let referenceCleanupError: string | null = expiredReferences.error?.message ?? null;
  if (!expiredReferences.error && (expiredReferences.data?.length ?? 0) > 0) {
    const paths = expiredReferences.data!.map((row) => row.storage_path);
    const removed = await supabase.storage.from('image-generation-references').remove(paths);
    referenceCleanupError = removed.error?.message ?? null;
    await supabase
      .from('image_generation_references')
      .update({
        status: removed.error ? 'cleanup_pending' : 'deleted',
        deleted_at: removed.error ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('id', expiredReferences.data!.map((row) => row.id));
  }
  const recovered = await supabase.rpc('recover_stale_image_generation_requests', {
    p_stale_after_seconds: 360,
    p_limit: 10,
  });
  const recoveredRows = Array.isArray(recovered.data) ? recovered.data : [];
  const terminalRecoveries = recoveredRows.filter(
    (row) => row && typeof row === 'object' && row.status === 'failed' && typeof row.request_id === 'string'
  );
  const recoveryRefunds = await Promise.all(
    terminalRecoveries.map((row) =>
      supabase.rpc('transition_generation_token_redemption', {
        p_request_id: row.request_id,
        p_action: 'refund',
      })
    )
  );
  const staleStoragePaths = recoveredRows.flatMap((row) =>
    row && typeof row === 'object' && Array.isArray(row.storage_paths)
      ? row.storage_paths.filter((path: unknown): path is string => typeof path === 'string')
      : []
  );
  const staleCleanup =
    staleStoragePaths.length > 0
      ? await supabase.storage.from('image-generation-candidates').remove(staleStoragePaths)
      : { error: null };
  const recoveredRefinements = await supabase.rpc('recover_stale_image_generation_refinements', {
    p_stale_after_seconds: 360,
    p_limit: 10,
  });
  const recoveredRefinementRows = Array.isArray(recoveredRefinements.data)
    ? recoveredRefinements.data
    : [];
  const staleRefinementStoragePaths = recoveredRefinementRows.flatMap((row) =>
    row && typeof row === 'object' && Array.isArray(row.storage_paths)
      ? row.storage_paths.filter((path: unknown): path is string => typeof path === 'string')
      : []
  );
  const staleRefinementCleanup =
    staleRefinementStoragePaths.length > 0
      ? await supabase.storage
          .from('image-generation-candidates')
          .remove(staleRefinementStoragePaths)
      : { error: null };
  const expiredReviews = await supabase.rpc('expire_due_image_generation_reviews', {
    p_limit: 50,
  });
  const expiredReviewRows = Array.isArray(expiredReviews.data) ? expiredReviews.data : [];
  const maintenanceSummary = {
    recovered_count: recoveredRows.length,
    recovery_error: recovered.error?.message ?? null,
    recovery_cleanup_error: staleCleanup.error?.message ?? null,
    recovered_refinement_count: recoveredRefinementRows.length,
    refinement_recovery_error: recoveredRefinements.error?.message ?? null,
    refinement_recovery_cleanup_error: staleRefinementCleanup.error?.message ?? null,
    expired_review_count: expiredReviewRows.length,
    review_expiry_error: expiredReviews.error?.message ?? null,
    reference_cleanup_error: referenceCleanupError,
    ...mintSummary,
    recovery_refund_errors: recoveryRefunds.flatMap((result) =>
      result.error ? [result.error.message] : []
    ),
  };
  const provider = configuredImageGenerationProvider();
  if (!provider) {
    return jsonResponse(
      { error: 'Image generation provider is not configured', ...maintenanceSummary },
      503
    );
  }
  const results = await processImageGenerationBatch(supabase, provider, batch);
  const refinementResults = await processImageRefinementBatch(supabase, provider, batch);
  return jsonResponse({
    provider: provider.name,
    model: provider.model,
    ...maintenanceSummary,
    results,
    refinement_results: refinementResults,
  });
}

export async function GET(request: Request): Promise<Response> {
  const requested = Number(new URL(request.url).searchParams.get('batch') ?? 1);
  const batch = Number.isFinite(requested) ? Math.min(10, Math.max(1, Math.trunc(requested))) : 1;
  return processRequest(request, batch);
}

export async function POST(request: Request): Promise<Response> {
  let batch = 1;
  try {
    const body = (await request.json()) as { batch?: unknown };
    const requested = Number(body?.batch ?? 1);
    if (Number.isFinite(requested)) batch = Math.min(10, Math.max(1, Math.trunc(requested)));
  } catch {
    batch = 1;
  }
  return processRequest(request, batch);
}
