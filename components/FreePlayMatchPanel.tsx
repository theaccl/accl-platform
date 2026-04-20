'use client';

/**
 * Free PLAT queue: **Create game** (post seat) vs **Find match** (random OpenQ join) — separate actions.
 * TEST CONTRACT: `data-testid="free-find-match"` on Find Match — E2E; `data-testid="free-create-game"` on Create.
 */

import type { CSSProperties } from 'react';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { runFreePlayCreateGame, runFreePlayFindMatchAutomatic } from '@/lib/freePlayFindMatch';
import {
  type PlatMode,
  PLAT_MODE_LABELS,
  PLAT_MODE_ORDER,
  platModeLabel,
  platTimeOptionsForMode,
} from '@/lib/freePlayModeTimeControl';
import { supabase } from '@/lib/supabaseClient';

function chipStyle(active: boolean, disabled: boolean): CSSProperties {
  return {
    border: `1px solid ${active ? '#3b82f6' : '#4a4a4a'}`,
    background: active ? '#1e3a8a' : '#0f0f0f',
    color: active ? '#fff' : '#e5e5e5',
    borderRadius: 6,
    padding: '10px 12px',
    minHeight: 44,
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    touchAction: 'manipulation',
  };
}

type FreePlayMatchPanelProps = {
  mode: PlatMode;
  onModeChange: (m: PlatMode) => void;
  clock: string;
  onClockChange: (c: string) => void;
  rated: boolean;
  onRatedChange: (r: boolean) => void;
  modeLocked?: boolean;
  compact?: boolean;
};

