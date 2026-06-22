import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { freePlayCreateOpenSeatPost } from '@/app/api/free-play/create-open-seat/handler';
import { freePlayCreateSeatedGamePost } from '@/app/api/free-play/create-seated-game/handler';
import { matchRequestCreateChallengePost } from '@/app/api/match-requests/create-challenge/handler';
import { matchRequestCreateRematchPost } from '@/app/api/match-requests/create-rematch/handler';
import {
  EMAIL_VERIFICATION_REQUIRED_CODE,
  EMAIL_VERIFICATION_REQUIRED_MESSAGE,
  requiresEmailVerificationForProvisioning,
} from '@/lib/emailVerificationGate';

const MIGRATION = '20260621190000_email_verification_client_boundary_hardening.sql';

function confirmedEmailUser(email = 'user@gmail.com') {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email,
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email' },
    user_metadata: {},
    identities: [{ provider: 'email' }],
  };
}

function unconfirmedEmailUser(email = 'pending@example.com') {
  return {
    id: '660e8400-e29b-41d4-a716-446655440001',
    email,
    email_confirmed_at: null,
    confirmed_at: null,
    app_metadata: { provider: 'email' },
    user_metadata: {},
    identities: [{ provider: 'email' }],
  };
}

function oauthUser(email = 'oauth@example.com') {
  return {
    id: '770e8400-e29b-41d4-a716-446655440002',
    email,
    email_confirmed_at: null,
    app_metadata: { provider: 'google' },
    user_metadata: {},
    identities: [{ provider: 'google' }],
  };
}

const OPPONENT_ID = '550e8400-e29b-41d4-a716-446655440099';
const SOURCE_GAME_ID = '650e8400-e29b-41d4-a716-446655440010';

