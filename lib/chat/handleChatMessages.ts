import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { checkRateLimit } from '@/lib/server/rateLimit';
import type { ChatChannel } from './chatChannels';
import { DEFAULT_LOBBY_ROOM } from './chatChannels';
import {
  assertChannelPayload,
  canAccessPlayerChat,
  canReadSpectatorChat,
  isGameParticipant,
} from './chatPolicy';
import {
  ecosystemsCompatible,
  loadGameRow,
  verifySpectatorGameView,
  type ViewerEcosystem,
} from './chatGameAccess';
import {
  getDmThreadForUser,
  getMutedUserIds,
  listDmMessages,
  listGameChannelMessages,
  listLobbyMessages,
} from './chatRepository';
import { viewerEcosystemFromRequest } from './viewerEcosystemHeader';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const CHAT_GET_MAX_PER_MIN = 200;

export async function handleChatMessagesGet(request: Request, userId: string): Promise<Response> {
  const rl = checkRateLimit(`chat:messages:get:${userId}`, CHAT_GET_MAX_PER_MIN, 60_000);
  if (!rl.allowed) {
    return json(
      {
        error: 'rate_limited',
        retry_after_sec: rl.retryAfterSec,
        message: 'Too many chat loads. Wait a moment.',
      },
      429,
    );
  }

  const url = new URL(request.url);
  const channel = String(url.searchParams.get('channel') ?? '').trim() as ChatChannel;
  if (
    channel !== 'game_spectator' &&
    channel !== 'game_player' &&
    channel !== 'lobby' &&
    channel !== 'dm'
  ) {
    return json({ error: 'invalid_channel' }, 400);
  }

  const limitRaw = Number(url.searchParams.get('limit') ?? '40');
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 40;
  const viewerEcosystem: ViewerEcosystem = viewerEcosystemFromRequest(request);

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
  const mutes = await getMutedUserIds(supabase, userId);

  if (channel === 'lobby') {
    const lobbyRoom =
      String(url.searchParams.get('lobbyRoom') ?? '').trim() || DEFAULT_LOBBY_ROOM;
    try {
      assertChannelPayload(channel, null, lobbyRoom, null);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'invalid_scope' }, 400);
    }
    const messages = await listLobbyMessages(supabase, {
      lobbyRoom,
      limit,
      muteFilterSenderIds: mutes,
    });
    return json({ messages: messages.reverse() });
  }

  if (channel === 'dm') {
    const threadId = String(url.searchParams.get('threadId') ?? '').trim();
    if (!threadId) return json({ error: 'threadId required' }, 400);
    const membership = await getDmThreadForUser(supabase, threadId, userId);
    if (!membership) return json({ error: 'forbidden' }, 403);
    const messages = await listDmMessages(supabase, {
      threadId,
      limit,
      muteFilterSenderIds: mutes,
    });
    return json({ messages: messages.reverse() });
  }

  const gameId = String(url.searchParams.get('gameId') ?? '').trim();
  if (!gameId) return json({ error: 'gameId required' }, 400);

  const game = await loadGameRow(supabase, gameId);
  if (!game) {
    return json({ error: 'game_unavailable', message: 'Game not found or not accessible.' }, 404);
  }

  const participant = isGameParticipant(game, userId);
  if (!participant) {
    const spectateOk = await verifySpectatorGameView(supabase, gameId, viewerEcosystem);
    if (!spectateOk || !ecosystemsCompatible(game, viewerEcosystem)) {
      return json({ error: 'forbidden' }, 403);
    }
  }

  if (channel === 'game_spectator') {
    if (!canReadSpectatorChat(game, userId)) return json({ error: 'forbidden' }, 403);
  } else if (!canAccessPlayerChat(game, userId)) {
    return json({ error: 'forbidden' }, 403);
  }

  try {
    assertChannelPayload(channel, gameId, null, null);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'invalid_scope' }, 400);
  }

  const messages = await listGameChannelMessages(supabase, {
    gameId,
    channel,
    limit,
    muteFilterSenderIds: mutes,
  });
  return json({ messages: messages.reverse() });
}
