import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatChannel } from './chatChannels';

export type ChatMessageRow = {
  id: string;
  created_at: string;
  channel: ChatChannel;
  game_id: string | null;
  lobby_room: string | null;
  dm_thread_id: string | null;
  sender_id: string;
  body: string;
};

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function getMutedUserIds(
  supabase: SupabaseClient,
  muterId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('tester_chat_mutes')
    .select('muted_user_id')
    .eq('muter_id', muterId);
  if (error || !data) return new Set();
  return new Set(data.map((r) => String((r as { muted_user_id: string }).muted_user_id)));
}

export async function isDmBlocked(
  supabase: SupabaseClient,
  a: string,
  b: string
): Promise<boolean> {
  const { data: row1 } = await supabase
    .from('tester_chat_blocks')
    .select('id')
    .eq('blocker_id', a)
    .eq('blocked_user_id', b)
    .maybeSingle();
  if (row1) return true;
  const { data: row2 } = await supabase
    .from('tester_chat_blocks')
    .select('id')
    .eq('blocker_id', b)
    .eq('blocked_user_id', a)
    .maybeSingle();
  return !!row2;
}

export async function getOrCreateDmThread(
  supabase: SupabaseClient,
  userA: string,
  userB: string
): Promise<{ id: string } | null> {
  const [low, high] = orderedPair(userA, userB);
  const { data: existing } = await supabase
    .from('tester_dm_threads')
    .select('id')
    .eq('participant_low', low)
    .eq('participant_high', high)
    .maybeSingle();
  if (existing?.id) return { id: existing.id as string };
  const { data: created, error } = await supabase
    .from('tester_dm_threads')
    .insert({ participant_low: low, participant_high: high })
    .select('id')
    .single();
  if (created?.id) return { id: created.id as string };
  if (error && String(error.code) === '23505') {
    const { data: again } = await supabase
      .from('tester_dm_threads')
      .select('id')
      .eq('participant_low', low)
      .eq('participant_high', high)
      .maybeSingle();
    if (again?.id) return { id: again.id as string };
  }
  return null;
}

export async function insertChatMessage(
  supabase: SupabaseClient,
  row: {
    channel: ChatChannel;
    game_id?: string | null;
    lobby_room?: string | null;
    dm_thread_id?: string | null;
    sender_id: string;
    body: string;
  }
): Promise<ChatMessageRow | null> {
  const { data, error } = await supabase
    .from('tester_chat_messages')
    .insert({
      channel: row.channel,
      game_id: row.game_id ?? null,
      lobby_room: row.lobby_room ?? null,
      dm_thread_id: row.dm_thread_id ?? null,
      sender_id: row.sender_id,
      body: row.body,
    })
    .select('id,created_at,channel,game_id,lobby_room,dm_thread_id,sender_id,body')
    .single();
  if (error || !data) return null;
  return data as ChatMessageRow;
}

async function usernamesForSenders(
  supabase: SupabaseClient,
  senderIds: string[]
): Promise<Map<string, string | null>> {
  const uniq = [...new Set(senderIds)].filter(Boolean);
  const map = new Map<string, string | null>();
  if (uniq.length === 0) return map;
  const { data } = await supabase.from('profiles').select('id,username').in('id', uniq);
  for (const row of (data ?? []) as { id: string; username: string | null }[]) {
    map.set(row.id, row.username ?? null);
  }
  return map;
}

export async function listGameChannelMessages(
  supabase: SupabaseClient,
  params: {
    gameId: string;
    channel: 'game_spectator' | 'game_player';
    limit: number;
    muteFilterSenderIds: Set<string>;
  }
): Promise<(ChatMessageRow & { sender_username: string | null })[]> {
  const { data, error } = await supabase
    .from('tester_chat_messages')
    .select('id,created_at,channel,game_id,lobby_room,dm_thread_id,sender_id,body')
    .eq('game_id', params.gameId)
    .eq('channel', params.channel)
    .order('created_at', { ascending: false })
    .limit(Math.min(params.limit, 100));
  if (error || !data) return [];
  const rows = data as ChatMessageRow[];
  const filtered = rows.filter((r) => !params.muteFilterSenderIds.has(r.sender_id));
  const names = await usernamesForSenders(
    supabase,
    filtered.map((r) => r.sender_id)
  );
  return filtered.map((r) => ({
    ...r,
    sender_username: names.get(r.sender_id) ?? null,
  }));
}

