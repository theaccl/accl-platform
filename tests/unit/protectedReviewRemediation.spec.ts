import { expect, test } from '@playwright/test';
import { Chess } from 'chess.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parsePosition, START_FEN } from '@/lib/chess';
import { deriveProtectedAnalysisOverlap, runProtectedAnalysisRequest } from '@/lib/analysis/protectedAnalysisServer';
import { evaluateOverlap, getIntegrityControlledTruth, type TruthPayload } from '@/lib/analysis/intelligence';
import { InMemoryAntiCheatEventStore, SupabaseAntiCheatEventStore, type AntiCheatSignalCounts } from '@/lib/analysis/antiCheatStore';
import { InMemoryAntiCheatEnforcementStore, SupabaseAntiCheatEnforcementStore } from '@/lib/analysis/enforcementStore';
import { InMemoryModeratorQueueSink } from '@/lib/analysis/moderatorQueue';

const USER = '00000000-0000-0000-0000-000000000001';
const GAME = '00000000-0000-0000-0000-000000000002';
const ACTIVE = '00000000-0000-0000-0000-000000000003';
const SANS = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6'];
const truth = async (): Promise<TruthPayload> => ({ rows: [], mode: 'analyst', tablebaseHook: null, openingDbHook: null });

function fixture(sans = SANS) {
  const chess = new Chess();
  const logs = sans.map((san, i) => {
    const fen_before = chess.fen();
    chess.move(san);
    return { id: String(i), game_id: ACTIVE, san, fen_before, fen_after: chess.fen(), created_at: new Date(i * 1000).toISOString() };
  });
  const game = { id: GAME, status: 'finished', rated: true, tournament_id: null, fen: chess.fen(), white_player_id: USER, black_player_id: 'other' };
  const active = { ...game, id: ACTIVE, status: 'active', source_type: 'human_game' };
  const state = {
    active: [active], logs, activeCount: 1, moveCount: logs.length,
    intakeLogs: logs.map((row) => ({ ...row, game_id: GAME })) as unknown[],
    intakeFinalFen: game.fen,
    activeCountAvailable: true, moveCountAvailable: true,
    activeLimit: 0, requestedCounts: [] as unknown[],
  };
  const client = {
    from(table: string) {
      const q = {
        select(_columns: string, options?: unknown) { state.requestedCounts.push(options); return q; },
        eq() { return q; }, or() { return q; }, in() { return q; }, order() { return q; },
        limit(n: number) { if (table === 'games') state.activeLimit = n; return q; },
        maybeSingle: async () => ({ data: game, error: null }),
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(resolve(table === 'games'
            ? { data: state.active, count: state.activeCountAvailable ? state.activeCount : null, error: null }
            : { data: state.logs, count: state.moveCountAvailable ? state.moveCount : null, error: null }));
        },
      };
      return q;
    },
    rpc: async () => ({ data: { schema_version: 'fgi.1', game: { ...game, final_fen: state.intakeFinalFen }, move_logs: state.intakeLogs }, error: null }),
  } as unknown as SupabaseClient;
  return { state, client, game };
}

function stores() {
  return { antiCheatStore: new InMemoryAntiCheatEventStore(), enforcementStore: new InMemoryAntiCheatEnforcementStore(), moderatorQueueSink: new InMemoryModeratorQueueSink() };
}

test('remediation: full server path blocks a canonical completed position matching a live game', async () => {
  const f = fixture();
  let called = 0;
  const result = await runProtectedAnalysisRequest({ serviceClient: f.client, userId: USER, gameId: GAME, fen: f.game.fen, mode: 'analyst', ...stores(), protectedReviewTruthProvider: async () => { called++; return truth(); } });
  expect(called).toBe(0);
  expect(result.ok).toBe(false);
  expect(result.audit.antiCheat.blockedByOverlap).toBe(true);
});

