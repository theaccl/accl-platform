import type { SupabaseClient } from '@supabase/supabase-js';

import {
  countryRequiresRegion,
  evaluateTournamentEligibility,
  normalizeCode,
  type EligibilityDecision,
} from '@/lib/eligibilityPolicy';
import { upsertUserEligibilityMetadata } from '@/lib/userEligibilityStore';

export type EligibilityCaptureInput = {
  country?: string | null;
  region?: string | null;
};

export type EligibilityCaptureValidation = {
  ok: boolean;
  country: string | null;
  region: string | null;
  reason?: string;
};

export function validateEligibilityCapture(input: EligibilityCaptureInput): EligibilityCaptureValidation {
  const country = normalizeCode(input.country);
  const region = normalizeCode(input.region);
  if (!country) {
    return { ok: false, country: null, region, reason: 'country is required' };
  }
  if (countryRequiresRegion(country) && !region) {
    return {
      ok: false,
      country,
      region,
      reason: `region is required for country ${country}`,
    };
  }
  return { ok: true, country, region };
}

export async function upsertEligibilityFromOnboarding(
  client: SupabaseClient,
  input: { userId: string } & EligibilityCaptureInput
): Promise<{ decision: EligibilityDecision }> {
  const validation = validateEligibilityCapture(input);
  if (!validation.ok) {
    throw new Error(validation.reason ?? 'invalid eligibility capture');
  }
  await upsertUserEligibilityMetadata(client, {
    userId: input.userId,
    country: validation.country,
    region: validation.region,
  });
  const decision = evaluateTournamentEligibility({
    country: validation.country,
    region: validation.region,
  });
  return { decision };
}
