import { expect, test } from '@playwright/test';

import { createEntryPost } from '@/app/api/payments/create-entry/handler';
import { depositPost } from '@/app/api/payments/deposit/handler';
import { matchRequestAcceptPost } from '@/app/api/match-requests/accept/handler';
import { matchRequestJoinOpenPost } from '@/app/api/match-requests/join-open-listing/handler';
import { payoutRequestPost } from '@/app/api/payouts/request/handler';
import { tournamentJoinPost } from '@/app/api/tournaments/join/handler';
import { tournamentRegisterPost } from '@/app/api/tournaments/register/handler';
import {
  EMAIL_VERIFICATION_REQUIRED_CODE,
  EMAIL_VERIFICATION_REQUIRED_MESSAGE,
  isEmailPasswordIdentity,
  requiresEmailVerificationForProvisioning,
} from '@/lib/emailVerificationGate';
import type { PaymentProvider } from '@/lib/payments/paymentProvider';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TOURNAMENT_ID = '550e8400-e29b-41d4-a716-446655440010';

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

function hybridUnconfirmedEmailPrimaryUser() {
  return {
    id: '880e8400-e29b-41d4-a716-446655440003',
    email: 'hybrid@example.com',
    email_confirmed_at: null,
    confirmed_at: null,
    app_metadata: { provider: 'email' },
    user_metadata: {},
    identities: [{ provider: 'google' }, { provider: 'email' }],
  };
}

function hybridUnconfirmedOAuthPrimaryUser() {
  return {
    id: '890e8400-e29b-41d4-a716-446655440004',
    email: 'hybrid@example.com',
    email_confirmed_at: null,
    confirmed_at: null,
    app_metadata: { provider: 'google' },
    user_metadata: {},
    identities: [{ provider: 'google' }, { provider: 'email' }],
  };
}

test.describe('email verification competitive gate', () => {
  test('unconfirmed email-password user is blocked by central rule', () => {
    expect(requiresEmailVerificationForProvisioning(unconfirmedEmailUser())).toBe(true);
    expect(isEmailPasswordIdentity(unconfirmedEmailUser())).toBe(true);
  });

  test('oauth-only user is not blocked', () => {
    expect(requiresEmailVerificationForProvisioning(oauthUser())).toBe(false);
  });

  test('hybrid identity follows Phase B1 provider precedence', () => {
    expect(requiresEmailVerificationForProvisioning(hybridUnconfirmedEmailPrimaryUser())).toBe(true);
    expect(requiresEmailVerificationForProvisioning(hybridUnconfirmedOAuthPrimaryUser())).toBe(false);
  });
});

test.describe('tournament join and register', () => {
  test('unconfirmed user cannot join a tournament', async () => {
    let joinCalls = 0;
    const res = await tournamentJoinPost(
      new Request('http://localhost/api/tournaments/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: TOURNAMENT_ID }),
      }),
      {
        resolveTournamentJoinActorCookieOnly: async () => unconfirmedEmailUser(),
        createServiceRoleClient: () => {
          throw new Error('service role should not be reached');
        },
        executeFreePendingTournamentJoin: async () => {
          joinCalls += 1;
          return { ok: true, alreadyJoined: false, eligibility: {} as never };
        },
        resolveUserNexusEcosystemFromAuthMetadata: () => 'adult',
      },
    );

    expect(res.status).toBe(403);
    expect(joinCalls).toBe(0);
    const body = (await res.json()) as { code?: string; error?: string };
    expect(body.code).toBe(EMAIL_VERIFICATION_REQUIRED_CODE);
    expect(body.error).toBe(EMAIL_VERIFICATION_REQUIRED_MESSAGE);
    expect(body.error).not.toMatch(/supabase|provider|not found/i);
  });

  test('unconfirmed user cannot register for a tournament', async () => {
    let joinCalls = 0;
    const res = await tournamentRegisterPost(
      new Request('http://localhost/api/tournaments/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id: TOURNAMENT_ID }),
      }),
      {
        resolveTournamentJoinActorCookieOrBearer: async () => unconfirmedEmailUser(),
        createServiceRoleClient: () => {
          throw new Error('service role should not be reached');
        },
        executeFreePendingTournamentJoin: async () => {
          joinCalls += 1;
          return { ok: true, alreadyJoined: false, eligibility: {} as never };
        },
        resolveUserNexusEcosystemFromAuthMetadata: () => 'adult',
      },
    );

    expect(res.status).toBe(403);
    expect(joinCalls).toBe(0);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe(EMAIL_VERIFICATION_REQUIRED_CODE);
  });

  test('confirmed email-password user can reach join execution', async () => {
    let joinCalls = 0;
    const res = await tournamentJoinPost(
      new Request('http://localhost/api/tournaments/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: TOURNAMENT_ID }),
      }),
      {
        resolveTournamentJoinActorCookieOnly: async () => confirmedEmailUser(),
        createServiceRoleClient: () => ({}) as never,
        executeFreePendingTournamentJoin: async () => {
          joinCalls += 1;
          return { ok: true, alreadyJoined: false, eligibility: {} as never };
        },
        resolveUserNexusEcosystemFromAuthMetadata: () => 'adult',
      },
    );

    expect(res.status).toBe(200);
    expect(joinCalls).toBe(1);
  });

  test('oauth-only user can reach join execution without mailbox confirmation', async () => {
    let joinCalls = 0;
    const res = await tournamentJoinPost(
      new Request('http://localhost/api/tournaments/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: TOURNAMENT_ID }),
      }),
      {
        resolveTournamentJoinActorCookieOnly: async () => oauthUser(),
        createServiceRoleClient: () => ({}) as never,
        executeFreePendingTournamentJoin: async () => {
          joinCalls += 1;
          return { ok: true, alreadyJoined: false, eligibility: {} as never };
        },
        resolveUserNexusEcosystemFromAuthMetadata: () => 'adult',
      },
    );

    expect(res.status).toBe(200);
    expect(joinCalls).toBe(1);
  });
});