test('independent finding: appended fabricated completed position never reaches analysis', async () => {
  const f = fixture(['d4', 'd5']);
  const active = fixture(['e4', 'e5']);
  f.state.active = active.state.active;
  f.state.logs = active.state.logs;
  const targetBoard = new Chess(active.game.fen);
  targetBoard.move('Nf3');
  const target = targetBoard.fen();
  let called = 0;
  const run = () => runProtectedAnalysisRequest({
    serviceClient: f.client, userId: USER, gameId: GAME, fen: target, mode: 'analyst', ...stores(),
    protectedReviewTruthProvider: async () => { called++; return truth(); },
  });
  await expect(run()).rejects.toMatchObject({ status: 403 });
  f.state.intakeLogs.push({
    san: 'Nf3', fen_before: target, fen_after: target, created_at: new Date(3000).toISOString(),
  });
  await expect(run()).rejects.toMatchObject({ status: 503 });
  expect(called).toBe(0);
});

for (const scenario of [
  'null row', 'missing before', 'missing after', 'illegal san', 'disconnected chain',
  'wrong resulting board', 'truncated tail', 'appended legal ply', 'counter mismatch',
  'intake final mismatch', 'lookup final mismatch', 'oversized history', 'oversized san',
  'malformed container', 'missing history', 'appended legal cycle',
]) {
  test(`independent finding: invalid completed evidence fails closed: ${scenario}`, async () => {
    const f = fixture(['e4', 'e5']);
    f.state.active = [];
    f.state.activeCount = 0;
    const row = f.state.intakeLogs[0] as Record<string, unknown>;
    if (scenario === 'null row') f.state.intakeLogs[0] = null;
    if (scenario === 'missing before') row.fen_before = null;
    if (scenario === 'missing after') row.fen_after = null;
    if (scenario === 'illegal san') row.san = 'Qa8';
    if (scenario === 'disconnected chain') row.fen_before = f.game.fen;
    if (scenario === 'wrong resulting board') row.fen_after = START_FEN;
    if (scenario === 'truncated tail') f.state.intakeLogs.pop();
    if (scenario === 'appended legal ply') {
      const board = new Chess(f.game.fen);
      board.move('Nf3');
      f.state.intakeLogs.push({ san: 'Nf3', fen_before: f.game.fen, fen_after: board.fen() });
    }
    if (scenario === 'counter mismatch') row.fen_after = String(row.fen_after).replace('0 1', '0 9');
    if (scenario === 'intake final mismatch') f.state.intakeFinalFen = START_FEN;
    if (scenario === 'lookup final mismatch') f.game.fen = START_FEN;
    if (scenario === 'oversized history') f.state.intakeLogs = Array(1025).fill(row);
    if (scenario === 'oversized san') row.san = 'e4' + ' '.repeat(65);
    if (scenario === 'malformed container') f.state.intakeLogs = {} as unknown as unknown[];
    if (scenario === 'missing history') f.state.intakeLogs = null as unknown as unknown[];
    if (scenario === 'appended legal cycle') {
      const board = new Chess(f.game.fen);
      for (const san of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) {
        const fen_before = board.fen();
        board.move(san);
        f.state.intakeLogs.push({ san, fen_before, fen_after: board.fen() });
      }
      expect(parsePosition(board.fen()).positionKey).toBe(parsePosition(f.game.fen).positionKey);
    }
    let called = 0;
    await expect(runProtectedAnalysisRequest({
      serviceClient: f.client, userId: USER, gameId: GAME, fen: f.game.fen, mode: 'analyst', ...stores(),
      protectedReviewTruthProvider: async () => { called++; return truth(); },
    })).rejects.toMatchObject({ status: 503 });
    expect(called).toBe(0);
  });
}

test('independent finding: a genuine zero-move completed game remains reviewable', async () => {
  const f = fixture([]);
  f.state.active = [];
  f.state.activeCount = 0;
  let called = 0;
  const result = await runProtectedAnalysisRequest({
    serviceClient: f.client, userId: USER, gameId: GAME, fen: START_FEN, mode: 'analyst', ...stores(),
    protectedReviewTruthProvider: async () => { called++; return truth(); },
  });
  expect(result.ok).toBe(true);
  expect(called).toBe(1);
});

