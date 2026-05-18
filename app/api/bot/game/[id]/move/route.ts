import { Chess } from 'chess.js';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { selectBotMove, type BotCandidateLine, type BotName } from '@/lib/bot/botPersonality';
import { verifyTournamentOpsSecret } from '@/lib/internalTournamentOpsAuth';
import { insertGameMoveLog } from '@/lib/replay/gameMoveLogInsert';
import { auditApiLog, shortId } from '@/lib/server/prodLog';

type Body = {
  bot?: unknown;
  candidates?: unknown;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Legacy alternate bot-move path — disabled for clients.
 * Production bot moves run only via POST /api/game/submit-move after the human ply.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  if (!verifyTournamentOpsSecret(request)) {
    return json(
      {
        error: 'This route is disabled for client use. Bot moves are applied via POST /api/game/submit-move.',
        code: 'BOT_MOVE_ROUTE_DISABLED',
      },
      403,
    );
  }

  const { id: gameId } = await context.params;
  if (!gameId) return json({ error: 'game id required' }, 400);

  const body = (await request.json().catch(() => ({}))) as Body;
  const bot = String(body.bot ?? '') as BotName;
  if (!['Cardi Bot', 'Aggro Bot', 'Endgame Bot'].includes(bot)) {
    return json({ error: 'bot must be Cardi Bot | Aggro Bot | Endgame Bot' }, 400);
  }
  const candidates = Array.isArray(body.candidates) ? (body.candidates as BotCandidateLine[]) : [];
  const selected = selectBotMove(bot, candidates);
  if (!selected) return json({ error: 'No candidate lines available' }, 400);

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Service configuration error';
    return json({ error: msg }, 503);
  }

  const { data: game, error: gameErr } = await supabase
    .from('games')
    .select('id,fen,turn,status,black_player_id,source_type')
    .eq('id', gameId)
    .single();
  if (gameErr || !game) return json({ error: gameErr?.message ?? 'Game not found' }, 404);
  if (String(game.status) !== 'active') return json({ error: 'Game is not active' }, 400);
  if (String(game.source_type ?? '') !== 'bot_game') return json({ error: 'Not a bot game' }, 400);

  const board = new Chess(String(game.fen ?? undefined));
  const uci = selected.move;
  const moved = board.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: (uci[4] as 'q' | 'r' | 'b' | 'n' | undefined) ?? undefined,
  });
  if (!moved) return json({ error: 'Selected move is illegal in current position' }, 400);

  const nextFen = board.fen();
  const nextTurn = board.turn() === 'w' ? 'white' : 'black';
  const nowIso = new Date().toISOString();

  const { data: updated, error: updateErr } = await supabase
    .from('games')
    .update({
      fen: nextFen,
      turn: nextTurn,
      last_move_at: nowIso,
      source_type: 'bot_game',
    })
    .eq('id', gameId)
    .select('*')
    .single();
  if (updateErr) return json({ error: updateErr.message }, 500);

  const logInsert = await insertGameMoveLog(
    supabase,
    {
      game_id: gameId,
      player_id: String(game.black_player_id ?? ''),
      san: moved.san,
      from_sq: moved.from,
      to_sq: moved.to,
      fen_before: String(game.fen ?? '').trim() || null,
      fen_after: nextFen,
      move_duration_ms: 0,
    },
    'legacy_ops',
  );
  if (!logInsert.ok) {
    auditApiLog('bot_game_move_legacy', {
      result: logInsert.code,
      game_id: shortId(gameId),
      move_log_insert_failed: true,
      replay_integrity_warning: true,
    });
    return json(
      {
        error: {
          code: logInsert.code,
          message: logInsert.message,
          retryable: true,
        },
        move_applied: true,
        move_log_failed: true,
        game: updated,
      },
      409,
    );
  }

  return json({ ok: true, bot, selected, game: updated });
}
