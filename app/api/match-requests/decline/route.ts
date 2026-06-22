import { matchRequestDeclinePost } from '@/app/api/match-requests/decline/handler';
import { getClientIp } from '@/lib/server/clientIp';
import { tooManyRequests } from '@/lib/server/httpJson';
import { checkRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const ip = getClientIp(request);
  const limited = checkRateLimit(`match-requests:decline:${ip}`, 40, 60_000);
  if (!limited.allowed) return tooManyRequests(limited.retryAfterSec);

  return matchRequestDeclinePost(request);
}
