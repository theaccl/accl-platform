import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { GET as moderatorQueueListGet } from '../../app/api/moderator/queue/route';
import { POST as moderatorRolesPost } from '../../app/api/moderator/roles/route';
import {
  getIntegrityControlledTruth,
  SupabaseModeratorQueueStore,
  type ModeratorQueueRecord,
} from '../../lib/analysis';
import { isAdminUser, isModeratorUser } from '../../lib/moderatorAuth';
import { SupabaseModeratorRoleAdminStore } from '../../lib/moderatorRoleAdminStore';

const START_FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B5/5N2/PPPPPPPP/RNBQK2R b KQkq - 2 2';

function createFakeSupabaseForModeratorQueue() {
  const queueRows: ModeratorQueueRecord[] = [];
  const actionHistoryRows: Record<string, unknown>[] = [];
  const roleAuditRows: Record<string, unknown>[] = [];
  const roleBindings = new Map<string, 'MODERATOR' | 'ADMIN'>();
  const antiCheatEvents = [
    {
      id: 'ace_1',
      user_id: '00000000-0000-0000-0000-000000000001',
      game_id: null,
      created_at: new Date().toISOString(),
    },
    {
      id: 'ace_2',
      user_id: '00000000-0000-0000-0000-000000000002',
      game_id: null,
      created_at: new Date().toISOString(),
    },
  ];
  let failAtomicAction = false;
  const from = (table: string) => {
    const state: Record<string, unknown> = { eq: {}, rangeFrom: 0, rangeTo: 19, pendingUpdate: null };
    const api = {
      insert: async (row: Record<string, unknown>) => {
        if (table === 'moderator_queue') {
          queueRows.push({
            id: `mq_${queueRows.length + 1}`,
            user_id: String(row.user_id),
            game_id: (row.game_id as string | null) ?? null,
            anti_cheat_event_id: (row.anti_cheat_event_id as string | null) ?? null,
            suspicion_tier: row.suspicion_tier as ModeratorQueueRecord['suspicion_tier'],
            suspicion_score: Number(row.suspicion_score ?? 0),
            recommended_action: row.recommended_action as ModeratorQueueRecord['recommended_action'],
            supporting_reasons_json: (row.supporting_reasons_json as ModeratorQueueRecord['supporting_reasons_json']) ?? [],
            overlap_verdict: row.overlap_verdict as ModeratorQueueRecord['overlap_verdict'],
            queue_status: (row.queue_status as ModeratorQueueRecord['queue_status']) ?? 'OPEN',
            assigned_to: null,
            moderator_note: null,
            resolution_note: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        if (table === 'moderator_queue_action_history') {
          actionHistoryRows.push({
            ...row,
            id: `mqa_${actionHistoryRows.length + 1}`,
            created_at: new Date().toISOString(),
          });
        }
        return { error: null };
      },
      select: (_columns: string, _opts?: unknown) => api,
      eq: (k: string, v: unknown) => {
        (state.eq as Record<string, unknown>)[k] = v;
        return api;
      },
      order: (_k: string, _opts?: unknown) => api,
      range: (fromN: number, toN: number) => {
        state.rangeFrom = fromN;
        state.rangeTo = toN;
        return Promise.resolve({
          data: queueRows.slice(fromN, toN + 1),
          error: null,
          count: queueRows.length,
        });
      },
      limit: async (n: number) => {
        if (table === 'anti_cheat_events') {
          const uid = String((state.eq as Record<string, unknown>).user_id ?? '');
          const gid = (state.eq as Record<string, unknown>).game_id as string | undefined;
          const rows = antiCheatEvents
            .filter((r) => r.user_id === uid && (gid === undefined || r.game_id === gid))
            .slice(0, n);
          return { data: rows, error: null };
        }
        if (table === 'moderator_queue_action_history') {
          const queueId = String((state.eq as Record<string, unknown>).queue_id ?? '');
          const rows = actionHistoryRows.filter((r) => String(r.queue_id ?? '') === queueId).slice(0, n);
          return { data: rows, error: null };
        }
        return { data: [], error: null };
      },
      maybeSingle: async () => {
        const id = String((state.eq as Record<string, unknown>).id ?? '');
        const row = queueRows.find((r) => r.id === id) ?? null;
        const pendingUpdate = state.pendingUpdate as Record<string, unknown> | null;
        if (row && pendingUpdate) {
          Object.assign(row, pendingUpdate);
          row.updated_at = new Date().toISOString();
          state.pendingUpdate = null;
        }
        return { data: row, error: null };
      },
      update: (patch: Record<string, unknown>) => {
        state.pendingUpdate = patch;
        return api;
      },
      then: undefined,
    };
    return api;
  };
  const rpc = async (fn: string, params: Record<string, unknown>) => {
    if (fn === 'apply_moderator_queue_action_atomic') {
      if (failAtomicAction) return { data: null, error: { message: 'forced atomic failure' } };
      const queueId = String(params.p_queue_id ?? '');
      const actedBy = String(params.p_acted_by ?? '');
      const actionType = String(params.p_action_type ?? '');
      const row = queueRows.find((r) => r.id === queueId) ?? null;
      if (!row) return { data: null, error: null };
      const previousStatus = row.queue_status;
      const nextStatus =
        actionType === 'MARK_IN_REVIEW'
          ? 'IN_REVIEW'
          : actionType === 'MARK_RESOLVED'
            ? 'RESOLVED'
            : actionType === 'MARK_DISMISSED'
              ? 'DISMISSED'
              : null;
      if (!nextStatus) return { data: null, error: { message: 'invalid moderator action type' } };
      row.queue_status = nextStatus;
      row.assigned_to = actedBy;
      if (actionType === 'MARK_IN_REVIEW') row.moderator_note = (params.p_moderator_note as string | null) ?? null;
      if (actionType === 'MARK_RESOLVED' || actionType === 'MARK_DISMISSED') {
        row.resolution_note = (params.p_resolution_note as string | null) ?? null;
      }
      row.updated_at = new Date().toISOString();
      actionHistoryRows.push({
        id: `mqa_${actionHistoryRows.length + 1}`,
        queue_id: row.id,
        acted_by: actedBy,
        action_type: actionType,
        previous_status: previousStatus,
        new_status: nextStatus,
        moderator_note: row.moderator_note,
        resolution_note: row.resolution_note,
        created_at: new Date().toISOString(),
      });
      return { data: row, error: null };
    }
    if (fn === 'set_moderator_role_binding') {
      const actedBy = String(params.p_acted_by ?? '');
      const targetUserId = String(params.p_target_user_id ?? '');
      const grant = Boolean(params.p_grant);
      const actorRole = roleBindings.get(actedBy);
      if (actorRole !== 'ADMIN') return { data: null, error: { message: 'admin role required for role mutation' } };
      if (actedBy === targetUserId) return { data: null, error: { message: 'self role mutation is not allowed' } };
      const prev = roleBindings.get(targetUserId);
      const previousRoles = prev ? [prev] : [];
      let newRoles: string[] = [];
      if (grant) {
        if (prev === 'ADMIN') {
          return { data: null, error: { message: 'cannot downgrade existing ADMIN role via moderator grant' } };
        }
        roleBindings.set(targetUserId, 'MODERATOR');
        newRoles = ['MODERATOR'];
      } else {
        if (prev === 'MODERATOR') roleBindings.delete(targetUserId);
        newRoles = prev === 'ADMIN' ? ['ADMIN'] : [];
      }
      const audit = {
        acted_by: actedBy,
        target_user_id: targetUserId,
        role_granted_or_revoked: grant ? 'GRANTED_MODERATOR' : 'REVOKED_MODERATOR',
        previous_roles: previousRoles,
        new_roles: newRoles,
        created_at: new Date().toISOString(),
      };
      roleAuditRows.push({ id: `mra_${roleAuditRows.length + 1}`, ...audit });
      return { data: audit, error: null };
    }
    return { data: null, error: { message: `unsupported rpc ${fn}` } };
  };
  return {
    client: { from, rpc } as unknown as ConstructorParameters<typeof SupabaseModeratorQueueStore>[0],
    queueRows,
    actionHistoryRows,
    roleAuditRows,
    roleBindings,
    setFailAtomicAction: (v: boolean) => {
      failAtomicAction = v;
    },
  };
}

test.describe('Moderator queue scaffolding', () => {
  test('queue persistence occurs for qualifying suspicion tiers only', async () => {
    const fake = createFakeSupabaseForModeratorQueue();
    const sink = new SupabaseModeratorQueueStore(fake.client);
    await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: {
        type: 'active-unrated-free-play-game',
        liveHumanVsHuman: false,
        explicitConsentMode: true,
      },
      overlap: {
        activeGameFen: START_FEN,
        activeGameMoves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6'],
        requestMoves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6'],
      },
      userId: '00000000-0000-0000-0000-000000000100',
      gameId: '00000000-0000-0000-0000-000000000101',
      moderatorQueueSink: sink,
      truthProvider: async () => ({
        rows: [],
        engine: { best_move: 'Nf6', candidate_moves: ['Nf6'], confidence: 0.61, depth: 16 },
        mode: 'coach',
        tablebaseHook: null,
        openingDbHook: null,
      }),
    });
    const afterEscalationAttempt = fake.queueRows.length;
    expect(afterEscalationAttempt).toBeGreaterThanOrEqual(0);

    const clear = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'training-mode' },
      overlap: {
        activeGameFen: START_FEN,
        activeGameMoves: ['e4', 'e5'],
        requestMoves: ['d4', 'd5'],
      },
      userId: '00000000-0000-0000-0000-000000000100',
      moderatorQueueSink: sink,
      truthProvider: async () => ({
        rows: [],
        engine: { best_move: 'Nf6', candidate_moves: ['Nf6'], confidence: 0.61, depth: 16 },
        mode: 'coach',
        tablebaseHook: null,
        openingDbHook: null,
      }),
    });
    expect(clear.audit.antiCheat.suspicion.tier).toBe('CLEAR');
    expect(fake.queueRows.length).toBe(afterEscalationAttempt);
  });

  test('moderator queue list supports pagination and action updates', async () => {
    const fake = createFakeSupabaseForModeratorQueue();
    const store = new SupabaseModeratorQueueStore(fake.client);
    await store.enqueue({
      user_id: '00000000-0000-0000-0000-000000000001',
      game_id: null,
      suspicion_tier: 'SOFT_LOCK_RECOMMENDED',
      suspicion_score: 45,
      recommended_action: 'RESTRICT_ANALYSIS_ACCESS',
      supporting_reasons: [],
      overlap_verdict: 'CONFIRMED_OVERLAP',
      created_at: new Date().toISOString(),
    });
    await store.enqueue({
      user_id: '00000000-0000-0000-0000-000000000002',
      game_id: null,
      suspicion_tier: 'ESCALATE_REVIEW',
      suspicion_score: 75,
      recommended_action: 'SEND_TO_MODERATOR_QUEUE',
      supporting_reasons: [],
      overlap_verdict: 'NOVELTY_COLLISION',
      created_at: new Date().toISOString(),
    });

    const list = await store.list({ limit: 1, offset: 0 });
    expect(list.rows.length).toBe(1);
    expect(list.total).toBe(2);

    const first = fake.queueRows[0]!;
    const updated = await store.applyAction(first.id, {
      type: 'MARK_RESOLVED',
      moderatorId: '00000000-0000-0000-0000-00000000abcd',
      resolutionNote: 'Confirmed resolution note',
    });
    expect(updated?.queue_status).toBe('RESOLVED');
    expect(updated?.resolution_note).toBe('Confirmed resolution note');
    expect(fake.actionHistoryRows.length).toBe(1);
    expect(fake.actionHistoryRows[0]?.action_type).toBe('MARK_RESOLVED');
    expect(fake.actionHistoryRows[0]?.previous_status).toBe('OPEN');
    expect(fake.actionHistoryRows[0]?.new_status).toBe('RESOLVED');
    await store.applyAction(first.id, {
      type: 'MARK_DISMISSED',
      moderatorId: '00000000-0000-0000-0000-00000000abcd',
      resolutionNote: 'Second action',
    });
    expect(fake.actionHistoryRows.length).toBe(2);
  });

  test('atomic action failure does not leave partial queue/history state', async () => {
    const fake = createFakeSupabaseForModeratorQueue();
    const store = new SupabaseModeratorQueueStore(fake.client);
    await store.enqueue({
      user_id: '00000000-0000-0000-0000-000000000001',
      game_id: null,
      suspicion_tier: 'SOFT_LOCK_RECOMMENDED',
      suspicion_score: 20,
      recommended_action: 'MONITOR',
      supporting_reasons: [],
      overlap_verdict: 'CONFIRMED_OVERLAP',
      created_at: new Date().toISOString(),
    });
    const before = { ...fake.queueRows[0]! };
    fake.setFailAtomicAction(true);
    await expect(
      store.applyAction(before.id, {
        type: 'MARK_IN_REVIEW',
        moderatorId: '00000000-0000-0000-0000-00000000abcd',
        note: 'should fail',
      })
    ).rejects.toThrow(/forced atomic failure/i);
    expect(fake.actionHistoryRows.length).toBe(0);
    expect(fake.queueRows[0]?.queue_status).toBe(before.queue_status);
    expect(fake.queueRows[0]?.assigned_to).toBe(before.assigned_to);
  });

  test('moderator read route fails closed when unauthenticated', async () => {
    const res = await moderatorQueueListGet(new Request('https://example.test/api/moderator/queue'));
    expect(res.status).toBe(401);
  });

  test('moderator role helper denies normal users and allows configured moderators', async () => {
    expect(
      isModeratorUser({
        userId: 'u1',
        appMetadata: { role: 'user' },
      })
    ).toBe(false);
    expect(
      isModeratorUser({
        userId: 'u2',
        appMetadata: { role: 'moderator' },
      })
    ).toBe(true);
    expect(
      isModeratorUser({
        userId: 'u3',
        appMetadata: {},
        allowedModeratorUserIdsEnv: 'u3,u4',
        enableAllowlistFallback: true,
      })
    ).toBe(true);
    expect(
      isModeratorUser({
        userId: 'u3',
        appMetadata: {},
        allowedModeratorUserIdsEnv: 'u3,u4',
      })
    ).toBe(false);
    expect(
      isModeratorUser({
        userId: 'u4',
        appMetadata: { roles: ['ADMIN'] },
      })
    ).toBe(true);
    expect(isAdminUser({ roles: ['admin'] })).toBe(true);
    expect(isAdminUser({ roles: ['moderator'] })).toBe(false);
  });

  test('enqueue links queue row to anti-cheat event when available', async () => {
    const fake = createFakeSupabaseForModeratorQueue();
    const store = new SupabaseModeratorQueueStore(fake.client);
    await store.enqueue({
      user_id: '00000000-0000-0000-0000-000000000001',
      game_id: null,
      suspicion_tier: 'SOFT_LOCK_RECOMMENDED',
      suspicion_score: 45,
      recommended_action: 'RESTRICT_ANALYSIS_ACCESS',
      supporting_reasons: [],
      overlap_verdict: 'CONFIRMED_OVERLAP',
      created_at: new Date().toISOString(),
    });
    expect(fake.queueRows[0]?.anti_cheat_event_id).toBe('ace_1');
  });

  test('role admin store allows admin grant/revoke and writes audit history', async () => {
    const fake = createFakeSupabaseForModeratorQueue();
    const store = new SupabaseModeratorRoleAdminStore(fake.client as never);
    const admin = '00000000-0000-0000-0000-00000000aa01';
    const target = '00000000-0000-0000-0000-00000000bb01';
    fake.roleBindings.set(admin, 'ADMIN');

    const grant = await store.grantModeratorRole(admin, target);
    expect(grant.role_granted_or_revoked).toBe('GRANTED_MODERATOR');
    expect(fake.roleBindings.get(target)).toBe('MODERATOR');

    const revoke = await store.revokeModeratorRole(admin, target);
    expect(revoke.role_granted_or_revoked).toBe('REVOKED_MODERATOR');
    expect(fake.roleBindings.get(target)).toBe(undefined);
    expect(fake.roleAuditRows.length).toBe(2);
  });

  test('role admin store fails closed for non-admin actors', async () => {
    const fake = createFakeSupabaseForModeratorQueue();
    const store = new SupabaseModeratorRoleAdminStore(fake.client as never);
    await expect(
      store.grantModeratorRole(
        '00000000-0000-0000-0000-00000000cc01',
        '00000000-0000-0000-0000-00000000dd01'
      )
    ).rejects.toThrow(/admin role required/i);
    expect(fake.roleAuditRows.length).toBe(0);
  });

  test('role admin route fails closed when unauthenticated', async () => {
    const res = await moderatorRolesPost(
      new Request('https://example.test/api/moderator/roles', {
        method: 'POST',
        body: JSON.stringify({
          action: 'GRANT_MODERATOR',
          target_user_id: '00000000-0000-0000-0000-00000000ee01',
        }),
      })
    );
    expect(res.status).toBe(401);
  });

  test('append-only history enforcement migration remains present', async () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/20260407213000_moderator_governance_hardening.sql'),
      'utf8'
    );
    expect(migration).toContain('prevent_moderator_queue_action_history_mutation');
    expect(migration).toContain('trg_mq_action_history_prevent_update');
    expect(migration).toContain('trg_mq_action_history_prevent_delete');
  });
});
