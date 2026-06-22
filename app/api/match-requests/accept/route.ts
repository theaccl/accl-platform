import { matchRequestAcceptPost } from '@/app/api/match-requests/accept/handler';
import { getClientIp } from '@/lib/server/clientIp';
import { tooManyRequests } from '@/lib/server/httpJson';
import { checkRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

/**
 * Accept an **incoming direct (non-open) match request** as the addressee (`to_user_id`).
 * Creates the `games` row with the same shape as the client previously built via `gameInsertFromAcceptedChallenge`,
 * then marks `match_requests` accepted — without calling `create_seated_game_guard` (free-play open-seat RPC).
 */
export async function POST(request: Request): Promise<Response> {
  const ip = getClientIp(request);
  const limited = checkRateLimit(`match-requests:accept:${ip}`, 30, 60_000);
  if (!limited.allowed) return tooManyRequests(limited.retryAfterSec);

  return matchRequestAcceptPost(request);
}