test('remediation: exact live opening position cannot be analyzed through completed review', async () => {
  const f = fixture(['e4', 'e5']);
  let called = false;
  const result = await runProtectedAnalysisRequest({ serviceClient: f.client, userId: USER, gameId: GAME, fen: f.game.fen, mode: 'analyst', ...stores(), protectedReviewTruthProvider: async () => { called = true; return truth(); } });
  expect(called).toBe(false);
  expect(result.ok).toBe(false);
});

for (const [counts, signal] of [
  [{ confirmedOverlap: 8 }, 'confirmed_overlap'],
  [{ noveltyCollision: 8 }, 'novelty_collision'],
  [{ protectedOverlapAttempt: 3 }, 'protected_context_overlap_attempt'],
  [{ blockedRequest: 3 }, 'blocked_request_pattern'],
  [{ probingBurst: 3 }, 'repeated_probing'],
  [{ openingBookOverlap: 3 }, 'opening_book_overlap'],
] as [AntiCheatSignalCounts, string][]) {
  test(`remediation: isolated durable ${signal} survives a clean request`, async () => {
    const deps = stores();
    deps.antiCheatStore.countRecentSignalsByUser = async () => counts;
    const result = await getIntegrityControlledTruth({ fen: START_FEN, mode: 'analyst', context: { type: 'completed-game-review' }, userId: USER, ...deps, requireDurableControls: true, truthProvider: truth });
    expect(result.audit.antiCheat.suspicion.reasons.find(r => r.signal === signal)?.weight).toBeGreaterThan(0);
  });
}

test('remediation: blocked-live history retains its own signal alongside mandatory supporting counts', async () => {
  const deps = stores();
  deps.antiCheatStore.countRecentSignalsByUser = async () => ({ blockedLiveProtectedRequest: 2, protectedOverlapAttempt: 2, blockedRequest: 2 });
  const result = await getIntegrityControlledTruth({ fen: START_FEN, mode: 'analyst', context: { type: 'completed-game-review' }, userId: USER, ...deps, requireDurableControls: true, truthProvider: truth });
  expect(result.audit.antiCheat.suspicion.reasons.find(r => r.signal === 'blocked_live_protected_request')?.occurrences).toBe(2);
});

function enforcementClient(patch: Record<string, unknown> = {}) {
  let writes = 0;
  const row = { user_id: USER, enforcement_state: 'NO_RESTRICTION', source_suspicion_tier: 'ESCALATE_REVIEW', source_recommended_action: 'SEND_TO_MODERATOR_QUEUE', source_reason_json: [], override_action: null, override_state: null, override_reason: null, override_expires_at: null, override_set_by: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...patch };
  const client = { from() { const q = { select() { return q; }, eq() { return q; }, maybeSingle: async () => ({ data: row, error: null }), upsert: async () => { writes++; return { error: null }; } }; return q; } } as unknown as SupabaseClient;
  return { store: new SupabaseAntiCheatEnforcementStore(client), writes: () => writes };
}

test('remediation: contradictory database enforcement fails before writes or analysis', async () => {
  const f = enforcementClient();
  let called = false;
  await expect(getIntegrityControlledTruth({ fen: START_FEN, mode: 'analyst', context: { type: 'completed-game-review' }, userId: USER, ...stores(), enforcementStore: f.store, requireDurableControls: true, truthProvider: async () => { called = true; return truth(); } })).rejects.toMatchObject({ code: 'ANTI_CHEAT_EVIDENCE_INVALID' });
  expect(f.writes()).toBe(0);
  expect(called).toBe(false);
});

