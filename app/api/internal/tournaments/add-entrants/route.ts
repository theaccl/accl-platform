import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import {
  tournamentOpsConfigInvalidJson,
  tournamentOpsSecretConfigured,
  tournamentOpsUnauthorizedJson,
  verifyTournamentOpsSecret,
} from '@/lib/internalTournamentOpsAuth';
import { guardRequest } from '@/lib/server/requestGuard';
import { auditApiLog, shortId } from '@/lib/server/prodLog';

export const runtime = 'nodejs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Body = {
  tournament_id?: unknown;
  user_ids?: unknown;
};

function normalizeUserIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    const id = String(x ?? '').trim();
    if (!UUID_RE.test(id)) return null;
    if (seen.has(id)) return null;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export async function POST(request: Request): Promise<Response> {
  const guard = guardRequest(request, 'tournaments');
  if (!guard.ok) return guard.response;

  try {
    if (!verifyTournamentOpsSecret(request)) {
      if (!tournamentOpsSecretConfigured()) return tournamentOpsConfigInvalidJson();
      return tournamentOpsUnauthorizedJson();
    }

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const tournamentId = String(body.tournament_id ?? '').trim();
    if (!UUID_RE.test(tournamentId)) {
      return json({ error: 'tournament_id must be a UUID' }, 400);
    }

    const userIds = normalizeUserIds(body.user_ids);
    if (!userIds || userIds.length < 2) {
      return json({ error: 'user_ids must be an array of at least 2 distinct UUIDs' }, 400);
    }

    let supabase;
    try {
      supabase = createServiceRoleClient();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Service configuration error';
      return json({ error: msg }, 503);
    }

    const { data: t, error: tErr } = await supabase
      .from('tournaments')
      .select('id, status')
      .eq('id', tournamentId)
      .maybeSingle();
    if (tErr) return json({ error: tErr.message }, 502);
    if (!t) return json({ error: 'tournament not found' }, 404);
    if (t.status !== 'pending') {
      return json({ error: `tournament must be pending (current: ${t.status})` }, 409);
    }

    const { count: matchCount, error: mcErr } = await supabase
      .from('tournament_matches')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId);
    if (mcErr) return json({ error: mcErr.message }, 502);
    if ((matchCount ?? 0) > 0) {
      return json({ error: 'tournament already has matches; add entrants before bootstrap only' }, 409);
    }

    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('id')
      .in('id', userIds);
    if (pErr) return json({ error: pErr.message }, 502);
    const found = new Set((profiles ?? []).map((r: { id: string }) => r.id));
    const missing = userIds.filter((id) => !found.has(id));
    if (missing.length) {
      return json({ error: 'unknown profile id(s)', missing }, 400);
    }

    const rows = userIds.map((user_id) => ({ tournament_id: tournamentId, user_id }));
    const { error: insErr } = await supabase.from('tournament_entries').insert(rows);
    if (insErr) {
      if (insErr.code === '23505') {
        return json({ error: 'duplicate entrant (tournament_id, user_id) or race' }, 409);
      }
      auditApiLog('tournament_ops_add_entrants', { result: 'error', detail: insErr.message });
      return json({ error: insErr.message }, 502);
    }

    auditApiLog('tournament_ops_add_entrants', {
      result: 'ok',
      tournament_id: shortId(tournamentId),
      count: userIds.length,
    });

    return json({ ok: true, tournament_id: tournamentId, user_ids: userIds });
  } finally {
    guard.release();
  }
}
