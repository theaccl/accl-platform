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

test.describe('rated / unrated lane doctrine through the create/find gate', () => {
  test('an unmatched RATED Rapid 10m waiting seat allows posting the UNRATED Rapid 10m lane', async () => {
    const ratedWaiting: Row = { ...seatedRapid10, id: 'r10', black_player_id: null, rated: true };
    const hit = await userBlockedFromNewLiveSeatOrSlot(fakeSupabase([ratedWaiting]), 'u1', freePlayTargetSlot('rapid', '10m', false));
    expect(hit).toBeNull();
  });

  test('an unmatched UNRATED Rapid 10m waiting seat allows posting the RATED Rapid 10m lane', async () => {
    const unratedWaiting: Row = { ...seatedRapid10, id: 'u10', black_player_id: null, rated: false };
    const hit = await userBlockedFromNewLiveSeatOrSlot(fakeSupabase([unratedWaiting]), 'u1', freePlayTargetSlot('rapid', '10m', true));
    expect(hit).toBeNull();
  });

  test('a second SAME-lane Rapid 10m Rated post is blocked (waiting_seat)', async () => {
    const ratedWaiting: Row = { ...seatedRapid10, id: 'r10', black_player_id: null, rated: true };
    const hit = await userBlockedFromNewLiveSeatOrSlot(fakeSupabase([ratedWaiting]), 'u1', freePlayTargetSlot('rapid', '10m', true));
    expect(hit && 'kind' in hit ? hit.kind : null).toBe('waiting_seat');
  });

  test('once SEATED in a rated live game, BOTH rated and unrated live lanes are blocked', async () => {
    const ratedTarget = await userBlockedFromNewLiveSeatOrSlot(fakeSupabase([seatedRapid10]), 'u1', freePlayTargetSlot('rapid', '15m', true));
    const unratedTarget = await userBlockedFromNewLiveSeatOrSlot(fakeSupabase([seatedRapid10]), 'u1', freePlayTargetSlot('rapid', '15m', false));
    expect(ratedTarget && 'kind' in ratedTarget ? ratedTarget.kind : null).toBe('seated_live_game');
    expect(unratedTarget && 'kind' in unratedTarget ? unratedTarget.kind : null).toBe('seated_live_game');
  });
});

test.describe('supersede sweep is lane-agnostic (static SQL)', () => {
  test('supersede_stale_free_open_seats_for_users matches by host only, no rated/clock/mode filter', () => {
    const full = src('supabase/migrations/20260528160000_free_play_supersede_not_daily_and_host_busy_skip_async.sql');
    const start = full.indexOf('create or replace function public.supersede_stale_free_open_seats_for_users');
    expect(start).toBeGreaterThanOrEqual(0);
    // Isolate the supersede function body (stop before the next function definition).
    const rest = full.slice(start + 1);
    const nextFn = rest.indexOf('create or replace function');
    const body = nextFn >= 0 ? rest.slice(0, nextFn) : rest;

    expect(body).toContain('white_player_id in (p_user_a, p_user_b)');
    expect(body).toContain('black_player_id is null');
    // No lane / exact-clock / mode narrowing inside the sweep.
    expect(body).not.toContain('rated');
    expect(body).not.toContain('live_time_control');
    expect(body).not.toContain('free_play_queue_slot_key');
  });
});

test.describe('direct-insert accept supersede reliability (static)', () => {
  test('invalidate helper retries supersede and returns a structured result', () => {
    const lib = src('lib/server/invalidateLiveQueueAvailability.ts');
    expect(lib).toContain('SUPERSEDE_MAX_ATTEMPTS');
    expect(lib).toContain('supersedeOk');
    expect(lib).toContain('InvalidateLiveQueueResult');
    expect(lib).toContain("rpc('supersede_stale_free_open_seats_for_users'");
  });

  test('accept route invokes supersede for both players and logs incompleteness', () => {
    const route = src('app/api/match-requests/accept/route.ts');
    expect(route).toContain('invalidateLiveQueueAvailabilityForUsers');
    expect(route).toContain('inv.supersedeOk');
    expect(route).toContain('console.error');
    // Invoked before the success response.
    expect(route.indexOf('invalidateLiveQueueAvailabilityForUsers')).toBeLessThan(route.lastIndexOf("ok: true"));
  });

  test('open-listing route invokes supersede for both players and logs incompleteness', () => {
    const route = src('app/api/match-requests/join-open-listing/route.ts');
    expect(route).toContain('invalidateLiveQueueAvailabilityForUsers');
    expect(route).toContain('inv.supersedeOk');
    expect(route).toContain('console.error');
    expect(route.indexOf('invalidateLiveQueueAvailabilityForUsers')).toBeLessThan(route.lastIndexOf("ok: true"));
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