for (const expires of [null, 'invalid']) {
  test(`remediation: temporary override rejects invalid expiry ${expires}`, async () => {
    const f = enforcementClient({ enforcement_state: 'REVIEW_LOCKED', override_action: 'TEMPORARY_UNLOCK', override_state: 'MONITOR_ONLY', override_expires_at: expires, override_set_by: 'moderator', override_reason: 'Verified appeal' });
    await expect(f.store.getEffectiveState(USER)).rejects.toThrow();
  });
}

test('remediation: override expiry uses timestamps rather than string ordering', async () => {
  // Future instant with earlier wall-clock text; expired instant with later text.
  const expires = new Date(Date.now() + 60_000 - 5 * 60 * 60 * 1000).toISOString().replace('Z', '-05:00');
  const f = enforcementClient({ enforcement_state: 'REVIEW_LOCKED', override_action: 'TEMPORARY_UNLOCK', override_state: 'MONITOR_ONLY', override_expires_at: expires, override_set_by: 'moderator', override_reason: 'Verified appeal' });
  expect((await f.store.getEffectiveState(USER)).state).toBe('MONITOR_ONLY');
  const expiredAt = new Date(Date.now() - 60_000 + 5 * 60 * 60 * 1000).toISOString().replace('Z', '+05:00');
  const expired = enforcementClient({ enforcement_state: 'REVIEW_LOCKED', override_action: 'TEMPORARY_UNLOCK', override_state: 'MONITOR_ONLY', override_expires_at: expiredAt, override_set_by: 'moderator', override_reason: 'Verified appeal' });
  expect((await expired.store.getEffectiveState(USER)).state).toBe('REVIEW_LOCKED');
});

for (const scenario of [
  'overflow', 'truncated games', 'truncated moves', 'missing moves', 'missing counts',
  'missing move count', 'move overflow', 'gap', 'missing leading moves', 'wrong final',
  'illegal san', 'missing before', 'missing after', 'foreign move', 'duplicate move',
]) {
  test(`remediation: incomplete active evidence fails closed: ${scenario}`, async () => {
    const f = fixture();
    if (scenario === 'overflow') { f.state.activeCount = 65; f.state.active = Array.from({ length: 64 }, (_, i) => ({ ...f.state.active[0], id: String(i) })); }
    if (scenario === 'truncated games') f.state.activeCount = 2;
    if (scenario === 'truncated moves') f.state.logs = f.state.logs.slice(0, 4);
    if (scenario === 'missing moves') { f.state.logs = []; f.state.moveCount = 0; }
    if (scenario === 'missing counts') f.state.activeCountAvailable = false;
    if (scenario === 'missing move count') f.state.moveCountAvailable = false;
    if (scenario === 'move overflow') f.state.moveCount = 1_025;
    if (scenario === 'gap') { f.state.logs.splice(4, 1); f.state.moveCount--; }
    if (scenario === 'missing leading moves') { f.state.logs = f.state.logs.slice(2); f.state.moveCount -= 2; }
    if (scenario === 'wrong final') f.state.active[0].fen = START_FEN;
    if (scenario === 'illegal san') f.state.logs[0].san = 'Qa8';
    if (scenario === 'missing before') f.state.logs[0].fen_before = '';
    if (scenario === 'missing after') f.state.logs[0].fen_after = '';
    if (scenario === 'foreign move') f.state.logs[0].game_id = 'unrelated';
    if (scenario === 'duplicate move') f.state.logs[1].id = f.state.logs[0].id;
    await expect(deriveProtectedAnalysisOverlap({ serviceClient: f.client, userId: USER, requestFen: START_FEN, requestMoves: SANS }))
      .rejects.toMatchObject({ code: 'ANTI_CHEAT_EVIDENCE_INVALID' });
  });
}

test('remediation: a complete zero-move active game is valid evidence', async () => {
  const f = fixture([]);
  const overlap = await deriveProtectedAnalysisOverlap({ serviceClient: f.client, userId: USER, requestFen: START_FEN, requestMoves: [] });
  expect(overlap.activeGameFen).toBe(parsePosition(START_FEN).engineFen);
  expect(overlap.activeGameMoves).toEqual([]);
});

