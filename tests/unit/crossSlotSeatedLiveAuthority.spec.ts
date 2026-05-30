import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { freePlayTargetSlot } from '../../lib/freePlayQueueSlotConflict';
import { userBlockedFromNewLiveSeatOrSlot } from '../../lib/hasActiveWaitingLiveFreeGame';

const root = process.cwd();
function src(rel: string): string {
  return readFileSync(join(root, ...rel.split('/')), 'utf8');
}

type Row = {
  id: string;
  white_player_id: string;
  black_player_id: string | null;
  tempo: string | null;
  live_time_control: string | null;
  rated: boolean | null;
  status?: string | null;
};

/** Minimal thenable PostgREST-style builder returning fixed rows for loadFreePlayBusyUserGames. */
function fakeSupabase(rows: Row[], opts?: { error?: boolean }) {
  const result = opts?.error ? { data: null, error: { message: 'boom' } } : { data: rows, error: null };
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'or', 'neq', 'not', 'order']) {
    builder[m] = () => builder;
  }
  builder.limit = () => Promise.resolve(result);
  return { from: () => builder } as never;
}

const seatedRapid10: Row = {
  id: 'live10',
  white_player_id: 'u1',
  black_player_id: 'u2',
  tempo: 'live',
  live_time_control: '10m',
  rated: true,
  status: 'active',
};

test.describe('userBlockedFromNewLiveSeatOrSlot — P0 create/find gate', () => {
  test('seated Rapid 10m blocks a NEW Rapid 15m post (cross-slot)', async () => {
    const hit = await userBlockedFromNewLiveSeatOrSlot(fakeSupabase([seatedRapid10]), 'u1', freePlayTargetSlot('rapid', '15m', true));
    expect(hit && 'gameId' in hit ? hit.gameId : null).toBe('live10');
    expect(hit && 'kind' in hit ? hit.kind : null).toBe('seated_live_game');
  });

  test('seated Rapid 10m blocks a NEW Blitz live post (cross-mode)', async () => {
    const hit = await userBlockedFromNewLiveSeatOrSlot(fakeSupabase([seatedRapid10]), 'u1', freePlayTargetSlot('blitz', '5m', true));
    expect(hit && 'kind' in hit ? hit.kind : null).toBe('seated_live_game');
  });

  test('seated Rapid 10m RATED blocks a NEW unrated live post', async () => {
    const hit = await userBlockedFromNewLiveSeatOrSlot(fakeSupabase([seatedRapid10]), 'u1', freePlayTargetSlot('rapid', '15m', false));
    expect(hit && 'kind' in hit ? hit.kind : null).toBe('seated_live_game');
  });

  test('an unmatched Rapid 10m waiting seat does NOT trigger the global block; slot-scoped rules remain', async () => {
    const waiting: Row = { ...seatedRapid10, id: 'seat10', black_player_id: null };
    // Cross-slot (Rapid 15m) is allowed when only a waiting seat exists.
    const cross = await userBlockedFromNewLiveSeatOrSlot(fakeSupabase([waiting]), 'u1', freePlayTargetSlot('rapid', '15m', true));
    expect(cross).toBeNull();
    // Same-slot still blocked by the existing slot-scoped rule (waiting_seat kind).
    const same = await userBlockedFromNewLiveSeatOrSlot(fakeSupabase([waiting]), 'u1', freePlayTargetSlot('rapid', '10m', true));
    expect(same && 'kind' in same ? same.kind : null).toBe('waiting_seat');
  });

  test('daily / async seated game does NOT block a live post; finished + unrelated do not block', async () => {
    const daily: Row = { ...seatedRapid10, id: 'd', tempo: 'daily', live_time_control: '1d' };
    expect(await userBlockedFromNewLiveSeatOrSlot(fakeSupabase([daily]), 'u1', freePlayTargetSlot('rapid', '10m', true))).toBeNull();

    const finished: Row = { ...seatedRapid10, status: 'finished' };
    expect(await userBlockedFromNewLiveSeatOrSlot(fakeSupabase([finished]), 'u1', freePlayTargetSlot('rapid', '10m', true))).toBeNull();

    expect(await userBlockedFromNewLiveSeatOrSlot(fakeSupabase([seatedRapid10]), 'u3', freePlayTargetSlot('rapid', '10m', true))).toBeNull();
  });

  test('a daily TARGET is never blocked even while seated live', async () => {
    expect(await userBlockedFromNewLiveSeatOrSlot(fakeSupabase([seatedRapid10]), 'u1', freePlayTargetSlot('daily', '1d', true))).toBeNull();
  });

  test('query error surfaces as queryError', async () => {
    const hit = await userBlockedFromNewLiveSeatOrSlot(fakeSupabase([], { error: true }), 'u1', freePlayTargetSlot('rapid', '10m', true));
    expect(hit && 'queryError' in hit).toBe(true);
  });
});

test.describe('create / find gate wiring (static)', () => {
  test('checkUserFreePlayQueueEligible and create-insert recovery use the global gate', () => {
    const find = src('lib/freePlayFindMatch.ts');
    expect(find).toContain('userBlockedFromNewLiveSeatOrSlot');
    // Old slot-only entry point must no longer drive the create/find gate.
    expect(find).not.toContain('userHasConflictingPlatQueueSlot(');
  });
});

test.describe('challenge accept / open-listing join guard (static)', () => {
  test('accept route blocks when either participant is seated in any active live game', () => {
    const route = src('app/api/match-requests/accept/route.ts');
    expect(route).toContain('userSeatedInAnyActiveLiveFreeGameAdmin');
    expect(route).toContain('r.from_user_id');
    expect(route).toContain('LIVE_CHALLENGE_ACCEPT_BLOCKED_MESSAGE');
  });

  test('open-listing join route blocks when either participant is seated in any active live game', () => {
    const route = src('app/api/match-requests/join-open-listing/route.ts');
    expect(route).toContain('userSeatedInAnyActiveLiveFreeGameAdmin');
    expect(route).toContain('r.from_user_id');
  });

  test('admin helper is not slot-scoped and reuses the shared predicate', () => {
    const admin = src('lib/server/userHasLiveFreeSessionAdmin.ts');
    expect(admin).toContain('userSeatedInAnyActiveLiveFreeGameAdmin');
    expect(admin).toContain('freePlayUserSeatedInAnyActiveLiveGame');
  });
});

test.describe('RLS hardening migration (static)', () => {
  test('migration blocks a new live seat while seated in any active live game, preserves daily + slot rules', () => {
    const sql = src('supabase/migrations/20260620120000_free_play_block_new_live_seat_while_seated_live.sql');
    expect(sql).toContain('auth_free_play_blocks_new_open_seat');
    expect(sql).toContain("if lt = 'daily' then");
    expect(sql).toContain('free_play_queue_slot_key');
    expect(sql).toContain('black_player_id is not null');
    expect(sql).toContain('return true;');
    // Must not introduce schema columns.
    expect(sql).not.toContain('alter table');
    expect(sql).not.toContain('add column');
  });
});
