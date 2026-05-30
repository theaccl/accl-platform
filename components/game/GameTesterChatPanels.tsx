'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import Link from 'next/link';
import { publicDisplayNameFromProfileUsername } from '@/lib/profileIdentity';
import { useOpenPublicIdentityCard } from '@/components/identity/PublicIdentityCardContext';
import {
  resolveTesterChatLane,
  type GameTesterChatViewerRole,
} from '@/lib/chat/resolveTesterChatLane';
import { supabase } from '@/lib/supabaseClient';

const CHAT_BODY_MAX = 2000;

/** Dev-only: detect duplicate realtime channel creation (Strict Mode / effect churn). */
let gameChatChannelSeq = 0;

/** Dev-only: where a chat load was triggered from (initial and tab focus; no network poll) */
type GameChatLoadSource = 'initial' | 'visibilitychange';

type ChatMsg = {
  id: string;
  created_at: string;
  sender_id: string;
  body: string;
  sender_username: string | null;
};

function formatChatSendError(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const o = payload as {
      message?: unknown;
      error?: unknown;
      db_message?: unknown;
      db_code?: unknown;
    };
    const code = typeof o.db_code === 'string' ? o.db_code.trim() : '';
    const db = typeof o.db_message === 'string' ? o.db_message.trim() : '';
    if (code === 'PGRST205' || /schema cache/i.test(db)) {
      return 'Chat storage is not available on this server yet (database migration missing).';
    }
    if (typeof o.message === 'string' && o.message.trim()) return o.message;
    if (o.error === 'rate_limited') return 'Too many messages. Wait a moment and try again.';
    if (o.error === 'Unauthorized') return 'Session expired — sign in again.';
    if (o.error === 'forbidden') return 'You cannot post in this channel.';
    if (o.error === 'game_unavailable') return 'This game chat is not available.';
    if (o.error === 'server_misconfigured') {
      return typeof o.message === 'string' && o.message.trim()
        ? o.message
        : 'Chat server is not configured. Check Supabase service role env on Vercel.';
    }
    if (o.error === 'send_failed') {
      if (db || code) {
        return [code && `(${code})`, db].filter(Boolean).join(' ');
      }
      return 'Message could not be saved. Try again.';
    }
    if (o.error === 'internal_error' && typeof o.message === 'string' && o.message.trim()) {
      return o.message;
    }
  }
  return 'Send failed. Try again.';
}

async function chatFetch(
  path: string,
  accessToken: string,
  viewerEcosystem: 'adult' | 'k12',
  init?: RequestInit
): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'x-accl-viewer-ecosystem': viewerEcosystem,
      ...(init?.headers ?? {}),
    },
  });
}

function sortChatChronological(list: ChatMsg[]): ChatMsg[] {
  return [...list].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  );
}

function parseInsertRowToMsg(row: Record<string, unknown>): ChatMsg | null {
  const id = typeof row.id === 'string' ? row.id : null;
  const created_at = typeof row.created_at === 'string' ? row.created_at : null;
  const sender_id = typeof row.sender_id === 'string' ? row.sender_id : null;
  const body = typeof row.body === 'string' ? row.body : null;
  if (!id || !created_at || !sender_id || body == null) return null;
  return { id, created_at, sender_id, body, sender_username: null };
}

/**
 * On postgres INSERT, merge into in-memory list (no full refetch). Deduplicate with optimistic / own echo.
 * Each lane only reacts to the matching `channel` so `game_spectator` and `game_player` stay isolated.
 */
function appendIncomingFromRealtime(
  setMessages: Dispatch<SetStateAction<ChatMsg[]>>,
  newRow: Record<string, unknown>,
  expectedChannel: 'game_spectator' | 'game_player',
  opts?: { currentUserId?: string | null; onOpponentMessage?: () => void }
) {
  if (String(newRow.channel ?? '') !== expectedChannel) return;
  const m = parseInsertRowToMsg(newRow);
  if (!m) return;
  // Attention signal for the unread light: only for messages from the *other*
  // seated player. Own-message realtime echoes never light the dot.
  if (opts?.onOpponentMessage && m.sender_id && m.sender_id !== opts.currentUserId) {
    opts.onOpponentMessage();
  }
  setMessages((prev: ChatMsg[]) =>
    prev.some((x) => x.id === m.id) ? prev : sortChatChronological([...prev, m])
  );
  void (async () => {
    const { data, error } = await supabase.from('profiles').select('username').eq('id', m.sender_id).maybeSingle();
    if (error || !data) return;
    const u = (data as { username: string | null }).username ?? null;
    if (u == null) return;
    setMessages((p: ChatMsg[]) => p.map((x) => (x.id === m.id ? { ...x, sender_username: u } : x)));
  })();
}

