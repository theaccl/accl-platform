'use client';

/**
 * `/requests` accept flow (App Router): this module is the page for URL `/requests`.
 *
 * Execution trace (incoming direct challenge):
 * 1) UI: Incoming card → `onClick={() => void acceptRequest(r)}` (`data-testid="challenge-accept-<id>"`).
 * 2) `acceptRequest` → `POST /api/match-requests/accept` (Bearer session) — server performs `games.insert` + `match_requests` update.
 * 3) Open/public “Join” still uses `createGameFromRequest` (client `games.insert` only — no `create_seated_game_guard`).
 *
 * Production parity check (DevTools Network):
 * - Expected on **direct** Accept: `POST /api/match-requests/accept` — not `/rest/v1/rpc/create_seated_game_guard`.
 * - If you still see the Supabase RPC on direct Accept, the deployment does not include this route/handler revision.
 *
 * Temporary runtime logging (opt-in, no rebuild required on web):
 * - In the browser console: `localStorage.setItem('accl_debug_requests_accept','1')` then reload and Accept.
 * - Optional env (requires rebuild): `NEXT_PUBLIC_ACCL_DEBUG_REQUESTS_ACCEPT=1`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { gameDisplayTempoLabel } from '@/lib/gameDisplayLabel';
import { gameRatedListLabel } from '@/lib/gameRated';
import { gameInsertFromAcceptedChallenge } from '@/lib/gameStartupInsert';
import { supabase } from '@/lib/supabaseClient';
import NavigationBar from '@/components/NavigationBar';
import { useOpenPublicIdentityCard } from '@/components/identity/PublicIdentityCardContext';
import { publicDisplayNameFromProfileUsername } from '@/lib/profileIdentity';

type MatchRequestRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  request_type: string;
  status: string;
  visibility?: string | null;
  created_at: string;
  tempo?: string | null;
  live_time_control?: string | null;
  white_player_id: string;
  black_player_id: string;
  source_game_id?: string | null;
  rated?: boolean | null;
};

function isDirect(r: MatchRequestRow): boolean {
  return r.visibility !== 'open';
}

function shortPlayerLabel(id: string, nameById: Record<string, string>): string {
  const n = nameById[id];
  if (n) return n;
  const t = id.trim();
  if (t.length <= 10) return t;
  return `${t.slice(0, 8)}…`;
}

function supabaseErrText(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const m = String((err as { message: unknown }).message ?? '').trim();
    if (m) return m;
  }
  return fallback;
}

function debugRequestsAcceptEnabled(): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  if (process.env.NEXT_PUBLIC_ACCL_DEBUG_REQUESTS_ACCEPT === '1') return true;
  if (typeof window !== 'undefined' && window.localStorage?.getItem('accl_debug_requests_accept') === '1') {
    return true;
  }
  return false;
}

export default function RequestsPage() {
  const router = useRouter();
  const openIdentity = useOpenPublicIdentityCard();
  const actionInFlightRef = useRef(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [requests, setRequests] = useState<MatchRequestRow[]>([]);
  const [busyReqId, setBusyReqId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [nameById, setNameById] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const uid = data.user?.id ?? null;
      setAuthUserId(uid);
      setAuthResolved(true);
      if (!uid) router.replace('/login');
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const fetchRequests = useCallback(async () => {
    if (!authUserId) {
      setRequests([]);
      return;
    }
    const { data, error } = await supabase
      .from('match_requests')
      .select('*')
      .eq('status', 'pending')
      .or(
        `from_user_id.eq.${authUserId},to_user_id.eq.${authUserId},and(visibility.eq.open,from_user_id.neq.${authUserId})`
      )
      .order('created_at', { ascending: false });
    if (error) {
      setMessage(error.message);
      return;
    }
    setRequests((data ?? []) as MatchRequestRow[]);
  }, [authUserId]);

  useEffect(() => {
    if (!authResolved || !authUserId) return;
    void fetchRequests();
  }, [authResolved, authUserId, fetchRequests]);

  useEffect(() => {
    if (!requests.length) return;
    let cancelled = false;
    const ids = [...new Set(requests.flatMap((r) => [r.from_user_id, r.to_user_id].filter(Boolean)))];
    void (async () => {
      const { data, error } = await supabase.from('profiles').select('id, username').in('id', ids);
      if (cancelled || error || !data?.length) return;
      const next: Record<string, string> = {};
      for (const row of data as { id: string; username: string | null }[]) {
        next[row.id] = publicDisplayNameFromProfileUsername(row.username, row.id);
      }
      setNameById((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
  }, [requests]);

  useEffect(() => {
    if (!authResolved || !authUserId) return;
    const poll = window.setInterval(() => {
      if (actionInFlightRef.current) return;
      void fetchRequests();
    }, 5000);
    return () => {
      window.clearInterval(poll);
    };
  }, [authResolved, authUserId, fetchRequests]);

  useEffect(() => {
    if (!authResolved || !authUserId) return;
    const channel = supabase
      .channel(`requests-${authUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_requests' },
        () => {
          void fetchRequests();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [authResolved, authUserId, fetchRequests]);

  const createGameFromRequest = useCallback(
    async (r: MatchRequestRow) => {
      if (debugRequestsAcceptEnabled()) {
        console.warn('[accl-debug] /requests createGameFromRequest → games.insert path', {
          requestId: r.id,
          request_type: r.request_type,
          visibility: r.visibility ?? null,
          tempo: r.tempo ?? null,
          live_time_control: r.live_time_control ?? null,
          rated: r.rated ?? null,
        });
      }
      const challengeRow = { ...gameInsertFromAcceptedChallenge(r) };
      /** Match request accept: two seated players — never use free-play open-seat RPC here. */
      const gameCreateRes = await supabase.from('games').insert(challengeRow).select('id').single();
      const newGame = gameCreateRes.data;
      const gErr = gameCreateRes.error;
      if (gErr) {
        return {
          error: new Error(supabaseErrText(gErr, 'Could not create the game from this request.')),
        };
      }
      const rawId =
        newGame && typeof newGame === 'object' && 'id' in newGame
          ? String((newGame as { id?: string }).id ?? '').trim()
          : '';
      if (!rawId) {
        return {
          error: new Error(
            'Game was not created (empty server response). Try again, or refresh if the request already resolved.'
          ),
        };
      }
      const gid = rawId;
      const { data: updatedRows, error: uErr } = await supabase
        .from('match_requests')
        .update({
          status: 'accepted',
          resolution_game_id: gid,
          responded_at: new Date().toISOString(),
        })
        .eq('id', r.id)
        .eq('status', 'pending')
        .select('id');
      if (uErr) {
        return {
          error: new Error(
            supabaseErrText(
              uErr,
              'Game may have been created but the match request could not be marked accepted. Refresh match requests.'
            )
          ),
        };
      }
      const n = Array.isArray(updatedRows) ? updatedRows.length : updatedRows ? 1 : 0;
      if (n === 0) {
        return {
          error: new Error(
            'This request is no longer pending — it may have been accepted, cancelled, or declined already. Refresh the page.'
          ),
        };
      }
      return { gameId: gid };
    },
    []
  );

  const acceptRequest = useCallback(
    async (r: MatchRequestRow) => {
      if (!authUserId || r.to_user_id !== authUserId) return;
      if (actionInFlightRef.current) return;
      actionInFlightRef.current = true;
      setBusyReqId(r.id);
      setMessage('');
      try {
        if (debugRequestsAcceptEnabled()) {
          console.warn('[accl-debug] /requests acceptRequest → POST /api/match-requests/accept', {
            requestId: r.id,
            request_type: r.request_type,
            visibility: r.visibility ?? null,
            tempo: r.tempo ?? null,
            live_time_control: r.live_time_control ?? null,
          });
        }
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token?.trim();
        if (!token) {
          setMessage('Sign in to accept a match request.');
          return;
        }
        const httpRes = await fetch('/api/match-requests/accept', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ requestId: r.id }),
        });
        const payload = (await httpRes.json().catch(() => ({}))) as { error?: unknown; gameId?: unknown };
        if (!httpRes.ok) {
          const err =
            typeof payload.error === 'string' && payload.error.trim()
              ? payload.error.trim()
              : `Accept failed (${httpRes.status})`;
          setMessage(err);
          return;
        }
        const gid = typeof payload.gameId === 'string' ? payload.gameId.trim() : '';
        if (!gid) {
          setMessage('Accept succeeded but no game id was returned. Refresh match requests.');
          return;
        }
        setRequests((prev) => prev.filter((x) => x.id !== r.id));
        router.push(`/game/${gid}`);
      } finally {
        actionInFlightRef.current = false;
        setBusyReqId(null);
      }
    },
    [authUserId, router]
  );

  const joinOpenListing = useCallback(
    async (r: MatchRequestRow) => {
      if (!authUserId || r.visibility !== 'open') return;
      if (actionInFlightRef.current) return;
      actionInFlightRef.current = true;
      setBusyReqId(r.id);
      setMessage('');
      try {
        const { data: claimed, error: claimError } = await supabase
          .from('match_requests')
          .update({ to_user_id: authUserId })
          .eq('id', r.id)
          .eq('status', 'pending')
          .eq('visibility', 'open')
          .or(`to_user_id.is.null,to_user_id.eq.${authUserId}`)
          .select('*')
          .single();
        if (claimError) {
          setMessage(claimError.message);
          return;
        }
        const claimedRow = claimed as MatchRequestRow;
        const res = await createGameFromRequest(claimedRow);
        if (res.error) {
          setMessage(res.error.message);
          return;
        }
        setRequests((prev) => prev.filter((x) => x.id !== r.id));
        if (res.gameId) router.push(`/game/${res.gameId}`);
      } finally {
        actionInFlightRef.current = false;
        setBusyReqId(null);
      }
    },
    [authUserId, createGameFromRequest, router]
  );

  const declineRequest = useCallback(
    async (r: MatchRequestRow) => {
      if (!authUserId || r.to_user_id !== authUserId) return;
      if (actionInFlightRef.current) return;
      actionInFlightRef.current = true;
      setBusyReqId(r.id);
      setMessage('');
      try {
        const { error } = await supabase
          .from('match_requests')
          .update({
            status: 'declined',
            responded_at: new Date().toISOString(),
          })
          .eq('id', r.id)
          .eq('status', 'pending')
          .eq('to_user_id', authUserId);
        if (error) {
          setMessage(error.message);
          return;
        }
        setRequests((prev) => prev.filter((x) => x.id !== r.id));
      } finally {
        actionInFlightRef.current = false;
        setBusyReqId(null);
      }
    },
    [authUserId]
  );

  const cancelOutgoing = useCallback(
    async (r: MatchRequestRow) => {
      if (!authUserId || r.from_user_id !== authUserId) return;
      if (actionInFlightRef.current) return;
      actionInFlightRef.current = true;
      setBusyReqId(r.id);
      setMessage('');
      try {
        const { error } = await supabase
          .from('match_requests')
          .update({
            status: 'cancelled',
            responded_at: new Date().toISOString(),
          })
          .eq('id', r.id)
          .eq('status', 'pending')
          .eq('from_user_id', authUserId);
        if (error) {
          setMessage(error.message);
          return;
        }
        setRequests((prev) => prev.filter((x) => x.id !== r.id));
      } finally {
        actionInFlightRef.current = false;
        setBusyReqId(null);
      }
    },
    [authUserId]
  );

  const incoming = useMemo(
    () => requests.filter((r) => r.to_user_id === authUserId && isDirect(r)),
    [requests, authUserId]
  );
  const outgoing = useMemo(
    () => requests.filter((r) => r.from_user_id === authUserId),
    [requests, authUserId]
  );
  const openListings = useMemo(
    () => requests.filter((r) => r.visibility === 'open' && r.from_user_id !== authUserId),
    [requests, authUserId]
  );

  if (!authResolved || !authUserId) {
    return (
      <div className="min-h-screen bg-[#0D1117] flex flex-col text-white">
        <NavigationBar />
        <main className="flex-1 p-6">
          <p className="text-sm text-gray-500">Loading...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col text-white">
      <NavigationBar />
      <main
        data-testid="requests-inbox-root"
        className="flex-1 w-full max-w-[980px] mx-auto p-6"
      >
      <h1 style={{ marginTop: 0 }}>Match requests (inbox)</h1>
      <p className="text-gray-400" style={{ lineHeight: 1.5, maxWidth: 640 }}>
        <strong className="text-gray-200">Direct challenge (private)</strong> — labeled below when someone picked you as opponent.
        Open / public listings are separate.{' '}
        <Link href="/free" className="text-red-300/90 hover:text-red-200 underline-offset-2 hover:underline">
          Open Free play
        </Link>
      </p>
      {message ? <p data-testid="requests-inbox-message">{message}</p> : null}

      <section style={{ marginBottom: 16 }}>
        <h2>Incoming</h2>
        {incoming.length === 0 ? (
          <p>None.</p>
        ) : (
          incoming.map((r) => (
            <div
              key={r.id}
              data-testid={`incoming-request-card-${r.id}`}
              style={{ border: '1px solid #2b3f55', padding: 10, borderRadius: 10, marginBottom: 8 }}
            >
              <p style={{ margin: 0 }}>
                <strong>{r.request_type}</strong> |{' '}
                {gameDisplayTempoLabel({ tempo: r.tempo, liveTimeControl: r.live_time_control })} |{' '}
                {gameRatedListLabel(r.rated)}
              </p>
              <p style={{ margin: '8px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
                From{' '}
                {openIdentity ? (
                  <button
                    type="button"
                    data-testid={`incoming-request-from-${r.from_user_id}`}
                    onClick={() => openIdentity(r.from_user_id)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      color: '#e2e8f0',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      textDecorationStyle: 'dotted',
                      font: 'inherit',
                    }}
                  >
                    {shortPlayerLabel(r.from_user_id, nameById)}
                  </button>
                ) : (
                  <span style={{ color: '#e2e8f0' }}>{shortPlayerLabel(r.from_user_id, nameById)}</span>
                )}
              </p>
              {authUserId && r.white_player_id === authUserId ? (
                <p
                  data-testid={`incoming-request-seat-${r.id}`}
                  style={{ margin: '6px 0 0 0', fontSize: 13, color: '#64748b' }}
                >
                  Your seat: White (move first).
                </p>
              ) : authUserId && r.black_player_id === authUserId ? (
                <p
                  data-testid={`incoming-request-seat-${r.id}`}
                  style={{ margin: '6px 0 0 0', fontSize: 13, color: '#64748b' }}
                >
                  Your seat: Black.
                </p>
              ) : null}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  data-testid={`challenge-accept-${r.id}`}
                  disabled={busyReqId === r.id}
                  onClick={() => void acceptRequest(r)}
                  style={{
                    minHeight: 44,
                    padding: '8px 14px',
                    touchAction: 'manipulation',
                    cursor: busyReqId === r.id ? 'wait' : 'pointer',
                  }}
                >
                  {busyReqId === r.id ? 'Working...' : 'Accept'}
                </button>
                <button
                  type="button"
                  data-testid={`challenge-decline-${r.id}`}
                  disabled={busyReqId === r.id}
                  onClick={() => void declineRequest(r)}
                  style={{
                    minHeight: 44,
                    padding: '8px 14px',
                    touchAction: 'manipulation',
                    cursor: busyReqId === r.id ? 'wait' : 'pointer',
                  }}
                >
                  {busyReqId === r.id ? 'Declining…' : 'Decline'}
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <section style={{ marginBottom: 16 }}>
        <h2>Outgoing — you invited someone</h2>
        {outgoing.length === 0 ? (
          <p>None.</p>
        ) : (
          outgoing.map((r) => (
            <div key={r.id} style={{ border: '1px solid #2b3f55', padding: 10, borderRadius: 10, marginBottom: 8 }}>
              <p style={{ margin: 0 }}>
                <strong>{isDirect(r) ? 'Direct' : 'Open'} </strong>|{' '}
                {gameDisplayTempoLabel({ tempo: r.tempo, liveTimeControl: r.live_time_control })} |{' '}
                {gameRatedListLabel(r.rated)}
              </p>
              {r.to_user_id ? (
                <p style={{ margin: '8px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
                  To{' '}
                  {openIdentity ? (
                    <button
                      type="button"
                      data-testid={`outgoing-request-to-${r.to_user_id}`}
                      onClick={() => openIdentity(r.to_user_id)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        color: '#e2e8f0',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        textDecorationStyle: 'dotted',
                        font: 'inherit',
                      }}
                    >
                      {shortPlayerLabel(r.to_user_id, nameById)}
                    </button>
                  ) : (
                    <span style={{ color: '#e2e8f0' }}>{shortPlayerLabel(r.to_user_id, nameById)}</span>
                  )}
                </p>
              ) : null}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" disabled={busyReqId === r.id} onClick={() => cancelOutgoing(r)}>
                  {busyReqId === r.id ? 'Cancelling...' : 'Cancel'}
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <section>
        <h2>Open / public listings (worldwide)</h2>
        <p style={{ color: '#555', fontSize: 14, marginTop: 0 }}>
          Not the same as a direct challenge — anyone may join these.
        </p>
        {openListings.length === 0 ? (
          <p>None.</p>
        ) : (
          openListings.map((r) => (
            <div key={r.id} style={{ border: '1px solid #2b3f55', padding: 10, borderRadius: 10, marginBottom: 8 }}>
              <p style={{ margin: 0 }}>
                <strong>{r.id.slice(0, 8)}...</strong> |{' '}
                {gameDisplayTempoLabel({ tempo: r.tempo, liveTimeControl: r.live_time_control })} |{' '}
                {gameRatedListLabel(r.rated)}
              </p>
              <p style={{ margin: '8px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
                Host{' '}
                {openIdentity ? (
                  <button
                    type="button"
                    data-testid={`open-listing-host-${r.from_user_id}`}
                    onClick={() => openIdentity(r.from_user_id)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      color: '#e2e8f0',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      textDecorationStyle: 'dotted',
                      font: 'inherit',
                    }}
                  >
                    {shortPlayerLabel(r.from_user_id, nameById)}
                  </button>
                ) : (
                  <span style={{ color: '#e2e8f0' }}>{shortPlayerLabel(r.from_user_id, nameById)}</span>
                )}
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" disabled={busyReqId === r.id} onClick={() => joinOpenListing(r)}>
                  {busyReqId === r.id ? 'Joining...' : 'Join'}
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </main>
    </div>
  );
}

