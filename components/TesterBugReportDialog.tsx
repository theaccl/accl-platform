'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { TESTER_BUG_REPORT_CATEGORIES } from '@/lib/tester/insertTesterBugReport';
import { parseGameIdFromRoute } from '@/lib/tester/parseGameIdFromRoute';
import { testerBugReportClientMessage } from '@/lib/tester/testerBugReportClient';

const CATEGORY_LABELS: Record<(typeof TESTER_BUG_REPORT_CATEGORIES)[number], string> = {
  bug: 'Bug',
  confusion: 'Confusing flow',
  match_issue: 'Match / pairing issue',
  ui_issue: 'UI / layout issue',
  cheating_concern: 'Cheating concern',
  other: 'Other',
};

export default function TesterBugReportDialog({
  open,
  onClose,
  initialMessage,
  initialCategory,
}: {
  open: boolean;
  onClose: () => void;
  /** When opening, seed the description (e.g. player report from identity card). */
  initialMessage?: string | null;
  initialCategory?: (typeof TESTER_BUG_REPORT_CATEGORIES)[number] | null;
}) {
  const pathname = usePathname();
  const routeGameId = useMemo(() => parseGameIdFromRoute(pathname ?? ''), [pathname]);
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<string>(TESTER_BUG_REPORT_CATEGORIES[0]);
  const [attachGameId, setAttachGameId] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDone(false);
    setError(null);
    setAttachGameId(true);
    const seed = typeof initialMessage === 'string' ? initialMessage.trim() : '';
    if (seed) {
      setMessage(seed);
      setCategory(initialCategory ?? 'cheating_concern');
    } else {
      setMessage('');
      setCategory(TESTER_BUG_REPORT_CATEGORIES[0]);
    }
  }, [open, initialMessage, initialCategory]);

  const submit = useCallback(async () => {
    setError(null);
    const trimmed = message.trim();
    if (trimmed.length < 1) {
      setError('Describe what happened so we can reproduce or investigate.');
      return;
    }
    if (!TESTER_BUG_REPORT_CATEGORIES.includes(category as (typeof TESTER_BUG_REPORT_CATEGORIES)[number])) {
      setError('Pick a report type from the list.');
      return;
    }
    setBusy(true);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      setError(testerBugReportClientMessage('unauthorized'));
      setBusy(false);
      return;
    }
    const gameId = attachGameId && routeGameId ? routeGameId : undefined;
    const res = await fetch('/api/tester/bug-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message: trimmed,
        category,
        route: pathname ?? '',
        ...(gameId ? { gameId } : {}),
      }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      ok?: boolean;
    };
    setBusy(false);
    if (!res.ok) {
      const friendly =
        typeof j.error === 'string' && j.error.trim()
          ? j.error.trim()
          : testerBugReportClientMessage(j.code);
      setError(friendly);
      return;
    }
    setDone(true);
    setMessage('');
    setCategory(TESTER_BUG_REPORT_CATEGORIES[0]);
  }, [attachGameId, category, message, pathname, routeGameId]);

  if (!open) return null;

  return (
    <TesterBugReportOverlay onClose={onClose}>
      <h2 id="tester-bug-report-title" className="text-lg font-semibold">
        Report an issue
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        Reports are saved for review only — they do not change games, ratings, or matchmaking.
        Your account and current page are attached automatically.
      </p>
      {done ? (
        <p className="mt-4 text-sm text-gray-300" data-testid="tester-bug-report-success">
          Thanks — your report was saved.
        </p>
      ) : (
        <>
          <label className="mt-4 block text-xs font-medium text-gray-400" htmlFor="bug-report-cat">
            Report type
          </label>
          <select
            id="bug-report-cat"
            data-testid="tester-bug-report-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[#2a3442] bg-[#151d2c] px-3 py-2 text-sm text-white focus:border-red-500/40 focus:outline-none focus:ring-2 focus:ring-red-500/40"
          >
            {TESTER_BUG_REPORT_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
          {routeGameId ? (
            <label className="mt-3 flex items-start gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                data-testid="tester-bug-report-attach-game"
                checked={attachGameId}
                onChange={(e) => setAttachGameId(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Attach game context (<span className="font-mono text-gray-500">{routeGameId}</span>)
              </span>
            </label>
          ) : null}
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
          {error ? (
            <p className="mt-2 text-sm text-red-300" role="alert" data-testid="tester-bug-report-error">
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
    </TesterBugReportOverlay>
  );
}

function TesterBugReportOverlay({ children, onClose }: { children: import('react').ReactNode; onClose: () => void }) {
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
        {children}
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