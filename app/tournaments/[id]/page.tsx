'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShellNav } from '@/components/AppShellNav';
import { UtcClock } from '@/components/UtcClock';
import { PublicProfileLink } from '@/components/PublicProfileLink';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  championUserIdFromTournament,
  findFinalMatch,
  formatTournamentStatusLabel,
  matchBoardStatus,
  matchStatusPresentation,
} from '@/lib/tournamentReadModel';
import { supabase } from '@/lib/supabaseClient';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Status: pending → active (bracket live) → completed (champion). */
type TournamentRow = {
  id: string;
  name: string;
  status: string;
  format: string;
  tempo: string;
  live_time_control: string | null;
  rated: boolean;
  created_by: string | null;
  created_at: string;
  ecosystem_scope?: string | null;
  entry_fee_cents: number | null;
  prize_pool_cents: number | null;
};

type EntryRow = {
  user_id: string;
  seed: number | null;
  eliminated: boolean;
  current_round: number;
};

type MatchRow = {
  id: string;
  round_number: number;
  match_number: number;
  player1_id: string | null;
  player2_id: string | null;
  game_id: string | null;
  winner_id: string | null;
  next_match_id: string | null;
  advance_winner_as: string | null;
};

export default function TournamentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const idRaw = typeof params?.id === 'string' ? params.id : '';
  const idOk = useMemo(() => UUID_RE.test(idRaw), [idRaw]);

  const [authReady, setAuthReady] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);
  const [payMsg, setPayMsg] = useState<string | null>(null);
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});
  const [payload, setPayload] = useState<{
    tournament: TournamentRow | null;
    entries: EntryRow[];
    matches: MatchRow[];
    gameStatusById: Record<string, string>;
    error: string | null;
  } | null>(null);

  const matchesList = useMemo(() => payload?.matches ?? [], [payload]);
  const matchesByRound = useMemo(() => {
    const map = new Map<number, MatchRow[]>();
    for (const m of matchesList) {
      if (!map.has(m.round_number)) map.set(m.round_number, []);
      map.get(m.round_number)!.push(m);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [matchesList]);

  const tournamentPreview = payload?.tournament ?? null;
  const finalMatch = useMemo(() => findFinalMatch(matchesList), [matchesList]);
  const championId = useMemo(() => {
    if (!tournamentPreview || matchesList.length === 0) return null;
    return championUserIdFromTournament(tournamentPreview.status, matchesList);
  }, [tournamentPreview, matchesList]);

  const entriesList = useMemo(() => payload?.entries ?? [], [payload]);
  const sortedEntries = useMemo(() => {
    const list = [...entriesList];
    list.sort((a, b) => {
      if (a.seed != null && b.seed != null && a.seed !== b.seed) return a.seed - b.seed;
      if (a.seed != null && b.seed == null) return -1;
      if (a.seed == null && b.seed != null) return 1;
      return a.user_id.localeCompare(b.user_id);
    });
    return list;
  }, [entriesList]);

  const maxRound = useMemo(
    () => (matchesList.length ? Math.max(...matchesList.map((m) => m.round_number)) : 0),
    [matchesList]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user?.id) {
        router.replace('/login');
        return;
      }
      setCurrentUserId(data.user.id);
      setAuthReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!authReady || !idOk) return;
    let cancelled = false;
    void (async () => {
      const [tRes, eRes, mRes] = await Promise.all([
        supabase
          .from('tournaments')
          .select(
            'id, name, status, format, tempo, live_time_control, rated, created_by, created_at, ecosystem_scope, entry_fee_cents, prize_pool_cents'
          )
          .eq('id', idRaw)
          .maybeSingle(),
        supabase
          .from('tournament_entries')
          .select('user_id, seed, eliminated, current_round')
          .eq('tournament_id', idRaw)
          .order('seed', { ascending: true, nullsFirst: false }),
        supabase
          .from('tournament_matches')
          .select(
            'id, round_number, match_number, player1_id, player2_id, game_id, winner_id, next_match_id, advance_winner_as'
          )
          .eq('tournament_id', idRaw)
          .order('round_number', { ascending: true })
          .order('match_number', { ascending: true }),
      ]);
      if (cancelled) return;
      const err = tRes.error?.message ?? eRes.error?.message ?? mRes.error?.message ?? null;
      const matches = (mRes.data as MatchRow[] | null) ?? [];
      const gameIds = [...new Set(matches.map((m) => m.game_id).filter((x): x is string => Boolean(x)))];
      let gameStatusById: Record<string, string> = {};
      if (gameIds.length > 0) {
        const gRes = await supabase.from('games').select('id, status').in('id', gameIds);
        if (!gRes.error && gRes.data) {
          gameStatusById = Object.fromEntries(
            (gRes.data as { id: string; status: string }[]).map((g) => [g.id, g.status])
          );
        }
      }
      setPayload({
        tournament: (tRes.data as TournamentRow | null) ?? null,
        entries: (eRes.data as EntryRow[] | null) ?? [],
        matches,
        gameStatusById,
        error: err,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, idOk, idRaw]);

  useEffect(() => {
    if (!payload) return;
    const ids = new Set<string>();
    for (const e of payload.entries) ids.add(e.user_id);
    for (const m of payload.matches) {
      if (m.player1_id) ids.add(m.player1_id);
      if (m.player2_id) ids.add(m.player2_id);
      if (m.winner_id) ids.add(m.winner_id);
    }
    const t = payload.tournament;
    if (t?.created_by) ids.add(t.created_by);
    const championId = championUserIdFromTournament(t?.status ?? '', payload.matches);
    if (championId) ids.add(championId);
    const list = [...ids];
    if (list.length === 0) return;
    let cancelled = false;
    void (async () => {
      const pRes = await supabase.from('profiles').select('id, username').in('id', list);
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const id of list) next[id] = id.slice(0, 8) + '…';
      if (!pRes.error && pRes.data) {
        for (const r of pRes.data as { id: string; username: string | null }[]) {
          next[r.id] = r.username?.trim() || r.id.slice(0, 8) + '…';
        }
      }
      setDisplayNames(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const labelFor = (uid: string | null) => {
    if (!uid) return '—';
    return displayNames[uid] ?? uid.slice(0, 8) + '…';
  };

  if (!authReady) {
    return (
      <main style={{ padding: 24 }}>
        <p>Loading…</p>
      </main>
    );
  }

  if (!idOk) {
    return (
      <main style={{ padding: 24 }}>
        <p>Invalid tournament id.</p>
        <Link href="/tournaments">Tournaments hub</Link>
      </main>
    );
  }

  const debugJson = payload
    ? {
        tournament: payload.tournament,
        entries: payload.entries,
        matches: payload.matches.map((m) => ({
          ...m,
          advancement: m.next_match_id
            ? `next_match_id=${m.next_match_id} as ${m.advance_winner_as ?? '?'}`
            : m.winner_id
              ? 'final / terminal'
              : 'pending',
          gameLink: m.game_id ?? null,
        })),
        fetchError: payload.error,
      }
    : null;

  const tournament = payload?.tournament ?? null;
  const gameStatusById = payload?.gameStatusById ?? {};

  return (
    <main
      data-testid="tournament-detail-root"
      style={{ padding: '24px 16px 48px', maxWidth: 960, margin: '0 auto' }}
    >
      <AppShellNav variant="tournamentDetail" />

      <div style={{ marginTop: 12, marginBottom: 8 }}>
        <UtcClock className="text-[11px] tabular-nums text-sky-300/90" />
      </div>

      {!tournament ? (
        <>
          <h1 style={{ marginTop: 16 }}>Tournament</h1>
          <p style={{ color: '#fecaca' }}>
            {payload?.error ?? 'Tournament not found or not visible with your account.'}
          </p>
        </>
      ) : (
        <>
          <h1 style={{ marginTop: 16, color: '#f8fafc' }} data-testid="tournament-detail-title">
            {tournament.name}
          </h1>
          <p style={{ margin: '8px 0 0 0', fontSize: 14, color: '#94a3b8' }}>
            <strong style={{ color: '#e2e8f0' }}>{formatTournamentStatusLabel(tournament.status)}</strong>
            {' · '}
            {tournament.format.replace(/_/g, ' ')} · {tournament.tempo}
            {tournament.live_time_control ? ` · ${tournament.live_time_control}` : ''} ·{' '}
            {tournament.rated ? 'Rated' : 'Unrated'}
            {' · '}
            Created {new Date(tournament.created_at).toLocaleString()}
            {tournament.created_by ? (
              <>
                {' '}
                · Host{' '}
                <PublicProfileLink userId={tournament.created_by} data-testid="tournament-host-public-link">
                  <strong style={{ color: '#e2e8f0' }}>{labelFor(tournament.created_by)}</strong>
                </PublicProfileLink>
              </>
            ) : null}
          </p>

          {String(tournament.ecosystem_scope ?? 'adult') === 'k12' ? (
            <p style={{ marginTop: 14, fontSize: 14, color: '#67e8f9', lineHeight: 1.55, maxWidth: 720 }}>
              School-safe event — recognition and progression only; no cash entry or payouts on this surface.
            </p>
          ) : (
            <section
              style={{
                marginTop: 14,
                padding: 16,
                borderRadius: 10,
                border: '1px solid #334155',
                background: '#0f172a',
              }}
            >
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Published economics</p>
              {(tournament.entry_fee_cents ?? 0) > 0 ? (
                <p style={{ margin: '10px 0 0 0', fontSize: 16, color: '#fbbf24', fontWeight: 700 }}>
                  Enter for ${((tournament.entry_fee_cents ?? 0) / 100).toFixed(2)}
                </p>
              ) : (
                <p style={{ margin: '10px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
                  Free entry (no paid entry fee on file).
                </p>
              )}
              {(tournament.prize_pool_cents ?? 0) > 0 ? (
                <p style={{ margin: '8px 0 0 0', fontSize: 15, color: '#86efac' }}>
                  Prize pool: ${((tournament.prize_pool_cents ?? 0) / 100).toFixed(2)}
                </p>
              ) : null}
              <p style={{ margin: '10px 0 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                Fees and pools are display-only; bracket integrity does not branch on payments.
              </p>
              {(() => {
                const st = String(tournament.status).toLowerCase();
                const canPay =
                  (tournament.entry_fee_cents ?? 0) > 0 &&
                  (st === 'pending' || st === 'active') &&
                  currentUserId &&
                  !entriesList.some((e) => e.user_id === currentUserId);
                return canPay ? (
                  <div style={{ marginTop: 14 }}>
                    <button
                      type="button"
                      disabled={payBusy}
                      onClick={async () => {
                        setPayBusy(true);
                        setPayErr(null);
                        setPayMsg(null);
                        const { data: sessionData } = await supabase.auth.getSession();
                        const token = sessionData.session?.access_token;
                        if (!token) {
                          setPayErr('Session expired — refresh and try again.');
                          setPayBusy(false);
                          return;
                        }
                        const res = await fetch('/api/payments/create-entry', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({ tournament_id: idRaw }),
                        });
                        const j = (await res.json()) as { error?: string; client_secret?: string };
                        setPayBusy(false);
                        if (!res.ok) {
                          setPayErr(j.error ?? 'Payment could not be started.');
                          return;
                        }
                        setPayMsg(
                          'Payment intent created. Use Stripe Elements with the returned client_secret — entry is granted only after webhook confirmation.'
                        );
                      }}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: '1px solid #b45309',
                        background: '#b45309',
                        color: '#fff',
                        fontWeight: 700,
                        cursor: payBusy ? 'wait' : 'pointer',
                        opacity: payBusy ? 0.75 : 1,
                      }}
                    >
                      {payBusy ? 'Starting…' : 'Start paid entry'}
                    </button>
                    {payErr ? (
                      <p style={{ margin: '10px 0 0 0', fontSize: 13, color: '#fca5a5' }}>{payErr}</p>
                    ) : null}
                    {payMsg ? (
                      <p style={{ margin: '10px 0 0 0', fontSize: 13, color: '#a7f3d0' }}>{payMsg}</p>
                    ) : null}
                  </div>
                ) : null;
              })()}
            </section>
          )}

          {tournament.status === 'completed' && championId ? (
            <section
              data-testid="tournament-champion-banner"
              style={{
                marginTop: 24,
                padding: '22px 22px 20px',
                borderRadius: 14,
                border: '2px solid transparent',
                background:
                  'linear-gradient(#0c1220, #0c1220) padding-box, linear-gradient(135deg, #fbbf24, #3b82f6, #a855f7) border-box',
                boxShadow: '0 12px 40px rgba(59, 130, 246, 0.12)',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  color: '#fde68a',
                  fontWeight: 800,
                  letterSpacing: '0.12em',
                }}
              >
                TOURNAMENT CHAMPION
              </p>
              <p style={{ margin: '12px 0 0 0', lineHeight: 1.2 }}>
                <Link
                  href={`/profile/${championId}`}
                  data-testid="tournament-champion-public-link"
                  style={{
                    display: 'inline-block',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <span
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      color: '#f8fafc',
                      borderBottom: '2px solid rgba(253, 224, 71, 0.55)',
                      paddingBottom: 2,
                    }}
                  >
                    {labelFor(championId)}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      marginTop: 10,
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#93c5fd',
                      letterSpacing: '0.02em',
                    }}
                  >
                    Public player profile →
                  </span>
                </Link>
              </p>
              <p style={{ margin: '10px 0 0 0', fontSize: 14, color: '#94a3b8', maxWidth: 640, lineHeight: 1.55 }}>
                <strong style={{ color: '#e2e8f0' }}>{tournament.name}</strong> — official result from the{' '}
                {finalMatch ? (
                  <>
                    terminal bracket match (round {finalMatch.round_number}, match {finalMatch.match_number}
                    ).
                  </>
                ) : (
                  <>recorded final match.</>
                )}{' '}
                Shown exactly as stored; trophies and prestige follow separate issuance rules.
              </p>
            </section>
          ) : tournament.status === 'completed' && !championId ? (
            <section
              data-testid="tournament-champion-unresolved"
              style={{
                marginTop: 24,
                padding: 16,
                borderRadius: 12,
                border: '1px solid #78350f',
                background: '#1c1917',
              }}
            >
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#fdba74' }}>
                Champion unresolved
              </p>
              <p style={{ margin: '8px 0 0 0', color: '#fed7aa', fontSize: 14, lineHeight: 1.5 }}>
                This event is marked completed, but the terminal bracket match has no winner on file. Nothing is
                inferred—verify match rows or operator tooling.
              </p>
            </section>
          ) : (
            <section
              data-testid="tournament-champion-pending"
              style={{
                marginTop: 24,
                padding: 16,
                borderRadius: 12,
                border: '1px solid #334155',
                background: '#0f172a',
              }}
            >
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#cbd5e1' }}>
                Champion to be decided
              </p>
              <p style={{ margin: '8px 0 0 0', color: '#94a3b8', fontSize: 14, lineHeight: 1.5 }}>
                {tournament.status === 'pending'
                  ? 'Bracket not underway yet. The champion appears here after the event completes and the final match records a winner.'
                  : 'Bracket in progress. Follow matches below; the champion appears when the event completes and the final records a winner.'}
              </p>
            </section>
          )}

          <section
            data-testid="tournament-entries-section"
            style={{
              marginTop: 24,
              padding: 18,
              borderRadius: 12,
              border: '1px solid #243244',
              background: '#111a27',
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: 17, color: '#f1f5f9' }}>Who’s in</h2>
            <p style={{ margin: '0 0 14px 0', color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>
              <strong style={{ color: '#e2e8f0' }}>{sortedEntries.length}</strong> entrant
              {sortedEntries.length === 1 ? '' : 's'}
              {finalMatch ? (
                <>
                  . Terminal match: round {finalMatch.round_number}, match {finalMatch.match_number}.
                </>
              ) : null}{' '}
              Names link to each player&apos;s <strong style={{ color: '#cbd5e1' }}>public</strong> ACCL profile
              (curated fields only). Rows mirror entry data—no scoring logic added here.
            </p>
            {sortedEntries.length === 0 ? (
              <p style={{ margin: 0, color: '#64748b' }}>No entries loaded.</p>
            ) : (
              <div style={{ display: 'grid', gap: 0 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(120px,1fr) 72px 100px 120px',
                    gap: 8,
                    padding: '8px 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    borderBottom: '1px solid #2f3f54',
                  }}
                >
                  <span>Player</span>
                  <span>Seed</span>
                  <span>Status</span>
                  <span>Round</span>
                </div>
                {sortedEntries.slice(0, 48).map((e) => (
                  <div
                    key={e.user_id}
                    data-testid={`tournament-entry-${e.user_id}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(120px,1fr) 72px 100px 120px',
                      gap: 8,
                      alignItems: 'center',
                      padding: '10px 10px',
                      fontSize: 14,
                      color: '#e2e8f0',
                      borderBottom: '1px solid #1e293b',
                      background: e.eliminated ? 'rgba(127, 29, 29, 0.12)' : 'transparent',
                    }}
                  >
                    <PublicProfileLink userId={e.user_id} data-testid={`tournament-entry-public-${e.user_id}`}>
                      <span style={{ fontWeight: 600 }}>{labelFor(e.user_id)}</span>
                    </PublicProfileLink>
                    <span style={{ color: e.seed != null ? '#cbd5e1' : '#64748b' }}>
                      {e.seed != null ? e.seed : '—'}
                    </span>
                    <span style={{ color: e.eliminated ? '#fca5a5' : '#86efac', fontSize: 13 }}>
                      {e.eliminated ? 'Out' : 'Active'}
                    </span>
                    <span style={{ color: '#94a3b8', fontSize: 13 }}>{e.current_round ?? '—'}</span>
                  </div>
                ))}
                {sortedEntries.length > 48 ? (
                  <p style={{ margin: '12px 0 0 0', color: '#64748b', fontSize: 13 }}>
                    … and {sortedEntries.length - 48} more entrants
                  </p>
                ) : null}
              </div>
            )}
          </section>

          <section style={{ marginTop: 28 }} data-testid="tournament-bracket-section">
            <h2 style={{ marginTop: 0, fontSize: 18, color: '#f1f5f9' }}>Bracket</h2>
            <p style={{ marginTop: 0, fontSize: 13, color: '#94a3b8', maxWidth: 720, lineHeight: 1.55 }}>
              Each match shows status from stored bracket rows and, when linked, the live game row. Colors are labels
              only—they do not change bracket rules.
            </p>
            {matchesByRound.length === 0 ? (
              <p style={{ color: '#64748b' }}>No bracket matches yet.</p>
            ) : (
              matchesByRound.map(([roundNum, roundMatches]) => {
                const isFinalRound = maxRound > 0 && roundNum === maxRound;
                return (
                  <div
                    key={roundNum}
                    data-testid={`tournament-bracket-round-${roundNum}`}
                    style={{
                      marginTop: 22,
                      paddingTop: 18,
                      borderTop: roundNum === matchesByRound[0][0] ? 'none' : '1px solid #243244',
                    }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                      <h3 style={{ margin: 0, fontSize: 17, color: '#f8fafc' }}>
                        Round {roundNum}
                        {isFinalRound ? (
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#c4b5fd', marginLeft: 10 }}>
                            Championship round
                          </span>
                        ) : null}
                      </h3>
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        {roundMatches.length} match{roundMatches.length === 1 ? '' : 'es'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gap: 12 }}>
                      {roundMatches.map((m) => {
                        const board = matchBoardStatus(
                          m,
                          m.game_id ? gameStatusById[m.game_id] : undefined
                        );
                        const pres = matchStatusPresentation(board);
                        const isFinal = m.next_match_id == null;
                        const gameStatus = m.game_id ? gameStatusById[m.game_id] : null;
                        return (
                          <article
                            key={m.id}
                            data-testid={`tournament-match-${m.id}`}
                            data-match-board-status={board}
                            style={{
                              border: `1px solid ${pres.border}`,
                              borderLeftWidth: 4,
                              borderRadius: 10,
                              padding: 14,
                              background: '#0f1723',
                              display: 'grid',
                              gap: 10,
                            }}
                          >
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                                  M{m.match_number}
                                  {isFinal ? (
                                    <span style={{ color: '#c4b5fd', marginLeft: 6 }}>· Final</span>
                                  ) : null}
                                </span>
                                {m.winner_id ? (
                                  <span style={{ fontSize: 13, color: '#86efac' }}>
                                    Winner:{' '}
                                    <PublicProfileLink userId={m.winner_id} style={{ color: '#86efac' }}>
                                      <strong>{labelFor(m.winner_id)}</strong>
                                    </PublicProfileLink>
                                  </span>
                                ) : null}
                              </div>
                              <span
                                title={pres.title}
                                style={{
                                  fontSize: 11,
                                  fontWeight: 800,
                                  letterSpacing: '0.06em',
                                  padding: '4px 10px',
                                  borderRadius: 999,
                                  border: `1px solid ${pres.border}`,
                                  background: pres.background,
                                  color: pres.color,
                                }}
                              >
                                {pres.short.toUpperCase()}
                              </span>
                            </div>
                            <div style={{ fontSize: 15, color: '#f1f5f9', lineHeight: 1.5 }}>
                              <div style={{ fontWeight: 700 }}>
                                <PublicProfileLink userId={m.player1_id}>
                                  {labelFor(m.player1_id)}
                                </PublicProfileLink>
                              </div>
                              <div style={{ fontSize: 12, color: '#64748b', margin: '2px 0' }}>vs</div>
                              <div style={{ fontWeight: 700 }}>
                                <PublicProfileLink userId={m.player2_id}>
                                  {labelFor(m.player2_id)}
                                </PublicProfileLink>
                              </div>
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                              {m.game_id ? (
                                <>
                                  Linked game: <code style={{ color: '#94a3b8' }}>{m.game_id.slice(0, 8)}…</code>
                                  {gameStatus ? (
                                    <>
                                      {' '}
                                      · Board <strong style={{ color: '#cbd5e1' }}>{gameStatus}</strong>
                                    </>
                                  ) : null}
                                </>
                              ) : (
                                <span>No game row linked — pair not on a board yet (or not spawned).</span>
                              )}
                            </div>
                            {m.game_id ? (
                              <div>
                                <button
                                  type="button"
                                  data-testid={`tournament-match-open-game-${m.id}`}
                                  onClick={() => router.push(`/game/${m.game_id}`)}
                                  style={{
                                    padding: '8px 14px',
                                    borderRadius: 8,
                                    border: '1px solid #3b82f6',
                                    background: '#1d4ed8',
                                    color: '#fff',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Open board & game record
                                </button>
                                <span style={{ marginLeft: 10, fontSize: 12, color: '#64748b' }}>
                                  PGN / replay on the game page
                                </span>
                              </div>
                            ) : board !== 'waiting' ? (
                              <p style={{ margin: 0, fontSize: 12, color: '#78716c' }}>
                                Match is ready or resolved in bracket data but has no <code>game_id</code> link yet.
                              </p>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </>
      )}

      <details style={{ marginTop: 28 }}>
        <summary style={{ cursor: 'pointer', color: '#94a3b8' }}>Technical bracket dump (debug JSON)</summary>
        <pre
          data-testid="tournament-debug"
          style={{
            marginTop: 12,
            padding: 16,
            borderRadius: 8,
            background: '#0d1524',
            color: '#d8e4f5',
            overflow: 'auto',
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          {debugJson ? JSON.stringify(debugJson, null, 2) : 'Loading…'}
        </pre>
      </details>
    </main>
  );
}
