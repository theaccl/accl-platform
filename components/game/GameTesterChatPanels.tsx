'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { publicDisplayNameFromProfileUsername } from '@/lib/profileIdentity';
import { useOpenPublicIdentityCard } from '@/components/identity/PublicIdentityCardContext';
import { supabase } from '@/lib/supabaseClient';

const CHAT_BODY_MAX = 2000;

/** Dev-only: detect duplicate realtime channel creation (Strict Mode / effect churn). */
let gameChatChannelSeq = 0;

const gameChatDebug = (...args: unknown[]) => {
  if (process.env.NODE_ENV === 'development') {
    console.warn('[game-chat-debug]', ...args);
  }
};

/** Dev-only: where a chat load was triggered from */
type GameChatLoadSource = 'initial' | 'visibilitychange' | 'poll' | 'realtime' | 'after_send';

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
}) {
  const remaining = maxLen - draft.length;
  return (
    <section
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
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: '#e2e8f0' }}>
          {title}
        </p>
        <p style={{ margin: '4px 0 0 0', fontSize: 11, color: '#94a3b8', lineHeight: 1.35 }}>{subtitle}</p>
      </div>
      <div
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
          data-testid={`game-chat-send-${title.includes('Player') ? 'player' : 'spectator'}`}
          onClick={() => void onSend()}
          disabled={sending || !draft.trim()}
          style={{ padding: '8px 12px', alignSelf: 'stretch' }}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </section>
  );
}

