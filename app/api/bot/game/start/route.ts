import { createClient } from '@supabase/supabase-js';
import fetchPolyfill from 'cross-fetch';

import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { botGameInsert } from '@/lib/gameStartupInsert';
import type { BotName } from '@/lib/bot/botPersonality';
import { getRuntimeConfigValidationReport } from '@/lib/runtimeConfigValidation';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { tooManyRequests } from '@/lib/server/httpJson';

const BOT_USER_IDS: Record<BotName, string> = {
  'Cardi Bot': '10000000-0000-0000-0000-000000000001',
  'Aggro Bot': '10000000-0000-0000-0000-000000000002',
  'Endgame Bot': '10000000-0000-0000-0000-000000000003',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function configuredBotUserId(bot: BotName): string {
  const envMap: Partial<Record<BotName, string | undefined>> = {
    'Cardi Bot': process.env.BOT_USER_ID_CARDI,
    'Aggro Bot': process.env.BOT_USER_ID_AGGRO,
    'Endgame Bot': process.env.BOT_USER_ID_ENDGAME,
  };
  const configured = envMap[bot]?.trim();
  return configured && configured.length > 0 ? configured : BOT_USER_IDS[bot];
}

async function resolveAuthenticatedUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) return null;
  const token = m[1]?.trim();
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchPolyfill as unknown as typeof fetch },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error) return null;
  return data.user?.id ?? null;
}

export async function POST(request: Request): Promise<Response> {
  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) {
    auditApiLog('bot_game_start', { result: 'unauthorized' });
    return json({ error: 'Unauthorized' }, 401);
  }
  const rl = checkRateLimit(`bot-game-start:${userId}`, 30, 60_000);
  if (!rl.allowed) {
    auditApiLog('bot_game_start', { result: 'rate_limited', user: shortId(userId) });
    return tooManyRequests(rl.retryAfterSec);
  }

  const body = (await request.json().catch(() => ({}))) as { bot?: unknown };
  const bot = String(body.bot ?? '') as BotName;
  if (!['Cardi Bot', 'Aggro Bot', 'Endgame Bot'].includes(bot)) {
    return json({ error: 'bot must be Cardi Bot | Aggro Bot | Endgame Bot' }, 400);
  }
  const botUserId = configuredBotUserId(bot);

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch {
    auditApiLog('bot_game_start', { result: 'service_config', user: shortId(userId) });
    return json(
      { error: 'service_unavailable', message: 'Service temporarily unavailable. Try again in a moment.' },
      503,
    );
  }

  const validation = await getRuntimeConfigValidationReport();
  const botValidationErrors = validation.states.filter(
    (s) =>
      !s.ok &&
      (s.key.startsWith('BOT_USER_ID_') ||
        s.key.startsWith('BOT_IDENTITY_SET') ||
        s.key.startsWith('BOT_USER_ID_CARDI_') ||
        s.key.startsWith('BOT_USER_ID_AGGRO_') ||
        s.key.startsWith('BOT_USER_ID_ENDGAME_'))
  );
  if (botValidationErrors.length > 0) {
    const first = botValidationErrors[0];
    return json(
      {
        error: 'Bot provisioning invalid',
        category: first.category,
        key: first.key,
        detail: first.detail,
        states: botValidationErrors,
      },
      503
    );
  }

  const { data: botProfile } = await supabase.from('profiles').select('id').eq('id', botUserId).maybeSingle();
  if (!botProfile?.id) {
    return json(
      {
        error: `Bot identity is not provisioned for ${bot}.`,
        category: 'missing_profile',
        key: `${bot}_PROFILE`,
        detail: `profile ${botUserId} not found`,
      },
      503
    );
  }

  const { data, error } = await supabase
    .from('games')
    .insert(botGameInsert(userId, botUserId))
    .select('id,source_type,white_player_id,black_player_id')
    .single();

  if (error) {
    auditApiLog('bot_game_start', { result: 'db_error', user: shortId(userId), bot });
    return json(
      { error: 'game_create_failed', message: 'Could not start the game. Try again in a moment.' },
      503,
    );
  }
  auditApiLog('bot_game_start', {
    result: 'ok',
    user: shortId(userId),
    bot,
    game_id: shortId(String(data?.id ?? '')),
  });
  return json({ ok: true, bot, game: data }, 200);
}
