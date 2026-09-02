export type GeneratorMembershipTier = 'free' | 'plus' | 'pro' | 'internal_unlimited';

export type GeneratorTierContract = {
  tier: GeneratorMembershipTier;
  label: string;
  weeklyTokens: number;
  initialCandidates: number;
  touchUpGuides: number;
  imagesPerTouchUp: number;
  maxReferences: number;
  placement: 'icon_or_background' | 'matching_icon_and_background';
  ownerMotion: boolean;
  visitorMotion: boolean;
  unlimitedTokens: boolean;
  unlimitedUploads: boolean;
};

export const GENERATOR_TIER_CONTRACTS: Record<GeneratorMembershipTier, GeneratorTierContract> = {
  free: {
    tier: 'free',
    label: 'Free',
    weeklyTokens: 0,
    initialCandidates: 3,
    touchUpGuides: 0,
    imagesPerTouchUp: 0,
    maxReferences: 1,
    placement: 'icon_or_background',
    ownerMotion: false,
    visitorMotion: false,
    unlimitedTokens: false,
    unlimitedUploads: false,
  },
  plus: {
    tier: 'plus',
    label: 'Plus',
    weeklyTokens: 2,
    initialCandidates: 4,
    touchUpGuides: 1,
    imagesPerTouchUp: 2,
    maxReferences: 1,
    placement: 'icon_or_background',
    ownerMotion: true,
    visitorMotion: false,
    unlimitedTokens: false,
    unlimitedUploads: false,
  },
  pro: {
    tier: 'pro',
    label: 'Pro',
    weeklyTokens: 4,
    initialCandidates: 5,
    touchUpGuides: 4,
    imagesPerTouchUp: 2,
    maxReferences: 2,
    placement: 'matching_icon_and_background',
    ownerMotion: true,
    visitorMotion: true,
    unlimitedTokens: false,
    unlimitedUploads: false,
  },
  internal_unlimited: {
    tier: 'internal_unlimited',
    label: 'Internal Unlimited',
    weeklyTokens: 0,
    initialCandidates: 5,
    touchUpGuides: 4,
    imagesPerTouchUp: 2,
    maxReferences: 2,
    placement: 'matching_icon_and_background',
    ownerMotion: true,
    visitorMotion: true,
    unlimitedTokens: true,
    unlimitedUploads: true,
  },
};

export function generatorTierSupportsMatchingSet(
  tier: unknown
): tier is Extract<GeneratorMembershipTier, 'pro' | 'internal_unlimited'> {
  if (typeof tier !== 'string' || !(tier in GENERATOR_TIER_CONTRACTS)) return false;
  return GENERATOR_TIER_CONTRACTS[tier as GeneratorMembershipTier].placement ===
    'matching_icon_and_background';
}

type EntitlementLike = {
  entitlement: string;
  metadata?: unknown;
};

function metadataPlan(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const plan = (metadata as Record<string, unknown>).plan;
  return typeof plan === 'string' ? plan.toLowerCase() : null;
}

export function resolveGeneratorMembershipTier(
  entitlements: EntitlementLike[],
  internalUnlimited = false
): GeneratorMembershipTier {
  if (internalUnlimited) return 'internal_unlimited';
  if (
    entitlements.some(
      (item) =>
        item.entitlement === 'membership_pro' ||
        item.entitlement === 'generation_pro' ||
        metadataPlan(item.metadata) === 'pro'
    )
  ) return 'pro';

  if (
    entitlements.some(
      (item) =>
        item.entitlement === 'membership_plus' ||
        item.entitlement === 'generation_plus' ||
        metadataPlan(item.metadata) === 'plus'
    )
  ) return 'plus';

  // The existing Slice 1 billing bridge only grants image_generator to Pro.
  if (entitlements.some((item) => item.entitlement === 'image_generator')) return 'pro';
  return 'free';
}
