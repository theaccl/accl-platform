import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { e2eUserBEmail, e2eUserEmail } from '../fixtures/env';

/** Fixed ACCL bucket namespace (service-role read; all rows expected for each profile). */
export const E2E_RATING_BUCKETS = [
  'free_live',
  'free_daily',
  'free_correspondence',
  'tournament_live',
  'tournament_daily',
  'tournament_correspondence',
] as const;

export type E2eRatingBucket = (typeof E2E_RATING_BUCKETS)[number];

export type UserRatingBucketsSnapshot = Record<E2eRatingBucket, { rating: number; games_played: number }>;

export type E2eServiceDbContext = { ok: true; client: SupabaseClient; url: string } | { ok: false; reason: string };

/** Service-role client for the configured E2E Supabase project (bypasses RLS on `player_ratings`). */
export function createE2eServiceDbContext(): E2eServiceDbContext {
  const url =
    process.env.E2E_SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (!url || !key) {
    return {
      ok: false,
      reason:
        'Set E2E_SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and E2E_SUPABASE_SERVICE_ROLE_KEY to read player_ratings.',
    };
  }
  if (!e2eUserEmail()?.trim() || !e2eUserBEmail()?.trim()) {
    return { ok: false, reason: 'E2E_USER_EMAIL and E2E_USER_B_EMAIL required to resolve test profiles.' };
  }
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return { ok: true, url, client };
}

export async function resolveE2ePairProfileIds(client: SupabaseClient): Promise<
  | { ok: true; userAId: string; userBId: string }
  | { ok: false; reason: string }
> {
  const aEmail = e2eUserEmail()!.toLowerCase();
  const bEmail = e2eUserBEmail()!.toLowerCase();
  const { data: profiles, error } = await client
    .from('profiles')
    .select('id,email')
    .in('email', [aEmail, bEmail]);
  if (error) {
    return { ok: false, reason: `profiles lookup: ${error.message}` };
  }
  const rows = (profiles ?? []) as { id: string; email: string | null }[];
  const idA = rows.find((r) => String(r.email ?? '').toLowerCase() === aEmail)?.id;
  const idB = rows.find((r) => String(r.email ?? '').toLowerCase() === bEmail)?.id;
  if (!idA || !idB) {
    return { ok: false, reason: 'Could not resolve both E2E profiles by id (check seeded profiles for emails).' };
  }
  return { ok: true, userAId: idA, userBId: idB };
}

export async function readUserRatingBuckets(
  client: SupabaseClient,
  userId: string
): Promise<{ ok: true; snapshot: UserRatingBucketsSnapshot } | { ok: false; reason: string }> {
  const { data, error } = await client
    .from('player_ratings')
    .select('bucket,rating,games_played')
    .eq('user_id', userId);
  if (error) {
    return { ok: false, reason: `player_ratings: ${error.message}` };
  }
  const byBucket = new Map<string, { rating: number; games_played: number }>();
  for (const row of (data ?? []) as { bucket: string; rating: number; games_played: number }[]) {
    byBucket.set(row.bucket, { rating: row.rating, games_played: row.games_played });
  }
  const snapshot = {} as UserRatingBucketsSnapshot;
  for (const b of E2E_RATING_BUCKETS) {
    const v = byBucket.get(b);
    if (!v) {
      return { ok: false, reason: `Missing player_ratings row for user ${userId.slice(0, 8)}… bucket ${b}` };
    }
    snapshot[b] = v;
  }
  return { ok: true, snapshot };
}

export async function readE2ePairRatingSnapshots(client: SupabaseClient, userAId: string, userBId: string): Promise<
  | { ok: true; a: UserRatingBucketsSnapshot; b: UserRatingBucketsSnapshot }
  | { ok: false; reason: string }
> {
  const a = await readUserRatingBuckets(client, userAId);
  const b = await readUserRatingBuckets(client, userBId);
  if (!a.ok) return a;
  if (!b.ok) return b;
  return { ok: true, a: a.snapshot, b: b.snapshot };
}

/** After a **rated** free finish, trigger should set this true when `apply_free_play_rating_update_core` succeeds. */
export async function waitForGameRatingAppliedRow(
  client: SupabaseClient,
  gameId: string,
  timeoutMs = 45_000
): Promise<{ rating_last_update: unknown | null }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data, error } = await client
      .from('games')
      .select('rating_applied,rating_last_update')
      .eq('id', gameId)
      .single();
    if (error) {
      throw new Error(`games poll: ${error.message}`);
    }
    if (data?.rating_applied === true) {
      return { rating_last_update: (data as { rating_last_update?: unknown | null }).rating_last_update ?? null };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    'Blocker: games.rating_applied never became true — migration 20260406120000_free_play_rating_activation.sql may not be applied (trigger games_apply_free_rating_after_finish) or finish_game did not transition status to finished.'
  );
}
