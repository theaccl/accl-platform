import type { GeneratorMembershipTier } from '@/lib/imageGenerator/membership';

export type CosmeticMotionSurface =
  | 'profile_icon'
  | 'profile_background'
  | 'badge'
  | 'relic'
  | 'reward';
export type CosmeticMotionContext =
  | 'owner_profile'
  | 'visitor_profile'
  | 'community'
  | 'chat'
  | 'game';

export type MotionDecision = {
  allowMotion: boolean;
  requiresStillFallback: true;
  reason: 'reduced_motion' | 'tier_still_only' | 'owner_only' | 'surface_restricted' | 'authorization_required' | 'allowed';
};

export function resolveCosmeticMotion(input: {
  tier: GeneratorMembershipTier;
  surface: CosmeticMotionSurface;
  context: CosmeticMotionContext;
  reducedMotion: boolean;
  explicitlyAuthorizedPublicSurface?: boolean;
}): MotionDecision {
  const still = (reason: MotionDecision['reason']): MotionDecision => ({
    allowMotion: false,
    requiresStillFallback: true,
    reason,
  });
  if (input.reducedMotion) return still('reduced_motion');
  if (input.tier === 'free') return still('tier_still_only');

  if (input.tier === 'plus') {
    if (input.context !== 'owner_profile') return still('owner_only');
    return ['profile_icon', 'profile_background', 'badge'].includes(input.surface)
      ? { allowMotion: true, requiresStillFallback: true, reason: 'allowed' }
      : still('surface_restricted');
  }

  if (input.context === 'owner_profile') {
    return { allowMotion: true, requiresStillFallback: true, reason: 'allowed' };
  }
  if (input.context === 'visitor_profile') {
    return { allowMotion: true, requiresStillFallback: true, reason: 'allowed' };
  }
  if (!input.explicitlyAuthorizedPublicSurface) return still('authorization_required');
  if ((input.context === 'chat' || input.context === 'game') && input.surface !== 'profile_icon') {
    return still('surface_restricted');
  }
  if (input.context === 'community' && input.surface === 'profile_background') {
    return still('surface_restricted');
  }
  return { allowMotion: true, requiresStillFallback: true, reason: 'allowed' };
}
