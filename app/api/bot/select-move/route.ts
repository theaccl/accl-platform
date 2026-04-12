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

export async function POST(request: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const bot = String(body.bot ?? '') as BotName;
  if (!['Cardi Bot', 'Aggro Bot', 'Endgame Bot'].includes(bot)) {
    return json({ error: 'bot must be Cardi Bot | Aggro Bot | Endgame Bot' }, 400);
  }

  const candidates = Array.isArray(body.candidates) ? (body.candidates as BotCandidateLine[]) : [];
  const selected = selectBotMove(bot, candidates);
  if (!selected) return json({ error: 'No candidate lines available' }, 400);

  return json({
    ok: true,
    selected,
    meta: {
      source_type: 'bot_game',
      retention_hint: 'short',
      pgn_export_supported: true,
      tournament_integrity_scope: 'excluded',
    },
  });
}
