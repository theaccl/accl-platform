import {
  type NexusInputEnvelope,
  type NexusSourceRef,
  validateNexusInput,
  type NexusValidationResult,
} from '@/lib/nexus/contract';

type Obj = Record<string, unknown>;

export type NexusAdapterOutput = {
  envelope: NexusInputEnvelope;
  source_refs: NexusSourceRef[];
  read_path: string;
};

const FORBIDDEN_RAW_KEYWORDS = [
  'access_token',
  'refresh_token',
  'authorization',
  'session',
  'password',
  'service_role_key',
  'anon_key',
  'secret',
  'api_key',
  'raw_moderation_evidence',
  'protected_position',
  'active_tournament_position',
];

const REPLAY_EQUIV_KEYWORDS = ['fen', 'pv', 'bestmove', 'uci', 'move_list', 'principal_variation'];

function isRecord(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function containsForbiddenKey(obj: unknown): boolean {
  if (obj == null) return false;
  if (Array.isArray(obj)) return obj.some((v) => containsForbiddenKey(v));
  if (!isRecord(obj)) return false;
  for (const [k, v] of Object.entries(obj)) {
    const kl = k.toLowerCase();
    if (FORBIDDEN_RAW_KEYWORDS.some((needle) => kl.includes(needle))) return true;
    if (containsForbiddenKey(v)) return true;
  }
  return false;
}

function containsReplayEquivalentKey(obj: unknown): boolean {
  if (obj == null) return false;
  if (Array.isArray(obj)) return obj.some((v) => containsReplayEquivalentKey(v));
  if (!isRecord(obj)) return false;
  for (const [k, v] of Object.entries(obj)) {
    const kl = k.toLowerCase();
    if (REPLAY_EQUIV_KEYWORDS.some((needle) => kl.includes(needle))) return true;
    if (containsReplayEquivalentKey(v)) return true;
  }
  return false;
}

function fail<T>(message: string): NexusValidationResult<T> {
  return { ok: false, errors: [{ category: 'forbidden_input', message }] };
}

function toEnvelope(
  source_type: NexusInputEnvelope['source_type'],
  source_id: string,
  payload: Obj,
  read_path: string
): NexusValidationResult<NexusAdapterOutput> {
  const envelope: NexusInputEnvelope = { source_type, source_id, payload };
  const valid = validateNexusInput(envelope);
  if (!valid.ok) return valid as NexusValidationResult<NexusAdapterOutput>;
  return {
    ok: true,
    value: {
      envelope,
      source_refs: [{ source_type, source_id }],
      read_path,
    },
  };
}

/**
 * Source query/read path:
 * public.finished_game_analysis_artifacts (artifact_type allowlist, finished-game only).
 */
export function adaptFinishedGameArtifact(row: unknown): NexusValidationResult<NexusAdapterOutput> {
  if (!isRecord(row)) return fail('finished_game_artifact row must be object');
  if (containsForbiddenKey(row)) return fail('finished_game_artifact row contains forbidden fields');

  const artifactId = String(row.id ?? '').trim();
  const gameId = String(row.game_id ?? '').trim();
  const artifactType = String(row.artifact_type ?? '').trim();
  const artifactVersion = String(row.artifact_version ?? '').trim();
  const payload = isRecord(row.payload) ? row.payload : {};
  const engine = isRecord(payload.engine) ? payload.engine : {};
  const evalObj = isRecord(engine.evaluation) ? engine.evaluation : {};
  const multiPv = Array.isArray(evalObj.multiPv) ? evalObj.multiPv.length : 0;

  if (!artifactId || !gameId || !artifactType) return fail('finished_game_artifact missing id/game_id/artifact_type');
  if (!['engine_structured', 'placeholder'].includes(artifactType)) {
    return fail(`finished_game_artifact type not allowlisted: ${artifactType}`);
  }

  const normalizedPayload: Obj = {
    artifact_id: artifactId,
    game_id: gameId,
    artifact_type: artifactType,
    artifact_version: artifactVersion || null,
    analysis_partition: String(row.analysis_partition ?? '') || null,
    engine_summary: {
      provider: String(engine.provider ?? '') || null,
      confidence: Number(evalObj.confidence ?? 0) || 0,
      multi_pv_count: multiPv,
      centipawn: evalObj.centipawn ?? null,
      suggested_move: String(evalObj.bestMove ?? '') || null,
    },
    created_at: String(row.created_at ?? '') || null,
    updated_at: String(row.updated_at ?? '') || null,
  };

  return toEnvelope('finished_game_artifact', artifactId, normalizedPayload, 'public.finished_game_analysis_artifacts');
}

/**
 * Source query/read path:
 * public.trainer_generated_positions where status='approved'.
 */
export function adaptTrainerApprovedOutput(row: unknown): NexusValidationResult<NexusAdapterOutput> {
  if (!isRecord(row)) return fail('trainer_approved_output row must be object');
  if (containsForbiddenKey(row)) return fail('trainer_approved_output row contains forbidden fields');
  if (containsReplayEquivalentKey(row)) return fail('trainer_approved_output contains replay-equivalent detail');

  const id = String(row.id ?? '').trim();
  const userId = String(row.user_id ?? '').trim();
  const gameId = String(row.source_game_id ?? '').trim();
  const status = String(row.status ?? '').trim().toLowerCase();
  if (!id || !userId || !gameId) return fail('trainer_approved_output missing id/user_id/source_game_id');
  if (status !== 'approved') return fail('trainer_approved_output must be approved');

  const normalizedPayload: Obj = {
    trainer_output_id: id,
    user_id: userId,
    source_game_id: gameId,
    status: 'approved',
    theme: String(row.theme ?? '') || null,
    difficulty: String(row.difficulty ?? '') || null,
    created_at: String(row.created_at ?? '') || null,
  };

  return toEnvelope('trainer_approved_output', id, normalizedPayload, 'public.trainer_generated_positions');
}

/**
 * Source query/read path:
 * public.player_pattern_profiles.
 */
export function adaptPlayerPatternProfile(row: unknown): NexusValidationResult<NexusAdapterOutput> {
  if (!isRecord(row)) return fail('player_pattern_profile row must be object');
  if (containsForbiddenKey(row)) return fail('player_pattern_profile row contains forbidden fields');

  const userId = String(row.user_id ?? '').trim();
  if (!userId) return fail('player_pattern_profile missing user_id');

  const patternTags = Array.isArray(row.pattern_tags) ? row.pattern_tags.map((v) => String(v)).slice(0, 50) : [];
  const suggestedThemes = Array.isArray(row.suggested_themes)
    ? row.suggested_themes.map((v) => String(v)).slice(0, 20)
    : [];

  const normalizedPayload: Obj = {
    user_id: userId,
    pattern_tags: patternTags,
    suggested_themes: suggestedThemes,
    updated_at: String(row.updated_at ?? '') || null,
  };

  return toEnvelope('player_pattern_profile', userId, normalizedPayload, 'public.player_pattern_profiles');
}

/**
 * Source query/read path:
 * moderation-safe operational summary endpoint payloads.
 */
export function adaptModerationSafeOperationalSummary(summary: unknown): NexusValidationResult<NexusAdapterOutput> {
  if (!isRecord(summary)) return fail('moderation summary must be object');
  if (containsForbiddenKey(summary)) return fail('moderation summary contains forbidden fields');

  const summaryId = String(summary.summary_id ?? 'moderation-safe-ops').trim();
  const normalizedPayload: Obj = {
    summary_id: summaryId,
    queue_counts: isRecord(summary.queue_counts) ? summary.queue_counts : {},
    stale_counts: isRecord(summary.stale_counts) ? summary.stale_counts : {},
    generated_at: String(summary.generated_at ?? '') || null,
  };

  return toEnvelope(
    'moderation_safe_operational_summary',
    summaryId,
    normalizedPayload,
    'safe_operational_summary_view'
  );
}

/**
 * Source query/read path:
 * tournament safety metadata derived from games + protected_position_fingerprints.
 * Must expose metadata only, never replay-equivalent details.
 */
export function adaptTournamentSafetyMetadata(row: unknown): NexusValidationResult<NexusAdapterOutput> {
  if (!isRecord(row)) return fail('tournament safety metadata row must be object');
  if (containsForbiddenKey(row)) return fail('tournament safety metadata contains forbidden fields');
  if (containsReplayEquivalentKey(row)) {
    return fail('tournament safety metadata contains replay-equivalent detail');
  }

  const gameId = String(row.game_id ?? row.id ?? '').trim();
  const tournamentId = String(row.tournament_id ?? '').trim();
  if (!gameId || !tournamentId) return fail('tournament safety metadata missing game_id/tournament_id');

  const normalizedPayload: Obj = {
    game_id: gameId,
    tournament_id: tournamentId,
    game_status: String(row.status ?? '') || null,
    has_finish_timestamp: Boolean(row.finished_at),
    fingerprint_present: Boolean(row.fingerprint_present),
    fingerprint_count: Number(row.fingerprint_count ?? 0) || 0,
    updated_at: String(row.updated_at ?? '') || null,
  };

  return toEnvelope(
    'tournament_safety_metadata',
    `${tournamentId}:${gameId}`,
    normalizedPayload,
    'games + protected_position_fingerprints metadata view'
  );
}

/**
 * Source query/read path:
 * runtime/env validation report.
 */
export function adaptConfigEnvHealthState(report: unknown): NexusValidationResult<NexusAdapterOutput> {
  if (!isRecord(report)) return fail('config env report must be object');
  if (containsForbiddenKey(report)) return fail('config env report contains forbidden fields');

  const generatedAt = String(report.generated_at ?? '').trim();
  const states = Array.isArray(report.states) ? report.states : [];
  const normalizedStates = states
    .filter((s) => isRecord(s))
    .map((s) => ({
      key: String(s.key ?? ''),
      ok: Boolean(s.ok),
      category: String(s.category ?? ''),
      detail: String(s.detail ?? ''),
    }))
    .filter((s) => s.key.length > 0);

  const normalizedPayload: Obj = {
    generated_at: generatedAt || null,
    has_errors: Boolean(report.has_errors),
    states: normalizedStates,
  };

  return toEnvelope(
    'config_env_health_state',
    generatedAt || 'config-env-health',
    normalizedPayload,
    'runtime_config_validation_report'
  );
}

