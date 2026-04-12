import type { FinishedGameAnalysisIntakePayload } from '@/lib/finishedGameAnalysisIntake';
import type {
  FinishedGameAnalysisJobRow,
  FinishedAnalysisJobStatus,
  ProcessBatchResponse,
  ProcessOneJobResult,
} from '@/lib/analysisQueueJob';
import {
  queueConfigInvalidJson,
  unauthorizedJson,
  verifyAnalysisQueueSecret,
} from '@/lib/internalAnalysisQueueAuth';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { runEngineComputeService } from '@/lib/analysis/engineComputeService';
import { extractPatternOutputs } from '@/lib/analysis/patternExtraction';
import { getQueueSecretValidationState } from '@/lib/runtimeConfigValidation';

export const runtime = 'nodejs';

const PLACEHOLDER_PROCESSOR = 'foundation.processor.v1';
const PLACEHOLDER_ARTIFACT_VERSION = 'fga.placeholder.1';
const ENGINE_STRUCTURED_ARTIFACT_VERSION = 'fga.engine.structured.1';

function parseClaimedJob(data: unknown): FinishedGameAnalysisJobRow | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  const id = o.id;
  const game_id = o.game_id;
  if (typeof id !== 'string' || typeof game_id !== 'string') return null;
  return o as unknown as FinishedGameAnalysisJobRow;
}

/**
 * POST: claim up to `batch` queued jobs (default 1), re-validate via `get_finished_game_analysis_intake` only,
 * then finalize to completed | no_finished_intake | failed.
 */
