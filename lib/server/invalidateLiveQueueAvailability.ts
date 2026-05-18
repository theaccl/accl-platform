import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

type InvalidateLiveQueueAvailabilityArgs = {
  userIds: string[];
  excludeGameId?: string | null;
  excludeRequestId?: string | null;
};

/**
 * Once a player enters a **live** seated free game, void their other live open `games` rows (via `supersede_*` RPC)
 * and cancel their pending **live** `match_requests` (open + direct).
 *
 * Do **not** call this for daily/correspondence activations — that would clear live queues incorrectly.
 * Call sites: match accept (live only), join-open-listing (live only), client `createSeatedGameGuard` follow-up (live only).
 */
export async function invalidateLiveQueueAvailabilityForUsers(
  args: InvalidateLiveQueueAvailabilityArgs
): Promise<void> {
  const uniqueIds = [...new Set(args.userIds.map((x) => String(x ?? '').trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return;

  const service = createServiceRoleClient();
  const excludeGameId = args.excludeGameId?.trim() || null;
  const excludeRequestId = args.excludeRequestId?.trim() || null;

  await Promise.all(
    uniqueIds.map(async (uid) => {
      await service.rpc('supersede_stale_free_open_seats_for_users', {
        p_user_a: uid,
        p_user_b: uid,
        p_exclude_game_id: excludeGameId,
      });
    })
  );

  let q = service
    .from('match_requests')
    .update({
      status: 'cancelled',
      responded_at: new Date().toISOString(),
    })
    .eq('status', 'pending')
    .in('visibility', ['open', 'direct'])
    .eq('tempo', 'live')
    .in('from_user_id', uniqueIds);
  if (excludeRequestId) {
    q = q.neq('id', excludeRequestId);
  }
  await q;
}
