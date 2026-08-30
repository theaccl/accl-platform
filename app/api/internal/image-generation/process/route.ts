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

export async function POST(request: Request): Promise<Response> {
  if (!imageGenerationWorkerConfigured()) {
    return jsonResponse({ error: 'Image generation worker secret is not configured' }, 503);
  }
  if (!verifyImageGenerationWorkerRequest(request)) return jsonResponse({ error: 'Unauthorized' }, 401);
  const provider = configuredImageGenerationProvider();
  if (!provider) return jsonResponse({ error: 'Image generation provider is not configured' }, 503);
  let batch = 1;
  try {
    const body = (await request.json()) as { batch?: unknown };
    const requested = Number(body?.batch ?? 1);
    if (Number.isFinite(requested)) batch = Math.min(10, Math.max(1, Math.trunc(requested)));
  } catch {
    batch = 1;
  }
  const results = await processImageGenerationBatch(createServiceRoleClient(), provider, batch);
  return jsonResponse({ provider: provider.name, model: provider.model, results });
}