test.describe('payments and wallet routes', () => {
  test('unconfirmed user cannot create paid entry before provider or ledger work', async () => {
    let providerCalls = 0;
    let insertCalls = 0;
    const res = await createEntryPost(
      new Request('http://localhost/api/payments/create-entry', {
        method: 'POST',
        headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id: TOURNAMENT_ID }),
      }),
      {
        resolveAuthenticatedUser: async () => unconfirmedEmailUser(),
        createServiceRoleClient: () =>
          ({
            from: () => ({
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => {
                    insertCalls += 1;
                    return { data: null, error: null };
                  },
                }),
              }),
              insert: () => {
                insertCalls += 1;
                return { select: () => ({ single: async () => ({ data: null, error: null }) }) };
              },
            }),
          }) as never,
        isPaidEntryDisabled: () => false,
        resolveEligibilityDecisionForUser: async () => {
          throw new Error('eligibility should not run');
        },
        enforceTournamentRegistration: () => {},
        checkTournamentRegistrationOpen: async () => ({ open: true, code: 'ok' }),
        getPaymentProvider: async () => {
          providerCalls += 1;
          const provider: PaymentProvider = {
            name: 'mock',
            createPaymentIntent: async () => ({
              provider: 'mock',
              providerPaymentId: 'pi',
              clientSecret: 'sec',
            }),
            parseIncomingWebhook: () => ({ kind: 'ignored', eventId: 'evt_test', detail: 'test' }),
            createPayoutTransfer: async () => ({
              provider: 'mock',
              transferId: 'tr',
              status: 'stub',
            }),
          };
          return provider;
        },
        evaluateAbnormalEntryPattern: async () => {},
      },
    );

    expect(res.status).toBe(403);
    expect(providerCalls).toBe(0);
    expect(insertCalls).toBe(0);
    const body = (await res.json()) as { code?: string; error?: string };
    expect(body.code).toBe(EMAIL_VERIFICATION_REQUIRED_CODE);
    expect(body.error).not.toMatch(/stripe|secret|token|password/i);
  });

  test('unconfirmed user cannot initiate deposit eligibility check', async () => {
    let eligibilityCalls = 0;
    const res = await depositPost(
      new Request('http://localhost/api/payments/deposit', {
        method: 'POST',
        headers: { Authorization: 'Bearer token' },
      }),
      {
        resolveAuthenticatedUser: async () => unconfirmedEmailUser(),
        createServiceRoleClient: () => ({}) as never,
        resolveEligibilityDecisionForUser: async () => {
          eligibilityCalls += 1;
          return {} as never;
        },
        enforceDepositAccess: () => {},
      },
    );

    expect(res.status).toBe(403);
    expect(eligibilityCalls).toBe(0);
    const body = (await res.json()) as { code?: string; error?: string };
    expect(body.code).toBe(EMAIL_VERIFICATION_REQUIRED_CODE);
  });

  test('unconfirmed user cannot request payout access', async () => {
    let payoutCalls = 0;
    const res = await payoutRequestPost(new Request('http://localhost/api/payouts/request', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
    }), {
      resolveAuthenticatedUser: async () => unconfirmedEmailUser(),
      createServiceRoleClient: () => ({}) as never,
      resolveEligibilityDecisionForUser: async () => {
        payoutCalls += 1;
        return {} as never;
      },
      enforcePayoutAccess: () => {},
    });

    expect(res.status).toBe(403);
    expect(payoutCalls).toBe(0);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe(EMAIL_VERIFICATION_REQUIRED_CODE);
  });

  test('confirmed email-password user can reach deposit eligibility path', async () => {
    let eligibilityCalls = 0;
    const res = await depositPost(
      new Request('http://localhost/api/payments/deposit', {
        method: 'POST',
        headers: { Authorization: 'Bearer token' },
      }),
      {
        resolveAuthenticatedUser: async () => confirmedEmailUser(),
        createServiceRoleClient: () => ({}) as never,
        resolveEligibilityDecisionForUser: async () => {
          eligibilityCalls += 1;
          return { status: 'FULL', canEnterPaidTournaments: true } as never;
        },
        enforceDepositAccess: () => {},
      },
    );

    expect(res.status).toBe(200);
    expect(eligibilityCalls).toBe(1);
  });
});

