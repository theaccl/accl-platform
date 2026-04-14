'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { publicDisplayNameFromProfileUsername } from '@/lib/profileIdentity';
import { supabase } from '@/lib/supabaseClient';

type ChatMsg = {
  id: string;
  created_at: string;
  sender_id: string;
  body: string;
  sender_username: string | null;
};

export default function TesterDmPage() {
  const searchParams = useSearchParams();
  const peerFromQuery = searchParams.get('peer')?.trim() ?? '';

  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [peerId, setPeerId] = useState(peerFromQuery);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
    void supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });
  }, []);

  const openThread = useCallback(async () => {
    if (!token || !peerId.trim() || peerId === userId) return;
    setErr(null);
    const res = await fetch('/api/chat/dm/threads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ peerId: peerId.trim() }),
    });
    if (!res.ok) {
      setErr('Could not open DM thread.');
      return;
    }
    const j = (await res.json()) as { thread_id?: string };
    if (j.thread_id) setThreadId(j.thread_id);
  }, [peerId, token, userId]);

  const loadMessages = useCallback(async () => {
    if (!token || !threadId) return;
    const res = await fetch(
      `/api/chat/messages?channel=dm&threadId=${encodeURIComponent(threadId)}&limit=80`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-accl-viewer-ecosystem': 'adult',
        },
      }
    );
    if (!res.ok) return;
    const j = (await res.json()) as { messages?: ChatMsg[] };
    setMessages(j.messages ?? []);
  }, [threadId, token]);

  useEffect(() => {
    if (!peerId.trim() || !token || !userId) return;
    void openThread();
  }, [openThread, peerId, token, userId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    const t = window.setInterval(() => void loadMessages(), 12000);
    return () => window.clearInterval(t);
  }, [loadMessages]);

  const send = async () => {
    if (!token || !peerId.trim() || !draft.trim()) return;
    setErr(null);
    const res = await fetch('/api/chat/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-accl-viewer-ecosystem': 'adult',
      },
      body: JSON.stringify({ channel: 'dm', peerId: peerId.trim(), body: draft.trim() }),
    });
    if (!res.ok) {
      setErr('Send failed.');
      return;
    }
    const j = (await res.json()) as { dm_thread_id?: string };
    if (j.dm_thread_id) setThreadId(j.dm_thread_id);
    setDraft('');
    void loadMessages();
  };

  if (!userId || !token) {
    return (
      <div style={{ padding: 24, color: '#e2e8f0' }}>
        <p>Sign in required for direct messages.</p>
        <Link href="/modes" style={{ color: '#93c5fd' }}>
          Back
        </Link>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 560, margin: '0 auto', color: '#e2e8f0' }}>
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>Tester DMs</h1>
      <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
        Peer user id (UUID){' '}
        <input
          value={peerId}
          onChange={(e) => setPeerId(e.target.value)}
          style={{ width: '100%', padding: 6, marginTop: 6, background: '#111827', color: '#e2e8f0' }}
        />
      </p>
      <button type="button" onClick={() => void openThread()} style={{ marginBottom: 12, padding: '6px 12px' }}>
        Open / refresh thread
      </button>
      {err ? <p style={{ color: '#f87171' }}>{err}</p> : null}
      <div
        style={{
          border: '1px solid #334155',
          borderRadius: 8,
          padding: 12,
          minHeight: 160,
          maxHeight: 320,
          overflowY: 'auto',
          marginBottom: 12,
          fontSize: 13,
          background: '#0f172a',
        }}
        data-testid="tester-dm-thread"
      >
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 8 }}>
            <span style={{ color: '#94a3b8' }}>
              {publicDisplayNameFromProfileUsername(m.sender_username, m.sender_id)}
            </span>
            <span style={{ color: '#475569', margin: '0 6px' }}>·</span>
            <span>{m.body}</span>
          </div>
        ))}
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        style={{ width: '100%', padding: 8, borderRadius: 6, marginBottom: 8, background: '#111827', color: '#e2e8f0' }}
      />
      <button type="button" onClick={() => void send()} style={{ padding: '8px 14px' }}>
        Send DM
      </button>
      <p style={{ marginTop: 16 }}>
        <Link href="/modes" style={{ color: '#93c5fd' }}>
          ← Back
        </Link>
      </p>
    </div>
  );
}
