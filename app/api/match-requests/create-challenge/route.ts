import { matchRequestCreateChallengePost } from '@/app/api/match-requests/create-challenge/handler';
import { getClientIp } from '@/lib/server/clientIp';
import { tooManyRequests } from '@/lib/server/httpJson';
import { checkRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

/** Create a direct challenge as the authenticated sender (server-derived `from_user_id`). */
export async function POST(request: Request): Promise<Response> {
  const ip = getClientIp(request);
  const limited = checkRateLimit(`match-requests:create-challenge:${ip}`, 30, 60_000);
  if (!limited.allowed) return tooManyRequests(limited.retryAfterSec);

  return matchRequestCreateChallengePost(request);
}