test('remediation: exactly 64 complete games are admitted with exact count requests', async () => {
  const f = fixture([]);
  f.state.activeCount = 64;
  f.state.active = Array.from({ length: 64 }, (_, i) => ({ ...f.state.active[0], id: String(i) }));
  await deriveProtectedAnalysisOverlap({ serviceClient: f.client, userId: USER, requestFen: START_FEN, requestMoves: [] });
  expect(f.state.activeLimit).toBe(64);
  expect(f.state.requestedCounts).toEqual([{ count: 'exact' }, { count: 'exact' }]);
});

test('remediation: a repeated starting board with advanced counters is not a zero-move game', async () => {
  const f = fixture([]);
  f.state.active[0].fen = START_FEN.replace('0 1', '4 3');
  await expect(deriveProtectedAnalysisOverlap({ serviceClient: f.client, userId: USER, requestFen: START_FEN, requestMoves: [] }))
    .rejects.toMatchObject({ code: 'ANTI_CHEAT_EVIDENCE_INVALID' });
});

for (const action of ['CLEAR_RESTRICTION', 'TEMPORARY_UNLOCK', 'KEEP_LOCKED_PENDING_REVIEW']) {
  test(`remediation: valid moderator ${action} preserves its effective access`, async () => {
    const effective = action === 'CLEAR_RESTRICTION' ? 'NO_RESTRICTION' :
      action === 'TEMPORARY_UNLOCK' ? 'MONITOR_ONLY' : 'REVIEW_LOCKED';
    const f = enforcementClient({
      enforcement_state: 'REVIEW_LOCKED', override_action: action, override_state: effective,
      override_set_by: 'moderator', override_reason: 'Verified appeal',
      override_expires_at: action === 'TEMPORARY_UNLOCK' ? new Date(Date.now() + 60_000).toISOString() : null,
    });
    const result = await getIntegrityControlledTruth({
      fen: START_FEN, mode: 'analyst', context: { type: 'completed-game-review' }, userId: USER,
      ...stores(), enforcementStore: f.store, requireDurableControls: true, truthProvider: truth,
    });
    expect(result.audit.enforcement.baselineState).toBe('REVIEW_LOCKED');
    expect(result.audit.enforcement.state).toBe(effective);
    expect(result.ok).toBe(action !== 'KEEP_LOCKED_PENDING_REVIEW');
    expect(f.writes()).toBe(0);
  });
}

test('remediation: durable history decays once and is not discounted by an unrelated opening match', () => {
  const now = Date.parse('2026-09-08T12:00:00Z');
  const input = { requestFen: START_FEN, context: { type: 'completed-game-review' as const }, nowEpochMs: now };
  const history = { signalCounts: { confirmedOverlap: 8 }, lastSignalAtEpochMs: now - 30 * 60 * 1000 };
  const clean = evaluateOverlap({ ...input, overlap: history });
  const book = evaluateOverlap({ ...input, overlap: { ...history, activeGameMoves: ['e4'], requestMoves: ['e4'] } });
  expect(clean.suspicion.reasons.find(r => r.signal === 'confirmed_overlap')?.weight).toBe(48);
  expect(book.suspicion.reasons.find(r => r.signal === 'confirmed_overlap')?.weight).toBe(48);
});

test('remediation: historical and current confirmed overlap are not added twice', async () => {
  const f = fixture();
  const deps = stores();
  deps.antiCheatStore.countRecentSignalsByUser = async () => ({ confirmedOverlap: 8 });
  const result = await getIntegrityControlledTruth({
    fen: f.game.fen, mode: 'analyst', context: { type: 'completed-game-review' }, userId: USER,
    ...deps, requireDurableControls: true, truthProvider: truth,
    overlap: { activeGameFen: f.game.fen, activeGameMoves: SANS, requestMoves: SANS, signalCounts: { confirmedOverlap: 8 } },
  });
  expect(result.audit.antiCheat.suspicion.reasons.find(r => r.signal === 'confirmed_overlap')?.occurrences).toBe(8);
});

