'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const TOURNAMENT_ACTIVE_STATUSES = ['active', 'waiting'] as const;

type ActiveTournamentRow = {
  tournamentId: string;
  gameId: string;
};

async function loadActiveTournamentMatchesForUser(userId: string): Promise<ActiveTournamentRow[]> {
  const { data, error } = await supabase
    .from('games')
    .select('id, tournament_id, status')
    .eq('play_context', 'tournament')
    .not('tournament_id', 'is', null)
    .in('status', [...TOURNAMENT_ACTIVE_STATUSES])
    .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`)
    .order('updated_at', { ascending: false })
    .limit(5);

  if (error || !data?.length) return [];

  const out: ActiveTournamentRow[] = [];
  const seen = new Set<string>();
  for (const row of data) {
    const tournamentId = String((row as { tournament_id?: string }).tournament_id ?? '').trim();
    const gameId = String((row as { id?: string }).id ?? '').trim();
    if (!tournamentId || !gameId || seen.has(tournamentId)) continue;
    seen.add(tournamentId);
    out.push({ tournamentId, gameId });
  }
  return out;
}

type Props =
  | {
      mode: 'on_tournament_board';
      tournamentId: string;
      excludeGameId?: string | null;
    }
  | {
      mode: 'lobby_reminder';
      /** When set, do not remind about this tournament (e.g. already on its board). */
      excludeTournamentId?: string | null;
    };

/**
 * Informational only — does not mutate queue or gameplay.
 */
export function TournamentCoexistenceNotice(props: Props) {
  const [rows, setRows] = useState<ActiveTournamentRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        if (!cancelled) setRows([]);
        return;
      }
      const loaded = await loadActiveTournamentMatchesForUser(uid);
      if (cancelled) return;
      if (props.mode === 'lobby_reminder') {
        const ex = props.excludeTournamentId?.trim();
        setRows(ex ? loaded.filter((r) => r.tournamentId !== ex) : loaded);
        return;
      }
      setRows(loaded.filter((r) => r.tournamentId === props.tournamentId));
    })();
    return () => {
      cancelled = true;
    };
  }, [props]);

  if (props.mode === 'on_tournament_board') {
    const tid = props.tournamentId.trim();
    if (!tid) return null;
    return (
      <p
        data-testid="tournament-board-context-notice"
        style={{
          margin: '0 0 12px 0',
          padding: '10px 12px',
          maxWidth: 560,
          fontSize: 13,
          lineHeight: 1.45,
          color: '#cbd5e1',
          border: '1px solid #475569',
          borderRadius: 8,
          background: '#0f172a',
        }}
      >
        You currently have an active tournament match. Tournament games are separate from free play.{' '}
        <Link href={`/tournaments/${tid}`} style={{ color: '#93c5fd', fontWeight: 600 }}>
          Back to tournament
        </Link>
      </p>
    );
  }

  if (rows === null) return null;
  const primary = rows[0];
  if (!primary) return null;

  return (
    <div
      data-testid="tournament-active-match-reminder"
      className="mb-4 rounded-xl border-2 border-amber-500/55 bg-gradient-to-br from-amber-950/50 to-[#14100c] px-4 py-3 text-sm text-amber-50"
      role="status"
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200/90">
        Your match ready — tournament obligation
      </p>
      <p className="mt-1 leading-snug text-amber-100/95">
        Live bracket play takes priority over free-play discovery. Open your board or return to the event hub.
      </p>
      <p className="mt-3 flex flex-wrap gap-3 text-xs">
        <Link
          href={`/game/${primary.gameId}`}
          data-testid="tournament-obligation-game-link"
          className="inline-flex min-h-[36px] items-center rounded-lg border border-amber-400/50 bg-amber-900/40 px-3 py-1.5 font-bold text-amber-50 underline-offset-2 hover:bg-amber-800/50"
        >
          Open your board
        </Link>
        <Link
          href={`/tournaments/${primary.tournamentId}`}
          className="inline-flex min-h-[36px] items-center font-semibold text-sky-300 underline hover:text-sky-200"
        >
          Tournament hub
        </Link>
        {rows.length > 1 ? (
          <span className="self-center text-amber-200/70">{rows.length} active event boards</span>
        ) : null}
      </p>
    </div>
  );
}
