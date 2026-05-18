'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { gameDisplayTempoLabel } from '@/lib/gameDisplayLabel';
import { supabase } from '@/lib/supabaseClient';

type Row = {
  id: string;
  status: string;
  tempo: string | null;
  live_time_control: string | null;
  turn: string | null;
  white_player_id: string;
  black_player_id: string | null;
  updated_at?: string | null;
};

function isYourMove(g: Row, uid: string): boolean {
  const t = String(g.turn ?? '').trim().toLowerCase();
  if (t !== 'white' && t !== 'black') return false;
  if (!g.black_player_id) return false;
  if (t === 'white' && g.white_player_id === uid) return true;
  if (t === 'black' && g.black_player_id === uid) return true;
  return false;
}

/**
 * Lightweight hub panel: active/waiting free games for this user.
 * Client-side only so lobby shell/realtime mount is not blocked.
 */
export function FreeLobbyCurrentGamesPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
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
        setError('Could not load your current games.');
        setRows([]);
        return;
      }
      setRows((data ?? []) as Row[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const queuedRows = (rows ?? []).filter((g) => !g.black_player_id);
  const currentRows = (rows ?? []).filter((g) => Boolean(g.black_player_id));

  return (
    <section
      className="relative z-20 mb-4 rounded-xl border border-sky-500/35 bg-[#0f141c] px-4 py-3 sm:px-5"
      data-testid="free-lobby-current-games"
      aria-label="Your current games"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-300/90">Review / Resume games</h2>
        <Link href="/free/active" className="text-[11px] font-semibold text-sky-300 underline-offset-2 hover:underline">
          View all
        </Link>
      </div>
      {rows === null ? <p className="mt-2 text-xs text-gray-500">Loading your games…</p> : null}
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
      {rows && rows.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">No active or waiting games yet.</p>
      ) : null}
      {rows && rows.length > 0 ? (
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-300/80">Queued games</p>
            {queuedRows.length === 0 ? <p className="mt-1 text-xs text-gray-500">No open seats waiting for opponent.</p> : null}
            {queuedRows.length > 0 ? (
              <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {queuedRows.slice(0, 4).map((g) => (
                  <li key={g.id}>
                    <Link
                      href={`/game/${g.id}`}
                      className="flex min-h-[48px] items-center justify-between rounded-lg border border-cyan-500/25 bg-[#0f1a24] px-3 py-2 text-sm text-gray-200 transition hover:border-cyan-400/45 hover:bg-[#122131]"
                      data-testid={`free-lobby-queued-game-${g.id}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-white">
                          {gameDisplayTempoLabel({ tempo: g.tempo, liveTimeControl: g.live_time_control })}
                        </span>
                        <span className="block text-[11px] text-cyan-300/70">Open seat</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-300/85">Current games</p>
            {currentRows.length === 0 ? <p className="mt-1 text-xs text-gray-500">No seated in-progress games.</p> : null}
            {currentRows.length > 0 ? (
              <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {currentRows.slice(0, 6).map((g) => {
                  const mine = uid ? isYourMove(g, uid) : false;
                  return (
                    <li key={g.id}>
                      <Link
                        href={`/game/${g.id}`}
                        className="flex min-h-[48px] items-center justify-between rounded-lg border border-white/[0.1] bg-[#111723] px-3 py-2 text-sm text-gray-200 transition hover:border-sky-500/45 hover:bg-[#141c2a]"
                        data-testid={`free-lobby-current-game-${g.id}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-white">
                            {gameDisplayTempoLabel({ tempo: g.tempo, liveTimeControl: g.live_time_control })}
                          </span>
                          <span className="block text-[11px] text-gray-500">{g.status}</span>
                        </span>
                        {mine ? (
                          <span className="ml-2 shrink-0 rounded-full border border-emerald-500/40 bg-emerald-950/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                            Your move
                          </span>
                        ) : (
                          <span className="ml-2 shrink-0 rounded-full border border-white/10 bg-[#0d131c] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            Waiting
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
