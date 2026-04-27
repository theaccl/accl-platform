'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { nexusModuleHeadingClass } from '@/components/nexus/NexusHeader';
import { nexusPrestigeCard } from '@/components/nexus/nexusShellTheme';
import { type FreeLobbyOpenSeatRow, useFreeLobbyOpenSeats } from '@/hooks/useFreeLobbyOpenSeats';
import { formatWaitingDuration } from '@/lib/formatWaitingDuration';
import { checkUserFreePlayQueueEligible } from '@/lib/freePlayFindMatch';
import { supabase } from '@/lib/supabaseClient';
import {
  PLAT_MODE_LABELS,
  type PlatMode,
  platTimeOptionsForMode,
} from '@/lib/freePlayModeTimeControl';
import { formatGameTimeControlLabel } from '@/lib/gameTimeControl';
import { platBucketForOpenSeat } from '@/lib/platOpenSeatBucket';

type Props = {
  mode: PlatMode;
  selectedClock: string;
  /** Must match FreePlayMatchPanel rated toggle — list filters to same queue slice. */
  selectedRated: boolean;
};

function rowModeLabel(row: FreeLobbyOpenSeatRow): string {
  const m = platBucketForOpenSeat(row.tempo, row.live_time_control);
  if (m) return PLAT_MODE_LABELS[m];
  return String(row.tempo ?? '—');
}

/**
 * Open Games: open seats waiting for an opponent — select row → Accept (manual pick-up).
 */