export default function GameTesterChatPanels({
  gameId,
  gameStatus,
  gameTempo,
  userId,
  whitePlayerId,
  blackPlayerId,
  isSpectator,
  viewerEcosystem,
  accessToken,
}: {
  gameId: string;
  gameStatus: string;
  /** `live` enables spectator chat; daily/correspondence have no in-game spectator channel (P2). */
  gameTempo: string | null;
  userId: string;
  /** Seat ids for label logic (case-normalized); avoids mismatches vs board `isSpectator` when UUID casing differs. */
  whitePlayerId: string;
  blackPlayerId: string | null;
  isSpectator: boolean;
  viewerEcosystem: 'adult' | 'k12';
  accessToken: string | null;
}) {
  if (!gameTempo) {
    console.warn('Game missing tempo:', gameId);
  }

  const isLive = String(gameTempo ?? '').trim().toLowerCase() === 'live';
  /** Post-game player thread only — no player channel during active games. */
  const showPlayer = !isSpectator && gameStatus === 'finished';
  /** Live games only: in-game chat uses spectator channel (players + viewers); not for daily/corr. */
  const showSpectator = isLive;

  const viewerIsTableParticipant =
    !isSpectator ||
    (!!userId &&
      (() => {
        const u = userId.trim().toLowerCase();
        const w = String(whitePlayerId ?? '').trim().toLowerCase();
        const b = String(blackPlayerId ?? '').trim().toLowerCase();
        return (w.length > 0 && u === w) || (b.length > 0 && u === b);
      })());

  /** Labels: DB channel is `game_spectator`; seated players must not see “Spectator chat” as the panel title. */
  const liveTableChatTitle = viewerIsTableParticipant ? 'Table chat (live)' : 'Spectator chat (live games)';
  const liveTableChatSubtitle = viewerIsTableParticipant
    ? 'You, your opponent, and viewers share this thread — the in-game channel during live play.'
    : 'Viewers and players use this channel during the game — separate from post-game player chat.';

  const devTraceRole = viewerIsTableParticipant ? 'player' : 'spectator';

  const [specMessages, setSpecMessages] = useState<ChatMsg[]>([]);
  const [playMessages, setPlayMessages] = useState<ChatMsg[]>([]);
  const [specErr, setSpecErr] = useState<string | null>(null);
  const [playErr, setPlayErr] = useState<string | null>(null);
  const [specBusy, setSpecBusy] = useState(false);
  const [playBusy, setPlayBusy] = useState(false);
  const [specDraft, setSpecDraft] = useState('');
  const [playDraft, setPlayDraft] = useState('');
  const [specSending, setSpecSending] = useState(false);
  const [playSending, setPlaySending] = useState(false);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportErr, setReportErr] = useState<string | null>(null);

  const specSendLock = useRef(false);
  const playSendLock = useRef(false);

  const canUseChat = !!accessToken && !!userId;

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    console.log('[game-chat-devtrace] mount', {
      gameId,
      role: devTraceRole,
      ts: Date.now(),
    });
    return () => {
      console.log('[game-chat-devtrace] cleanup', {
        gameId,
        role: devTraceRole,
        ts: Date.now(),
      });
    };
  }, [gameId, devTraceRole]);

  const loadSpectator = useCallback(
    async (opts?: { source?: GameChatLoadSource; bypassVisibility?: boolean }) => {
      const source: GameChatLoadSource = opts?.source ?? 'initial';
      gameChatDebug('loadSpectator:trigger', { source, gameId, showSpectator });
      if (!canUseChat || !showSpectator) {
        gameChatDebug('loadSpectator:skip', { source, reason: !canUseChat ? 'no_auth' : 'panel_off' });
        return;
      }
      if (
        !opts?.bypassVisibility &&
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      ) {
        gameChatDebug('loadSpectator:skip', { source, reason: 'hidden_tab' });
        return;
      }
      setSpecBusy(true);
      setSpecErr(null);
      const res = await chatFetch(
        `/api/chat/messages?channel=game_spectator&gameId=${encodeURIComponent(gameId)}&limit=50`,
        accessToken!,
        viewerEcosystem
      );
      setSpecBusy(false);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as {
          error?: unknown;
          message?: unknown;
          db_message?: unknown;
          db_code?: unknown;
        };
        setSpecErr(
          formatChatSendError({
            error: j.error,
            message: j.message,
            db_message: j.db_message,
            db_code: j.db_code,
          })
        );
        gameChatDebug('loadSpectator:result', { source, ok: false, gameId });
        return;
      }
      const j = (await res.json()) as { messages?: ChatMsg[] };
      const list = j.messages ?? [];
      setSpecMessages(list);
      gameChatDebug('loadSpectator:result', {
        source,
        ok: true,
        count: list.length,
        firstId: list[0]?.id,
        lastId: list[list.length - 1]?.id,
        gameId,
      });
      if (process.env.NODE_ENV === 'development') {
        const src =
          source === 'poll' ? 'poll' : source === 'realtime' ? 'realtime' : source;
        console.log('[game-chat-devtrace] ui:update', {
          gameId,
          role: devTraceRole,
          source: src,
          ts: Date.now(),
        });
      }
    },
    [accessToken, canUseChat, devTraceRole, gameId, showSpectator, viewerEcosystem]
  );

  const loadPlayer = useCallback(
    async (opts?: { bypassVisibility?: boolean; source?: GameChatLoadSource }) => {
      const source: GameChatLoadSource = opts?.source ?? 'initial';
      gameChatDebug('loadPlayer:trigger', {
        source,
        gameId,
        showPlayer,
        bypassVisibility: opts?.bypassVisibility === true,
      });
      if (!canUseChat || !showPlayer) {
        gameChatDebug('loadPlayer:skip', { source, reason: !canUseChat ? 'no_auth' : 'panel_off' });
        return;
      }
      if (
        !opts?.bypassVisibility &&
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      ) {
        gameChatDebug('loadPlayer:skip', { source, reason: 'hidden_tab' });
        return;
      }
      setPlayBusy(true);
      setPlayErr(null);
      const res = await chatFetch(
        `/api/chat/messages?channel=game_player&gameId=${encodeURIComponent(gameId)}&limit=50`,
        accessToken!,
        viewerEcosystem
      );
      setPlayBusy(false);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as {
          error?: unknown;
          message?: unknown;
          db_message?: unknown;
          db_code?: unknown;
        };
        setPlayErr(
          formatChatSendError({
            error: j.error,
            message: j.message,
            db_message: j.db_message,
            db_code: j.db_code,
          })
        );
        gameChatDebug('loadPlayer:result', { source, ok: false, gameId });
        return;
      }
      const j = (await res.json()) as { messages?: ChatMsg[] };
      const list = j.messages ?? [];
      setPlayMessages(list);
      gameChatDebug('loadPlayer:result', {
        source,
        ok: true,
        count: list.length,
        firstId: list[0]?.id,
        lastId: list[list.length - 1]?.id,
        gameId,
      });
      if (process.env.NODE_ENV === 'development') {
        const src =
          source === 'poll' ? 'poll' : source === 'realtime' ? 'realtime' : source;
        console.log('[game-chat-devtrace] ui:update', {
          gameId,
          role: devTraceRole,
          source: src,
          ts: Date.now(),
        });
      }
    },
    [accessToken, canUseChat, devTraceRole, gameId, showPlayer, viewerEcosystem]
  );

  useEffect(() => {
    void loadSpectator({ source: 'initial' });
  }, [loadSpectator]);

  useEffect(() => {
    void loadPlayer({ source: 'initial' });
  }, [loadPlayer]);

  /** INSERT on tester_chat_messages for this game → refetch the matching channel list (API applies mutes). */
  useEffect(() => {
    if (!canUseChat || !gameId.trim()) return;
    if (!showSpectator && !showPlayer) return;

    if (process.env.NODE_ENV === 'development') {
      console.log('[game-chat-devtrace] effect:start', {
        gameId,
        role: devTraceRole,
        showPlayer,
        bypassVisibility: false,
        visible: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
        ts: Date.now(),
      });
    }

    const filter = `game_id=eq.${gameId}`;
    gameChatDebug('subscribe:start', {
      gameId,
      showSpectator,
      showPlayer,
      filter,
    });

    const seq = ++gameChatChannelSeq;
    if (process.env.NODE_ENV === 'development') {
      console.log('[game-chat-devtrace] subscribe:create', {
        seq,
        gameId,
        role: devTraceRole,
        ts: Date.now(),
      });
    }

    const channelName = `game-tester-chat-${gameId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tester_chat_messages',
          filter,
        },
        (payload) => {
          const row = payload.new as {
            channel?: string | null;
            id?: string;
            game_id?: string | null;
            sender_id?: string | null;
          };
          const ch = String(row.channel ?? '');
          const rowGameId = row.game_id != null ? String(row.game_id) : '';
          const gameIdMatch = rowGameId === gameId;

          gameChatDebug('realtime:insert', {
            id: row.id,
            channel: row.channel,
            game_id: row.game_id,
            sender_id: row.sender_id,
            gameIdMatch,
            currentGameId: gameId,
          });

          if (process.env.NODE_ENV === 'development') {
            console.log('[game-chat-devtrace] realtime:insert', {
              seq,
              gameId,
              role: devTraceRole,
              payload,
              ts: Date.now(),
            });
            console.log('[game-chat-devtrace] realtime:route-check', {
              seq,
              gameId,
              role: devTraceRole,
              isPlayer: ch === 'game_player',
              isSpectator: ch === 'game_spectator',
              bypassVisibility: ch === 'game_player',
              ts: Date.now(),
            });
          }

          if (ch === 'game_spectator' && showSpectator) {
            if (process.env.NODE_ENV === 'development') {
              console.log('[game-chat-devtrace] realtime:route:spectator', {
                seq,
                gameId,
                role: devTraceRole,
                ts: Date.now(),
              });
            }
            gameChatDebug('realtime:route:spectator', { id: row.id });
            void loadSpectator({ source: 'realtime' });
          }
          // Always dispatch player lane; loadPlayer() no-ops if post-game panel is not active.
          if (ch === 'game_player') {
            if (process.env.NODE_ENV === 'development') {
              console.log('[game-chat-devtrace] realtime:route:player', {
                seq,
                gameId,
                role: devTraceRole,
                ts: Date.now(),
              });
            }
            gameChatDebug('realtime:route:player', { id: row.id });
            void loadPlayer({ bypassVisibility: true, source: 'realtime' });
          }
        }
      )
      .subscribe((status, err) => {
        gameChatDebug('subscribe:status', {
          status,
          err: err instanceof Error ? err.message : err ?? null,
          gameId,
        });
        if (process.env.NODE_ENV === 'development') {
          console.log('[game-chat-devtrace] subscribe:status', {
            seq,
            gameId,
            role: devTraceRole,
            status,
            err: err instanceof Error ? err.message : err ?? null,
            channelName,
            ts: Date.now(),
          });
        }
        // After websocket + Realtime auth, sync once so early messages are not missed during warmup.
        if (status === 'SUBSCRIBED') {
          void loadSpectator({ bypassVisibility: true, source: 'initial' });
          void loadPlayer({ bypassVisibility: true, source: 'initial' });
        }
      });

    return () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[game-chat-devtrace] subscribe:cleanup', {
          seq,
          gameId,
          role: devTraceRole,
          channelName,
          ts: Date.now(),
        });
      }
      gameChatDebug('subscribe:cleanup', { gameId });
      void supabase.removeChannel(channel);
    };
  }, [canUseChat, devTraceRole, gameId, showSpectator, showPlayer, loadSpectator, loadPlayer]);

  useEffect(() => {
    const runPollTick = () => {
      gameChatDebug('poll:tick', { gameId, showSpectator, showPlayer });
      void loadSpectator({ source: 'poll' });
      void loadPlayer({ source: 'poll' });
    };
    const id = window.setInterval(runPollTick, 6000);
    const onVis = () => {
      gameChatDebug('visibilitychange', {
        visibilityState: document.visibilityState,
        gameId,
      });
      if (document.visibilityState === 'visible') {
        void loadSpectator({ source: 'visibilitychange' });
        void loadPlayer({ source: 'visibilitychange' });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [gameId, showSpectator, showPlayer, loadSpectator, loadPlayer]);

  const sendSpectator = async () => {
    const body = specDraft.trim();
    if (!canUseChat || !body || specSending || specSendLock.current) return;
    specSendLock.current = true;
    setSpecSending(true);
    setSpecErr(null);
    try {
      const res = await chatFetch('/api/chat/send', accessToken!, viewerEcosystem, {
        method: 'POST',
        body: JSON.stringify({
          channel: 'game_spectator',
          gameId,
          body,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setSpecErr(formatChatSendError(j));
        return;
      }
      setSpecDraft('');
      void loadSpectator({ source: 'after_send' });
    } finally {
      specSendLock.current = false;
      setSpecSending(false);
    }
  };

  const sendPlayer = async () => {
    const body = playDraft.trim();
    if (!canUseChat || !body || playSending || playSendLock.current) return;
    playSendLock.current = true;
    setPlaySending(true);
    setPlayErr(null);
    try {
      const res = await chatFetch('/api/chat/send', accessToken!, viewerEcosystem, {
        method: 'POST',
        body: JSON.stringify({
          channel: 'game_player',
          gameId,
          body,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setPlayErr(formatChatSendError(j));
        return;
      }
      setPlayDraft('');
      void loadPlayer({ source: 'after_send' });
    } finally {
      playSendLock.current = false;
      setPlaySending(false);
    }
  };

  const report = async (messageId: string) => {
    if (!canUseChat) return;
    setReportingId(messageId);
    setReportErr(null);
    try {
      const res = await chatFetch('/api/chat/report', accessToken!, viewerEcosystem, {
        method: 'POST',
        body: JSON.stringify({ messageId }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        setReportErr(j.message || j.error || 'Report could not be submitted.');
      }
    } finally {
      setReportingId(null);
    }
  };

  const lobbyHref = useMemo(() => '/tester/lobby-chat', []);
  const openIdentity = useOpenPublicIdentityCard();

  if (!userId) return null;

  if (!canUseChat) {
    return (
      <p style={{ marginTop: 16, fontSize: 12, color: '#64748b', maxWidth: 520 }}>
        Sign in required for tester chat.
      </p>
    );
  }

  return (
    <div data-testid="game-tester-chat-panels" style={{ marginTop: 20, maxWidth: 520 }}>
      <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#94a3b8', lineHeight: 1.45 }}>
        <strong style={{ color: '#e2e8f0' }}>Tester chat</strong> — authenticated only; channels are separated.
        During live games, the table uses one shared channel (labeled “Table chat” for players, “Spectator chat” for
        viewers); post-game player-only chat unlocks after the game ends. Daily/correspondence boards do not use this
        live channel.{' '}
        <Link href={lobbyHref} style={{ color: '#93c5fd' }}>
          Tester mode chat
        </Link>
        .
      </p>
      {!showPlayer && !showSpectator ? (
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
          {isLive
            ? 'This should not happen for an active live game — refresh if the board looks wrong.'
            : gameStatus === 'finished'
              ? 'Post-game player chat appears above when available; daily/correspondence games do not use live spectator chat on the board.'
              : 'Daily and correspondence games do not use live spectator chat here — that is by design, not a missing feature. Use tester lobby chat if you need a side channel.'}
        </p>
      ) : null}
      {reportErr ? (
        <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#f87171' }} role="alert">
          {reportErr}
        </p>
      ) : null}
      {showPlayer ? (
        <ChatStrip
          title="Player chat (post-game)"
          subtitle="Only the two players — opens after the game finishes; not used during play."
          accent="#3b82f6"
          messages={playMessages}
          busy={playBusy}
          error={playErr}
          draft={playDraft}
          onDraft={setPlayDraft}
          onSend={sendPlayer}
          sending={playSending}
          onReport={report}
          reportingId={reportingId}
          maxLen={CHAT_BODY_MAX}
          onSenderClick={openIdentity ?? undefined}
        />
      ) : null}
      {showSpectator ? (
        <ChatStrip
          title={liveTableChatTitle}
          subtitle={liveTableChatSubtitle}
          accent="#a855f7"
          messages={specMessages}
          busy={specBusy}
          error={specErr}
          draft={specDraft}
          onDraft={setSpecDraft}
          onSend={sendSpectator}
          sending={specSending}
          onReport={report}
          reportingId={reportingId}
          maxLen={CHAT_BODY_MAX}
          onSenderClick={openIdentity ?? undefined}
        />
      ) : null}
    </div>
  );
}