function authRequest(path: string, body: unknown, token = 'test-token') {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

test.describe('email verification Phase B3 competitive gates', () => {
  test('unconfirmed email-password user cannot create a direct challenge', async () => {
    let insertCalls = 0;
    const res = await matchRequestCreateChallengePost(
      authRequest('/api/match-requests/create-challenge', {
        toUserId: OPPONENT_ID,
        colorPreference: 'white',
        platMode: 'rapid',
        platClock: '5m',
        rated: false,
        fromUserId: 'evil-impersonator',
      }),
      {
        resolveAuthenticatedUser: async () => unconfirmedEmailUser(),
        bearerToken: () => 'token',
        createUserSupabase: () => {
          throw new Error('user supabase should not be reached');
        },
        createServiceRoleClient: () => {
          insertCalls += 1;
          throw new Error('service role should not be reached');
        },
      },
    );

    expect(res.status).toBe(403);
    expect(insertCalls).toBe(0);
    const body = (await res.json()) as { code?: string; error?: string };
    expect(body.code).toBe(EMAIL_VERIFICATION_REQUIRED_CODE);
    expect(body.error).toBe(EMAIL_VERIFICATION_REQUIRED_MESSAGE);
  });

  test('confirmed user can create a direct challenge with server-derived sender id', async () => {
    let insertedFrom: string | null = null;
    const res = await matchRequestCreateChallengePost(
      authRequest('/api/match-requests/create-challenge', {
        toUserId: OPPONENT_ID,
        colorPreference: 'white',
        platMode: 'rapid',
        platClock: '5m',
        rated: false,
      }),
      {
        resolveAuthenticatedUser: async () => confirmedEmailUser(),
        bearerToken: () => 'token',
        createUserSupabase: () =>
          ({
            from: () => ({
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      eq: () => ({
                        eq: () => ({
                          eq: () => ({
                            eq: () => ({
                              eq: () => ({
                                eq: () => ({
                                  limit: () => ({
                                    maybeSingle: async () => ({ data: null, error: null }),
                                  }),
                                }),
                              }),
                            }),
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }) as never,
        createServiceRoleClient: () =>
          ({
            from: () => ({
              insert: (row: { from_user_id?: string }) => {
                insertedFrom = row.from_user_id ?? null;
                return {
                  select: () => ({
                    single: async () => ({ data: { id: 'req-1' }, error: null }),
                  }),
                };
              },
            }),
          }) as never,
      },
    );

    expect(res.status).toBe(200);
    expect(insertedFrom).toBe(confirmedEmailUser().id);
    const body = (await res.json()) as { ok?: boolean; requestId?: string };
    expect(body.ok).toBe(true);
    expect(body.requestId).toBe('req-1');
  });

  test('oauth-only user is not blocked from creating a challenge', async () => {
    const res = await matchRequestCreateChallengePost(
      authRequest('/api/match-requests/create-challenge', {
        toUserId: OPPONENT_ID,
        colorPreference: 'random',
        platMode: 'rapid',
        platClock: '5m',
        rated: true,
      }),
      {
        resolveAuthenticatedUser: async () => oauthUser(),
        bearerToken: () => 'token',
        createUserSupabase: () =>
          ({
            from: () => ({
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      eq: () => ({
                        eq: () => ({
                          eq: () => ({
                            eq: () => ({
                              eq: () => ({
                                eq: () => ({
                                  limit: () => ({
                                    maybeSingle: async () => ({ data: null, error: null }),
                                  }),
                                }),
                              }),
                            }),
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }) as never,
        createServiceRoleClient: () =>
          ({
            from: () => ({
              insert: () => ({
                select: () => ({
                  single: async () => ({ data: { id: 'req-oauth' }, error: null }),
                }),
              }),
            }),
          }) as never,
      },
    );

    expect(res.status).toBe(200);
    expect(requiresEmailVerificationForProvisioning(oauthUser())).toBe(false);
  });

  test('unconfirmed user cannot create rematch before match_requests insert', async () => {
    let insertCalls = 0;
    const res = await matchRequestCreateRematchPost(
      authRequest('/api/match-requests/create-rematch', { sourceGameId: SOURCE_GAME_ID }),
      {
        resolveAuthenticatedUser: async () => unconfirmedEmailUser(),
        bearerToken: () => 'token',
        createUserSupabase: () => {
          throw new Error('user supabase should not be reached');
        },
        createServiceRoleClient: () => {
          insertCalls += 1;
          throw new Error('service role should not be reached');
        },
      },
    );

    expect(res.status).toBe(403);
    expect(insertCalls).toBe(0);
  });

  test('unconfirmed user cannot seat a game before service-only seated RPC', async () => {
    let rpcCalls = 0;
    const res = await freePlayCreateSeatedGamePost(
      authRequest('/api/free-play/create-seated-game', {
        existingOpenSeatId: '750e8400-e29b-41d4-a716-446655440011',
        row: { black_player_id: unconfirmedEmailUser().id },
      }),
      {
        resolveAuthenticatedUser: async () => unconfirmedEmailUser(),
        bearerToken: () => 'token',
        createServiceRoleClient: () => {
          rpcCalls += 1;
          throw new Error('service role should not be reached');
        },
        invalidateLiveQueueAvailabilityForUsers: async () => {},
      },
    );

    expect(res.status).toBe(403);
    expect(rpcCalls).toBe(0);
  });

  test('seated-game route rejects impersonation via payload black_player_id', async () => {
    let rpcCalls = 0;
    const res = await freePlayCreateSeatedGamePost(
      authRequest('/api/free-play/create-seated-game', {
        existingOpenSeatId: '750e8400-e29b-41d4-a716-446655440011',
        row: { black_player_id: '990e8400-e29b-41d4-a716-446655440099' },
      }),
      {
        resolveAuthenticatedUser: async () => confirmedEmailUser(),
        bearerToken: () => 'token',
        createServiceRoleClient: () => {
          rpcCalls += 1;
          throw new Error('service role should not be reached');
        },
        invalidateLiveQueueAvailabilityForUsers: async () => {},
      },
    );

    expect(res.status).toBe(403);
    expect(rpcCalls).toBe(0);
  });

  test('confirmed user seated-game route calls server wrapper with server-derived actor id', async () => {
    let rpcName = '';
    let rpcActor: string | null = null;
    let rpcPayload: Record<string, unknown> | null = null;
    const res = await freePlayCreateSeatedGamePost(
      authRequest('/api/free-play/create-seated-game', {
        existingOpenSeatId: '750e8400-e29b-41d4-a716-446655440011',
        row: {},
      }),
      {
        resolveAuthenticatedUser: async () => confirmedEmailUser(),
        bearerToken: () => 'token',
        createServiceRoleClient: () =>
          ({
            rpc: (name: string, args: { p_actor_id?: string; payload?: Record<string, unknown> }) => {
              rpcName = name;
              rpcActor = args.p_actor_id ?? null;
              rpcPayload = args.payload ?? null;
              return Promise.resolve({
                data: {
                  id: 'game-1',
                  white_player_id: 'host',
                  black_player_id: confirmedEmailUser().id,
                  tempo: 'correspondence',
                },
                error: null,
              });
            },
          }) as never,
        invalidateLiveQueueAvailabilityForUsers: async () => {},
      },
    );

    expect(res.status).toBe(200);
    expect(rpcName).toBe('create_seated_game_server_guard');
    expect(rpcActor).toBe(confirmedEmailUser().id);
    expect(rpcPayload).toEqual({ black_player_id: confirmedEmailUser().id });
  });

  test('oauth-only user is not blocked from seated-game server wrapper', async () => {
    const res = await freePlayCreateSeatedGamePost(
      authRequest('/api/free-play/create-seated-game', {
        existingOpenSeatId: '750e8400-e29b-41d4-a716-446655440011',
        row: {},
      }),
      {
        resolveAuthenticatedUser: async () => oauthUser(),
        bearerToken: () => 'token',
        createServiceRoleClient: () =>
          ({
            rpc: () =>
              Promise.resolve({
                data: {
                  id: 'game-oauth',
                  white_player_id: 'host',
                  black_player_id: oauthUser().id,
                  tempo: 'correspondence',
                },
                error: null,
              }),
          }) as never,
        invalidateLiveQueueAvailabilityForUsers: async () => {},
      },
    );

    expect(res.status).toBe(200);
    expect(requiresEmailVerificationForProvisioning(oauthUser())).toBe(false);
  });

  test('unconfirmed user cannot post an open seat before service-role insert', async () => {
    let insertCalls = 0;
    const res = await freePlayCreateOpenSeatPost(
      authRequest('/api/free-play/create-open-seat', {
        mode: 'rapid',
        clock: '5m',
        rated: false,
      }),
      {
        resolveAuthenticatedUser: async () => unconfirmedEmailUser(),
        bearerToken: () => 'token',
        createUserSupabase: () => {
          throw new Error('user supabase should not be reached');
        },
        createServiceRoleClient: () => {
          insertCalls += 1;
          throw new Error('service role should not be reached');
        },
      },
    );

    expect(res.status).toBe(403);
    expect(insertCalls).toBe(0);
  });
});

test.describe('email verification Phase B3 client wiring (static)', () => {
  test('browser no longer performs direct match_requests insert for challenge or rematch', () => {
    const challengePanel = readFileSync(
      join(process.cwd(), 'components', 'DirectChallengePanel.tsx'),
      'utf8',
    );
    expect(challengePanel).toContain('/api/match-requests/create-challenge');
    expect(challengePanel).not.toMatch(/from\(['"]match_requests['"]\)[\s\S]*?\.insert\(/);

    const gamePage = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');
    expect(gamePage).toContain('/api/match-requests/create-rematch');
    expect(gamePage).not.toMatch(/from\(['"]match_requests['"]\)[\s\S]*?\.insert\(/);
  });

  test('browser seated-game and open-seat creation use gated API routes', () => {
    const seated = readFileSync(join(process.cwd(), 'lib', 'createSeatedFreePlayGame.ts'), 'utf8');
    expect(seated).toContain('/api/free-play/create-seated-game');
    expect(seated).toContain('createSeatedGameGuardViaApi');

    const queue = readFileSync(join(process.cwd(), 'lib', 'freePlayFindMatch.ts'), 'utf8');
    expect(queue).toContain('/api/free-play/create-open-seat');
  });

  test('gate runs before service-role match_requests insert in challenge handler', () => {
    const src = readFileSync(
      join(process.cwd(), 'app', 'api', 'match-requests', 'create-challenge', 'handler.ts'),
      'utf8',
    );
    const gate = src.indexOf('provisioningBlockedReason');
    const insert = src.indexOf(".from('match_requests')");
    expect(gate).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(gate);
  });

  test('requests inbox decline and cancel use server routes not direct UPDATE', () => {
    const src = readFileSync(join(process.cwd(), 'app', 'requests', 'page.tsx'), 'utf8');
    expect(src).toContain('/api/match-requests/decline');
    expect(src).toContain('/api/match-requests/cancel');
    expect(src).not.toMatch(/from\(['"]match_requests['"]\)[\s\S]*?\.update\(/);
  });

  test('gate runs before service-only seated RPC in seated handler', () => {
    const src = readFileSync(
      join(process.cwd(), 'app', 'api', 'free-play', 'create-seated-game', 'handler.ts'),
      'utf8',
    );
    const gate = src.indexOf('provisioningBlockedReason');
    const serviceClient = src.indexOf('createServiceRoleClient');
    const rpc = src.indexOf("rpc('create_seated_game_server_guard'");
    expect(gate).toBeGreaterThan(-1);
    expect(serviceClient).toBeGreaterThan(gate);
    expect(rpc).toBeGreaterThan(serviceClient);
  });

  test('open-seat handler uses service role only after gate', () => {
    const src = readFileSync(
      join(process.cwd(), 'app', 'api', 'free-play', 'create-open-seat', 'handler.ts'),
      'utf8',
    );
    const gate = src.indexOf('provisioningBlockedReason');
    const serviceClient = src.indexOf('createServiceRoleClient');
    const insert = src.indexOf(".from('games')");
    expect(gate).toBeGreaterThan(-1);
    expect(serviceClient).toBeGreaterThan(gate);
    expect(insert).toBeGreaterThan(serviceClient);
  });
});

test.describe('email verification client boundary migration (static)', () => {
  test('migration defines shared core and service-only seated wrapper', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');
    expect(sql).toContain('private.create_seated_game_guard_core');
    expect(sql).toContain('public.create_seated_game_server_guard');
    expect(sql).toMatch(/revoke all on function private\.create_seated_game_guard_core\(uuid, uuid, jsonb\) from authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.create_seated_game_server_guard\(uuid, uuid, jsonb\) to service_role/i);
    expect(sql).toMatch(/revoke all on function public\.create_seated_game_guard\(uuid, jsonb\) from authenticated/i);
  });

  test('migration revokes direct authenticated INSERT on match_requests and games', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');
    expect(sql).toMatch(/revoke insert on table public\.match_requests from authenticated/i);
    expect(sql).toMatch(/revoke insert on table public\.match_requests from anon/i);
    expect(sql).toMatch(/revoke insert on table public\.games from authenticated/i);
    expect(sql).toMatch(/revoke insert on table public\.games from anon/i);
  });

  test('migration revokes direct authenticated INSERT on tournament_entries', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');
    expect(sql).toMatch(/revoke insert on table public\.tournament_entries from authenticated/i);
    expect(sql).toMatch(/revoke insert on table public\.tournament_entries from anon/i);
    expect(sql).toMatch(/revoke insert on table public\.tournament_entries from public/i);
  });

  test('migration limits authenticated games UPDATE to draw-offer columns only', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');
    const beginIdx = sql.indexOf('begin;');
    const commitIdx = sql.indexOf('commit;');
    const forward = sql.slice(beginIdx, commitIdx + 'commit;'.length);
    expect(forward).toMatch(/revoke update on table public\.games from authenticated/i);
    expect(forward).toMatch(
      /grant update \(draw_offered_by, draw_offered_at\) on table public\.games to authenticated/i,
    );
    expect(forward).not.toMatch(/grant update on table public\.games to authenticated/i);
  });

  test('migration revokes direct authenticated UPDATE on match_requests', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');
    expect(sql).toMatch(/revoke update on table public\.match_requests from authenticated/i);
    expect(sql).toMatch(/revoke update on table public\.match_requests from anon/i);
  });

  test('migration documents dependency-safe rollback restoring standalone seated RPC before dropping core', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');
    expect(sql).toContain('ROLLBACK — Option A');
    expect(sql).toContain('20260529130000_hotfix_create_seated_game_guard_supersede_signature_alignment.sql');
    expect(sql).toMatch(/ONLY after step 5/i);
    const restoreStandalone = sql.indexOf('must NOT call private.create_seated_game_guard_core');
    const dropCore = sql.indexOf('drop function if exists private.create_seated_game_guard_core');
    expect(restoreStandalone).toBeGreaterThan(-1);
    expect(dropCore).toBeGreaterThan(restoreStandalone);
  });

  test('migration documents rollback for tournament_entries and games UPDATE grants', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');
    expect(sql).toMatch(/grant insert on table public\.tournament_entries to authenticated/i);
    expect(sql).toMatch(/grant update on table public\.games to authenticated/i);
  });

  test('prior match_requests UPDATE policies did not constrain status transitions', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20260530120000_supabase_security_hardening.sql'),
      'utf8',
    );
    expect(sql).toContain('match_requests_update_recipient_pending');
    expect(sql).toMatch(/with check \(\s*to_user_id = \(select auth\.uid\(\)\)/);
    expect(sql).not.toMatch(/match_requests_update_recipient_pending[\s\S]*status = 'declined'/i);
  });

  test('browser games UPDATE is limited to draw-offer columns', () => {
    const src = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');
    const updates = [...src.matchAll(/\.from\(['"]games['"]\)[\s\S]*?\.update\(\{([^}]+)\}/g)];
    expect(updates.length).toBeGreaterThan(0);
    for (const match of updates) {
      const body = match[1] ?? '';
      expect(body).not.toMatch(/black_player_id|white_player_id|status|rated|tournament_id|fen|turn/i);
      expect(body).toMatch(/draw_offered_by|draw_offered_at/);
    }
  });

  test('tournament join remains server-only with provisioning gate before entry insert', () => {
    const src = readFileSync(
      join(process.cwd(), 'app', 'api', 'tournaments', 'join', 'handler.ts'),
      'utf8',
    );
    const gate = src.indexOf('provisioningBlockedReason');
    const joinCall = src.indexOf('executeFreePendingTournamentJoin');
    expect(gate).toBeGreaterThan(-1);
    expect(joinCall).toBeGreaterThan(gate);
    expect(src).toContain('createServiceRoleClient');
  });

  test('migration filename is strictly after repository maximum excluding B3', () => {
    const names = readdirSync(join(process.cwd(), 'supabase', 'migrations'))
      .filter((n) => n.endsWith('.sql') && n !== MIGRATION)
      .sort();
    const maxOther = names[names.length - 1]!;
    expect(MIGRATION > maxOther).toBe(true);
    expect(maxOther).toBe('20260621170000_accl_overall_o2_free_play_atomic_dual_write.sql');
  });

  test('migration filename sorts after prior migrations and is unique', () => {
    const names = readdirSync(join(process.cwd(), 'supabase', 'migrations')).filter((n) =>
      n.endsWith('.sql'),
    );
    expect(names).toContain(MIGRATION);
    const dupes = names.filter((n) => n === MIGRATION);
    expect(dupes).toHaveLength(1);
    const sorted = [...names].sort();
    const idx = sorted.indexOf(MIGRATION);
    expect(idx).toBeGreaterThan(sorted.indexOf('20260621170000_accl_overall_o2_free_play_atomic_dual_write.sql'));
  });
});