test('remediation: evaluator independently rejects a contradictory effective source bundle', async () => {
  const deps = stores();
  const baseline = await deps.enforcementStore.getEffectiveState(USER);
  deps.enforcementStore.getEffectiveState = async () => ({
    ...baseline, sourceSuspicionTier: 'ESCALATE_REVIEW', sourceRecommendedAction: 'SEND_TO_MODERATOR_QUEUE',
  });
  await expect(getIntegrityControlledTruth({
    fen: START_FEN, mode: 'analyst', context: { type: 'completed-game-review' }, userId: USER,
    ...deps, requireDurableControls: true, truthProvider: truth,
  })).rejects.toMatchObject({ code: 'ANTI_CHEAT_EVIDENCE_INVALID' });
});

test('remediation: a complete nonmatching opening permits canonical completed review', async () => {
  const f = fixture(['e4', 'e5']);
  let called = false;
  const result = await runProtectedAnalysisRequest({
    serviceClient: f.client, userId: USER, gameId: GAME, fen: START_FEN, mode: 'analyst', ...stores(),
    protectedReviewTruthProvider: async () => { called = true; return truth(); },
  });
  expect(called).toBe(true);
  expect(result.ok).toBe(true);
});

test('remediation: same live position through a different opening move order is blocked', async () => {
  const f = fixture(['Nf3', 'Nf6', 'Nc3', 'Nc6']);
  const board = new Chess();
  f.state.logs = ['Nc3', 'Nc6', 'Nf3', 'Nf6'].map((san, index) => {
    const fen_before = board.fen();
    board.move(san);
    return { id: String(index), game_id: ACTIVE, san, fen_before, fen_after: board.fen(), created_at: new Date(index * 1000).toISOString() };
  });
  let called = false;
  const result = await runProtectedAnalysisRequest({
    serviceClient: f.client, userId: USER, gameId: GAME, fen: f.game.fen, mode: 'analyst', ...stores(),
    protectedReviewTruthProvider: async () => { called = true; return truth(); },
  });
  expect(called).toBe(false);
  expect(result.audit.antiCheat.matchSummary.positionMatch).toBe(true);
  expect(result.ok).toBe(false);
});

test('re-review: repeated nonmatching opening reviews never build an enforcement lock', async () => {
  const f = fixture(['e4', 'e5']);
  const deps = stores();
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await runProtectedAnalysisRequest({
      serviceClient: f.client, userId: USER, gameId: GAME, fen: START_FEN, mode: 'explainer', ...deps,
    });
    expect(result.ok).toBe(true);
    expect(result.audit.antiCheat.verdict).toBe('BOOK_OVERLAP');
    expect(result.audit.antiCheat.protectedContext).toBe(false);
    expect(result.audit.enforcement.state).toBe('NO_RESTRICTION');
  }
  const counts = await deps.antiCheatStore.countRecentSignalsByUser(USER, '2020-01-01T00:00:00Z');
  expect(counts.openingBookOverlap).toBe(100);
  expect(counts.protectedOverlapAttempt).toBe(0);
  expect(counts.blockedRequest).toBe(0);
});

test('re-review: book history stays weak while genuine protected history still locks', async () => {
  for (const genuine of [false, true]) {
    const deps = stores();
    deps.antiCheatStore.countRecentSignalsByUser = async () => ({ openingBookOverlap: 10_000, confirmedOverlap: genuine ? 8 : 0 });
    let called = 0;
    const result = await getIntegrityControlledTruth({
      fen: START_FEN, mode: 'analyst', context: { type: 'completed-game-review' }, userId: USER,
      ...deps, requireDurableControls: true, truthProvider: async () => { called++; return truth(); },
    });
    expect(result.ok).toBe(!genuine);
    expect(called).toBe(genuine ? 0 : 1);
    expect(result.audit.enforcement.state).toBe(genuine ? 'REVIEW_LOCKED' : 'NO_RESTRICTION');
  }
});

