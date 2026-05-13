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
  name?: unknown;
  created_by?: unknown;
  ecosystem_scope?: unknown;
  tempo?: unknown;
};

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

    const name = String(body.name ?? '').trim();
    if (!name || name.length > 240) {
      return json({ error: 'name is required (max 240 chars)' }, 400);
    }

    const createdBy = String(body.created_by ?? '').trim();
    if (!UUID_RE.test(createdBy)) {
      return json({ error: 'created_by must be a UUID (profiles.id)' }, 400);
    }

    const ecosystemRaw = String(body.ecosystem_scope ?? 'adult').trim().toLowerCase();
    const ecosystem_scope = ecosystemRaw === 'k12' ? 'k12' : 'adult';

    const tempoRaw = String(body.tempo ?? 'live').trim().toLowerCase();
    const tempo = tempoRaw === 'async' ? 'async' : 'live';

    let supabase;
    try {
      supabase = createServiceRoleClient();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Service configuration error';
      return json({ error: msg }, 503);
    }

    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', createdBy)
      .maybeSingle();
    if (profErr) return json({ error: profErr.message }, 502);
    if (!profile?.id) {
      return json({ error: 'created_by profile not found' }, 400);
    }

    const { data: row, error: insErr } = await supabase
      .from('tournaments')
      .insert({
        name,
        status: 'pending',
        format: 'single_elimination',
        tempo,
        live_time_control: null,
        rated: true,
        created_by: createdBy,
        ecosystem_scope,
        entry_fee_cents: null,
        prize_pool_cents: null,
      })
      .select('id, name, status, format, tempo, ecosystem_scope, created_by, created_at')
      .single();

    if (insErr) {
      auditApiLog('tournament_ops_create', { result: 'error', detail: insErr.message });
      return json({ error: insErr.message }, 502);
    }

    auditApiLog('tournament_ops_create', {
      result: 'ok',
      tournament_id: shortId(row.id),
      created_by: shortId(createdBy),
    });

    return json({ ok: true, tournament: row });
  } finally {
    guard.release();
  }
}