export async function POST(request: Request): Promise<Response> {
  if (!getQueueSecretValidationState().ok) return queueConfigInvalidJson();
  if (!verifyAnalysisQueueSecret(request)) return unauthorizedJson();

  let batch = 1;
  try {
    const body = (await request.json()) as { batch?: unknown } | null;
    const n = typeof body?.batch === 'number' ? body.batch : parseInt(String(body?.batch ?? '1'), 10);
    batch = Math.min(25, Math.max(1, Number.isFinite(n) ? n : 1));
  } catch {
    batch = 1;
  }

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

  const results: ProcessOneJobResult[] = [];

  for (let i = 0; i < batch; i++) {
    const { data: claimedRaw, error: claimErr } = await supabase.rpc('claim_next_finished_game_analysis_job');
    if (claimErr) {
      results.push({ claimed: false, error: claimErr.message });
      break;
    }
    const job = parseClaimedJob(claimedRaw);
    if (!job) {
      results.push({ claimed: false });
      break;
    }

    const gameId = job.game_id;
    const jobId = job.id;

    try {
      const { data: intake, error: intakeErr } = await supabase.rpc('get_finished_game_analysis_intake', {
        p_game_id: gameId,
      });

      if (intakeErr) {
        const { error: finErr } = await supabase.rpc('finalize_finished_game_analysis_job', {
          p_job_id: jobId,
          p_final_status: 'failed' satisfies FinishedAnalysisJobStatus,
          p_result_meta: {
            processor: PLACEHOLDER_PROCESSOR,
            stage: 'intake_rpc_error',
          },
          p_error_message: intakeErr.message,
        });
        results.push({
          claimed: true,
          job_id: jobId,
          game_id: gameId,
          final_status: 'failed',
          finalize_ok: !finErr,
          error: intakeErr.message,
        });
        continue;
      }

      if (intake == null) {
        const { error: finErr } = await supabase.rpc('finalize_finished_game_analysis_job', {
          p_job_id: jobId,
          p_final_status: 'no_finished_intake' satisfies FinishedAnalysisJobStatus,
          p_result_meta: {
            processor: PLACEHOLDER_PROCESSOR,
            stage: 'intake_null_at_process',
            note: 'Game may have been reopened or deleted after enqueue; no analysis payload.',
          },
          p_error_message: null,
        });
        results.push({
          claimed: true,
          job_id: jobId,
          game_id: gameId,
          final_status: 'no_finished_intake',
          finalize_ok: !finErr,
        });
        continue;
      }

      const payload = intake as FinishedGameAnalysisIntakePayload;
      const moveCount = Array.isArray(payload.move_logs) ? payload.move_logs.length : 0;
      const artifactPayload = {
        schema_version: PLACEHOLDER_ARTIFACT_VERSION,
        processor_version: PLACEHOLDER_PROCESSOR,
        intake_schema_version: payload.schema_version,
        analysis_partition: payload.game?.analysis_partition ?? null,
        move_count: moveCount,
        note: 'Placeholder non-engine artifact. Engine scoring not implemented yet.',
      };
      const { data: artifactIdRaw, error: artifactErr } = await supabase.rpc(
        'upsert_finished_game_analysis_artifact',
        {
          p_job_id: jobId,
          p_game_id: gameId,
          p_artifact_type: 'placeholder',
          p_artifact_version: PLACEHOLDER_ARTIFACT_VERSION,
          p_analysis_partition: payload.game?.analysis_partition ?? null,
          p_payload: artifactPayload,
        }
      );
      if (artifactErr) {
        const { error: finErr } = await supabase.rpc('finalize_finished_game_analysis_job', {
          p_job_id: jobId,
          p_final_status: 'failed' satisfies FinishedAnalysisJobStatus,
          p_result_meta: {
            processor: PLACEHOLDER_PROCESSOR,
            stage: 'artifact_write_error',
            intake_schema_version: payload.schema_version,
          },
          p_error_message: artifactErr.message,
        });
        results.push({
          claimed: true,
          job_id: jobId,
          game_id: gameId,
          final_status: 'failed',
          finalize_ok: !finErr,
          error: artifactErr.message,
        });
        continue;
      }
      const artifactId = (artifactIdRaw as string | null) ?? undefined;
      const engine = await runEngineComputeService({
        gameId,
        intake: payload,
      });
      const { data: engineArtifactIdRaw, error: engineArtifactErr } = await supabase.rpc(
        'upsert_finished_game_analysis_artifact',
        {
          p_job_id: jobId,
          p_game_id: gameId,
          p_artifact_type: 'engine_structured',
          p_artifact_version: ENGINE_STRUCTURED_ARTIFACT_VERSION,
          p_analysis_partition: payload.game?.analysis_partition ?? null,
          p_payload: {
            schema_version: ENGINE_STRUCTURED_ARTIFACT_VERSION,
            processor_version: PLACEHOLDER_PROCESSOR,
            engine,
          },
        }
      );
      if (engineArtifactErr) {
        const { error: finErr } = await supabase.rpc('finalize_finished_game_analysis_job', {
          p_job_id: jobId,
          p_final_status: 'failed' satisfies FinishedAnalysisJobStatus,
          p_result_meta: {
            processor: PLACEHOLDER_PROCESSOR,
            stage: 'engine_artifact_write_error',
            intake_schema_version: payload.schema_version,
          },
          p_error_message: engineArtifactErr.message,
        });
        results.push({
          claimed: true,
          job_id: jobId,
          game_id: gameId,
          final_status: 'failed',
          finalize_ok: !finErr,
          error: engineArtifactErr.message,
        });
        continue;
      }
      const engineArtifactId = (engineArtifactIdRaw as string | null) ?? undefined;
      const patternOutput = extractPatternOutputs(payload, engine);
      const profileUserIds = [
        payload.game?.white_player_id ? String(payload.game.white_player_id) : null,
        payload.game?.black_player_id ? String(payload.game.black_player_id) : null,
      ].filter((x): x is string => Boolean(x));
      for (const uid of profileUserIds) {
        await supabase.from('player_pattern_profiles').upsert(
          {
            user_id: uid,
            pattern_tags: patternOutput.patternTags,
            suggested_themes: patternOutput.suggestedThemes,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );
      }
      const trainerFen =
        String(payload.move_logs?.[Math.max(0, (payload.move_logs?.length ?? 1) - 1)]?.fen_before ?? '').trim() ||
        String(payload.game?.final_fen ?? '').trim();
      if (trainerFen) {
        for (const uid of profileUserIds) {
          await supabase.from('trainer_generated_positions').insert({
            user_id: uid,
            source_game_id: gameId,
            fen: trainerFen,
            theme: patternOutput.suggestedThemes[0] ?? 'Calculation Discipline',
            difficulty: 'normal',
            status: 'approved',
          });
        }
      }
      const resultMeta = {
        processor: PLACEHOLDER_PROCESSOR,
        stage: 'engine_structured_complete',
        intake_schema_version: payload.schema_version,
        analysis_partition: payload.game?.analysis_partition ?? null,
        move_count_at_process: moveCount,
        artifact_id: artifactId ?? null,
        engine_artifact_id: engineArtifactId ?? null,
        note: 'Structured engine compute, pattern extraction, and trainer generation emitted.',
      };

      const { error: finErr } = await supabase.rpc('finalize_finished_game_analysis_job', {
        p_job_id: jobId,
        p_final_status: 'completed' satisfies FinishedAnalysisJobStatus,
        p_result_meta: resultMeta,
        p_error_message: null,
      });

      results.push({
        claimed: true,
        job_id: jobId,
        game_id: gameId,
        final_status: 'completed',
        finalize_ok: !finErr,
        artifact_id: artifactId,
        error: finErr ? finErr.message : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.rpc('finalize_finished_game_analysis_job', {
        p_job_id: jobId,
        p_final_status: 'failed' satisfies FinishedAnalysisJobStatus,
        p_result_meta: { processor: PLACEHOLDER_PROCESSOR, stage: 'processor_exception' },
        p_error_message: msg,
      });
      results.push({
        claimed: true,
        job_id: jobId,
        game_id: gameId,
        final_status: 'failed',
        error: msg,
      });
    }
  }

  const payload: ProcessBatchResponse = { batch_requested: batch, results };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
