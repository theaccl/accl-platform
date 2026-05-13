/**
 * Shared auth for /api/internal/tournaments/* (operator-only, server-only).
 * Header: x-accl-tournament-ops-secret must match ACCL_TOURNAMENT_OPS_SECRET (min 16 chars).
 */
function timingSafeEqualSecret(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function tournamentOpsSecretConfigured(): boolean {
  const s = process.env.ACCL_TOURNAMENT_OPS_SECRET?.trim() ?? '';
  return s.length >= 16;
}

export function verifyTournamentOpsSecret(request: Request): boolean {
  if (!tournamentOpsSecretConfigured()) return false;
  const expected = process.env.ACCL_TOURNAMENT_OPS_SECRET!.trim();
  const header = request.headers.get('x-accl-tournament-ops-secret') ?? '';
  return timingSafeEqualSecret(header, expected);
}

export function tournamentOpsUnauthorizedJson(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function tournamentOpsConfigInvalidJson(): Response {
  return new Response(
    JSON.stringify({
      error: 'Tournament ops not configured',
      detail: 'Set ACCL_TOURNAMENT_OPS_SECRET (>= 16 characters) for internal tournament operator routes.',
    }),
    { status: 503, headers: { 'Content-Type': 'application/json' } },
  );
}
