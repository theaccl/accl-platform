'use client';

/**
 * Free PLAT queue: **Create game** (post seat) vs **Find match** (random OpenQ join) — separate actions.
 * TEST CONTRACT: `data-testid="free-find-match"` on Find Match — E2E; `data-testid="free-create-game"` on Create.
 */

import type { CSSProperties } from 'react';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FreePlayQueueResult } from '@/lib/freePlayFindMatch';
import { runFreePlayCreateGame, runFreePlayFindMatchAutomatic } from '@/lib/freePlayFindMatch';
import { registerHostLiveOpenSeatFollow } from '@/lib/hostLiveOpenSeatFollow';
import {
  type PlatMode,
  PLAT_MODE_LABELS,
  PLAT_MODE_ORDER,
  platModeLabel,
  platTimeOptionsForMode,
} from '@/lib/freePlayModeTimeControl';
import { supabase } from '@/lib/supabaseClient';

function chipStyle(active: boolean, disabled: boolean, compactChips?: boolean): CSSProperties {
  return {
    border: `1px solid ${active ? '#3b82f6' : '#4a4a4a'}`,
    background: active ? '#1e3a8a' : '#0f0f0f',
    color: active ? '#fff' : '#e5e5e5',
    borderRadius: 6,
    padding: compactChips ? '7px 8px' : '10px 12px',
    minHeight: compactChips ? 38 : 44,
    fontSize: compactChips ? 12 : 13,
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
  /** Tighter layout when embedded beside Open Games in a mode room. */
  embedded?: boolean;
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
  embedded = false,
}: FreePlayMatchPanelProps) {
  const router = useRouter();
  const [busyCreate, setBusyCreate] = useState(false);
  const [busyFind, setBusyFind] = useState(false);
  const [message, setMessage] = useState('');
  const [suggestCreate, setSuggestCreate] = useState(false);

  const busy = busyCreate || busyFind;
  const timeOptions = platTimeOptionsForMode(mode);
  const chipCompact = Boolean(embedded);

  const handleResult = useCallback(
    (res: FreePlayQueueResult) => {
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
      if (res.hostLiveOpenSeat) {
        registerHostLiveOpenSeatFollow(res.gameId);
      }
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

  const rootClass = embedded
    ? 'w-full max-w-none px-0 py-0'
    : 'mx-auto max-w-2xl px-6 py-8';
  const innerCardClass = embedded
    ? 'flex flex-col gap-2 rounded-xl bg-[#161b22] p-2.5 sm:gap-3 sm:p-4'
    : 'flex flex-col gap-4 rounded-2xl bg-[#161b22] p-5';

  return (
    <div
      id={embedded ? undefined : 'free-find-match-anchor'}
      className={rootClass}
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
            Same filters for all actions: <strong className="text-gray-300">Create game</strong> only posts your seat
            (never joins another queue). <strong className="text-gray-300">Find match</strong> joins a compatible open
            seat if one exists; otherwise it posts your seat and waits. Or use Open Games for manual pick-up.
          </p>
        </>
      ) : embedded ? (
        <p className="mb-2 text-[11px] leading-snug text-gray-500">
          <span className="text-gray-400">Create game</span> posts your seat; <span className="text-gray-400">Find match</span>{' '}
          tries to pair automatically. Uses the same clock and rated filters as <span className="text-gray-400">Open Games</span>{' '}
          and <span className="text-gray-400">Watch live</span> above.
        </p>
      ) : (
        <ul className="mb-4 list-inside list-disc space-y-1.5 text-sm text-gray-400">
          <li>
            <strong className="text-gray-300">Create game</strong> — always posts <em>your</em> seat only (never joins
            someone else).
          </li>
          <li>
            <strong className="text-gray-300">Find match</strong> — joins a random compatible seat if found; otherwise
            posts your seat and waits.
          </li>
          <li>
            <strong className="text-gray-300">Open Games</strong> — pick a row, then Accept (manual pick-up).
          </li>
        </ul>
      )}

      <div className={innerCardClass}>
        <div
          className={`rounded-lg border border-[#30363d] bg-[#0d1117] text-gray-200 ${
            embedded ? 'px-2 py-1.5 text-[11px] leading-snug' : 'px-3 py-2 text-sm'
          }`}
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
                  style={chipStyle(mode === m, busy, chipCompact)}
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
          <p className={`mb-1.5 text-gray-400 ${embedded ? 'text-[11px]' : 'mb-2 text-sm'}`}>Time control</p>
          <div className={`flex flex-wrap ${embedded ? 'gap-1.5' : 'gap-2'}`} data-testid="free-plat-clock-group">
            {timeOptions.map((c) => (
              <button
                key={c.id}
                type="button"
                data-testid={`free-plat-clock-${c.id.replace(/\+/g, 'plus')}`}
                disabled={busy}
                aria-pressed={clock === c.id}
                onClick={() => onClockChange(c.id)}
                style={chipStyle(clock === c.id, busy, chipCompact)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={`text-gray-400 ${embedded ? 'mb-1.5 text-[11px]' : 'mb-2 text-sm'}`}>Rated</p>
          <div className={`flex ${embedded ? 'gap-1.5' : 'gap-2'}`} data-testid="free-plat-rated-group">
            <button
              type="button"
              data-testid="free-plat-rated-yes"
              disabled={busy}
              aria-pressed={rated === true}
              onClick={() => onRatedChange(true)}
              style={chipStyle(rated === true, busy, chipCompact)}
            >
              Rated
            </button>
            <button
              type="button"
              data-testid="free-plat-rated-no"
              disabled={busy}
              aria-pressed={rated === false}
              onClick={() => onRatedChange(false)}
              style={chipStyle(rated === false, busy, chipCompact)}
            >
              Unrated
            </button>
          </div>
        </div>

        <div
          className={
            embedded
              ? 'flex flex-col gap-1.5 border-t border-[#30363d] pt-2'
              : 'flex flex-col gap-2 border-t border-[#30363d] pt-4'
          }
        >
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Create game</p>
          <button
            type="button"
            data-testid="free-create-game"
            disabled={busy}
            onClick={() => void createGame()}
            className={
              embedded
                ? 'min-h-[44px] w-full touch-manipulation rounded-lg bg-[#1f2836] py-2.5 text-sm font-semibold text-white transition hover:bg-[#2a3545] disabled:cursor-not-allowed disabled:opacity-60'
                : 'min-h-[48px] w-full touch-manipulation rounded-xl bg-[#1f2836] py-3.5 text-base font-semibold text-white transition hover:bg-[#2a3545] disabled:cursor-not-allowed disabled:opacity-60'
            }
          >
            {busyCreate ? 'Posting…' : 'Create game'}
          </button>
          {!embedded ? (
            <p className="text-[11px] leading-snug text-gray-600">
              Posts only — adds your seat to Open Games. Never auto-joins another queue.
            </p>
          ) : null}
        </div>

        <div className={embedded ? 'flex flex-col gap-1.5' : 'flex flex-col gap-2'}>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Find match</p>
          <button
            type="button"
            data-testid="free-find-match"
            data-plat-find-match="true"
            disabled={busy}
            onClick={() => void findMatchAutomatic()}
            className={
              embedded
                ? 'min-h-[44px] w-full touch-manipulation rounded-lg bg-[#21262d] py-2.5 text-sm font-semibold text-white transition hover:bg-[#2b3138] disabled:cursor-not-allowed disabled:opacity-60'
                : 'min-h-[48px] w-full touch-manipulation rounded-xl bg-[#21262d] py-3.5 text-base font-semibold text-white transition hover:bg-[#2b3138] disabled:cursor-not-allowed disabled:opacity-60'
            }
          >
            {busyFind ? 'Matching…' : 'Find match'}
          </button>
          {!embedded ? (
            <p className="text-[11px] leading-snug text-gray-600">
              Tries to join a random compatible seat; if none, posts your seat and waits (same as Create).
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
