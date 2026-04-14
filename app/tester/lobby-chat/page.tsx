'use client';

import Link from 'next/link';
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

export default function TesterLobbyChatPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
    void supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setErr(null);
    const res = await fetch('/api/chat/messages?channel=lobby&lobbyRoom=global&limit=80', {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-accl-viewer-ecosystem': 'adult',
      },
    });
    setBusy(false);
    if (!res.ok) {
      setErr('Failed to load lobby chat.');
      return;
    }
    const j = (await res.json()) as { messages?: ChatMsg[] };
    setMessages(j.messages ?? []);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(t);
  }, [load]);

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
      body: JSON.stringify({ channel: 'lobby', lobbyRoom: 'global', body: draft.trim() }),
    });
    if (!res.ok) {
      setErr('Send failed.');
      return;
    }
    setDraft('');
    void load();
  };

  if (!userId || !token) {
    return (
      <div style={{ padding: 24, maxWidth: 560, margin: '0 auto', color: '#e2e8f0' }}>
        <p>Sign in required for lobby chat.</p>
        <Link href="/modes" style={{ color: '#93c5fd' }}>
          Back
        </Link>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 560, margin: '0 auto', color: '#e2e8f0' }}>
      <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
        <strong style={{ color: '#e2e8f0' }}>Tester lobby chat</strong> — authenticated only; separate from game
        channels.
      </p>
      <div
        style={{
          border: '1px solid #334155',
          borderRadius: 8,
          padding: 12,
          minHeight: 200,
          maxHeight: 360,
          overflowY: 'auto',
          marginBottom: 12,
          fontSize: 13,
          background: '#0f172a',
        }}
      >
        {busy ? <p style={{ color: '#64748b' }}>Loading…</p> : null}
        {err ? <p style={{ color: '#f87171' }}>{err}</p> : null}
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
        Send
      </button>
      <p style={{ marginTop: 16 }}>
        <Link href="/modes" style={{ color: '#93c5fd' }}>
          ← Back
        </Link>
      </p>
    </div>
  );
}
