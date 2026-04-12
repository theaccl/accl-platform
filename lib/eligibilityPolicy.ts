export type EligibilityStatus =
  | 'FULL_TOURNAMENT_ACCESS'
  | 'FREE_ONLY'
  | 'TRAINING_ONLY'
  | 'BLOCKED';

export type TournamentCapability =
  | 'enter_paid_tournaments'
  | 'receive_payouts'
  | 'free_play'
  | 'training';

export type UserEligibilityMetadata = {
  userId: string;
  country: string | null;
  region: string | null;
  eligibilityStatus: EligibilityStatus;
  reason: string;
  lastVerifiedAt: string;
};

export type EligibilityDecision = {
  status: EligibilityStatus;
  reason: string;
  canEnterPaidTournaments: boolean;
  canReceivePayouts: boolean;
  canAccessFreePlay: boolean;
  canAccessTraining: boolean;
};

const TRAINING_ONLY_COUNTRIES = new Set(['TRAINING_ONLY']);
const FREE_ONLY_COUNTRIES = new Set(['FREE_ONLY']);
const BLOCKED_COUNTRIES = new Set(['BLOCKED']);
const REGION_REQUIRED_COUNTRIES = new Set(['US']);

export function normalizeCode(v: string | null | undefined): string | null {
  const s = String(v ?? '')
    .trim()
    .toUpperCase();
  return s.length ? s : null;
}

export function countryRequiresRegion(country: string | null | undefined): boolean {
  const normalized = normalizeCode(country);
  if (!normalized) return false;
  return REGION_REQUIRED_COUNTRIES.has(normalized);
}

export function evaluateTournamentEligibility(input: {
  country?: string | null;
  region?: string | null;
}): EligibilityDecision {
  const country = normalizeCode(input.country);
  const region = normalizeCode(input.region);
  const regionKey = country && region ? `${country}-${region}` : null;

  if (country && BLOCKED_COUNTRIES.has(country)) {
    return {
      status: 'BLOCKED',
      reason: 'Jurisdiction is currently blocked from platform access.',
      canEnterPaidTournaments: false,
      canReceivePayouts: false,
      canAccessFreePlay: false,
      canAccessTraining: false,
    };
  }

  if ((country && TRAINING_ONLY_COUNTRIES.has(country)) || regionKey === 'US-TRAINING_ONLY') {
    return {
      status: 'TRAINING_ONLY',
      reason: 'Jurisdiction is limited to training-only access.',
      canEnterPaidTournaments: false,
      canReceivePayouts: false,
      canAccessFreePlay: false,
      canAccessTraining: true,
    };
  }

  if ((country && FREE_ONLY_COUNTRIES.has(country)) || regionKey === 'US-FREE_ONLY') {
    return {
      status: 'FREE_ONLY',
      reason: 'Jurisdiction is limited to free play and training.',
      canEnterPaidTournaments: false,
      canReceivePayouts: false,
      canAccessFreePlay: true,
      canAccessTraining: true,
    };
  }

  return {
    status: 'FULL_TOURNAMENT_ACCESS',
    reason: 'No jurisdiction restrictions currently apply.',
    canEnterPaidTournaments: true,
    canReceivePayouts: true,
    canAccessFreePlay: true,
    canAccessTraining: true,
  };
}

export function canUseCapability(
  decision: EligibilityDecision,
  capability: TournamentCapability
): boolean {
  if (capability === 'enter_paid_tournaments') return decision.canEnterPaidTournaments;
  if (capability === 'receive_payouts') return decision.canReceivePayouts;
  if (capability === 'free_play') return decision.canAccessFreePlay;
  return decision.canAccessTraining;
}