export function FreeLobbyOpenGamesList({ mode, selectedClock, selectedRated }: Props) {
  const router = useRouter();
  const { rows, loading, error } = useFreeLobbyOpenSeats(mode, selectedClock, selectedRated);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preJoinError, setPreJoinError] = useState<string | null>(null);
  const [preJoinResumeId, setPreJoinResumeId] = useState<string | null>(null);

  const tcLabel =
    platTimeOptionsForMode(mode).find((o) => o.id === selectedClock)?.label ?? selectedClock;
  const ratedLabel = selectedRated ? 'Rated' : 'Unrated';

  useEffect(() => {
    if (selectedId && !rows.some((r) => r.id === selectedId)) {
      setSelectedId(null);
    }
  }, [rows, selectedId]);

  const selected = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null;

  const onRowActivate = useCallback((r: FreeLobbyOpenSeatRow) => {
    setPreJoinError(null);
    setPreJoinResumeId(null);
    setSelectedId((cur) => (cur === r.id ? null : r.id));
  }, []);

  const onConfirmJoin = useCallback(async () => {
    if (!selected) return;
    setPreJoinError(null);
    setPreJoinResumeId(null);
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) {
      setPreJoinError('Sign in to accept a game.');
      return;
    }
    const gate = await checkUserFreePlayQueueEligible(supabase, auth.user.id, {
      mode,
      clock: selectedClock,
      rated: selectedRated,
      tempo: selected.tempo,
    });
    if ('error' in gate) {
      setPreJoinError(gate.error);
      setPreJoinResumeId(gate.resumeGameId ?? null);
      return;
    }
    router.push(`/game/${selected.id}?join=1`);
  }, [router, selected]);

  return (
    <section
      id="free-lobby-open-games-anchor"
      className={`${nexusPrestigeCard} scroll-mt-24 flex flex-col border border-sky-500/35 bg-[#0a1018]/90 p-4 shadow-lg shadow-sky-950/20 sm:scroll-mt-28 sm:p-5`}
      data-testid="free-lobby-open-games"
      aria-label={`Players waiting for opponent — ${PLAT_MODE_LABELS[mode]} ${tcLabel} ${ratedLabel}`}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={nexusModuleHeadingClass}>Open seats</p>
          <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Open Games</h2>
        </div>
        <span className="shrink-0 rounded-md border border-sky-500/30 bg-sky-950/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-sky-200/90">
          Waiting for opponents
        </span>
      </div>
      <p className="mt-2 text-xs leading-snug text-gray-500">
        <strong className="text-gray-300">Manual pick-up:</strong> seats here match{' '}
        <strong className="text-gray-400">{PLAT_MODE_LABELS[mode]}</strong>,{' '}
        <strong className="text-gray-400">{tcLabel}</strong>, and{' '}
        <strong className="text-gray-400">{ratedLabel}</strong>. Tap a row, then <strong className="text-gray-400">Accept game</strong> to join as Black (not the same as Find match, which auto-joins).
      </p>
      <p className="mt-1 text-[10px] text-gray-600" role="status">
        This list updates live when new seats are posted or joined.
      </p>
      {loading ? <p className="mt-3 text-sm text-gray-500">Loading open seats…</p> : null}
      {error ? (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && !error && rows.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">
          No one is waiting in this slice right now. Use <strong className="text-gray-400">Create game</strong> in{' '}
          <strong className="text-gray-400">Create or find a game</strong> below to post your seat.
        </p>
      ) : null}
      {!loading && rows.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((r) => {
            const active = selectedId === r.id;
            const waiting = formatWaitingDuration(r.created_at);
            const host = r.hostUsername?.trim() || 'Player';
            return (
              <li key={r.id}>
                <button
                  type="button"
                  data-testid={`free-lobby-open-game-${r.id}`}
                  onClick={() => onRowActivate(r)}
                  className={`flex w-full flex-col gap-1 rounded-lg border px-3 py-2.5 text-left text-sm text-gray-200 transition ${
                    active
                      ? 'border-sky-500/50 bg-[#121a28]'
                      : 'border-white/[0.08] bg-[#0c0e12] hover:border-red-500/35 hover:bg-[#121a24]'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-white">{host}</span>
                    {waiting ? <span className="text-[11px] text-gray-500">{waiting}</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-gray-400">
                    <span>{rowModeLabel(r)}</span>
                    <span>{formatGameTimeControlLabel(r.tempo, r.live_time_control)}</span>
                    <span className={r.rated === true ? 'text-amber-200/85' : 'text-gray-500'}>
                      {r.rated === true ? 'Rated' : 'Unrated'}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {selected ? (
        <div
          className="mt-4 rounded-xl border border-sky-500/35 bg-[#0c121c] p-4"
          data-testid="free-lobby-open-game-confirm"
        >
          <p className="text-sm font-medium text-gray-200">Accept this game?</p>
          <p className="mt-1 text-xs text-gray-500">
            You will take Black against{' '}
            <strong className="text-gray-300">{selected.hostUsername?.trim() || 'this player'}</strong> (
            {rowModeLabel(selected)}, {formatGameTimeControlLabel(selected.tempo, selected.live_time_control)},{' '}
            {selected.rated === true ? 'rated' : 'unrated'}).
          </p>
          {preJoinError ? (
            <div
              className="mt-3 rounded-lg border border-amber-600/45 bg-amber-950/35 px-3 py-2 text-sm text-amber-100/95"
              role="alert"
            >
              <p>{preJoinError}</p>
              {preJoinResumeId ? (
                <p className="mt-2 text-xs text-amber-200/80">
                  <Link href={`/game/${preJoinResumeId}`} className="font-semibold text-sky-300 underline hover:text-sky-200">
                    Go to your game
                  </Link>{' '}
                  to resume or leave your waiting seat first.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="free-lobby-join-confirm"
              onClick={() => void onConfirmJoin()}
              className="inline-flex min-h-[44px] min-w-[140px] touch-manipulation items-center justify-center rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-500"
            >
              Accept game
            </button>
            <button
              type="button"
              data-testid="free-lobby-join-cancel"
              onClick={() => {
                setSelectedId(null);
                setPreJoinError(null);
                setPreJoinResumeId(null);
              }}
              className="inline-flex min-h-[44px] min-w-[100px] touch-manipulation items-center justify-center rounded-lg border border-white/15 bg-transparent px-4 text-sm font-medium text-gray-300 hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
