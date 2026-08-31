import { resolveAuthenticatedUser } from '@/lib/requestAuth';
import { jsonResponse } from '@/lib/server/httpJson';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import {
  GENERATOR_TIER_CONTRACTS,
  resolveGeneratorMembershipTier,
} from '@/lib/imageGenerator/membership';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const supabase = createServiceRoleClient();
  const normalizedEmail = user.email?.trim().toLowerCase() ?? '';
  const [result, tokenAccount, tokenLedger, internalGrant] = await Promise.all([
    supabase
      .from('membership_entitlements')
      .select('entitlement,status,valid_until,metadata')
      .eq('user_id', user.id)
      .eq('status', 'active'),
    supabase
      .from('generation_token_accounts')
      .select('balance,reserved,lifetime_earned,lifetime_spent')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('generation_token_ledger')
      .select('id,amount,balance_after,event_type,membership_tier,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(12),
    supabase
      .from('internal_generator_unlimited_grants')
      .select('status,user_id')
      .eq('email_normalized', normalizedEmail)
      .eq('status', 'active')
      .maybeSingle(),
  ]);
  if (result.error) return jsonResponse({ error: 'Could not load entitlements' }, 500);
  const now = Date.now();
  const active = (result.data ?? []).filter(
    (item) => !item.valid_until || new Date(item.valid_until).getTime() > now
  );
  if (internalGrant.error) {
    return jsonResponse({ error: 'Could not verify internal generator access' }, 500);
  }
  const internalUnlimited = Boolean(
    normalizedEmail &&
      user.email_confirmed_at &&
      internalGrant.data?.status === 'active' &&
      (internalGrant.data.user_id === null || internalGrant.data.user_id === user.id)
  );
  const tier = resolveGeneratorMembershipTier(active, internalUnlimited);
  if (tokenAccount.error) {
    return jsonResponse({ error: 'Could not load Generation Token account' }, 500);
  }
  if (tokenLedger.error) {
    return jsonResponse({ error: 'Could not load Generation Token ledger' }, 500);
  }
  const tokenSummary = tokenAccount.data ?? {
    balance: 0,
    reserved: 0,
    lifetime_earned: 0,
    lifetime_spent: 0,
  };
  const hasPaidGeneratorTier = tier === 'plus' || tier === 'pro';
  const canCommission = internalUnlimited || tokenSummary.balance > 0;
  return jsonResponse({
    image_generator: internalUnlimited || hasPaidGeneratorTier || tokenSummary.balance > 0,
    can_commission: canCommission,
    profile_motion: internalUnlimited || active.some((item) => item.entitlement === 'profile_motion'),
    internal_unlimited: internalUnlimited,
    membership_tier: tier,
    generator_contract: GENERATOR_TIER_CONTRACTS[tier],
    generation_tokens: internalUnlimited ? {
      balance: null,
      reserved: tokenSummary.reserved,
      lifetime_earned: tokenAccount.data?.lifetime_earned ?? 0,
      lifetime_spent: tokenAccount.data?.lifetime_spent ?? 0,
      unlimited: true,
    } : {
      ...tokenSummary,
      unlimited: false,
    },
    generation_token_ledger: tokenLedger.data ?? [],
  });
}
