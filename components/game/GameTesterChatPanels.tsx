'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { publicDisplayNameFromProfileUsername } from '@/lib/profileIdentity';

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
      const db = typeof o.db_message === 'string' ? o.db_message.trim() : '';
      const code = typeof o.db_code === 'string' ? o.db_code.trim() : '';
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
}) {
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
            <span style={{ color: '#94a3b8' }}>
              {publicDisplayNameFromProfileUsername(m.sender_username, m.sender_id)}
            </span>
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
        <textarea
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          rows={2}
          placeholder="Message (testers only)…"
          style={{
            flex: 1,
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
        <button
          type="button"
          onClick={onSend}
          disabled={sending || !draft.trim()}
          style={{ padding: '8px 12px', alignSelf: 'stretch' }}
        >
          {sending ? '…' : 'Send'}
        </button>
      </div>
    </section>
  );
}

export default function GameTesterChatPanels({
  gameId,
  gameStatus,
  userId,
  isSpectator,
  viewerEcosystem,
  accessToken,
}: {
  gameId: string;
  gameStatus: string;
  userId: string;
  isSpectator: boolean;
  viewerEcosystem: 'adult' | 'k12';
  accessToken: string | null;
}) {
  const showSpectator = isSpectator || gameStatus === 'finished';
  const showPlayer = !isSpectator;

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

  const canUseChat = !!accessToken && !!userId;

  const loadSpectator = useCallback(async () => {
    if (!canUseChat || !showSpectator) return;
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
      return;
    }
    const j = (await res.json()) as { messages?: ChatMsg[] };
    setSpecMessages(j.messages ?? []);
  }, [accessToken, canUseChat, gameId, showSpectator, viewerEcosystem]);

  const loadPlayer = useCallback(async () => {
    if (!canUseChat || !showPlayer) return;
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
      return;
    }
    const j = (await res.json()) as { messages?: ChatMsg[] };
    setPlayMessages(j.messages ?? []);
  }, [accessToken, canUseChat, gameId, showPlayer, viewerEcosystem]);

  useEffect(() => {
    void loadSpectator();
  }, [loadSpectator]);

  useEffect(() => {
    void loadPlayer();
  }, [loadPlayer]);

  useEffect(() => {
    const t = window.setInterval(() => {
      void loadSpectator();
      void loadPlayer();
    }, 12000);
    return () => window.clearInterval(t);
  }, [loadSpectator, loadPlayer]);

  const sendSpectator = async () => {
    if (!canUseChat || !specDraft.trim() || specSending) return;
    setSpecSending(true);
    setSpecErr(null);
    const res = await chatFetch('/api/chat/send', accessToken!, viewerEcosystem, {
      method: 'POST',
      body: JSON.stringify({
        channel: 'game_spectator',
        gameId,
        body: specDraft.trim(),
      }),
    });
    setSpecSending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setSpecErr(formatChatSendError(j));
      return;
    }
    setSpecDraft('');
    void loadSpectator();
  };

  const sendPlayer = async () => {
    if (!canUseChat || !playDraft.trim() || playSending) return;
    setPlaySending(true);
    setPlayErr(null);
    const res = await chatFetch('/api/chat/send', accessToken!, viewerEcosystem, {
      method: 'POST',
      body: JSON.stringify({
        channel: 'game_player',
        gameId,
        body: playDraft.trim(),
      }),
    });
    setPlaySending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setPlayErr(formatChatSendError(j));
      return;
    }
    setPlayDraft('');
    void loadPlayer();
  };

  const report = async (messageId: string) => {
    if (!canUseChat) return;
    setReportingId(messageId);
    await chatFetch('/api/chat/report', accessToken!, viewerEcosystem, {
      method: 'POST',
      body: JSON.stringify({ messageId }),
    });
    setReportingId(null);
  };

  const lobbyHref = useMemo(() => '/tester/lobby-chat', []);

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
        Spectator discussion does not appear in player chat.{' '}
        <Link href={lobbyHref} style={{ color: '#93c5fd' }}>
          Lobby chat
        </Link>
        .
      </p>
      {showPlayer ? (
        <ChatStrip
          title="Player chat (in-game)"
          subtitle="Only the two players see this — not shown in spectator chat."
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
        />
      ) : null}
      {showSpectator ? (
        <ChatStrip
          title="Spectator chat"
          subtitle={
            isSpectator
              ? 'For viewers only — separate from player chat.'
              : 'Shown after the game ends — separate from player chat.'
          }
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
        />
      ) : null}
    </div>
  );
}
