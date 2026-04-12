import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

import { enforceModeratorSeedSafety, requireModeratorE2EEnv } from './moderatorE2EGuard';

type SeededModeratorRecord = {
  runId: string;
  queueId: string;
  antiCheatEventId: string;
  seededUserId: string;
  seededGameId: string;
};

function deterministicUuid(seed: string): string {
  const h = crypto.createHash('sha256').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function getServiceRoleClient() {
  const env = requireModeratorE2EEnv();
  enforceModeratorSeedSafety(env.E2E_SUPABASE_URL);
  return createClient(env.E2E_SUPABASE_URL, env.E2E_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function seedModeratorQueueDetailFixture(runId: string): Promise<SeededModeratorRecord> {
  const supabase = getServiceRoleClient();
  const seededUserId = deterministicUuid(`moderator-seed-user:${runId}`);
  const seededGameId = deterministicUuid(`moderator-seed-game:${runId}`);
  const antiCheatEventId = deterministicUuid(`moderator-seed-anti-cheat:${runId}`);
  const queueId = deterministicUuid(`moderator-seed-queue:${runId}`);

  // Remove stale rows from previous interrupted runs that reused this run id.
  await cleanupModeratorQueueDetailFixture({
    runId,
    queueId,
    antiCheatEventId,
    seededUserId,
    seededGameId,
  });

  const { data: antiCheatRows, error: antiCheatError } = await supabase
    .from('anti_cheat_events')
    .insert({
      id: antiCheatEventId,
      user_id: seededUserId,
      game_id: seededGameId,
      fen: 'seeded-moderator-e2e',
      overlap_verdict: 'HIGH_CONFIDENCE_MATCH',
      suspicion_score: 99,
      suspicion_tier: 'ESCALATE_REVIEW',
      reasons_json: [{ code: 'SEED_E2E_REASON', run_id: runId }],
      protected_context: true,
      engine_called: true,
      request_context: { source: 'moderator-e2e', run_id: runId },
    })
    .select('id')
    .single();

  if (antiCheatError || !antiCheatRows?.id) {
    throw new Error(`Failed to seed anti_cheat_events row: ${antiCheatError?.message ?? 'no id returned'}`);
  }

  const { data: queueRows, error: queueError } = await supabase
    .from('moderator_queue')
    .insert({
      id: queueId,
      user_id: seededUserId,
      game_id: seededGameId,
      anti_cheat_event_id: antiCheatRows.id,
      suspicion_tier: 'ESCALATE_REVIEW',
      suspicion_score: 99,
      recommended_action: 'SEND_TO_MODERATOR_QUEUE',
      supporting_reasons_json: [{ code: 'SEED_QUEUE_REASON', run_id: runId }],
      overlap_verdict: 'HIGH_CONFIDENCE_MATCH',
      queue_status: 'OPEN',
    })
    .select('id')
    .single();

  if (queueError || !queueRows?.id) {
    throw new Error(`Failed to seed moderator_queue row: ${queueError?.message ?? 'no id returned'}`);
  }

  return {
    runId,
    queueId: queueRows.id,
    antiCheatEventId: antiCheatRows.id,
    seededUserId,
    seededGameId,
  };
}

export async function cleanupModeratorQueueDetailFixture(seed: SeededModeratorRecord): Promise<void> {
  const supabase = getServiceRoleClient();
  const { error: enforcementHistoryErr } = await supabase
    .from('anti_cheat_enforcement_override_history')
    .delete()
    .eq('target_user_id', seed.seededUserId);
  if (enforcementHistoryErr) {
    throw new Error(`Failed to cleanup enforcement override history: ${enforcementHistoryErr.message}`);
  }

  const { error: historyErr } = await supabase
    .from('moderator_queue_action_history')
    .delete()
    .eq('queue_id', seed.queueId);
  if (historyErr) throw new Error(`Failed to cleanup moderator history: ${historyErr.message}`);

  const { error: queueErr } = await supabase.from('moderator_queue').delete().eq('id', seed.queueId);
  if (queueErr) throw new Error(`Failed to cleanup moderator queue: ${queueErr.message}`);

  const { error: antiCheatErr } = await supabase.from('anti_cheat_events').delete().eq('id', seed.antiCheatEventId);
  if (antiCheatErr) throw new Error(`Failed to cleanup anti-cheat event: ${antiCheatErr.message}`);
}

export async function getModeratorQueueStatus(queueId: string): Promise<'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED'> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.from('moderator_queue').select('queue_status').eq('id', queueId).single();
  if (error) throw new Error(`Failed to read moderator queue status: ${error.message}`);
  const status = data?.queue_status;
  if (!status) throw new Error('Failed to read moderator queue status: queue row missing');
  return status;
}

export async function getEnforcementOverrideAction(userId: string): Promise<string | null> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('anti_cheat_enforcement_states')
    .select('override_action')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read enforcement override state: ${error.message}`);
  return (data?.override_action as string | null | undefined) ?? null;
}