export function FreePlayMatchPanel({
  mode,
  onModeChange,
  clock,
  onClockChange,
  rated,
  onRatedChange,
  modeLocked = false,
  compact = false,
}: FreePlayMatchPanelProps) {
  const router = useRouter();
  const [busyCreate, setBusyCreate] = useState(false);
  const [busyFind, setBusyFind] = useState(false);
  const [message, setMessage] = useState('');
  const [suggestCreate, setSuggestCreate] = useState(false);

  const busy = busyCreate || busyFind;
  const timeOptions = platTimeOptionsForMode(mode);

  const handleResult = useCallback(
    (res: { gameId: string } | { error: string; resumeGameId?: string; suggestCreate?: boolean }) => {
      if ('error' in res) {
        if ('resumeGameId' in res && res.resumeGameId) {
          router.push(`/game/${res.resumeGameId}`);
          return;
        }
        setSuggestCreate(Boolean(res.suggestCreate));
        setMessage(res.error);
        return;
      }
      setSuggestCreate(false);
      router.push(`/game/${res.gameId}`);
    },
    [router]
  );

  const createGame = useCallback(async () => {
    if (busy) return;
    setMessage('');
    setSuggestCreate(false);
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) {
      setMessage('You must be logged in.');
      return;
    }
    setBusyCreate(true);
    try {
      const res = await runFreePlayCreateGame(supabase, {
        userId: auth.user.id,
        mode,
        clock,
        rated,
      });
      handleResult(res);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusyCreate(false);
    }
  }, [busy, mode, clock, rated, handleResult]);

  const findMatchAutomatic = useCallback(async () => {
    if (busy) return;
    setMessage('');
    setSuggestCreate(false);
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) {
      setMessage('You must be logged in.');
      return;
    }
    setBusyFind(true);
    try {
      const res = await runFreePlayFindMatchAutomatic(supabase, {
        userId: auth.user.id,
        mode,
        clock,
        rated,
      });
      handleResult(res);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[free-play] findMatchAutomatic threw', e);
      }
      setMessage(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusyFind(false);
    }
  }, [busy, mode, clock, rated, handleResult]);

  return (
    <div
      id="free-find-match-anchor"
      className="mx-auto max-w-2xl px-6 py-8"
      data-testid="free-plat-play-root"
    >
      {!compact ? (
        <p className="mb-4 text-sm text-gray-400">
          <Link href="/trainer/lab" className="text-red-300 underline hover:text-red-200">
            Open Trainer lab
          </Link>{' '}
          — post-game style analysis for practice positions (not during live games).
        </p>
      ) : null}
      {!compact ? (
        <>
          <h1 className="mb-2 text-3xl font-bold">Free play queue</h1>
          <p className="mb-6 text-sm text-gray-400">
            Use the same filters for everything below: <strong className="text-gray-300">Create game</strong> posts your
            seat to Open Games; <strong className="text-gray-300">Find match</strong> joins a random matching seat
            automatically; or pick a row under Open Games and accept manually.
          </p>
        </>
      ) : (
        <p className="mb-4 text-sm text-gray-400">
          <strong className="text-gray-300">Create game</strong> posts to the list;{' '}
          <strong className="text-gray-300">Find match</strong> auto-joins a random matching seat.
        </p>
      )}

      <div className="flex flex-col gap-4 rounded-2xl bg-[#161b22] p-5">
        <div
          className="rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-gray-200"
          data-testid="free-plat-selection-summary"
          aria-live="polite"
        >
          <span className="text-gray-500">Filters: </span>
          <span className="font-semibold text-white">
            {platModeLabel(mode)} · {timeOptions.find((o) => o.id === clock)?.label ?? clock} ·{' '}
            {rated ? 'Rated' : 'Unrated'}
          </span>
        </div>

        {message ? (
          <div data-testid="free-plat-play-message" className="space-y-1">
            <p className={`text-sm ${suggestCreate ? 'text-amber-200/95' : 'text-red-300'}`}>{message}</p>
            {suggestCreate ? (
              <p className="text-xs text-gray-500">
                Post an open seat with <span className="font-medium text-gray-400">Create game</span> so others (or Find
                match) can pair with you.
              </p>
            ) : null}
          </div>
        ) : null}

        {!modeLocked ? (
          <div>
            <p className="mb-2 text-sm text-gray-400">Mode</p>
            <div className="flex flex-wrap gap-2" data-testid="free-plat-mode-group">
              {PLAT_MODE_ORDER.map((m) => (
                <button
                  key={m}
                  type="button"
                  data-testid={`free-plat-mode-${m}`}
                  disabled={busy}
                  aria-pressed={mode === m}
                  onClick={() => onModeChange(m)}
                  style={chipStyle(mode === m, busy)}
                >
                  {PLAT_MODE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500" data-testid="free-plat-mode-locked">
            Mode: <span className="font-semibold text-gray-200">{PLAT_MODE_LABELS[mode]}</span> (use{' '}
            <Link href="/free/lobby" className="text-sky-400 underline hover:text-sky-300">
              Lobby Chat hub
            </Link>{' '}
            to switch)
          </p>
        )}

        <div>
          <p className="mb-2 text-sm text-gray-400">Time control</p>
          <div className="flex flex-wrap gap-2" data-testid="free-plat-clock-group">
            {timeOptions.map((c) => (
              <button
                key={c.id}
                type="button"
                data-testid={`free-plat-clock-${c.id.replace(/\+/g, 'plus')}`}
                disabled={busy}
                aria-pressed={clock === c.id}
                onClick={() => onClockChange(c.id)}
                style={chipStyle(clock === c.id, busy)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm text-gray-400">Rated</p>
          <div className="flex gap-2" data-testid="free-plat-rated-group">
            <button
              type="button"
              data-testid="free-plat-rated-yes"
              disabled={busy}
              aria-pressed={rated === true}
              onClick={() => onRatedChange(true)}
              style={chipStyle(rated === true, busy)}
            >
              Rated
            </button>
            <button
              type="button"
              data-testid="free-plat-rated-no"
              disabled={busy}
              aria-pressed={rated === false}
              onClick={() => onRatedChange(false)}
              style={chipStyle(rated === false, busy)}
            >
              Unrated
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-[#30363d] pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Create game</p>
          <button
            type="button"
            data-testid="free-create-game"
            disabled={busy}
            onClick={() => void createGame()}
            className="min-h-[48px] w-full touch-manipulation rounded-xl bg-[#1f2836] py-3.5 text-base font-semibold text-white transition hover:bg-[#2a3545] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyCreate ? 'Posting…' : 'Create game'}
          </button>
          <p className="text-[11px] leading-snug text-gray-600">
            Adds your open seat to Open Games (same filters). Others can accept manually or via Find match.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Find match</p>
          <button
            type="button"
            data-testid="free-find-match"
            data-plat-find-match="true"
            disabled={busy}
            onClick={() => void findMatchAutomatic()}
            className="min-h-[48px] w-full touch-manipulation rounded-xl bg-[#21262d] py-3.5 text-base font-semibold text-white transition hover:bg-[#2b3138] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyFind ? 'Matching…' : 'Find match'}
          </button>
          <p className="text-[11px] leading-snug text-gray-600">
            Picks one random compatible seat from Open Games and joins you immediately. Does not create a new seat.
          </p>
        </div>
      </div>
    </div>
  );
}
