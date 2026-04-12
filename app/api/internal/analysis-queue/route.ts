import type {
  EnqueueAnalysisJobBody,
  EnqueueAnalysisJobResponse,
  FinishedAnalysisJobStatus,
  FinishedGameAnalysisJobRow,
} from '@/lib/analysisQueueJob';
import {
  queueConfigInvalidJson,
  unauthorizedJson,
  verifyAnalysisQueueSecret,
} from '@/lib/internalAnalysisQueueAuth';
import { getQueueSecretValidationState } from '@/lib/runtimeConfigValidation';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JOB_STATUSES: FinishedAnalysisJobStatus[] = [
  'queued',
  'running',
  'completed',
  'failed',
  'no_finished_intake',
];

/** POST: enqueue via DB RPC (intake-only gate). GET: last jobs for audit (service role). */
export async function POST(request: Request): Promise<Response> {
  if (!getQueueSecretValidationState().ok) return queueConfigInvalidJson();
  if (!verifyAnalysisQueueSecret(request)) return unauthorizedJson();

  let body: EnqueueAnalysisJobBody;
  try {
    body = (await request.json()) as EnqueueAnalysisJobBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const gameId = String(body.game_id ?? '').trim();
  if (!UUID_RE.test(gameId)) {
    return new Response(JSON.stringify({ error: 'game_id must be a valid UUID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const correlationId =
    body.correlation_id != null && String(body.correlation_id).trim() !== ''
      ? String(body.correlation_id).trim()
      : null;

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

  const { data: jobId, error: rpcError } = await supabase.rpc('enqueue_finished_game_analysis_job', {
    p_game_id: gameId,
    p_correlation_id: correlationId,
  });

  if (rpcError) {
    return new Response(JSON.stringify({ error: rpcError.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = jobId as string | null;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Enqueue returned no job id' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: row, error: fetchError } = await supabase
    .from('finished_game_analysis_jobs')
    .select(
      'id,game_id,status,job_schema_version,correlation_id,intake_schema_version,analysis_partition,move_count,created_at,updated_at,error_message,result_meta'
    )
    .eq('id', id)
    .single();

  if (fetchError || !row) {
    return new Response(
      JSON.stringify({ error: fetchError?.message ?? 'Job created but row fetch failed', job_id: id }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const r = row as FinishedGameAnalysisJobRow;
  const payload: EnqueueAnalysisJobResponse = {
    job_id: r.id,
    status: r.status,
    job_schema_version: r.job_schema_version,
    game_id: r.game_id,
    intake_schema_version: r.intake_schema_version,
    analysis_partition: r.analysis_partition,
    move_count: r.move_count,
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

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
  const limitRaw = url.searchParams.get('limit');
  const limit = Math.min(100, Math.max(1, parseInt(limitRaw ?? '30', 10) || 30));
  const statusRaw = (url.searchParams.get('status') ?? '').trim() as FinishedAnalysisJobStatus;
  const status = JOB_STATUSES.includes(statusRaw) ? statusRaw : null;
  const staleAfterRaw = url.searchParams.get('stale_after_seconds');
  const staleAfterSeconds = Math.max(60, parseInt(staleAfterRaw ?? '900', 10) || 900);

  let q = supabase
    .from('finished_game_analysis_jobs')
    .select(
      'id,game_id,status,job_schema_version,correlation_id,intake_schema_version,analysis_partition,move_count,created_at,updated_at,error_message,result_meta'
    )
    .order('created_at', { ascending: false });

  if (status) q = q.eq('status', status);

  const { data, error } = await q.limit(limit);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: summaryRaw, error: summaryErr } = await supabase.rpc(
    'get_finished_game_analysis_queue_ops_summary',
    { p_stale_after_seconds: staleAfterSeconds }
  );

  if (summaryErr) {
    return new Response(JSON.stringify({ error: summaryErr.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      jobs: (data ?? []) as FinishedGameAnalysisJobRow[],
      limit,
      filters: { status, stale_after_seconds: staleAfterSeconds },
      summary: summaryRaw ?? null,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
