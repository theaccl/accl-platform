import { getClientIp } from '@/lib/server/clientIp';
import { invalidateLiveQueueAvailabilityForUsers } from '@/lib/server/invalidateLiveQueueAvailability';
import { jsonResponse, tooManyRequests } from '@/lib/server/httpJson';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { resolveAuthenticatedUser } from '@/lib/requestAuth';
import { emailVerificationRequiredPayload, provisioningBlockedReason } from '@/lib/emailVerificationGate';

export const runtime = 'nodejs';

type Body = {
  userIds?: unknown;
  excludeGameId?: unknown;
  excludeRequestId?: unknown;
};

/**
 * After a client-side `create_seated_game_guard` (open-seat join), live seats + open listings are
 * cleaned in SQL, but **pending direct live** match_requests are only cleaned here. Match accept/join
 * API routes also call the same server helper.
 */
export async function POST(request: Request): Promise<Response> {
  const ip = getClientIp(request);
  const limited = checkRateLimit(`match-requests:invalidate-live:${ip}`, 40, 60_000);
  if (!limited.allowed) return tooManyRequests(limited.retryAfterSec);

  const user = await resolveAuthenticatedUser(request);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (provisioningBlockedReason(user)) {
    return jsonResponse(emailVerificationRequiredPayload(), 403);
  }

  const uid = user.id;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const raw = body.userIds;
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const userIds = [...new Set(list.map((x) => String(x ?? '').trim()).filter(Boolean))];
  if (userIds.length === 0) {
    return jsonResponse({ error: 'userIds required' }, 400);
  }
  if (!userIds.includes(uid)) {
    return jsonResponse({ error: 'Caller must be included in userIds' }, 403);
  }

  const excludeGameId = typeof body.excludeGameId === 'string' ? body.excludeGameId.trim() : null;
  const excludeRequestId = typeof body.excludeRequestId === 'string' ? body.excludeRequestId.trim() : null;

  try {
    await invalidateLiveQueueAvailabilityForUsers({
      userIds,
      excludeGameId: excludeGameId || undefined,
      excludeRequestId: excludeRequestId || undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'invalidation failed';
    console.warn('[match-requests/invalidate-live-availability]', msg);
    return jsonResponse({ error: msg }, 503);
  }

  return jsonResponse({ ok: true });
}
