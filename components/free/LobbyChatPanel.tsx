'use client';

import { useCallback, useEffect, useState } from 'react';
import { publicDisplayNameFromProfileUsername } from '@/lib/profileIdentity';
import { useOpenPublicIdentityCard } from '@/components/identity/PublicIdentityCardContext';
import { supabase } from '@/lib/supabaseClient';
import { nexusPrestigeCard } from '@/components/nexus/nexusShellTheme';
import { nexusModuleHeadingClass } from '@/components/nexus/NexusHeader';

type ChatMsg = {
  id: string;
  created_at: string;
  sender_id: string;
  body: string;
  sender_username: string | null;
};

export type LobbyChatPanelProps = {
  /** Allowed `lobby_room` value (see chat policy). */
  lobbyRoom: string;
  /** Human-readable room title. */
  roomLabel: string;
  /** Section heading (e.g. “General lobby chat” / “Blitz chat”). */
  heading: string;
  /** Show internal room key for debugging/support. */
  showRoomKey?: boolean;
  'data-testid'?: string;
  draftTestId?: string;
  sendButtonTestId?: string;
};

/**
 * Shared lobby chat UI — one conversation per `lobbyRoom`. Mode vs general is chosen by the parent route.
 */
export function LobbyChatPanel({
  lobbyRoom,
  roomLabel,
  heading,
  showRoomKey = true,
  'data-testid': dataTestId = 'lobby-chat-panel',
  draftTestId = 'lobby-chat-draft',
  sendButtonTestId = 'lobby-chat-send',
}: LobbyChatPanelProps) {
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const openIdentity = useOpenPublicIdentityCard();

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(
      `/api/chat/messages?channel=lobby&lobbyRoom=${encodeURIComponent(lobbyRoom)}&limit=40`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-accl-viewer-ecosystem': 'adult',
        },
      },
    );
    setBusy(false);
    if (!res.ok) {
      setErr('Could not load chat.');
      return;
    }
    const j = (await res.json()) as { messages?: ChatMsg[] };
    setMessages(j.messages ?? []);
  }, [token, lobbyRoom]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Supabase Realtime (RLS-scoped) + light polling if a delivery is missed. */
  useEffect(() => {
    if (!userId || !token || !lobbyRoom.trim()) return;

    const pollMs = 12_000;
    const pollId = window.setInterval(() => void load(), pollMs);

    const filterRoom = lobbyRoom.replace(/"/g, '');
    const channel = supabase
      .channel(`lobby-chat:${filterRoom}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tester_chat_messages',
          filter: `lobby_room=eq.${filterRoom}`,
        },
        () => void load(),
      )
      .subscribe();

    return () => {
      window.clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [userId, token, lobbyRoom, load]);

  const send = async () => {
    if (!token || !draft.trim()) return;
    setErr(null);
    const res = await fetch('/api/chat/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-accl-viewer-ecosystem': 'adult',
      },
      body: JSON.stringify({
        channel: 'lobby',
        lobbyRoom,
        body: draft.trim(),
      }),
    });
    if (!res.ok) {
      setErr('Send failed.');
      return;
    }
    setDraft('');
    void load();
  };

  return (
    <section
      className={`${nexusPrestigeCard} flex h-full min-h-[280px] min-w-0 flex-col overflow-hidden p-4 sm:min-h-0 sm:p-5`}
      data-testid={dataTestId}
      aria-label={heading}
    >
      <h2 className={nexusModuleHeadingClass}>{heading}</h2>
      <p
        className="mt-2 text-[10px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs"
        aria-live="polite"
      >
        Room: <span className="font-semibold text-amber-100/50">{roomLabel}</span>
        {showRoomKey ? (
          <>
            <span className="text-gray-600"> · </span>
            <span className="font-mono text-[10px] text-gray-500 sm:text-xs">{lobbyRoom}</span>
          </>
        ) : null}
      </p>
      <div
        key={lobbyRoom}
        className="mt-4 min-h-[120px] flex-1 overflow-y-auto rounded-lg border border-white/[0.06] bg-[#0a0c10] p-3 text-sm leading-relaxed"
      >
        {busy ? <p className="text-gray-500">Loading…</p> : null}
        {err ? <p className="text-red-400">{err}</p> : null}
        {!userId ? <p className="text-gray-500">Sign in to chat.</p> : null}
        {messages.map((m) => (
          <div key={m.id} className="mb-2">
            {openIdentity ? (
              <button
                type="button"
                data-testid={`lobby-chat-sender-${m.sender_id}`}
                onClick={() => openIdentity(m.sender_id)}
                className="border-0 bg-transparent p-0 text-left text-gray-500 underline decoration-dotted decoration-gray-600 underline-offset-2 hover:text-gray-300 hover:decoration-solid"
              >
                {publicDisplayNameFromProfileUsername(m.sender_username, m.sender_id)}
              </button>
            ) : (
              <span className="text-gray-500">
                {publicDisplayNameFromProfileUsername(m.sender_username, m.sender_id)}
              </span>
            )}
            <span className="text-gray-600"> · </span>
            <span className="text-gray-200">{m.body}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          disabled={!userId}
          className="min-h-[44px] flex-1 resize-none rounded-lg border border-white/10 bg-[#0c0e12] px-2 py-2 text-sm text-white transition-colors placeholder:text-gray-600 focus-visible:border-red-500/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30"
          placeholder="Message…"
          data-testid={draftTestId}
        />
        <button
          type="button"
          className="min-h-[44px] shrink-0 rounded-lg border border-red-700/70 bg-gradient-to-b from-red-950/55 to-red-950/75 px-3.5 text-sm font-semibold text-red-50 shadow-md shadow-red-950/30 transition-[transform,opacity,box-shadow] duration-150 hover:from-red-900/60 hover:to-red-950/85 hover:border-red-500/45 hover:shadow-red-950/45 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0e12] motion-reduce:active:scale-100"
          disabled={!userId || !draft.trim()}
          onClick={() => void send()}
          data-testid={sendButtonTestId}
        >
          Send
        </button>
      </div>
    </section>
  );
}