function ChatStrip({
  title,
  subtitle,
  accent,
  messages,
  busy,
  error,
  draft,
  onDraft,
  onSend,
  sending,
  onReport,
  reportingId,
  maxLen,
  onSenderClick,
  sendTestId,
  readOnly = false,
}: {
  title: string;
  subtitle: string;
  accent: string;
  messages: ChatMsg[];
  busy: boolean;
  error: string | null;
  draft: string;
  onDraft: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  onReport: (messageId: string) => void;
  reportingId: string | null;
  maxLen: number;
  /** When set, clicking the sender display name opens the public identity card. */
  onSenderClick?: (senderId: string) => void;
  sendTestId: 'player' | 'spectator';
  /** When true, render an archive view: no composer, no send action. */
  readOnly?: boolean;
}) {
  const remaining = maxLen - draft.length;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const latestMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
  // Pin the internal chat list to the newest message when one is appended. Acts
  // only on this overflow container's scrollTop — never scrolls the page/board.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [latestMessageId]);
  return (
    <section
      className="accl-game-side-panel"
      style={{
        marginTop: 14,
        maxWidth: 520,
        border: `1px solid ${accent}`,
        borderRadius: 8,
        background: '#111318',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${accent}`, background: '#0c0e12' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: '#e2e8f0' }}>
            {title}
          </p>
          {readOnly ? (
            <span
              data-testid="game-chat-readonly-indicator"
              style={{
                flex: '0 0 auto',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#94a3b8',
                border: '1px solid #334155',
                borderRadius: 999,
                padding: '2px 8px',
              }}
            >
              Read-only
            </span>
          ) : null}
        </div>
        <p style={{ margin: '4px 0 0 0', fontSize: 11, color: '#94a3b8', lineHeight: 1.35 }}>{subtitle}</p>
      </div>
      <div
        ref={scrollRef}
        className="accl-scroll-no-anchor"
        style={{
          maxHeight: 160,
          overflowY: 'auto',
          padding: '8px 10px',
          fontSize: 12,
          color: '#cbd5e1',
          lineHeight: 1.45,
        }}
      >
        {busy ? <p style={{ margin: 0, color: '#64748b' }}>Loading…</p> : null}
        {error ? <p style={{ margin: '0 0 6px 0', color: '#f87171' }}>{error}</p> : null}
        {messages.length === 0 && !busy ? (
          <p style={{ margin: 0, color: '#64748b' }}>No messages yet.</p>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 8 }}>
            {onSenderClick ? (
              <button
                type="button"
                data-testid={`game-chat-sender-${m.sender_id}`}
                onClick={() => onSenderClick(m.sender_id)}
                style={{
                  color: '#94a3b8',
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  font: 'inherit',
                  textDecoration: 'underline',
                  textDecorationStyle: 'dotted',
                  textUnderlineOffset: '2px',
                }}
              >
                {publicDisplayNameFromProfileUsername(m.sender_username, m.sender_id)}
              </button>
            ) : (
              <span style={{ color: '#94a3b8' }}>
                {publicDisplayNameFromProfileUsername(m.sender_username, m.sender_id)}
              </span>
            )}
            <span style={{ color: '#475569', margin: '0 6px' }}>·</span>
            <span>{m.body}</span>
            <button
              type="button"
              onClick={() => onReport(m.id)}
              disabled={reportingId === m.id}
              style={{
                marginLeft: 8,
                padding: 0,
                border: 'none',
                background: 'transparent',
                color: '#64748b',
                fontSize: 11,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {reportingId === m.id ? '…' : 'Report'}
            </button>
          </div>
        ))}
      </div>
      {readOnly ? (
        <div
          data-testid="game-chat-archive-footer"
          style={{ padding: '8px 12px', borderTop: '1px solid #1e293b', fontSize: 11, color: '#64748b' }}
        >
          Archived game chat — this channel is read-only and closed to new messages.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, padding: 8, borderTop: '1px solid #1e293b', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <textarea
              value={draft}
              maxLength={maxLen}
              onChange={(e) => onDraft(e.target.value.slice(0, maxLen))}
              rows={2}
              placeholder="Message (testers only)…"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                resize: 'vertical',
                minHeight: 44,
                maxHeight: 120,
                padding: 8,
                fontSize: 13,
                borderRadius: 6,
                border: '1px solid #334155',
                background: '#0f172a',
                color: '#e2e8f0',
              }}
            />
            <span style={{ fontSize: 10, color: remaining < 80 ? '#fbbf24' : '#64748b' }}>
              {draft.length}/{maxLen}
            </span>
          </div>
          <button
            type="button"
            data-testid={`game-chat-send-${sendTestId}`}
            onClick={() => void onSend()}
            disabled={sending || !draft.trim()}
            style={{ padding: '8px 12px', alignSelf: 'stretch' }}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      )}
    </section>
  );
}

export type { GameTesterChatViewerRole } from '@/lib/chat/resolveTesterChatLane';

type LaneSharedProps = {
  gameId: string;
  accessToken: string;
  viewerEcosystem: 'adult' | 'k12';
};

/** Spectator-only: `game_spectator` fetch, send, realtime, and state — no player channel. */
function TesterSpectatorChatLane({ gameId, accessToken, viewerEcosystem }: LaneSharedProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const sendLock = useRef(false);
  const openIdentity = useOpenPublicIdentityCard();

  const load = useCallback(
    async (opts?: { source?: GameChatLoadSource; bypassVisibility?: boolean }) => {
      if (
        !opts?.bypassVisibility &&
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      ) {
        return;
      }
      setBusy(true);
      setErr(null);
      const res = await chatFetch(
        `/api/chat/messages?channel=game_spectator&gameId=${encodeURIComponent(gameId)}&limit=50`,
        accessToken,
        viewerEcosystem
      );
      setBusy(false);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as {
          error?: unknown;
          message?: unknown;
          db_message?: unknown;
          db_code?: unknown;
        };
        setErr(
          formatChatSendError({
            error: j.error,
            message: j.message,
            db_message: j.db_message,
            db_code: j.db_code,
          })
        );
        return;
      }
      const j = (await res.json()) as { messages?: ChatMsg[] };
      // Merge by id (server row wins) so a slow/stale load never clobbers a
      // realtime-appended message that arrived while this load was in flight.
      const incoming = j.messages ?? [];
      setMessages((prev) => {
        const byId = new Map(prev.map((message) => [message.id, message]));
        for (const message of incoming) byId.set(message.id, message);
        return sortChatChronological([...byId.values()]);
      });
      if (process.env.NODE_ENV === 'development') {
        console.log('[game-chat-devtrace] spectator-lane:load', {
          source: opts?.source ?? 'initial',
          gameId,
          ts: Date.now(),
        });
      }
    },
    [accessToken, gameId, viewerEcosystem]
  );

  useEffect(() => {
    void load({ source: 'initial' });
  }, [load]);

  useEffect(() => {
    const filter = `game_id=eq.${gameId}`;
    ++gameChatChannelSeq;
    const channelName = `game-tester-chat-${gameId}-spectator-only`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tester_chat_messages', filter },
        (payload) => {
          appendIncomingFromRealtime(setMessages, payload.new as Record<string, unknown>, 'game_spectator');
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void load({ source: 'visibilitychange' });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending || sendLock.current) return;
    sendLock.current = true;
    setSending(true);
    setErr(null);
    try {
      const res = await chatFetch('/api/chat/send', accessToken, viewerEcosystem, {
        method: 'POST',
        body: JSON.stringify({ channel: 'game_spectator', gameId, body }),
      });
      if (!res.ok) {
        setErr(formatChatSendError(await res.json().catch(() => ({}))));
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { message?: ChatMsg };
      setDraft('');
      if (j.message?.id) {
        const fromApi = j.message as ChatMsg;
        setMessages((prev) => (prev.some((x) => x.id === fromApi.id) ? prev : sortChatChronological([...prev, fromApi])));
        if (fromApi.sender_username == null && fromApi.sender_id) {
          const { data } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', fromApi.sender_id)
            .maybeSingle();
          const u = (data as { username: string | null } | null)?.username ?? null;
          if (u != null) {
            setMessages((p) => p.map((x) => (x.id === fromApi.id ? { ...x, sender_username: u } : x)));
          }
        }
      }
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  };

  const report = async (messageId: string) => {
    setReportingId(messageId);
    try {
      await chatFetch('/api/chat/report', accessToken, viewerEcosystem, {
        method: 'POST',
        body: JSON.stringify({ messageId }),
      });
    } finally {
      setReportingId(null);
    }
  };

  return (
    <ChatStrip
      title="Spectator chat (viewers only)"
      subtitle="Spectator channel only. Player table chat is not loaded in this component."
      accent="#a855f7"
      messages={messages}
      busy={busy}
      error={err}
      draft={draft}
      onDraft={setDraft}
      onSend={() => void send()}
      sending={sending}
      onReport={report}
      reportingId={reportingId}
      maxLen={CHAT_BODY_MAX}
      onSenderClick={openIdentity ?? undefined}
      sendTestId="spectator"
    />
  );
}

/** Seated players only: `game_player` fetch, send, realtime — never `game_spectator`. */
function TesterPlayerGameChatLane({
  gameId,
  accessToken,
  viewerEcosystem,
  variant,
  currentUserId,
  onOpponentMessage,
}: LaneSharedProps & {
  variant: 'live' | 'postgame' | 'async_play';
  currentUserId?: string | null;
  onOpponentMessage?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const sendLock = useRef(false);
  const openIdentity = useOpenPublicIdentityCard();
  // Refs keep the realtime subscription stable (no resubscribe when these change).
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;
  const onOpponentMessageRef = useRef(onOpponentMessage);
  onOpponentMessageRef.current = onOpponentMessage;

  const load = useCallback(
    async (opts?: { source?: GameChatLoadSource; bypassVisibility?: boolean }) => {
      if (
        !opts?.bypassVisibility &&
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      ) {
        return;
      }
      setBusy(true);
      setErr(null);
      const res = await chatFetch(
        `/api/chat/messages?channel=game_player&gameId=${encodeURIComponent(gameId)}&limit=50`,
        accessToken,
        viewerEcosystem
      );
      setBusy(false);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as {
          error?: unknown;
          message?: unknown;
          db_message?: unknown;
          db_code?: unknown;
        };
        setErr(
          formatChatSendError({
            error: j.error,
            message: j.message,
            db_message: j.db_message,
            db_code: j.db_code,
          })
        );
        return;
      }
      const j = (await res.json()) as { messages?: ChatMsg[] };
      // Merge by id (server row wins) so a slow/stale load never clobbers a
      // realtime-appended message that arrived while this load was in flight.
      const incoming = j.messages ?? [];
      setMessages((prev) => {
        const byId = new Map(prev.map((message) => [message.id, message]));
        for (const message of incoming) byId.set(message.id, message);
        return sortChatChronological([...byId.values()]);
      });
      if (process.env.NODE_ENV === 'development') {
        console.log('[game-chat-devtrace] player-lane:load', {
          source: opts?.source ?? 'initial',
          gameId,
          variant,
          ts: Date.now(),
        });
      }
    },
    [accessToken, gameId, variant, viewerEcosystem]
  );

  useEffect(() => {
    void load({ source: 'initial' });
  }, [load]);

  useEffect(() => {
    const filter = `game_id=eq.${gameId}`;
    ++gameChatChannelSeq;
    const channelName = `game-tester-chat-${gameId}-player-only-${variant}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tester_chat_messages', filter },
        (payload) => {
          appendIncomingFromRealtime(setMessages, payload.new as Record<string, unknown>, 'game_player', {
            currentUserId: currentUserIdRef.current,
            // Postgame archive is read-only — never raise an unread signal there.
            onOpponentMessage: variant === 'postgame' ? undefined : onOpponentMessageRef.current,
          });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId, variant]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void load({ source: 'visibilitychange' });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const send = async () => {
    // Postgame archive is read-only — never append new messages, even if a stale handler fires.
    if (variant === 'postgame') return;
    const body = draft.trim();
    if (!body || sending || sendLock.current) return;
    sendLock.current = true;
    setSending(true);
    setErr(null);
    try {
      const res = await chatFetch('/api/chat/send', accessToken, viewerEcosystem, {
        method: 'POST',
        body: JSON.stringify({ channel: 'game_player', gameId, body }),
      });
      if (!res.ok) {
        setErr(formatChatSendError(await res.json().catch(() => ({}))));
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { message?: ChatMsg };
      setDraft('');
      if (j.message?.id) {
        const fromApi = j.message as ChatMsg;
        setMessages((prev) => (prev.some((x) => x.id === fromApi.id) ? prev : sortChatChronological([...prev, fromApi])));
        if (fromApi.sender_username == null && fromApi.sender_id) {
          const { data } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', fromApi.sender_id)
            .maybeSingle();
          const u = (data as { username: string | null } | null)?.username ?? null;
          if (u != null) {
            setMessages((p) => p.map((x) => (x.id === fromApi.id ? { ...x, sender_username: u } : x)));
          }
        }
      }
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  };

  const report = async (messageId: string) => {
    setReportingId(messageId);
    try {
      await chatFetch('/api/chat/report', accessToken, viewerEcosystem, {
        method: 'POST',
        body: JSON.stringify({ messageId }),
      });
    } finally {
      setReportingId(null);
    }
  };

  const isLive = variant === 'live';
  const isAsyncPlay = variant === 'async_play';
  return (
    <div style={{ marginBottom: isLive || isAsyncPlay ? 16 : 0 }}>
      <ChatStrip
        title={
          isLive
            ? 'Table chat (players only)'
            : isAsyncPlay
              ? 'Player chat (daily / correspondence)'
              : 'Player chat (post-game, players only)'
        }
        subtitle={
          isLive
            ? 'Player channel only — the two seated players. Spectators use a separate spectator channel.'
            : isAsyncPlay
              ? 'Player channel only — the two participants. There is no spectator chat on async boards.'
              : 'Player channel archive after the game — only the two seated players.'
        }
        accent="#3b82f6"
        messages={messages}
        busy={busy}
        error={err}
        draft={draft}
        onDraft={setDraft}
        onSend={() => void send()}
        sending={sending}
        onReport={report}
        reportingId={reportingId}
        maxLen={CHAT_BODY_MAX}
        onSenderClick={openIdentity ?? undefined}
        sendTestId="player"
        readOnly={variant === 'postgame'}
      />
    </div>
  );
}

export default function GameTesterChatPanels({
  gameId,
  gameStatus,
  gameTempo,
  userId,
  viewerChatRole,
  isBoardSpectator,
  viewerEcosystem,
  accessToken,
  onOpponentMessage,
}: {
  gameId: string;
  gameStatus: string;
  gameTempo: string | null;
  userId: string;
  viewerChatRole: GameTesterChatViewerRole;
  /** From the game board: true when the viewer is not White or Black on this `games` row. */
  isBoardSpectator: boolean;
  viewerEcosystem: 'adult' | 'k12';
  accessToken: string | null;
  /** Raised when an active-lane opponent message arrives (unread-light attention only). */
  onOpponentMessage?: () => void;
}) {
  if (!gameTempo) {
    console.warn('Game missing tempo:', gameId);
  }

  const effectiveLane = useMemo(
    () => resolveTesterChatLane(viewerChatRole, isBoardSpectator, gameTempo, gameStatus),
    [viewerChatRole, isBoardSpectator, gameTempo, gameStatus]
  );

  const tempoNorm = String(gameTempo ?? '').trim().toLowerCase();
  const isLive = tempoNorm === 'live';
  const isAsyncBoard = tempoNorm === 'daily' || tempoNorm === 'correspondence';
  const inPlay = gameStatus === 'active' || gameStatus === 'waiting';

  const canUseChat = !!accessToken && !!userId;
  const lobbyHref = useMemo(() => '/tester/lobby-chat', []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    console.log('[game-chat-devtrace] mount', {
      gameId,
      requested: viewerChatRole,
      effectiveLane,
      isBoardSpectator,
      ts: Date.now(),
    });
    return () => {
      console.log('[game-chat-devtrace] cleanup', { gameId, ts: Date.now() });
    };
  }, [effectiveLane, gameId, isBoardSpectator, viewerChatRole]);

  if (!userId) return null;

  if (!canUseChat) {
    return (
      <p style={{ marginTop: 16, fontSize: 12, color: '#64748b', maxWidth: 520 }}>
        Sign in required for tester chat.
      </p>
    );
  }

  const laneProps = { gameId, accessToken: accessToken!, viewerEcosystem };

  return (
    <div
      data-testid="game-tester-chat-panels"
      className="accl-game-side-panel"
      style={{ marginTop: 20, maxWidth: 520 }}
    >
      {effectiveLane === 'spectator' ? (
        <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#94a3b8', lineHeight: 1.45 }}>
          <strong style={{ color: '#e2e8f0' }}>Tester chat</strong> — you are on{' '}
          <code style={{ color: '#cbd5e1' }}>game_spectator</code> only. Player table chat uses{' '}
          <code style={{ color: '#cbd5e1' }}>game_player</code> and is not shown here.{' '}
          <Link href={lobbyHref} style={{ color: '#93c5fd' }}>
            Tester lobby chat
          </Link>
        </p>
      ) : effectiveLane === 'table' || effectiveLane === 'postgame_player' ? (
        <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#94a3b8', lineHeight: 1.45 }}>
          <strong style={{ color: '#e2e8f0' }}>Tester chat</strong> — you are on{' '}
          <code style={{ color: '#cbd5e1' }}>game_player</code> only. Spectators use{' '}
          <code style={{ color: '#cbd5e1' }}>game_spectator</code> elsewhere.{' '}
          <Link href={lobbyHref} style={{ color: '#93c5fd' }}>
            Tester lobby chat
          </Link>
        </p>
      ) : (
        <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#94a3b8', lineHeight: 1.45 }}>
          <strong style={{ color: '#e2e8f0' }}>Tester chat</strong> — no game chat panel for this view.{' '}
          <Link href={lobbyHref} style={{ color: '#93c5fd' }}>
            Tester lobby chat
          </Link>
        </p>
      )}

      {effectiveLane === 'spectator' ? (
        <TesterSpectatorChatLane key={`spectator-only-${gameId}`} {...laneProps} />
      ) : null}
      {effectiveLane === 'table' ? (
        <TesterPlayerGameChatLane
          key={`player-table-${gameId}-${isLive ? 'live' : 'async'}`}
          {...laneProps}
          variant={isLive ? 'live' : 'async_play'}
          currentUserId={userId}
          onOpponentMessage={onOpponentMessage}
        />
      ) : null}
      {effectiveLane === 'postgame_player' ? (
        <TesterPlayerGameChatLane key={`player-post-${gameId}`} {...laneProps} variant="postgame" />
      ) : null}
      {effectiveLane === 'none' ? (
        <p
          style={{
            margin: '0 0 12px 0',
            padding: '10px 12px',
            fontSize: 12,
            lineHeight: 1.5,
            color: '#a8b8cf',
            borderRadius: 8,
            border: '1px solid #334155',
            background: '#0f172a',
          }}
          role="status"
        >
          <strong style={{ color: '#e2e8f0' }}>No in-game chat panel for this game right now.</strong>{' '}
          {isLive && inPlay
            ? 'This should not happen for an active live game — refresh if the board looks wrong.'
            : gameStatus === 'finished'
              ? 'Post-game player chat appears when you are a seated participant; spectators use spectator chat on live boards.'
              : isAsyncBoard && inPlay && isBoardSpectator
                ? 'Player chat is only for the two participants. Async boards do not have a spectator chat channel.'
                : isAsyncBoard && inPlay
                  ? 'This should not happen for a seated participant — refresh if the board looks wrong.'
                  : 'No chat panel for this view. Use tester lobby chat if you need a side channel.'}
        </p>
      ) : null}
    </div>
  );
}
