import { matchRequestJoinOpenPost } from '@/app/api/match-requests/join-open-listing/handler';
import { getClientIp } from '@/lib/server/clientIp';
import { tooManyRequests } from '@/lib/server/httpJson';
import { checkRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

/**
 * Secured join for **open / public** match listings from `/requests`.
 * After the game row exists and the listing is marked accepted, voids both players' other live queue
 * state (same timing as direct accept) so stale listings cannot be joined afterward.
 * Blocks live joins when the user is already in a **seated** live free game (not their own solo open seats).
 */
export async function POST(request: Request): Promise<Response> {
  const ip = getClientIp(request);
  const limited = checkRateLimit(`match-requests:join-open:${ip}`, 30, 60_000);
  if (!limited.allowed) return tooManyRequests(limited.retryAfterSec);

  return matchRequestJoinOpenPost(request);
}
