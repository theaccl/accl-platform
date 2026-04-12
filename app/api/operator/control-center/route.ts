import { requireModerator } from '@/lib/moderatorAuth';
import {
  getRuntimeConfigValidationReport,
  getRuntimeConfigValidationSync,
} from '@/lib/runtimeConfigValidation';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type QueueJobLite = {
  id: string;
  game_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  error_message: string | null;
  result_meta: Record<string, unknown> | null;
};

type ActionBody =
  | { action: 'retry_failed_queue_job'; job_id?: unknown }
  | { action: 'rerun_trainer_generation'; game_id?: unknown }
  | { action?: unknown; [k: string]: unknown };

function ageSeconds(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}

function linkForGame(gameId: string): Record<string, string> {
  return {
    game: `/game/${gameId}`,
    finished: `/finished/${gameId}`,
    analyze: `/finished/${gameId}/analyze`,
    train: `/finished/${gameId}/train`,
  };
}

function healthFromLevel(level: 'green' | 'yellow' | 'red', reason: string): { level: string; reason: string } {
  return { level, reason };
}

export async function GET(request: Request): Promise<Response> {
  const guard = await requireModerator(request);
  if (!guard.ok) return json({ error: guard.error }, guard.status);

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Service configuration error';
    return json({ error: msg }, 503);
  }

  const queueStaleAfterSeconds = 900;
  const configSync = getRuntimeConfigValidationSync();
  const configReport = await getRuntimeConfigValidationReport();

  const botStaleAfterSeconds = 1800;
  const trainerMissingAfterSeconds = 1800;

  const queueSummaryRes = await supabase.rpc('get_finished_game_analysis_queue_ops_summary', {
    p_stale_after_seconds: queueStaleAfterSeconds,
  });
  if (queueSummaryRes.error) return json({ error: queueSummaryRes.error.message }, 502);

  const recentJobsRes = await supabase
    .from('finished_game_analysis_jobs')
    .select('id,game_id,status,created_at,updated_at,error_message,result_meta')
    .order('updated_at', { ascending: false })
    .limit(30);
  if (recentJobsRes.error) return json({ error: recentJobsRes.error.message }, 502);
  const recentJobs = (recentJobsRes.data ?? []) as QueueJobLite[];

  const staleRunningJobs = recentJobs
    .filter((j) => j.status === 'running')
    .map((j) => ({
      ...j,
      age_in_state_seconds: ageSeconds(j.updated_at),
      links: {
        ...linkForGame(j.game_id),
      },
    }))
    .filter((j) => (j.age_in_state_seconds ?? 0) > queueStaleAfterSeconds)
    .slice(0, 20);

  const failedQueueJobs = recentJobs
    .filter((j) => j.status === 'failed')
    .map((j) => ({
      ...j,
      age_in_state_seconds: ageSeconds(j.updated_at),
      links: {
        ...linkForGame(j.game_id),
      },
      triage_ids: {
        job_id: j.id,
        game_id: j.game_id,
        artifact_id: String((j.result_meta?.artifact_id as string | undefined) ?? ''),
      },
      actions: {
        retry_failed_queue_job: {
          method: 'POST',
          route: '/api/operator/control-center',
          body: { action: 'retry_failed_queue_job', job_id: j.id },
        },
      },
    }))
    .slice(0, 20);

  const completedJobs = recentJobs.filter((j) => j.status === 'completed').slice(0, 20);
  const lastQueueSuccessAt = completedJobs[0]?.updated_at ?? null;
  const lastQueueFailureAt = recentJobs.filter((j) => j.status === 'failed')[0]?.updated_at ?? null;
  const engineVisibility = await Promise.all(
    completedJobs.map(async (job) => {
      const { data: artifacts, error } = await supabase.rpc('get_latest_finished_game_analysis_artifacts', {
        p_game_id: job.game_id,
      });
      if (error) {
        return {
          job_id: job.id,
          game_id: job.game_id,
          status: 'artifact_lookup_error',
          error: error.message,
          links: {
            ...linkForGame(job.game_id),
          },
        };
      }
      const list = Array.isArray(artifacts) ? (artifacts as Array<Record<string, unknown>>) : [];
      const engine = list.find((a) => a.artifact_type === 'engine_structured');
      if (!engine) {
        return {
          job_id: job.id,
          game_id: job.game_id,
          status: 'missing_engine_structured_artifact',
          links: {
            ...linkForGame(job.game_id),
          },
          actions: {
            rerun_trainer_generation: {
              method: 'POST',
              route: '/api/operator/control-center',
              body: { action: 'rerun_trainer_generation', game_id: job.game_id },
            },
          },
        };
      }
      const payload = (engine.payload ?? {}) as Record<string, unknown>;
      const enginePayload = (payload.engine ?? {}) as Record<string, unknown>;
      const evaluation = (enginePayload.evaluation ?? {}) as Record<string, unknown>;
      return {
        job_id: job.id,
        game_id: job.game_id,
        artifact_id: String((engine.id as string | undefined) ?? ''),
        status: 'ok',
        provider: enginePayload.provider ?? null,
        best_move: evaluation.bestMove ?? null,
        centipawn: evaluation.centipawn ?? null,
        links: {
          ...linkForGame(job.game_id),
        },
      };
    })
  );

  const botGamesRes = await supabase
    .from('games')
    .select('id,status,turn,created_at,updated_at,black_player_id,source_type')
    .eq('source_type', 'bot_game')
    .order('updated_at', { ascending: false })
    .limit(30);
  if (botGamesRes.error) return json({ error: botGamesRes.error.message }, 502);
  const botGames = botGamesRes.data ?? [];

  const botMovesRes = await supabase
    .from('game_move_logs')
    .select('game_id,created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (botMovesRes.error) return json({ error: botMovesRes.error.message }, 502);
  const botMoveCounts = new Map<string, number>();
  for (const row of botMovesRes.data ?? []) {
    const gameId = String(row.game_id ?? '');
    if (!gameId) continue;
    botMoveCounts.set(gameId, (botMoveCounts.get(gameId) ?? 0) + 1);
  }
  const botAnomalies = botGames
    .map((g) => ({
      game_id: g.id,
      status: g.status,
      turn: g.turn,
      user_id: g.black_player_id,
      updated_at: g.updated_at,
      age_in_state_seconds: ageSeconds(String(g.updated_at)),
      move_count: botMoveCounts.get(String(g.id)) ?? 0,
      anomaly:
        (botMoveCounts.get(String(g.id)) ?? 0) === 0 && String(g.status) === 'active'
          ? 'no_moves_logged'
          : Date.now() - new Date(String(g.updated_at)).getTime() > botStaleAfterSeconds * 1000 &&
              String(g.status) === 'active'
            ? 'stale_active_bot_game'
            : null,
      links: {
        ...linkForGame(String(g.id)),
      },
    }))
    .filter((g) => g.anomaly !== null)
    .slice(0, 20);

  const trainerRecentRes = await supabase
    .from('trainer_generated_positions')
    .select('id,user_id,source_game_id,status,theme,created_at')
    .order('created_at', { ascending: false })
    .limit(40);
  if (trainerRecentRes.error) return json({ error: trainerRecentRes.error.message }, 502);
  const trainerRows = trainerRecentRes.data ?? [];
  const trainerByGame = new Map<string, number>();
  for (const row of trainerRows) {
    const gameId = String(row.source_game_id ?? '');
    if (!gameId) continue;
    trainerByGame.set(gameId, (trainerByGame.get(gameId) ?? 0) + 1);
  }

  const trainerOutcomes = completedJobs.slice(0, 20).map((j) => {
    const generated = trainerByGame.get(j.game_id) ?? 0;
    const updatedAt = j.updated_at;
    const age = ageSeconds(updatedAt) ?? 0;
    const status = generated >= 2 ? 'generated_for_both_players' : generated === 1 ? 'partial' : 'missing';
    return {
      job_id: j.id,
      game_id: j.game_id,
      generated_rows: generated,
      status,
      age_in_state_seconds: age,
      links: {
        ...linkForGame(j.game_id),
      },
      triage_ids: {
        job_id: j.id,
        game_id: j.game_id,
      },
      actions:
        status !== 'generated_for_both_players' && age >= trainerMissingAfterSeconds
          ? {
              rerun_trainer_generation: {
                method: 'POST',
                route: '/api/operator/control-center',
                body: { action: 'rerun_trainer_generation', game_id: j.game_id },
              },
            }
          : null,
    };
  });

  const tournamentGamesRes = await supabase
    .from('games')
    .select('id,status,finished_at,tournament_id,updated_at')
    .not('tournament_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (tournamentGamesRes.error) return json({ error: tournamentGamesRes.error.message }, 502);
  const tournamentGames = tournamentGamesRes.data ?? [];
  const reopenedTournamentGames = tournamentGames
    .filter((g) => g.finished_at && String(g.status) !== 'finished')
    .map((g) => ({
      game_id: g.id,
      status: g.status,
      finished_at: g.finished_at,
      updated_at: g.updated_at,
      age_in_state_seconds: ageSeconds(String(g.updated_at)),
      issue: 'finished_tournament_game_not_finished_status',
      links: {
        ...linkForGame(String(g.id)),
      },
    }))
    .slice(0, 10);

  const fingerprintsRes = await supabase
    .from('protected_position_fingerprints')
    .select('id,game_id,created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  if (fingerprintsRes.error) return json({ error: fingerprintsRes.error.message }, 502);

  const botIds = {
    cardi: process.env.BOT_USER_ID_CARDI?.trim() ?? '',
    aggro: process.env.BOT_USER_ID_AGGRO?.trim() ?? '',
    endgame: process.env.BOT_USER_ID_ENDGAME?.trim() ?? '',
  };
  const configuredBotIds = Object.values(botIds).filter(Boolean);
  const botProfilesRes =
    configuredBotIds.length > 0
      ? await supabase.from('profiles').select('id').in('id', configuredBotIds)
      : { data: [], error: null };
  if (botProfilesRes.error) return json({ error: botProfilesRes.error.message }, 502);
  const provisionedBotProfileIds = new Set((botProfilesRes.data ?? []).map((r) => String(r.id)));

  const queueCounts = (queueSummaryRes.data as { counts?: Record<string, number> } | null)?.counts ?? {};
  const queueFailed = Number(queueCounts.failed ?? 0);
  const queueStale = staleRunningJobs.length;
  const queueHealth =
    queueFailed > 0 || queueStale > 0
      ? healthFromLevel('red', 'failed or stale queue jobs present')
      : Number(queueCounts.running ?? 0) > 0 || Number(queueCounts.queued ?? 0) > 0
        ? healthFromLevel('yellow', 'queue is active with in-flight jobs')
        : healthFromLevel('green', 'queue clear');

  const botHealth =
    botAnomalies.length > 0
      ? healthFromLevel('red', 'bot anomalies detected')
      : botGames.length > 0
        ? healthFromLevel('green', 'recent bot games healthy')
        : healthFromLevel('yellow', 'no recent bot games');

  const trainerMissingCount = trainerOutcomes.filter((t) => t.status === 'missing').length;
  const trainerPartialCount = trainerOutcomes.filter((t) => t.status === 'partial').length;
  const trainerHealth =
    trainerMissingCount > 0
      ? healthFromLevel('red', 'trainer outputs missing for completed jobs')
      : trainerPartialCount > 0
        ? healthFromLevel('yellow', 'trainer outputs partial')
        : healthFromLevel('green', 'trainer outputs present');

  const tournamentHealth =
    reopenedTournamentGames.length > 0
      ? healthFromLevel('red', 'tournament finality anomalies present')
      : healthFromLevel('green', 'tournament enforcement healthy');

  const missingEnvCount = configReport.states.filter((s) => s.category === 'missing_env').length;
  const invalidEnvCount = configReport.states.filter((s) => s.category === 'invalid_env').length;
  const missingProfileCount = configReport.states.filter((s) => s.category === 'missing_profile').length;
  const mismatchedBotCount = configReport.states.filter((s) => s.category === 'mismatched_bot_identity').length;
  const envHealth =
    missingEnvCount > 0 || invalidEnvCount > 0 || missingProfileCount > 0 || mismatchedBotCount > 0
      ? healthFromLevel('red', 'env/config provisioning issues detected')
      : healthFromLevel('green', 'required env/config present');

  return json({
    summary_strip: {
      queue_health: queueHealth,
      bot_health: botHealth,
      trainer_health: trainerHealth,
      tournament_enforcement_health: tournamentHealth,
      env_health: envHealth,
    },
    queue: {
      summary: queueSummaryRes.data ?? null,
      stale_threshold_seconds: queueStaleAfterSeconds,
      last_success_at: lastQueueSuccessAt,
      last_failure_at: lastQueueFailureAt,
      statuses_surfaced: ['queued', 'running', 'completed', 'failed', 'no_finished_intake'],
      failed_jobs: failedQueueJobs,
      stale_running_jobs: staleRunningJobs,
    },
    engine: {
      statuses_surfaced: ['ok', 'missing_engine_structured_artifact', 'artifact_lookup_error'],
      recent_completed_job_engine_visibility: engineVisibility.slice(0, 15),
    },
    bot: {
      stale_threshold_seconds: botStaleAfterSeconds,
      last_success_at: botGames.find((g) => (botMoveCounts.get(String(g.id)) ?? 0) > 0)?.updated_at ?? null,
      last_failure_at: botAnomalies[0]?.updated_at ?? null,
      statuses_surfaced: ['ok', 'no_moves_logged', 'stale_active_bot_game'],
      recent_games: botGames,
      anomalies: botAnomalies,
    },
    trainer: {
      stale_threshold_seconds: trainerMissingAfterSeconds,
      last_success_at: trainerRows[0]?.created_at ?? null,
      last_failure_at:
        completedJobs.find((j) => {
          const generated = trainerByGame.get(j.game_id) ?? 0;
          return generated < 2;
        })?.updated_at ?? null,
      statuses_surfaced: ['generated_for_both_players', 'partial', 'missing'],
      recent_rows: trainerRows.slice(0, 20),
      outcomes_by_completed_job: trainerOutcomes,
    },
    tournament_enforcement: {
      statuses_surfaced: ['ok', 'finished_tournament_game_not_finished_status'],
      reopened_tournament_games: reopenedTournamentGames,
      recent_protected_position_fingerprints: fingerprintsRes.data ?? [],
    },
    env_health: {
      statuses_surfaced: ['ok', 'missing_env', 'invalid_env', 'missing_profile', 'mismatched_bot_identity'],
      categories_count: {
        missing_env: missingEnvCount,
        invalid_env: invalidEnvCount,
        missing_profile: missingProfileCount,
        mismatched_bot_identity: mismatchedBotCount,
      },
      sync_boot_report: configSync,
      validation_report: configReport,
      bot_profile_provisioning: {
        configured_ids: botIds,
        provisioned_profile_ids: [...provisionedBotProfileIds],
        missing_profile_ids: configuredBotIds.filter((id) => !provisionedBotProfileIds.has(id)),
      } satisfies Record<string, unknown>,
    },
    generated_at: new Date().toISOString(),
  });
}

export async function POST(request: Request): Promise<Response> {
  const guard = await requireModerator(request);
  if (!guard.ok) return json({ error: guard.error }, guard.status);

  let body: ActionBody | null = null;
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    body = null;
  }

  const action = String(body?.action ?? '');
  if (!action) return json({ error: 'action required' }, 400);

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Service configuration error';
    return json({ error: msg }, 503);
  }

  if (action === 'retry_failed_queue_job') {
    const jobId = String((body as { job_id?: unknown })?.job_id ?? '').trim();
    if (!jobId) return json({ error: 'job_id required' }, 400);

    const { data: job, error: jobErr } = await supabase
      .from('finished_game_analysis_jobs')
      .select('id,game_id,status')
      .eq('id', jobId)
      .maybeSingle();
    if (jobErr) return json({ error: jobErr.message }, 502);
    if (!job) return json({ error: 'job not found' }, 404);
    if (String(job.status) !== 'failed') return json({ error: 'only failed jobs can be retried' }, 400);

    const { data, error } = await supabase.rpc('enqueue_finished_game_analysis_job', {
      p_game_id: String(job.game_id),
      p_correlation_id: `operator_retry_${jobId}_${Date.now()}`,
    });
    if (error) return json({ error: error.message }, 502);
    return json({
      ok: true,
      action: 'retry_failed_queue_job',
      retried_from_job_id: jobId,
      game_id: String(job.game_id),
      enqueued: data ?? null,
    });
  }

  if (action === 'rerun_trainer_generation') {
    const gameId = String((body as { game_id?: unknown })?.game_id ?? '').trim();
    if (!gameId) return json({ error: 'game_id required' }, 400);

    const { data: game, error: gameErr } = await supabase
      .from('games')
      .select('id,status')
      .eq('id', gameId)
      .maybeSingle();
    if (gameErr) return json({ error: gameErr.message }, 502);
    if (!game) return json({ error: 'game not found' }, 404);
    if (String(game.status) !== 'finished') return json({ error: 'game must be finished to rerun trainer generation' }, 400);

    const { data, error } = await supabase.rpc('enqueue_finished_game_analysis_job', {
      p_game_id: gameId,
      p_correlation_id: `operator_rerun_trainer_${gameId}_${Date.now()}`,
    });
    if (error) return json({ error: error.message }, 502);
    return json({
      ok: true,
      action: 'rerun_trainer_generation',
      game_id: gameId,
      enqueued: data ?? null,
    });
  }

  return json({ error: 'unsupported action' }, 400);
}

