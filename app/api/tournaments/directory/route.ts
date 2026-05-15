import { getSupabaseUserFromCookies } from '@/lib/auth/getSupabaseUserFromCookies';
import type { NexusEcosystem } from '@/lib/nexus/getNexusData';
import { resolveAuthenticatedUserId } from '@/lib/requestAuth';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { guardRequest } from '@/lib/server/requestGuard';
import {
  fetchTournamentDirectoryRows,
  type TournamentDirectoryRow,
  type TournamentDirectoryStatusFilter,
} from '@/lib/server/tournamentDirectoryReadModel';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseEcosystem(raw: string | null): NexusEcosystem | null {
  const s = String(raw ?? '').toLowerCase().trim();
  if (s === 'k12') return 'k12';
  if (s === 'adult') return 'adult';
  return null;
}

function parseStatusFilter(raw: string | null): TournamentDirectoryStatusFilter {
  const s = String(raw ?? 'all').toLowerCase().trim();
  if (s === 'active' || s === 'pending' || s === 'completed' || s === 'all') return s;
  return 'all';
}

function parseLimit(raw: string | null): number {
  const n = parseInt(String(raw ?? '30'), 10);
  if (!Number.isFinite(n)) return 30;
  return Math.min(Math.max(n, 1), 100);
}

/** API shape — same fields as internal model, stable for clients. */
function serializeRow(r: TournamentDirectoryRow) {
  return {
    id: r.id,
    name: r.name,
    format: r.format,
    ecosystemScope: r.ecosystemScope,
    status: r.status,
    tempo: r.tempo,
    rated: r.rated,
    liveTimeControl: r.liveTimeControl,
    createdAt: r.createdAt,
    participantCount: r.participantCount,
    sponsorLabel: r.sponsorLabel,
    sponsorTag: r.sponsorTag,
    entryFeeCents: r.entryFeeCents,
    prizePoolCents: r.prizePoolCents,
  };
}

/**
 * Trusted tournament directory (service-backed). Does not widen RLS.
 *
 * Auth: K-12 listing requires a session or valid Bearer token. Adult allows anonymous.
 */
export async function GET(request: Request): Promise<Response> {
  const guard = guardRequest(request, 'tournaments');
  if (!guard.ok) return guard.response;

  try {
    const url = new URL(request.url);
    const ecosystem = parseEcosystem(url.searchParams.get('ecosystem'));
    if (!ecosystem) {
      auditApiLog('tournament_directory', { result: 'bad_request', reason: 'ecosystem' });
      return json({ error: 'ecosystem must be adult or k12' }, 400);
    }

    const statusFilter = parseStatusFilter(url.searchParams.get('status'));
    const limit = parseLimit(url.searchParams.get('limit'));

    const cookieUser = await getSupabaseUserFromCookies();
    const bearerId = await resolveAuthenticatedUserId(request);
    const authed = Boolean(cookieUser?.id || bearerId);

    if (ecosystem === 'k12' && !authed) {
      auditApiLog('tournament_directory', { result: 'unauthorized', reason: 'k12_requires_auth' });
      return json({ error: 'Sign in required for school ecosystem directory.' }, 401);
    }

    const items = await fetchTournamentDirectoryRows({ ecosystem, statusFilter, limit });

    auditApiLog('tournament_directory', {
      result: 'ok',
      ecosystem,
      status: statusFilter,
      count: items.length,
      user: shortId(cookieUser?.id ?? bearerId ?? ''),
    });

    return json({
      ok: true,
      ecosystem,
      statusFilter,
      items: items.map(serializeRow),
    });
  } finally {
    guard.release();
  }
}
