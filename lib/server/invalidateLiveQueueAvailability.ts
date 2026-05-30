import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

type InvalidateLiveQueueAvailabilityArgs = {
  userIds: string[];
  excludeGameId?: string | null;
  excludeRequestId?: string | null;
};

export type InvalidateLiveQueueResult = {
  /** False when there were no user ids to act on (no-op). */
  attempted: boolean;
  /** True when supersede succeeded for every user (after bounded retry). */
  supersedeOk: boolean;
  /** Total supersede RPC attempts across all users (includes retries). */
  supersedeAttempts: number;
  supersedeError?: string;
  /** True when the pending live match_requests cancel succeeded. */
  requestsCancelled: boolean;
  requestsError?: string;
};

const SUPERSEDE_MAX_ATTEMPTS = 3;
const SUPERSEDE_RETRY_BASE_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Once a player enters a **live** seated free game, void their other live open `games` rows (via
 * `supersede_*` RPC) and cancel their pending **live** `match_requests` (open + direct).
 *
 * The supersede sweep is the integrity step that removes every OTHER unmatched live open seat owned
 * by either newly seated player — lane-agnostic (rated and unrated), every mode, every exact time
 * control. Because the direct-insert accept routes are not transactional, this runs with a small
 * bounded retry and reports a structured result so callers can log a supersede failure explicitly
 * instead of silently leaving stale seats.
 *
 * Do **not** call this for daily/correspondence activations — that would clear live queues incorrectly.
 * Call sites: match accept (live only), join-open-listing (live only), client `createSeatedGameGuard`
 * follow-up (live only).
 */
export async function invalidateLiveQueueAvailabilityForUsers(
  args: InvalidateLiveQueueAvailabilityArgs
): Promise<InvalidateLiveQueueResult> {
  const uniqueIds = [...new Set(args.userIds.map((x) => String(x ?? '').trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { attempted: false, supersedeOk: true, supersedeAttempts: 0, requestsCancelled: true };
  }

  const service = createServiceRoleClient();
  const excludeGameId = args.excludeGameId?.trim() || null;
  const excludeRequestId = args.excludeRequestId?.trim() || null;

  // Supersede other unmatched live open seats for each newly seated player, with a bounded retry so
  // a transient failure does not silently leave stale seats behind. Sequential (at most two users).
  let supersedeOk = true;
  let supersedeAttempts = 0;
  let supersedeError: string | undefined;
  for (const uid of uniqueIds) {
    let perUserOk = false;
    for (let attempt = 1; attempt <= SUPERSEDE_MAX_ATTEMPTS; attempt += 1) {
      supersedeAttempts += 1;
      const { error } = await service.rpc('supersede_stale_free_open_seats_for_users', {
        p_user_a: uid,
        p_user_b: uid,
        p_exclude_game_id: excludeGameId,
      });
      if (!error) {
        perUserOk = true;
        break;
      }
      supersedeError = error.message;
      if (attempt < SUPERSEDE_MAX_ATTEMPTS) {
        await sleep(SUPERSEDE_RETRY_BASE_DELAY_MS * attempt);
      }
    }
    if (!perUserOk) {
      supersedeOk = false;
    }
  }

  let requestsCancelled = true;
  let requestsError: string | undefined;
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
  const { error: reqErr } = await q;
  if (reqErr) {
    requestsCancelled = false;
    requestsError = reqErr.message;
  }

  return { attempted: true, supersedeOk, supersedeAttempts, supersedeError, requestsCancelled, requestsError };
}
