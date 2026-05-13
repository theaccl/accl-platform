import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import {
  tournamentOpsConfigInvalidJson,
  tournamentOpsSecretConfigured,
  tournamentOpsUnauthorizedJson,
  verifyTournamentOpsSecret,
} from '@/lib/internalTournamentOpsAuth';
import { guardRequest } from '@/lib/server/requestGuard';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { persistTournamentBracket, TournamentBracketPersistError } from '@/lib/tournamentPersist';

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
  ordered_user_ids?: unknown;
};

function normalizeOrderedUserIds(raw: unknown): string[] | null {
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
  return out.length ? out : null;
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

    const orderedUserIds = normalizeOrderedUserIds(body.ordered_user_ids);
    if (!orderedUserIds || orderedUserIds.length < 2) {
      return json({ error: 'ordered_user_ids must list at least 2 distinct UUIDs (bracket seed order)' }, 400);
    }

    let supabase;
    try {
      supabase = createServiceRoleClient();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Service configuration error';
      return json({ error: msg }, 503);
    }

    const { data: entries, error: eErr } = await supabase
      .from('tournament_entries')
      .select('user_id')
      .eq('tournament_id', tournamentId);
    if (eErr) return json({ error: eErr.message }, 502);
    const entryIds = new Set((entries ?? []).map((r: { user_id: string }) => r.user_id));
    const orderedSet = new Set(orderedUserIds);
    if (orderedSet.size !== entryIds.size || ![...entryIds].every((id) => orderedSet.has(id))) {
      return json(
        {
          error: 'ordered_user_ids must be a permutation of tournament_entries (same users, no extras)',
          entry_count: entryIds.size,
          ordered_count: orderedUserIds.length,
        },
        400,
      );
    }

    try {
      const result = await persistTournamentBracket(supabase, tournamentId, orderedUserIds);
      const gameIds = result.matchRows.map((m) => m.game_id).filter(Boolean);

      auditApiLog('tournament_ops_bootstrap', {
        result: 'ok',
        tournament_id: shortId(tournamentId),
        idempotent: Boolean(result.idempotentReplay),
      });

      return json({
        ok: true,
        tournament_id: tournamentId,
        idempotent_replay: result.idempotentReplay ?? false,
        match_count: result.matchRows.length,
        game_ids: gameIds,
        matches: result.matchRows.map((m) => ({
          id: m.id,
          round_number: m.round_number,
          match_number: m.match_number,
          player1_id: m.player1_id,
          player2_id: m.player2_id,
          game_id: m.game_id,
          winner_id: m.winner_id,
        })),
      });
    } catch (e) {
      if (e instanceof TournamentBracketPersistError) {
        auditApiLog('tournament_ops_bootstrap', { result: 'reject', detail: e.message });
        return json({ error: e.message }, 409);
      }
      const message = e instanceof Error ? e.message : 'Bootstrap failed';
      auditApiLog('tournament_ops_bootstrap', { result: 'error', detail: message });
      return json({ error: message }, 502);
    }
  } finally {
    guard.release();
  }
}
