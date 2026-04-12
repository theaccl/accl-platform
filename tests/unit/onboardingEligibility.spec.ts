import { expect, test } from '@playwright/test';

import { evaluateTournamentEligibility } from '../../lib/eligibilityPolicy';
import { upsertEligibilityFromOnboarding, validateEligibilityCapture } from '../../lib/onboardingEligibility';

test.describe('onboarding eligibility capture', () => {
  test('signup creates baseline eligibility record', async () => {
    let recordedPayload: Record<string, unknown> | null = null;
    const mockClient = {
      from: () => ({
        upsert: (payload: Record<string, unknown>) => {
          recordedPayload = payload;
          return {
            select: () => ({
              single: async () => ({
                data: {
                  user_id: payload.user_id,
                  country: payload.country,
                  region: payload.region,
                  eligibility_status: payload.eligibility_status,
                  reason: payload.reason,
                  last_verified_at: payload.last_verified_at,
                },
                error: null,
              }),
            }),
          };
        },
      }),
    } as unknown as Parameters<typeof upsertEligibilityFromOnboarding>[0];

    const result = await upsertEligibilityFromOnboarding(mockClient, {
      userId: 'user-1',
      country: 'CA',
      region: null,
    });

    expect(recordedPayload).not.toBeNull();
    if (!recordedPayload) throw new Error('expected baseline payload to be recorded');
    const baselinePayload = recordedPayload as { user_id?: string; country?: string };
    expect(baselinePayload.user_id).toBe('user-1');
    expect(baselinePayload.country).toBe('CA');
    expect(result.decision.status).toBe('FULL_TOURNAMENT_ACCESS');
  });

  test('conditional region/state requirement works', () => {
    const usWithoutRegion = validateEligibilityCapture({ country: 'US', region: '' });
    expect(usWithoutRegion.ok).toBe(false);
    expect(usWithoutRegion.reason).toContain('region is required');

    const caWithoutRegion = validateEligibilityCapture({ country: 'CA', region: '' });
    expect(caWithoutRegion.ok).toBe(true);
  });

  test('restricted user sees limited-access state early', () => {
    const restricted = evaluateTournamentEligibility({ country: 'FREE_ONLY' });
    expect(restricted.status).toBe('FREE_ONLY');
    expect(restricted.canEnterPaidTournaments).toBe(false);
    expect(restricted.canAccessTraining).toBe(true);
  });
});
