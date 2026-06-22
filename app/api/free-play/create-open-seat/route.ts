import { freePlayCreateOpenSeatPost } from '@/app/api/free-play/create-open-seat/handler';
import { getClientIp } from '@/lib/server/clientIp';
import { tooManyRequests } from '@/lib/server/httpJson';
import { checkRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

/** Post a new free-play open seat (server-derived host id). */
export async function POST(request: Request): Promise<Response> {
  const ip = getClientIp(request);
  const limited = checkRateLimit(`free-play:create-open-seat:${ip}`, 40, 60_000);
  if (!limited.allowed) return tooManyRequests(limited.retryAfterSec);

  return freePlayCreateOpenSeatPost(request);
}
