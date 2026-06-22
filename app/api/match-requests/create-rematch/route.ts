import { matchRequestCreateRematchPost } from '@/app/api/match-requests/create-rematch/handler';
import { getClientIp } from '@/lib/server/clientIp';
import { tooManyRequests } from '@/lib/server/httpJson';
import { checkRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

/** Create a rematch request for a finished game (server-derived participants). */
export async function POST(request: Request): Promise<Response> {
  const ip = getClientIp(request);
  const limited = checkRateLimit(`match-requests:create-rematch:${ip}`, 30, 60_000);
  if (!limited.allowed) return tooManyRequests(limited.retryAfterSec);

  return matchRequestCreateRematchPost(request);
}
