import { freePlayCreateSeatedGamePost } from '@/app/api/free-play/create-seated-game/handler';
import { getClientIp } from '@/lib/server/clientIp';
import { tooManyRequests } from '@/lib/server/httpJson';
import { checkRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

/** Seat a free-play game via `create_seated_game_guard` with server-derived actor checks. */
export async function POST(request: Request): Promise<Response> {
  const ip = getClientIp(request);
  const limited = checkRateLimit(`free-play:create-seated-game:${ip}`, 40, 60_000);
  if (!limited.allowed) return tooManyRequests(limited.retryAfterSec);

  return freePlayCreateSeatedGamePost(request);
}
