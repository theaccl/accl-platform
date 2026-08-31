import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  GENERATOR_TIER_CONTRACTS,
  resolveGeneratorMembershipTier,
} from '../../lib/imageGenerator/membership';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260831050722_accl_generation_tokens_and_tiers.sql'
  ),
  'utf8'
);
const internalMigration = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260831052551_internal_generator_unlimited_grants.sql'
  ),
  'utf8'
);
const pendingAllowlistMigration = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260831053706_internal_unlimited_pending_email_allowlist.sql'
  ),
  'utf8'
);
const economyMigration = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260831060000_generation_token_economy_enforcement.sql'
  ),
  'utf8'
);
const entitlementRoute = readFileSync(
  join(process.cwd(), 'app', 'api', 'image-generations', 'entitlements', 'route.ts'),
  'utf8'
);
const tokenCard = readFileSync(
  join(process.cwd(), 'components', 'image-generator', 'GenerationTokenCard.tsx'),
  'utf8'
);
const vaultPage = readFileSync(join(process.cwd(), 'app', 'vault', 'page.tsx'), 'utf8');
const referenceRoute = readFileSync(
  join(process.cwd(), 'app', 'api', 'image-generations', 'references', 'route.ts'),
  'utf8'
);

test.describe('ACCL Generation Token and tier contract', () => {
  test('tier allowances match the locked doctrine', () => {
    expect(GENERATOR_TIER_CONTRACTS.free.initialCandidates).toBe(3);
    expect(GENERATOR_TIER_CONTRACTS.plus).toMatchObject({
      weeklyTokens: 2,
      initialCandidates: 4,
      touchUpGuides: 1,
      imagesPerTouchUp: 2,
      maxReferences: 1,
    });
    expect(GENERATOR_TIER_CONTRACTS.pro).toMatchObject({
      weeklyTokens: 4,
      initialCandidates: 5,
      touchUpGuides: 4,
      imagesPerTouchUp: 2,
      maxReferences: 2,
      placement: 'matching_icon_and_background',
    });
  });

  test('legacy image_generator entitlement remains Pro during migration', () => {
    expect(resolveGeneratorMembershipTier([{ entitlement: 'image_generator' }])).toBe('pro');
  });

  test('Internal Unlimited inherits Pro capabilities with infinite tokens and uploads', () => {
    expect(resolveGeneratorMembershipTier([], true)).toBe('internal_unlimited');
    expect(GENERATOR_TIER_CONTRACTS.internal_unlimited).toMatchObject({
      initialCandidates: 5,
      touchUpGuides: 4,
      placement: 'matching_icon_and_background',
      unlimitedTokens: true,
      unlimitedUploads: true,
      ownerMotion: true,
      visitorMotion: true,
    });
  });

  test('explicit Plus and Pro metadata resolve correctly', () => {
    expect(
      resolveGeneratorMembershipTier([
        { entitlement: 'image_generator', metadata: { plan: 'plus' } },
      ])
    ).toBe('plus');
    expect(
      resolveGeneratorMembershipTier([
        { entitlement: 'image_generator', metadata: { plan: 'pro' } },
      ])
    ).toBe('pro');
  });

  test('wallet tables are RLS-protected and client read-only', () => {
    expect(migration).toContain('alter table public.generation_token_accounts enable row level security');
    expect(migration).toContain('alter table public.generation_token_ledger enable row level security');
    expect(migration).toContain('revoke all on public.generation_token_accounts from anon, authenticated');
    expect(migration).toContain('grant select on public.generation_token_accounts to authenticated');
  });

  test('adjustments are idempotent and cannot produce a negative balance', () => {
    expect(migration).toContain('unique (source_key)');
    expect(migration).toContain('v_account.balance + p_amount < 0');
    expect(migration).toContain('insufficient generation tokens');
  });

  test('Internal Unlimited grants are private, exact-email, and verified-account only', () => {
    expect(internalMigration).toContain('email_normalized = lower(trim(email_normalized))');
    expect(internalMigration).toContain('email_confirmed_at is not null');
    expect(internalMigration).toContain('lower(u.email) = g.email_normalized');
    expect(internalMigration).toContain(
      'revoke all on public.internal_generator_unlimited_grants from anon, authenticated'
    );
  });

  test('Internal Unlimited commissions log token use without reducing balance', () => {
    expect(internalMigration).toContain("'internal_unlimited_commission'");
    expect(internalMigration).toMatch(/p_owner_id,\s*0,\s*v_balance/i);
    expect(internalMigration).toContain("'tokens_display', 'infinity'");
    expect(internalMigration).toContain('on conflict (source_key) do nothing');
  });

  test('approved emails can remain pending until verified signup', () => {
    expect(pendingAllowlistMigration).toContain('alter column user_id drop not null');
    expect(pendingAllowlistMigration).toContain("'pending_verified_signup'");
    expect(pendingAllowlistMigration).toContain('u.email_confirmed_at is not null');
    expect(pendingAllowlistMigration).toContain('g.email_normalized = lower(u.email)');
    expect(pendingAllowlistMigration).toContain('(g.user_id is null or g.user_id = u.id)');
  });

  test('commissions reserve, spend, and refund tokens atomically', () => {
    expect(economyMigration).toContain('create table public.generation_token_redemptions');
    expect(economyMigration).toContain("'commission_reservation'");
    expect(economyMigration).toContain("perform public.transition_generation_token_redemption(v_id, 'spend')");
    expect(economyMigration).toContain(
      "perform public.transition_generation_token_redemption(p_request_id, 'refund')"
    );
    expect(economyMigration).toContain('reserved = reserved + v_token_cost');
    expect(economyMigration).toContain('reserved = reserved - v_redemption.token_cost');
  });

  test('weekly mint hierarchy tops Plus to two and Pro to four without stacking', () => {
    expect(economyMigration).toContain("v_target := case v_tier when 'plus' then 2 when 'pro' then 4 else 0 end");
    expect(economyMigration).toContain('v_delta := greatest(v_target - v_existing, 0)');
    expect(economyMigration).toContain("'plus_weekly_mint'");
    expect(economyMigration).toContain("'pro_weekly_mint'");
  });

  test('rating milestones mint once from a new historical peak', () => {
    expect(economyMigration).toContain('after update of peak_rank_band');
    expect(economyMigration).toContain("'rating_milestone_mint'");
    expect(economyMigration).toContain(
      "'rating-milestone:' || new.user_id::text || ':' || new.peak_rank_band"
    );
  });

  test('token economy functions and tables remain server-controlled', () => {
    expect(economyMigration).toContain(
      'alter table public.generation_token_redemptions enable row level security'
    );
    expect(economyMigration).toContain(
      'revoke all on function public.transition_generation_token_redemption(uuid, text)'
    );
    expect(economyMigration).toContain(
      'grant execute on function public.mint_due_generation_token_allowances(integer)\n  to service_role'
    );
  });

  test('Vault exposes a privacy-safe recent Token Ledger and routes Use Token through Edit Profile', () => {
    expect(entitlementRoute).toContain(
      ".select('id,amount,balance_after,event_type,membership_tier,created_at')"
    );
    expect(entitlementRoute).toContain(".from('generation_token_ledger')");
    expect(entitlementRoute).toContain(".eq('user_id', user.id)");
    expect(entitlementRoute).toContain('.limit(12)');
    expect(entitlementRoute).not.toContain(
      ".select('id,amount,balance_after,event_type,source_key"
    );
    expect(tokenCard).toContain('Token Ledger');
    expect(tokenCard).toContain('Recent Generation Token activity');
    expect(tokenCard).toContain('Internal Unlimited tokens never decrease.');
    expect(vaultPage).toContain('actionHref="/profile/edit#generation-token-card"');
  });

  test('Internal Unlimited API checks preserve the activated exact-user binding', () => {
    for (const route of [entitlementRoute, referenceRoute]) {
      expect(route).toContain(".select('status,user_id')");
      expect(route).toContain(
        'internalGrant.data.user_id === null || internalGrant.data.user_id === user.id'
      );
    }
  });
});
