/**
 * @deprecated Self-serve registration — use `POST /api/tournaments/join` with `{ tournamentId }`.
 * This route delegates to the same server-side join implementation for backward compatibility.
 */
import { tournamentRegisterPost } from '@/app/api/tournaments/register/handler';
import { auditApiLog } from '@/lib/server/prodLog';
import { guardRequest } from '@/lib/server/requestGuard';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const guard = guardRequest(request, 'tournaments');
  if (!guard.ok) return guard.response;

  try {
    return await tournamentRegisterPost(request);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Registration failed';
    auditApiLog('tournament_register', { result: 'error', detail: message });
    return json({ error: message, code: 'UNEXPECTED_ERROR' }, 503);
  } finally {
    guard.release();
  }
}
