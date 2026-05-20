'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import {
  resolveTournamentSessionRedirectTarget,
  TOURNAMENT_GAME_ACTIVE_STATUSES,
  type TournamentSessionGameRef,
  type TournamentSessionParticipationRef,
} from '@/lib/tournamentSessionContinuity';
import { supabase } from '@/lib/supabaseClient';

const POLL_MS = 3200;
const REDIRECT_DEBOUNCE_MS = 2200;

function normId(v: unknown): string {
  return String(v ?? '').trim();
}

async function loadActiveTournamentGames(userId: string): Promise<TournamentSessionGameRef[]> {
  const { data, error } = await supabase
    .from('games')
    .select('id, tournament_id, status, updated_at')
    .eq('play_context', 'tournament')
    .not('tournament_id', 'is', null)
    .in('status', [...TOURNAMENT_GAME_ACTIVE_STATUSES])
    .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`)
    .order('updated_at', { ascending: false })
    .limit(8);

  if (error || !data?.length) return [];

  const out: TournamentSessionGameRef[] = [];
  const seen = new Set<string>();
  for (const row of data) {
    const tournamentId = normId((row as { tournament_id?: string }).tournament_id);
    const gameId = normId((row as { id?: string }).id);
    if (!tournamentId || !gameId || seen.has(tournamentId)) continue;
    seen.add(tournamentId);
    out.push({ tournamentId, gameId });
  }
  return out;
}

async function loadActiveTournamentParticipations(
  userId: string,
): Promise<TournamentSessionParticipationRef[]> {
  const { data: entries, error: eErr } = await supabase
    .from('tournament_entries')
    .select('tournament_id, eliminated')
    .eq('user_id', userId)
    .eq('eliminated', false);

  if (eErr || !entries?.length) return [];

  const ids = [...new Set(entries.map((e) => normId((e as { tournament_id?: string }).tournament_id)).filter(Boolean))];
  if (ids.length === 0) return [];

  const { data: tournaments, error: tErr } = await supabase
    .from('tournaments')
    .select('id, status')
    .in('id', ids)
    .eq('status', 'active');

  if (tErr || !tournaments?.length) return [];

  return tournaments.map((t) => ({
    tournamentId: normId((t as { id?: string }).id),
  }));
}

/**
 * Global tournament session continuity: when a live event is active, pull participants
 * off free-play discovery into their board or tournament shell.
 */
export function TournamentSessionRedirectListener() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const pathnameRef = useRef(pathname);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const lastPushRef = useRef<{ href: string; at: number } | null>(null);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSessionUserId(session?.user?.id ?? null);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSessionUserId(data.session?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!sessionUserId) return;
    const uid = sessionUserId;

    let cancelled = false;

    const maybeRedirect = async () => {
      const path = pathnameRef.current;
      const [activeGames, activeParticipations] = await Promise.all([
        loadActiveTournamentGames(uid),
        loadActiveTournamentParticipations(uid),
      ]);
      if (cancelled) return;

      const target = resolveTournamentSessionRedirectTarget({
        pathname: path,
        activeGames,
        activeParticipations,
      });
      if (!target) return;

      const now = Date.now();
      const prev = lastPushRef.current;
      if (prev && prev.href === target.href && now - prev.at < REDIRECT_DEBOUNCE_MS) {
        return;
      }

      lastPushRef.current = { href: target.href, at: now };
      router.replace(target.href);
    };

    void maybeRedirect();

    const poll = window.setInterval(() => {
      void maybeRedirect();
    }, POLL_MS);

    const channel = supabase
      .channel(`tournament-session-${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `play_context=eq.tournament` },
        () => {
          void maybeRedirect();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tournaments' },
        () => {
          void maybeRedirect();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [sessionUserId, router]);

  return null;
}