export async function listLobbyMessages(
  supabase: SupabaseClient,
  params: { lobbyRoom: string; limit: number; muteFilterSenderIds: Set<string> }
): Promise<(ChatMessageRow & { sender_username: string | null })[]> {
  const { data, error } = await supabase
    .from('tester_chat_messages')
    .select('id,created_at,channel,game_id,lobby_room,dm_thread_id,sender_id,body')
    .eq('channel', 'lobby')
    .eq('lobby_room', params.lobbyRoom)
    .order('created_at', { ascending: false })
    .limit(Math.min(params.limit, 100));
  if (error || !data) return [];
  const rows = data as ChatMessageRow[];
  const filtered = rows.filter((r) => !params.muteFilterSenderIds.has(r.sender_id));
  const names = await usernamesForSenders(
    supabase,
    filtered.map((r) => r.sender_id)
  );
  return filtered.map((r) => ({
    ...r,
    sender_username: names.get(r.sender_id) ?? null,
  }));
}

export async function listDmMessages(
  supabase: SupabaseClient,
  params: { threadId: string; limit: number; muteFilterSenderIds: Set<string> }
): Promise<(ChatMessageRow & { sender_username: string | null })[]> {
  const { data, error } = await supabase
    .from('tester_chat_messages')
    .select('id,created_at,channel,game_id,lobby_room,dm_thread_id,sender_id,body')
    .eq('channel', 'dm')
    .eq('dm_thread_id', params.threadId)
    .order('created_at', { ascending: false })
    .limit(Math.min(params.limit, 100));
  if (error || !data) return [];
  const rows = data as ChatMessageRow[];
  const filtered = rows.filter((r) => !params.muteFilterSenderIds.has(r.sender_id));
  const names = await usernamesForSenders(
    supabase,
    filtered.map((r) => r.sender_id)
  );
  return filtered.map((r) => ({
    ...r,
    sender_username: names.get(r.sender_id) ?? null,
  }));
}

export async function getDmThreadForUser(
  supabase: SupabaseClient,
  threadId: string,
  userId: string
): Promise<{ id: string; participant_low: string; participant_high: string } | null> {
  const { data } = await supabase
    .from('tester_dm_threads')
    .select('id,participant_low,participant_high')
    .eq('id', threadId)
    .maybeSingle();
  const row = data as { id: string; participant_low: string; participant_high: string } | null;
  if (!row) return null;
  if (row.participant_low !== userId && row.participant_high !== userId) return null;
  return row;
}

export async function insertReport(
  supabase: SupabaseClient,
  messageId: string,
  reporterId: string,
  reason: string | null
): Promise<boolean> {
  const { error } = await supabase.from('tester_chat_reports').insert({
    message_id: messageId,
    reporter_id: reporterId,
    reason: reason?.trim() || null,
  });
  if (!error) return true;
  if (/duplicate|unique/i.test(error.message)) return true;
  return false;
}

export async function upsertMute(
  supabase: SupabaseClient,
  muterId: string,
  mutedUserId: string
): Promise<boolean> {
  const { error } = await supabase.from('tester_chat_mutes').insert({
    muter_id: muterId,
    muted_user_id: mutedUserId,
  });
  if (!error) return true;
  if (/duplicate|unique/i.test(error.message)) return true;
  return false;
}

export async function upsertBlock(
  supabase: SupabaseClient,
  blockerId: string,
  blockedUserId: string
): Promise<boolean> {
  const { error } = await supabase.from('tester_chat_blocks').insert({
    blocker_id: blockerId,
    blocked_user_id: blockedUserId,
  });
  if (!error) return true;
  if (/duplicate|unique/i.test(error.message)) return true;
  return false;
}

export async function listDmThreadsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<{ thread_id: string; peer_id: string; last_at: string }[]> {
  const { data: threads } = await supabase
    .from('tester_dm_threads')
    .select('id,participant_low,participant_high,created_at')
    .or(`participant_low.eq.${userId},participant_high.eq.${userId}`);
  if (!threads?.length) return [];
  const out: { thread_id: string; peer_id: string; last_at: string }[] = [];
  for (const t of threads as {
    id: string;
    participant_low: string;
    participant_high: string;
    created_at: string;
  }[]) {
    const peer = t.participant_low === userId ? t.participant_high : t.participant_low;
    const { data: last } = await supabase
      .from('tester_chat_messages')
      .select('created_at')
      .eq('channel', 'dm')
      .eq('dm_thread_id', t.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    out.push({
      thread_id: t.id,
      peer_id: peer,
      last_at: (last as { created_at?: string } | null)?.created_at ?? t.created_at,
    });
  }
  out.sort((a, b) => (a.last_at < b.last_at ? 1 : -1));
  return out;
}
