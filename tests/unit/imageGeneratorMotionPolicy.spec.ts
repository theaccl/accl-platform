import { expect, test } from '@playwright/test';
import { resolveCosmeticMotion, type CosmeticMotionContext, type CosmeticMotionSurface } from '../../lib/imageGenerator/motionPolicy';
import { generatorTierSupportsMatchingSet, type GeneratorMembershipTier } from '../../lib/imageGenerator/membership';

const tiers: GeneratorMembershipTier[] = ['free', 'plus', 'pro', 'internal_unlimited'];
const surfaces: CosmeticMotionSurface[] = ['profile_icon', 'profile_background', 'badge', 'relic', 'reward'];
const contexts: CosmeticMotionContext[] = ['owner_profile', 'visitor_profile', 'community', 'chat', 'game'];

test('community remains still for every tier and surface even with a public authorization flag', () => {
  for (const tier of tiers) for (const surface of surfaces) {
    expect(resolveCosmeticMotion({ tier, surface, context: 'community', reducedMotion: false, explicitlyAuthorizedPublicSurface: true }))
      .toMatchObject({ allowMotion: false, requiresStillFallback: true });
  }
});

test('reduced motion overrides every membership, surface and audience', () => {
  for (const tier of tiers) for (const surface of surfaces) for (const context of contexts) {
    expect(resolveCosmeticMotion({ tier, surface, context, reducedMotion: true, explicitlyAuthorizedPublicSurface: true }))
      .toEqual({ allowMotion: false, requiresStillFallback: true, reason: 'reduced_motion' });
  }
});

test('Plus motion is limited to the owner icon, background and badge', () => {
  for (const surface of surfaces) for (const context of contexts) {
    expect(resolveCosmeticMotion({ tier: 'plus', surface, context, reducedMotion: false, explicitlyAuthorizedPublicSurface: true }).allowMotion)
      .toBe(context === 'owner_profile' && ['profile_icon', 'profile_background', 'badge'].includes(surface));
  }
});

test('Pro chat and game motion needs explicit authorization and supports only icons', () => {
  for (const tier of ['pro', 'internal_unlimited'] as const) for (const context of ['chat', 'game'] as const) for (const surface of surfaces) {
    expect(resolveCosmeticMotion({ tier, surface, context, reducedMotion: false }).allowMotion).toBe(false);
    expect(resolveCosmeticMotion({ tier, surface, context, reducedMotion: false, explicitlyAuthorizedPublicSurface: true }).allowMotion).toBe(surface === 'profile_icon');
  }
});

test('unknown and inherited object keys never grant motion or matching sets', () => {
  for (const tier of ['constructor', '__proto__', 'toString', 'unknown']) {
    expect(generatorTierSupportsMatchingSet(tier)).toBe(false);
    expect(resolveCosmeticMotion({ tier: tier as GeneratorMembershipTier, surface: 'profile_icon', context: 'owner_profile', reducedMotion: false }).allowMotion).toBe(false);
  }
});
