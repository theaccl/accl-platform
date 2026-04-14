'use client';

import { useCallback, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

const CATEGORIES = [
  { value: '', label: 'Category (optional)' },
  { value: 'bug', label: 'Bug' },
  { value: 'ux', label: 'UX' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'suspicious', label: 'Suspicious behavior' },
] as const;

export default function TesterBugReportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = useCallback(async () => {
    setError(null);
    const trimmed = message.trim();
    if (trimmed.length < 1) {
      setError('Describe what happened so we can reproduce or investigate.');
      return;
    }
    setBusy(true);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      setError('Sign in again, then retry.');
      setBusy(false);
      return;
    }
    const res = await fetch('/api/tester/bug-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message: trimmed,
        category: category || undefined,
        route: pathname ?? '',
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
    setBusy(false);
    if (!res.ok) {
      setError(typeof j.error === 'string' ? j.error : 'Could not send report. Try again.');
      return;
    }
    setDone(true);
    setMessage('');
    setCategory('');
  }, [category, message, pathname]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tester-bug-report-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-[#2a3442] bg-[#111723] p-5 text-white shadow-xl">
        <h2 id="tester-bug-report-title" className="text-lg font-semibold">
          Report an issue
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Your account and current page are attached automatically. Be specific about what you expected vs what
          happened.
        </p>
        {done ? (
          <p className="mt-4 text-sm text-gray-300" data-testid="tester-bug-report-success">
            Thanks — your report was saved.
          </p>
        ) : (
          <>
            <label className="mt-4 block text-xs font-medium text-gray-400" htmlFor="bug-report-msg">
              Description
            </label>
            <textarea
              id="bug-report-msg"
              data-testid="tester-bug-report-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded-xl border border-[#2a3442] bg-[#151d2c] px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-red-500/40 focus:outline-none focus:ring-2 focus:ring-red-500/40"
              placeholder="What went wrong or what should improve?"
            />
            <label className="mt-3 block text-xs font-medium text-gray-400" htmlFor="bug-report-cat">
              Category
            </label>
            <select
              id="bug-report-cat"
              data-testid="tester-bug-report-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#2a3442] bg-[#151d2c] px-3 py-2 text-sm text-white focus:border-red-500/40 focus:outline-none focus:ring-2 focus:ring-red-500/40"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value || 'none'} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            {error ? (
              <p className="mt-2 text-sm text-red-300" role="alert">
                {error}
              </p>
            ) : null}
          </>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              setDone(false);
              setError(null);
            }}
            className="rounded-lg border border-[#2a3442] px-3 py-2 text-sm text-gray-300 hover:bg-[#1a2231]"
          >
            {done ? 'Close' : 'Cancel'}
          </button>
          {!done ? (
            <button
              type="button"
              data-testid="tester-bug-report-submit"
              disabled={busy}
              onClick={() => void submit()}
              className="rounded-lg border border-red-500/45 bg-red-900/25 px-3 py-2 text-sm font-medium text-red-100 hover:bg-red-900/40 disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Submit'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Opens bug report overlay; only render when user is signed in (caller checks session). */
export function TesterBugReportTrigger({
  className,
  label = 'Report issue',
}: {
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid="tester-bug-report-open"
        onClick={() => setOpen(true)}
        className={
          className ??
          'rounded-md px-2 py-1 text-xs font-medium text-amber-200/90 hover:bg-[#1a2231] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50'
        }
      >
        {label}
      </button>
      <TesterBugReportDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
