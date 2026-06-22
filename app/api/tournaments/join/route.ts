import { tournamentJoinPost } from '@/app/api/tournaments/join/handler';
import { auditApiLog } from '@/lib/server/prodLog';
import { guardRequest } from '@/lib/server/requestGuard';
import { tournamentApiErrorPayload } from '@/lib/server/tournamentUserFacingError';

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
    return await tournamentJoinPost(request);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Join failed';
    auditApiLog('tournament_join', { result: 'error', detail: message });
    return json(tournamentApiErrorPayload('UNEXPECTED_ERROR', message), 503);
  } finally {
    guard.release();
  }
}