function eventClient(patch: Record<string, unknown>) {
  const row = {
    id: 'event', user_id: USER, game_id: null, fen: START_FEN, overlap_verdict: 'CLEAR',
    suspicion_score: 0, suspicion_tier: 'CLEAR', reasons_json: [], protected_context: false,
    engine_called: true, request_context: {}, created_at: new Date().toISOString(), ...patch,
  };
  const client = { from() { const q = {
    select() { return q; }, eq() { return q; }, gte() { return q; }, order() { return q; }, limit() { return q; },
    then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: [row], error: null })); },
    insert: async () => ({ error: null }),
  }; return q; } } as unknown as SupabaseClient;
  return new SupabaseAntiCheatEventStore(client);
}

for (const [label, patch] of [
  ...[-1, 'not-a-count', '3', 1.5, 10_001, null, undefined, Number.NaN, Number.POSITIVE_INFINITY].map((occurrences) =>
    [`probe ${String(occurrences)}`, { reasons_json: [{ signal: 'repeated_probing', occurrences }] }] as const),
  ['malformed reasons', { reasons_json: {} }],
  ['negative score', { suspicion_score: -1 }],
  ['string score', { suspicion_score: 'not-a-score' }],
] as [string, Record<string, unknown>][]) {
  test(`re-review: raw persisted ${label} fails before analysis`, async () => {
    let called = 0;
    await expect(getIntegrityControlledTruth({
      fen: START_FEN, mode: 'analyst', context: { type: 'completed-game-review' }, userId: USER,
      ...stores(), antiCheatStore: eventClient(patch), requireDurableControls: true,
      truthProvider: async () => { called++; return truth(); },
    })).rejects.toMatchObject({ code: 'ANTI_CHEAT_EVIDENCE_INVALID' });
    expect(called).toBe(0);
  });
}

test('re-review: raw valid probing evidence reaches durable enforcement', async () => {
  const result = await getIntegrityControlledTruth({
    fen: START_FEN, mode: 'analyst', context: { type: 'completed-game-review' }, userId: USER,
    ...stores(), antiCheatStore: eventClient({ reasons_json: [{ signal: 'repeated_probing', occurrences: 10_000 }] }),
    requireDurableControls: true, truthProvider: truth,
  });
  expect(result.ok).toBe(false);
  expect(result.audit.antiCheat.suspicion.reasons.find(r => r.signal === 'repeated_probing')?.occurrences).toBe(10_000);
});

for (const action of ['CLEAR_RESTRICTION', 'TEMPORARY_UNLOCK', 'KEEP_LOCKED_PENDING_REVIEW']) {
  for (const field of ['override_set_by', 'override_reason']) {
    for (const invalid of [null, '   ']) {
      test(`re-review: ${action} rejects ${field} ${String(invalid)}`, async () => {
        const f = enforcementClient({
          enforcement_state: 'REVIEW_LOCKED', override_action: action,
          override_state: action === 'CLEAR_RESTRICTION' ? 'NO_RESTRICTION' : action === 'TEMPORARY_UNLOCK' ? 'MONITOR_ONLY' : 'REVIEW_LOCKED',
          override_set_by: 'moderator', override_reason: 'Verified appeal',
          override_expires_at: new Date(Date.now() + 60_000).toISOString(), [field]: invalid,
        });
        let called = 0;
        await expect(getIntegrityControlledTruth({
          fen: START_FEN, mode: 'analyst', context: { type: 'completed-game-review' }, userId: USER,
          ...stores(), enforcementStore: f.store, requireDurableControls: true,
          truthProvider: async () => { called++; return truth(); },
        })).rejects.toMatchObject({ code: 'ANTI_CHEAT_EVIDENCE_INVALID' });
        expect(called).toBe(0);
        expect(f.writes()).toBe(0);
      });
    }
  }
}
