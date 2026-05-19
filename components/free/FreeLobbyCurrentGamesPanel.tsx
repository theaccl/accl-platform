'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { GameContinuityGameRows } from '@/components/free/GameContinuityGameRows';
import {
  DAILY_ASYNC_SECTION_HINT,
  DAILY_ASYNC_SECTION_TITLE,
  freeActiveGamesHref,
  LIVE_NOW_SECTION_HINT,
  LIVE_NOW_SECTION_TITLE,
  partitionGamesByContinuity,
  type GameContinuityRow,
} from '@/lib/gameContinuityPresentation';
import { supabase } from '@/lib/supabaseClient';

function ContinuitySectionHeader({
  title,
  hint,
  viewAllHref,
  titleClassName,
}: {
  title: string;
  hint: string;
  viewAllHref: string;
  titleClassName: string;
}) {
  return (
    <>
      <SectionTitleRow title={title} viewAllHref={viewAllHref} titleClassName={titleClassName} />
      <p className="mt-1 text-[11px] leading-snug text-gray-500">{hint}</p>
    </>
  );
}

function SectionTitleRow({
  title,
  viewAllHref,
  titleClassName,
}: {
  title: string;
  viewAllHref: string;
  titleClassName: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${titleClassName}`}>{title}</h2>
      <Link href={viewAllHref} className="text-[11px] font-semibold text-sky-300 underline-offset-2 hover:underline">
        View all
      </Link>
    </div>
  );
}

/**
 * Lobby hub: live reconnect vs daily/async continuity, shown in separate sections.
 */
export function FreeLobbyCurrentGamesPanel() {
  const [rows, setRows] = useState<GameContinuityRow[] | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: s } = await supabase.auth.getSession();
      const me = s.session?.user?.id ?? null;
      if (cancelled) return;
      setUid(me);
      if (!me) {
        setRows([]);
        return;
      }

      const { data, error: qErr } = await supabase
        .from('games')
        .select('id,status,tempo,live_time_control,turn,white_player_id,black_player_id,updated_at')
        .eq('play_context', 'free')
        .is('tournament_id', null)
        .in('status', ['active', 'waiting'])
        .or(`white_player_id.eq.${me},black_player_id.eq.${me}`)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (cancelled) return;
      if (qErr) {
        setError('Could not load your games.');
        setRows([]);
        return;
      }
      setRows((data ?? []) as GameContinuityRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { live, dailyAsync } = useMemo(() => partitionGamesByContinuity(rows ?? []), [rows]);

  return (
    <section
      className="relative z-20 mb-4 space-y-4"
      data-testid="free-lobby-current-games"
      aria-label="Your games"
    >
      {rows === null ? (
        <p className="rounded-xl border border-sky-500/35 bg-[#0f141c] px-4 py-3 text-xs text-gray-500">
          Loading your games…
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-500/35 bg-[#0f141c] px-4 py-3 text-xs text-red-400">{error}</p>
      ) : null}

      <div
        className="rounded-xl border border-sky-500/35 bg-[#0f141c] px-4 py-3 sm:px-5"
        data-testid="free-lobby-live-now"
      >
        <ContinuitySectionHeader
          title={LIVE_NOW_SECTION_TITLE}
          hint={LIVE_NOW_SECTION_HINT}
          viewAllHref={freeActiveGamesHref('live')}
          titleClassName="text-sky-300/90"
        />
        {rows && live.length === 0 ? (
          <p className="mt-2 text-xs text-gray-500">No live boards right now.</p>
        ) : null}
        {rows && live.length > 0 ? (
          <GameContinuityGameRows rows={live} uid={uid} variant="live" testIdPrefix="free-lobby-live" compact />
        ) : null}
      </div>

      <DailyAsyncSection
        rows={rows}
        dailyAsync={dailyAsync}
        uid={uid}
      />
    </section>
  );
}

function DailyAsyncSection({
  rows,
  dailyAsync,
  uid,
}: {
  rows: GameContinuityRow[] | null;
  dailyAsync: GameContinuityRow[];
  uid: string | null;
}) {
  return (
    <div
      className="rounded-xl border border-violet-500/30 bg-[#0f141c] px-4 py-3 sm:px-5"
      data-testid="free-lobby-daily-async"
    >
      <ContinuitySectionHeader
        title={DAILY_ASYNC_SECTION_TITLE}
        hint={DAILY_ASYNC_SECTION_HINT}
        viewAllHref={freeActiveGamesHref('async')}
        titleClassName="text-violet-300/90"
      />
      {rows && dailyAsync.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">No daily or correspondence games waiting.</p>
      ) : null}
      {rows && dailyAsync.length > 0 ? (
        <GameContinuityGameRows
          rows={dailyAsync}
          uid={uid}
          variant="async"
          testIdPrefix="free-lobby-async"
          compact
        />
      ) : null}
    </div>
  );
}
