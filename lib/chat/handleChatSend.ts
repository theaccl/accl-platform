import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { checkRateLimit } from '@/lib/server/rateLimit';
import type { ChatChannel } from './chatChannels';
import { DEFAULT_LOBBY_ROOM } from './chatChannels';
import {
  assertChannelPayload,
  canPostPlayerChat,
  canPostSpectatorChat,
  isGameParticipant,
} from './chatPolicy';
import {
  ecosystemsCompatible,
  loadGameRow,
  verifySpectatorGameView,
  type ViewerEcosystem,
} from './chatGameAccess';
import {
  getOrCreateDmThread,
  insertChatMessage,
  isDmBlocked,
} from './chatRepository';
import { normalizeChatBody } from './chatBody';

const RATE_MAX = 25;
const RATE_WINDOW_MS = 60_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function profileExists(supabase: ReturnType<typeof createServiceRoleClient>, id: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('id').eq('id', id).maybeSingle();
  return !!data?.id;
}

export async function handleChatSend(
  request: Request,
  userId: string,
  viewerEcosystem: ViewerEcosystem
): Promise<Response> {
  const rl = checkRateLimit(`chat:send:${userId}`, RATE_MAX, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return json(
      {
        error: 'rate_limited',
        retry_after_sec: rl.retryAfterSec,
        message: 'Too many messages. Wait a moment and try again.',
      },
      429,
    );
  }

  let payload: {
    channel?: unknown;
    gameId?: unknown;
    lobbyRoom?: unknown;
    peerId?: unknown;
    body?: unknown;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const channel = String(payload.channel ?? '').trim() as ChatChannel;
  if (
    channel !== 'game_spectator' &&
    channel !== 'game_player' &&
    channel !== 'lobby' &&
    channel !== 'dm'
  ) {
    return json({ error: 'invalid_channel' }, 400);
  }

  const bodyNorm = normalizeChatBody(payload.body);
  if (!bodyNorm.ok) return json({ error: bodyNorm.error }, 400);

  let supabase: ReturnType<typeof createServiceRoleClient>;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    return json(
      {
        error: 'server_misconfigured',
        message: e instanceof Error ? e.message : 'Server chat is not configured (Supabase service role).',
      },
      503
    );
  }

  if (channel === 'lobby') {
    const lobbyRoom =
      typeof payload.lobbyRoom === 'string' && payload.lobbyRoom.trim()
        ? payload.lobbyRoom.trim()
        : DEFAULT_LOBBY_ROOM;
    try {
      assertChannelPayload(channel, null, lobbyRoom, null);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'invalid_scope' }, 400);
    }
    const ins = await insertChatMessage(supabase, {
      channel: 'lobby',
      lobby_room: lobbyRoom,
      sender_id: userId,
      body: bodyNorm.body,
    });
    if (!ins.ok) {
      return json(
        {
          error: 'send_failed',
          message: 'Message could not be saved.',
          db_code: ins.supabase.code,
          db_message: ins.supabase.message,
        },
        503
      );
    }
    return json({ message: ins.row });
  }

  if (channel === 'dm') {
    const peerId = typeof payload.peerId === 'string' ? payload.peerId.trim() : '';
    if (!peerId || peerId === userId) return json({ error: 'invalid_peer' }, 400);
    const peerOk = await profileExists(supabase, peerId);
    if (!peerOk) return json({ error: 'peer_not_found' }, 404);
    if (await isDmBlocked(supabase, userId, peerId)) return json({ error: 'blocked' }, 403);
    const thread = await getOrCreateDmThread(supabase, userId, peerId);
    if (!thread) {
      return json({ error: 'thread_failed', message: 'Could not open this conversation. Try again.' }, 503);
    }
    try {
      assertChannelPayload(channel, null, null, thread.id);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'invalid_scope' }, 400);
    }
    const ins = await insertChatMessage(supabase, {
      channel: 'dm',
      dm_thread_id: thread.id,
      sender_id: userId,
      body: bodyNorm.body,
    });
    if (!ins.ok) {
      return json(
        {
          error: 'send_failed',
          message: 'Message could not be saved.',
          db_code: ins.supabase.code,
          db_message: ins.supabase.message,
        },
        503
      );
    }
    return json({ message: ins.row, dm_thread_id: thread.id });
  }

  const gameId = typeof payload.gameId === 'string' ? payload.gameId.trim() : '';
  if (!gameId) return json({ error: 'gameId required' }, 400);

  const game = await loadGameRow(supabase, gameId);
  if (!game) {
    return json({ error: 'game_unavailable', message: 'Game not found or not accessible.' }, 404);
  }

  const participant = isGameParticipant(game, userId);
  if (!participant) {
    const spectateOk = await verifySpectatorGameView(supabase, gameId, viewerEcosystem);
    if (!spectateOk || !ecosystemsCompatible(game, viewerEcosystem)) {
      return json(
        { error: 'forbidden', message: 'You cannot read or post in this game chat.' },
        403,
      );
    }
  }

  if (channel === 'game_spectator') {
    if (!canPostSpectatorChat(game, userId)) {
      return json({ error: 'forbidden', message: 'Spectator chat is not available for you here.' }, 403);
    }
  } else {
    if (!canPostPlayerChat(game, userId)) {
      return json({ error: 'forbidden', message: 'Player chat is only for the two players.' }, 403);
    }
  }

  try {
    assertChannelPayload(channel, gameId, null, null);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'invalid_scope' }, 400);
  }

  const ins = await insertChatMessage(supabase, {
    channel,
    game_id: gameId,
    sender_id: userId,
    body: bodyNorm.body,
  });
  if (!ins.ok) {
    return json(
      {
        error: 'send_failed',
        message: 'Message could not be saved.',
        db_code: ins.supabase.code,
        db_message: ins.supabase.message,
      },
      503
    );
  }
  return json({ message: ins.row });
}