test.describe('match requests and direct challenges', () => {
  test('unconfirmed user cannot accept a direct challenge', async () => {
    let supabaseCreated = false;
    const res = await matchRequestAcceptPost(
      new Request('http://localhost/api/match-requests/accept', {
        method: 'POST',
        headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: '880e8400-e29b-41d4-a716-446655440099' }),
      }),
      {
        resolveAuthenticatedUser: async () => unconfirmedEmailUser(),
        bearerToken: () => 'token',
        createUserSupabase: () => {
          supabaseCreated = true;
          throw new Error('supabase should not be created');
        },
        userHasConflictingPlatQueueSlotAdmin: async () => null,
        invalidateLiveQueueAvailabilityForUsers: async () => {},
      },
    );

    expect(res.status).toBe(403);
    expect(supabaseCreated).toBe(false);
    const body = (await res.json()) as { code?: string; error?: string };
    expect(body.code).toBe(EMAIL_VERIFICATION_REQUIRED_CODE);
    expect(body.error).not.toMatch(/supabase|stripe|password|token/i);
  });

  test('unconfirmed user cannot join an open listing', async () => {
    let supabaseCreated = false;
    const res = await matchRequestJoinOpenPost(
      new Request('http://localhost/api/match-requests/join-open-listing', {
        method: 'POST',
        headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: '880e8400-e29b-41d4-a716-446655440099' }),
      }),
      {
        resolveAuthenticatedUser: async () => unconfirmedEmailUser(),
        bearerToken: () => 'token',
        createUserSupabase: () => {
          supabaseCreated = true;
          throw new Error('supabase should not be created');
        },
        userInSeatedInSamePlatQueueSlotAdmin: async () => ({ blocked: false }),
        invalidateLiveQueueAvailabilityForUsers: async () => {},
      },
    );

    expect(res.status).toBe(403);
    expect(supabaseCreated).toBe(false);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe(EMAIL_VERIFICATION_REQUIRED_CODE);
  });

  test('oauth-only user can reach open-listing handler before supabase work', async () => {
    let supabaseCreated = false;
    const res = await matchRequestJoinOpenPost(
      new Request('http://localhost/api/match-requests/join-open-listing', {
        method: 'POST',
        headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: '880e8400-e29b-41d4-a716-446655440099' }),
      }),
      {
        resolveAuthenticatedUser: async () => oauthUser(),
        bearerToken: () => 'token',
        createUserSupabase: () => {
          supabaseCreated = true;
          return {
            from: () => ({
              select: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
              }),
            }),
          } as never;
        },
        userInSeatedInSamePlatQueueSlotAdmin: async () => ({ blocked: false }),
        invalidateLiveQueueAvailabilityForUsers: async () => {},
      },
    );

    expect(supabaseCreated).toBe(true);
    expect(res.status).toBe(404);
  });
});

test.describe('tournament check-in and bootstrap invariants', () => {
  test('check-in requires an existing tournament entry before mutation', () => {
    const src = readFileSync(
      join(process.cwd(), 'app', 'api', 'tournaments', '[id]', 'check-in', 'route.ts'),
      'utf8',
    );
    const entryLookup = src.indexOf("from('tournament_entries')");
    const updatePatch = src.indexOf('.update(patch)');
    expect(entryLookup).toBeGreaterThan(-1);
    expect(updatePatch).toBeGreaterThan(entryLookup);
    expect(src).toContain("if (!entry) return json({ ok: false, error: 'Not registered for this tournament.' }, 403);");
  });

  test('bootstrap is host or moderator only and does not create tournament entries', () => {
    const src = readFileSync(
      join(process.cwd(), 'app', 'api', 'tournaments', '[id]', 'bootstrap', 'route.ts'),
      'utf8',
    );
    expect(src).toContain('canUserOperateTournament');
    expect(src).not.toMatch(/from\(['"]tournament_entries['"]\)\.insert/);
  });

  test('self-serve tournament join is gated before entry insertion helpers', () => {
    const src = readFileSync(
      join(process.cwd(), 'app', 'api', 'tournaments', 'join', 'handler.ts'),
      'utf8',
    );
    const gate = src.indexOf('provisioningBlockedReason');
    const joinCall = src.indexOf('executeFreePendingTournamentJoin');
    expect(gate).toBeGreaterThan(-1);
    expect(joinCall).toBeGreaterThan(gate);
  });
});

test.describe('remaining client-side competitive surfaces', () => {
  test('direct match_requests insert and create_seated_game_guard remain client-side only', () => {
    const challengePanel = readFileSync(
      join(process.cwd(), 'components', 'DirectChallengePanel.tsx'),
      'utf8',
    );
    expect(challengePanel).toContain("from('match_requests')");
    expect(challengePanel).not.toContain('/api/match-requests/');
    const seated = readFileSync(join(process.cwd(), 'lib', 'createSeatedFreePlayGame.ts'), 'utf8');
    expect(seated).toContain('create_seated_game_guard');
  });
});
