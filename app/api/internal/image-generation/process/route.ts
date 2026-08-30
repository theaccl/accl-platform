import {
  imageGenerationWorkerConfigured,
  verifyImageGenerationWorkerRequest,
} from '@/lib/imageGenerator/internalAuth';
import { configuredImageGenerationProvider } from '@/lib/imageGenerator/provider';
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
  const provider = configuredImageGenerationProvider();
  if (!provider) return jsonResponse({ error: 'Image generation provider is not configured' }, 503);

  const supabase = createServiceRoleClient();
  const recovered = await supabase.rpc('recover_stale_image_generation_requests', {
    p_stale_after_seconds: 360,
    p_limit: 10,
  });
  const recoveredRows = Array.isArray(recovered.data) ? recovered.data : [];
  const staleStoragePaths = recoveredRows.flatMap((row) =>
    row && typeof row === 'object' && Array.isArray(row.storage_paths)
      ? row.storage_paths.filter((path: unknown): path is string => typeof path === 'string')
      : []
  );
  const staleCleanup =
    staleStoragePaths.length > 0
      ? await supabase.storage.from('image-generation-candidates').remove(staleStoragePaths)
      : { error: null };
  const results = await processImageGenerationBatch(supabase, provider, batch);
  return jsonResponse({
    provider: provider.name,
    model: provider.model,
    recovered_count: recoveredRows.length,
    recovery_cleanup_error: staleCleanup.error?.message ?? null,
    results,
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
