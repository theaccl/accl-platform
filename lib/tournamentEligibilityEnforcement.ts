import type { EligibilityDecision } from '@/lib/eligibilityPolicy';
import { evaluateTournamentEligibility } from '@/lib/eligibilityPolicy';
import { getUserEligibilityMetadata } from '@/lib/userEligibilityStore';
import type { SupabaseClient } from '@supabase/supabase-js';

export class EligibilityEnforcementError extends Error {
  code: string;
  decision: EligibilityDecision;

  constructor(code: string, message: string, decision: EligibilityDecision) {
    super(message);
    this.name = 'EligibilityEnforcementError';
    this.code = code;
    this.decision = decision;
  }
}

export async function resolveEligibilityDecisionForUser(
  client: SupabaseClient,
  userId: string
): Promise<EligibilityDecision> {
  const meta = await getUserEligibilityMetadata(client, userId);
  return evaluateTournamentEligibility({
    country: meta?.country ?? null,
    region: meta?.region ?? null,
  });
}

export function enforceTournamentRegistration(decision: EligibilityDecision): void {
  if (!decision.canEnterPaidTournaments) {
    throw new EligibilityEnforcementError(
      'TOURNAMENT_ENTRY_NOT_ALLOWED',
      'User is not eligible to enter paid tournaments.',
      decision
    );
  }
}

export function enforceDepositAccess(decision: EligibilityDecision): void {
  if (!decision.canEnterPaidTournaments) {
    throw new EligibilityEnforcementError(
      'DEPOSIT_NOT_ALLOWED',
      'User is not eligible for paid tournament access; deposits are blocked.',
      decision
    );
  }
}

export function enforcePayoutAccess(decision: EligibilityDecision): void {
  if (!decision.canReceivePayouts) {
    throw new EligibilityEnforcementError(
      'PAYOUT_NOT_ALLOWED',
      'User is not eligible to receive payouts.',
      decision
    );
  }
}
