import type { SupabaseClient } from '@supabase/supabase-js';

import { evaluateTournamentEligibility, type UserEligibilityMetadata } from '@/lib/eligibilityPolicy';

type UserEligibilityRow = {
  user_id: string;
  country: string | null;
  region: string | null;
  eligibility_status: UserEligibilityMetadata['eligibilityStatus'];
  reason: string;
  last_verified_at: string;
};

function toMetadata(row: UserEligibilityRow): UserEligibilityMetadata {
  return {
    userId: row.user_id,
    country: row.country,
    region: row.region,
    eligibilityStatus: row.eligibility_status,
    reason: row.reason,
    lastVerifiedAt: row.last_verified_at,
  };
}

export async function upsertUserEligibilityMetadata(
  client: SupabaseClient,
  input: { userId: string; country?: string | null; region?: string | null }
): Promise<UserEligibilityMetadata> {
  const decision = evaluateTournamentEligibility({ country: input.country, region: input.region });
  const lastVerifiedAt = new Date().toISOString();
  const payload: UserEligibilityRow = {
    user_id: input.userId,
    country: input.country ?? null,
    region: input.region ?? null,
    eligibility_status: decision.status,
    reason: decision.reason,
    last_verified_at: lastVerifiedAt,
  };
  const { data, error } = await client
    .from('user_eligibility')
    .upsert(payload, { onConflict: 'user_id' })
    .select('user_id, country, region, eligibility_status, reason, last_verified_at')
    .single();
  if (error) throw error;
  return toMetadata(data as UserEligibilityRow);
}

export async function getUserEligibilityMetadata(
  client: SupabaseClient,
  userId: string
): Promise<UserEligibilityMetadata | null> {
  const { data, error } = await client
    .from('user_eligibility')
    .select('user_id, country, region, eligibility_status, reason, last_verified_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toMetadata(data as UserEligibilityRow);
}
