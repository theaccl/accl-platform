import {
  queueConfigInvalidJson,
  unauthorizedJson,
  verifyAnalysisQueueSecret,
} from '@/lib/internalAnalysisQueueAuth';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { getQueueSecretValidationState } from '@/lib/runtimeConfigValidation';

export const runtime = 'nodejs';

/**
 * GET: queue ops summary and recent failure/stale samples.
 * POST: stale-running recovery (marks stale running jobs as failed).
 */

export async function GET(request: Request): Promise<Response> {
  if (!getQueueSecretValidationState().ok) return queueConfigInvalidJson();
  if (!verifyAnalysisQueueSecret(request)) return unauthorizedJson();

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Service configuration error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const staleAfterSeconds = Math.max(60, parseInt(url.searchParams.get('stale_after_seconds') ?? '900', 10) || 900);
  const sampleLimit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('sample_limit') ?? '20', 10) || 20));

  const { data: summary, error: sumErr } = await supabase.rpc('get_finished_game_analysis_queue_ops_summary', {
    p_stale_after_seconds: staleAfterSeconds,
  });
  if (sumErr) {
    return new Response(JSON.stringify({ error: sumErr.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const staleThresholdIso = new Date(Date.now() - staleAfterSeconds * 1000).toISOString();
  const [failedRes, noIntakeRes, staleRes] = await Promise.all([
    supabase
      .from('finished_game_analysis_jobs')
      .select('id,game_id,status,created_at,updated_at,error_message,result_meta')
      .eq('status', 'failed')
      .order('updated_at', { ascending: false })
      .limit(sampleLimit),
    supabase
      .from('finished_game_analysis_jobs')
      .select('id,game_id,status,created_at,updated_at,error_message,result_meta')
      .eq('status', 'no_finished_intake')
      .order('updated_at', { ascending: false })
      .limit(sampleLimit),
    supabase
      .from('finished_game_analysis_jobs')
      .select('id,game_id,status,created_at,updated_at,error_message,result_meta')
      .eq('status', 'running')
      .lt('updated_at', staleThresholdIso)
      .order('updated_at', { ascending: true })
      .limit(sampleLimit),
  ]);

  const err = failedRes.error || noIntakeRes.error || staleRes.error;
  if (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      stale_after_seconds: staleAfterSeconds,
      sample_limit: sampleLimit,
      summary: summary ?? null,
      failed_jobs: failedRes.data ?? [],
      no_finished_intake_jobs: noIntakeRes.data ?? [],
      stale_running_jobs: staleRes.data ?? [],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!getQueueSecretValidationState().ok) return queueConfigInvalidJson();
  if (!verifyAnalysisQueueSecret(request)) return unauthorizedJson();

  let body: { stale_after_seconds?: unknown; limit?: unknown } | null = null;
  try {
    body = (await request.json()) as { stale_after_seconds?: unknown; limit?: unknown } | null;
  } catch {
    body = null;
  }

  const staleAfterSeconds = Math.max(
    60,
    parseInt(String(body?.stale_after_seconds ?? '900'), 10) || 900
  );
  const limit = Math.min(1000, Math.max(1, parseInt(String(body?.limit ?? '100'), 10) || 100));

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Service configuration error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data, error } = await supabase.rpc('fail_stale_running_finished_game_analysis_jobs', {
    p_stale_after_seconds: staleAfterSeconds,
    p_limit: limit,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      recovery_strategy: 'mark_failed',
      stale_after_seconds: staleAfterSeconds,
      limit,
      result: data ?? null,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

