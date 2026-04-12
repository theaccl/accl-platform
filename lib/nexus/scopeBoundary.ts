export const NEXUS_SCOPE_BOUNDARY = {
  policy_version: 'nexus-scope-boundary-v1',
  mission: 'read/sanitize/present only',
  trusted_sources: [
    'public.finished_game_analysis_artifacts(engine_structured|placeholder)',
    'public.trainer_generated_positions(status=approved)',
    'public.player_pattern_profiles',
    'public.games(status=finished,tournament metadata only)',
    'public.protected_position_fingerprints(metadata only)',
    'runtime_config_validation_report',
  ],
  forbidden_paths: [
    '/api/game/submit-move',
    'finish_game',
    'finish_game_system',
    'update games set',
    'authoritative mutation',
  ],
  integrity_guards: [
    'never expose active tournament positions',
    'never expose replay-equivalent data in trainer/tournament safety payloads',
    'advisory outputs are non-authoritative and non-mutating',
  ],
} as const;

export function isNexusTournamentGameEligible(status: string | null | undefined): boolean {
  return String(status ?? '').toLowerCase() === 'finished';
}
