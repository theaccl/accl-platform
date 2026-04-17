'use client';

/**
 * Free PLAT Find Match. TEST CONTRACT: `data-testid="free-find-match"` — do not rename or remove (E2E).
 */

import type { CSSProperties } from 'react';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { runFreePlayFindMatch } from '@/lib/freePlayFindMatch';
import type { LiveClockValue } from '@/lib/gameTimeControl';
import { supabase } from '@/lib/supabaseClient';

type PlatMode = 'bullet' | 'blitz' | 'rapid' | 'daily';

function chipStyle(active: boolean, disabled: boolean): CSSProperties {
  return {
    border: `1px solid ${active ? '#3b82f6' : '#4a4a4a'}`,
    background: active ? '#1e3a8a' : '#0f0f0f',
    color: active ? '#fff' : '#e5e5e5',
    borderRadius: 6,
    padding: '7px 10px',
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
  };
}

const MODE_LABELS: { id: PlatMode; label: string }[] = [
  { id: 'bullet', label: 'Bullet' },
  { id: 'blitz', label: 'Blitz' },
  { id: 'rapid', label: 'Rapid' },
  { id: 'daily', label: 'Daily' },
];

const CLOCKS: { id: LiveClockValue; label: string }[] = [
  { id: '1m', label: '1m' },
  { id: '3m', label: '3m' },
  { id: '5m', label: '5m' },
  { id: '10m', label: '10m' },
];

function modeLabel(m: PlatMode): string {
  return MODE_LABELS.find((x) => x.id === m)?.label ?? m;
}

type FreePlayMatchPanelProps = {
  /** When set, mode is controlled by parent (e.g. lobby chat mode sync). */
  mode?: PlatMode;
  onModeChange?: (m: PlatMode) => void;
};

/**
 * PLAT free-play match controls: open-seat queue with tempo / rated / clock.
 */
export function FreePlayMatchPanel({ mode: controlledMode, onModeChange }: FreePlayMatchPanelProps = {}) {
  const router = useRouter();
  const [internalMode, setInternalMode] = useState<PlatMode>('blitz');
  const isControlled = controlledMode !== undefined;
  const mode = isControlled ? controlledMode : internalMode;
  const setMode = (m: PlatMode) => {
    if (!isControlled) setInternalMode(m);
    onModeChange?.(m);
  };
  const [clock, setClock] = useState<LiveClockValue>('3m');
  const [rated, setRated] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const findMatch = useCallback(async () => {
    if (busy) return;
    setMessage('');
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) {
      setMessage('You must be logged in to find a match.');
      return;
    }
    setBusy(true);
    try {
      const res = await runFreePlayFindMatch(supabase, {
        userId: auth.user.id,
        mode,
        clock,
        rated,
      });
      if ('error' in res) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[free-play] find match failed', res.error);
        }
        setMessage(res.error);
        return;
      }
      router.push(`/game/${res.gameId}`);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[free-play] findMatch threw', e);
      }
      setMessage(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, mode, clock, rated, router]);

  return (
    <div
      id="free-find-match-anchor"
      className="max-w-2xl mx-auto px-6 py-8"
      data-testid="free-plat-play-root"
    >
      <p className="text-sm text-gray-400 mb-4">
        <Link href="/trainer/lab" className="text-red-300 underline hover:text-red-200">
          Open Trainer lab
        </Link>{' '}
        — post-game style analysis for practice positions (not during live games).
      </p>
      <h1 className="text-3xl font-bold mb-2">PLAY</h1>
      <p className="text-sm text-gray-400 mb-6">
        Pick mode, clock, and rated — selection updates below. Find Match creates an open seat and opens your board.
      </p>

      <div className="bg-[#161b22] rounded-2xl p-5 flex flex-col gap-4">
        <div
          className="rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-gray-200"
          data-testid="free-plat-selection-summary"
          aria-live="polite"
        >
          <span className="text-gray-500">Selected: </span>
          <span className="font-semibold text-white">
            {modeLabel(mode)} · {clock} · {rated ? 'Rated' : 'Unrated'}
          </span>
        </div>

        {message ? (
          <p className="text-sm text-red-300" data-testid="free-plat-play-message">
            {message}
          </p>
        ) : null}

        <div>
          <p className="text-sm text-gray-400 mb-2">Mode</p>
          <div className="flex flex-wrap gap-2" data-testid="free-plat-mode-group">
            {MODE_LABELS.map((m) => (
              <button
                key={m.id}
                type="button"
                data-testid={`free-plat-mode-${m.id}`}
                disabled={busy}
                aria-pressed={mode === m.id}
                onClick={() => {
                  setMode(m.id);
                  if (m.id === 'bullet') setClock('1m');
                  else if (m.id === 'blitz') setClock('3m');
                  else if (m.id === 'rapid') setClock('10m');
                }}
                style={chipStyle(mode === m.id, busy)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm text-gray-400 mb-2">Time control</p>
          <div className="flex flex-wrap gap-2" data-testid="free-plat-clock-group">
            {CLOCKS.map((c) => (
              <button
                key={c.id}
                type="button"
                data-testid={`free-plat-clock-${c.id}`}
                disabled={busy}
                aria-pressed={clock === c.id}
                onClick={() => setClock(c.id)}
                style={chipStyle(clock === c.id, busy)}
              >
                {c.label}
              </button>
            ))}
          </div>
          {mode === 'daily' ? (
            <p className="text-xs text-gray-500 mt-2">
              Daily mode maps these chips to a daily clock (30m or 60m per side).
            </p>
          ) : null}
        </div>

        <div>
          <p className="text-sm text-gray-400 mb-2">Rated</p>
          <div className="flex gap-2" data-testid="free-plat-rated-group">
            <button
              type="button"
              data-testid="free-plat-rated-yes"
              disabled={busy}
              aria-pressed={rated === true}
              onClick={() => setRated(true)}
              style={chipStyle(rated === true, busy)}
            >
              Rated
            </button>
            <button
              type="button"
              data-testid="free-plat-rated-no"
              disabled={busy}
              aria-pressed={rated === false}
              onClick={() => setRated(false)}
              style={chipStyle(rated === false, busy)}
            >
              Unrated
            </button>
          </div>
        </div>

        <button
          type="button"
          data-testid="free-find-match"
          data-plat-find-match="true"
          disabled={busy}
          onClick={() => void findMatch()}
          className="w-full py-4 bg-[#21262d] rounded-xl text-lg font-semibold hover:bg-[#2b3138] transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {busy ? 'Starting…' : 'FIND MATCH'}
        </button>
      </div>
    </div>
  );
}
