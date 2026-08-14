'use client';

import { FormEvent, useState } from 'react';

import { ALBERT_MAX_MESSAGE_LENGTH } from '@/lib/albert/communication';
import { supabase } from '@/lib/supabaseClient';

type AlbertReply = {
  ok?: boolean;
  reply?: string;
  mode?: 'generated' | 'fallback';
  error?: string;
};

export default function AlbertCommunicationPanel() {
  const [message, setMessage] = useState('');
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [mode, setMode] = useState<'generated' | 'fallback' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = message.trim();
    if (!clean || sending) return;

    setSending(true);
    setError(null);
    setReply(null);
    setMode(null);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in to speak with Albert.');

      const response = await fetch('/api/albert/message', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: clean }),
      });
      const payload = (await response.json()) as AlbertReply;
      if (!response.ok || !payload.reply) {
        throw new Error(payload.error ?? 'Albert could not answer right now.');
      }

      setSentMessage(clean);
      setReply(payload.reply);
      setMode(payload.mode ?? 'generated');
      setMessage('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Albert could not answer right now.');
    } finally {
      setSending(false);
    }
  }

  return (
    <section
      aria-labelledby="albert-heading"
      className="rounded-2xl border border-[#2a3442] bg-[#111723] p-4 shadow-md shadow-black/15 sm:p-5"
      data-testid="albert-communication-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300/80">
            ACCL advisory assistant
          </p>
          <h2 id="albert-heading" className="mt-1 text-lg font-semibold text-gray-100">
            Albert
          </h2>
        </div>
        <span className="rounded-full border border-emerald-700/60 bg-emerald-950/40 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
          Communication preview
        </span>
      </div>

      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-400">
        Ask one question at a time about ACCL navigation, league etiquette, or general chess concepts.
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Advisory only — Albert cannot move pieces or change games, clocks, ratings, standings, tournaments, or accounts.
      </p>

      {sentMessage && reply ? (
        <div className="mt-4 space-y-3" aria-live="polite">
          <div className="ml-auto max-w-2xl rounded-xl bg-[#202938] px-3 py-2 text-sm text-gray-200">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">You</p>
            <p className="whitespace-pre-wrap">{sentMessage}</p>
          </div>
          <div className="max-w-2xl rounded-xl border border-amber-700/30 bg-amber-950/15 px-3 py-2 text-sm text-gray-200">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">Albert</p>
              {mode === 'fallback' ? (
                <span className="text-[10px] text-amber-400/80">Limited mode</span>
              ) : null}
            </div>
            <p className="whitespace-pre-wrap leading-relaxed">{reply}</p>
          </div>
        </div>
      ) : null}

      <form className="mt-4" onSubmit={sendMessage}>
        <label htmlFor="albert-message" className="sr-only">
          Message Albert
        </label>
        <textarea
          id="albert-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={ALBERT_MAX_MESSAGE_LENGTH}
          rows={3}
          placeholder="Say hi to Albert…"
          className="w-full resize-y rounded-xl border border-[#303b4b] bg-[#0b1019] px-3 py-2 text-sm text-gray-100 outline-none transition placeholder:text-gray-600 focus:border-amber-500/70 focus:ring-2 focus:ring-amber-500/20"
          disabled={sending}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500">
            {message.length}/{ALBERT_MAX_MESSAGE_LENGTH} · Your message is processed by Albert’s AI service with a
            pseudonymous identifier. This preview does not retain conversation history.
          </p>
          <button
            type="submit"
            disabled={sending || !message.trim()}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? 'Albert is thinking…' : 'Send'}
          </button>
        </div>
      </form>

      {error ? (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
