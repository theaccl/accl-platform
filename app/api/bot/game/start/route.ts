import { createClient } from '@supabase/supabase-js';
import fetchPolyfill from 'cross-fetch';

import {
  BOT_DIFFICULTY_LABELS,
  normalizeBotDifficultyLevel,
  type BotDifficultyLevel,
} from '@/lib/bot/botDifficulty';
import { botProfileForPersonalityStyle, configuredBotUserIds } from '@/lib/bot/botIdentity';
import type { BotName } from '@/lib/bot/botPersonality';
import {
  BOT_PERSONALITY_LABELS,
  BOT_PERSONALITY_STYLES,
  normalizeBotPersonalityStyle,
  type BotPersonalityStyle,
} from '@/lib/bot/botPersonalityStyle';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import {
  normalizeComputerPlayPlatMode,
  resolveComputerPlayLiveTimeControl,
} from '@/lib/freePlayComputerEntry';
import {
  playComputerBotEnvFailures,
  playComputerMissingProfileBody,
  playComputerProvisioningErrorBody,
} from '@/lib/bot/botStartProvisioning';
import { botGameInsert } from '@/lib/gameStartupInsert';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { tooManyRequests } from '@/lib/server/httpJson';
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function configuredBotUserId(bot: BotName): string {
  return configuredBotUserIds()[bot];
}

function resolveLegacyBotName(raw: unknown): BotName | null {
  const s = String(raw ?? '').trim();
  if (s === 'Cardi Bot' || s === 'Aggro Bot' || s === 'Endgame Bot') return s;
  return null;
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

  const body = (await request.json().catch(() => ({}))) as {
    bot?: unknown;
    difficulty?: unknown;
    personalityStyle?: unknown;
    personality?: unknown;
    liveTimeControl?: unknown;
    timeControl?: unknown;
    platMode?: unknown;
    mode?: unknown;
  };

  const difficulty: BotDifficultyLevel = normalizeBotDifficultyLevel(body.difficulty ?? 3);
  const personalityStyle: BotPersonalityStyle = normalizeBotPersonalityStyle(
    body.personalityStyle ?? body.personality ?? 'balanced',
  );

  const legacyBot = resolveLegacyBotName(body.bot);
  const profileBot: BotName = legacyBot ?? botProfileForPersonalityStyle(personalityStyle);
  const botUserId = configuredBotUserId(profileBot);
  const opponentLabel = legacyBot ?? BOT_PERSONALITY_LABELS[personalityStyle];

  const platMode = normalizeComputerPlayPlatMode(body.platMode ?? body.mode);
  const liveTimeControlRaw = String(body.liveTimeControl ?? body.timeControl ?? '').trim();
  const resolvedTc = resolveComputerPlayLiveTimeControl({
    platMode,
    liveTimeControl: liveTimeControlRaw || null,
  });
  if (platMode && liveTimeControlRaw && !resolvedTc.ok) {
    return json(
      { error: 'invalid_time_control_for_mode', message: `Time control is not valid for ${platMode}.` },
      400,
    );
  }
  const liveTimeControl = resolvedTc.ok ? resolvedTc.liveTimeControl : null;

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

  const envFailures = playComputerBotEnvFailures();
  if (envFailures.length > 0) {
    auditApiLog('bot_game_start', {
      result: 'provisioning_invalid',
      user: shortId(userId),
      key: envFailures[0]?.key,
      category: envFailures[0]?.category,
    });
    return json(playComputerProvisioningErrorBody(envFailures), 503);
  }

  const { data: botProfile } = await supabase.from('profiles').select('id').eq('id', botUserId).maybeSingle();
  if (!botProfile?.id) {
    auditApiLog('bot_game_start', {
      result: 'provisioning_invalid',
      user: shortId(userId),
      bot: profileBot,
      category: 'missing_profile',
    });
    return json(playComputerMissingProfileBody(profileBot, botUserId), 503);
  }

  const insertRow = botGameInsert(userId, botUserId, {
    difficulty,
    personalityStyle,
    opponentLabel,
    liveTimeControl,
  });

  const { data, error } = await supabase.from('games').insert(insertRow).select('id,source_type,white_player_id,black_player_id').single();

  if (error) {
    auditApiLog('bot_game_start', { result: 'db_error', user: shortId(userId), bot: profileBot });
    return json(
      { error: 'game_create_failed', message: 'Could not start the game. Try again in a moment.' },
      503,
    );
  }
  auditApiLog('bot_game_start', {
    result: 'ok',
    user: shortId(userId),
    bot: profileBot,
    difficulty,
    personalityStyle,
    game_id: shortId(String(data?.id ?? '')),
  });
  return json(
    {
      ok: true,
      bot: profileBot,
      difficulty,
      difficultyLabel: BOT_DIFFICULTY_LABELS[difficulty],
      personalityStyle,
      personalityLabel: BOT_PERSONALITY_LABELS[personalityStyle],
      allowedPersonalityStyles: BOT_PERSONALITY_STYLES,
      game: data,
    },
    200,
  );
}
