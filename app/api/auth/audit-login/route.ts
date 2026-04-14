import { resolveAuthenticatedUserId } from '@/lib/requestAuth';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { auditApiLog, shortId } from '@/lib/server/prodLog';

export const runtime = 'nodejs';

/** Client calls after password sign-in so server audit trail records successful auth (no password in payload). */
export async function POST(request: Request): Promise<Response> {
  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) {
    auditApiLog('auth_login_ack', { result: 'unauthorized' });
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const rl = checkRateLimit(`audit-login:${userId}`, 30, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  auditApiLog('auth_login', { user: shortId(userId) });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
