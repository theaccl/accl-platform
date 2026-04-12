import { Chess } from 'chess.js';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { selectBotMove, type BotCandidateLine, type BotName } from '@/lib/bot/botPersonality';

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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
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

  await supabase.from('game_move_logs').insert({
    game_id: gameId,
    // For bot games, black_player_id is the effective bot identity chosen at game creation.
    player_id: game.black_player_id,
    san: moved.san,
    from_sq: moved.from,
    to_sq: moved.to,
    fen_before: game.fen,
    fen_after: nextFen,
    move_duration_ms: 0,
  });

  return json({ ok: true, bot, selected, game: updated });
}
