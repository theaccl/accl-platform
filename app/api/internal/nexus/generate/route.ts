import {
  adaptConfigEnvHealthState,
  adaptFinishedGameArtifact,
  adaptPlayerPatternProfile,
  adaptTournamentSafetyMetadata,
  adaptTrainerApprovedOutput,
  type NexusAdapterOutput,
} from '@/lib/nexus/adapters';
import { runNexusAdvisoryGeneration } from '@/lib/nexus/generation';
import { NexusOutputRegistryService, SupabaseNexusOutputRegistryRepo } from '@/lib/nexus/outputRegistry';
import { NEXUS_SCOPE_BOUNDARY, isNexusTournamentGameEligible } from '@/lib/nexus/scopeBoundary';
import { getRuntimeConfigValidationReport } from '@/lib/runtimeConfigValidation';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { auditApiLog } from '@/lib/server/prodLog';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function verifyInternalSecret(request: Request): boolean {
  const header = request.headers.get('x-accl-analysis-queue-secret') ?? '';
  const expected = process.env.ACCL_ANALYSIS_QUEUE_SECRET?.trim() ?? '';
  return expected.length >= 16 && header.length === expected.length && header === expected;
}

function collect(validated: ReturnType<typeof adaptFinishedGameArtifact>, out: NexusAdapterOutput[]) {
  if (validated.ok) out.push(validated.value);
}

export async function POST(request: Request): Promise<Response> {
  if (!verifyInternalSecret(request)) return json({ error: 'Unauthorized' }, 401);

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Service configuration error' }, 503);
  }

  const adapters: NexusAdapterOutput[] = [];

  // Trusted source 1: finished-game artifacts only.
  const { data: artifacts } = await supabase
    .from('finished_game_analysis_artifacts')
    .select('id,game_id,artifact_type,artifact_version,analysis_partition,payload,created_at,updated_at')
    .in('artifact_type', ['engine_structured', 'placeholder'])
    .order('created_at', { ascending: false })
    .limit(120);
  for (const row of artifacts ?? []) collect(adaptFinishedGameArtifact(row), adapters);

  // Trusted source 2: trainer approved outputs only.
  const { data: trainerRows } = await supabase
    .from('trainer_generated_positions')
    .select('id,user_id,source_game_id,theme,difficulty,status,created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(120);
  for (const row of trainerRows ?? []) collect(adaptTrainerApprovedOutput(row), adapters);

  // Trusted source 3: player pattern profile.
  const { data: profileRows } = await supabase
    .from('player_pattern_profiles')
    .select('user_id,pattern_tags,suggested_themes,updated_at')
    .order('updated_at', { ascending: false })
    .limit(120);
  for (const row of profileRows ?? []) collect(adaptPlayerPatternProfile(row), adapters);

  // Trusted source 4: tournament safety metadata (finished-only, metadata only).
  const { data: tGames } = await supabase
    .from('games')
    .select('id,tournament_id,status,finished_at,updated_at')
    .not('tournament_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(120);
  for (const g of tGames ?? []) {
    if (!isNexusTournamentGameEligible(String(g.status ?? ''))) continue;
    const { count } = await supabase
      .from('protected_position_fingerprints')
      .select('game_id', { count: 'exact', head: true })
      .eq('game_id', g.id);
    collect(
      adaptTournamentSafetyMetadata({
        game_id: g.id,
        tournament_id: g.tournament_id,
        status: g.status,
        finished_at: g.finished_at,
        updated_at: g.updated_at,
        fingerprint_present: (count ?? 0) > 0,
        fingerprint_count: count ?? 0,
      }),
      adapters
    );
  }

  // Trusted source 5: runtime health state.
  const runtimeReport = await getRuntimeConfigValidationReport();
  collect(adaptConfigEnvHealthState(runtimeReport), adapters);

  const registry = new NexusOutputRegistryService(new SupabaseNexusOutputRegistryRepo());
  const generated = await runNexusAdvisoryGeneration({
    adapter_inputs: adapters,
    registry,
  });

  auditApiLog('internal_nexus_generate', {
    result: 'ok',
    trusted_inputs: adapters.length,
  });

  return json({
    ok: true,
    scope_boundary: NEXUS_SCOPE_BOUNDARY,
    trusted_inputs_considered: adapters.length,
    generated,
  });
}
