import { expect, test } from '@playwright/test';
import { createEntryPost, type CreateEntryRouteDeps } from '../../app/api/payments/create-entry/handler';

for (const scenario of [
  { membership: false, error: null, status: 403, code: 'battlefield_membership_required' },
  { membership: null, error: { message: 'database unavailable' }, status: 503, code: 'membership_unavailable' },
]) {
  test(`Battlefield paid entry fails before any payment work: ${scenario.code}`, async () => {
    const calls: string[] = [];
    const forbidden = () => { throw new Error('Payment or ledger work must not run'); };
    const deps: CreateEntryRouteDeps = {
      resolveAuthenticatedUser: async () => ({ id: '00000000-0000-4000-8000-000000000001', email_confirmed_at: '2026-01-01', app_metadata: {}, user_metadata: {} }),
      isPaidEntryDisabled: () => false,
      createServiceRoleClient: () => ({
        rpc: async (name: string, args: { p_user_id: string }) => {
          calls.push(name);
          expect(args.p_user_id).toBe('00000000-0000-4000-8000-000000000001');
          return { data: scenario.membership, error: scenario.error };
        }, from: forbidden,
      }) as never,
      resolveEligibilityDecisionForUser: forbidden,
      enforceTournamentRegistration: forbidden,
      checkTournamentRegistrationOpen: forbidden,
      getPaymentProvider: forbidden,
      evaluateAbnormalEntryPattern: forbidden,
    };
    const response = await createEntryPost(new Request('http://localhost/api/payments/create-entry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournament_id: '00000000-0000-4000-8000-000000000002' }),
    }), deps);
    expect(response.status).toBe(scenario.status);
    expect(await response.json()).toMatchObject({ code: scenario.code });
    expect(calls).toEqual(['has_battlefield_membership']);
  });
}
