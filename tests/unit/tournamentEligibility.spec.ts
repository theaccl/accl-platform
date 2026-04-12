import { expect, test } from '@playwright/test';

import {
  enforceTournamentRegistration,
  EligibilityEnforcementError,
} from '../../lib/tournamentEligibilityEnforcement';
import { evaluateTournamentEligibility } from '../../lib/eligibilityPolicy';

test.describe('tournament eligibility policy', () => {
  test('restricted jurisdiction is blocked from paid tournament entry', () => {
    const decision = evaluateTournamentEligibility({ country: 'FREE_ONLY' });
    expect(decision.status).toBe('FREE_ONLY');
    expect(decision.canEnterPaidTournaments).toBe(false);
    expect(() => enforceTournamentRegistration(decision)).toThrow(EligibilityEnforcementError);
  });

  test('restricted jurisdiction still allows free play/training paths', () => {
    const decision = evaluateTournamentEligibility({ country: 'FREE_ONLY' });
    expect(decision.canAccessFreePlay).toBe(true);
    expect(decision.canAccessTraining).toBe(true);
  });

  test('server-side registration gate blocks bypass attempts', () => {
    const forgedUiBypassDecision = evaluateTournamentEligibility({ country: 'TRAINING_ONLY' });
    expect(forgedUiBypassDecision.status).toBe('TRAINING_ONLY');
    try {
      enforceTournamentRegistration(forgedUiBypassDecision);
      throw new Error('expected registration enforcement to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(EligibilityEnforcementError);
      const err = e as EligibilityEnforcementError;
      expect(err.code).toBe('TOURNAMENT_ENTRY_NOT_ALLOWED');
    }
  });
});
