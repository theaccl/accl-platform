'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  PLAT_MODE_LABELS,
  PLAT_MODE_ORDER,
  type PlatMode,
  coercePlatTimeForMode,
  defaultPlatTimeControl,
  platModeLabel,
  platSelectionToStoredGameFields,
  platTimeOptionsForMode,
} from '@/lib/freePlayModeTimeControl';
import {
  type ChallengeColorPreference,
  resolveChallengeSeatIds,
} from '@/lib/challengeColorPreference';
import { RatedUnratedToggle } from '@/components/RatedUnratedToggle';
import { RequestSuccessBanner } from '@/components/RequestSuccessBanner';
import { userMessageForMatchRequestInsertError } from '@/lib/matchRequestInsertError';
import { logLiveTimeControlInsert, logSupabaseWriteError } from '@/lib/logSupabaseWriteError';
import { publicDisplayNameFromProfileUsername } from '@/lib/profileIdentity';
import {
  formatRatingDisplay,
  modeRatingFromP1Context,
  parseP1FromSnapshotPayload,
  type PublicP1Read,
} from '@/lib/p1PublicRatingRead';
import { validateAcclUsername } from '@/lib/usernameRules';
import { navigateAfterAcceptIfAllowed } from '@/lib/postAcceptGameNavigation';
import { canonicalLiveTimeControlForInsert } from '@/lib/gameTimeControl';
import { supabase } from '@/lib/supabaseClient';
import { useOpenPublicIdentityCard } from '@/components/identity/PublicIdentityCardContext';

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  rating: number;
};

function challengeColorSummaryLine(pref: ChallengeColorPreference): string {
  if (pref === 'white') return 'You requested White (move first).';
  if (pref === 'black') return 'You requested Black.';
  return 'Colors were assigned at random when you sent.';
}

function tcChipStyle(active: boolean, disabled: boolean): CSSProperties {
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

type Props = {
  /** Anchor id for in-page links */
  anchorId?: string;
  /**
   * One primary action: resolve opponent (email or validated username) and send the challenge.
   * Use on `/free/create` so the flow cannot appear to do nothing.
   */
  singleStep?: boolean;
};

type LookupOutcome =
  | { ok: true; profile: Profile }
  | {
      ok: false;
      message: string;
      code: 'empty' | 'invalid_username' | 'user_not_found' | 'lookup_failed';
    };

async function lookupProfileForChallenge(raw: string): Promise<LookupOutcome> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: 'Enter an opponent username', code: 'empty' };
  }
  const isEmailShape = trimmed.includes('@');
  let normalizedUsername: string | null = null;
  if (!isEmailShape) {
    const v = validateAcclUsername(trimmed);
    if (!v.ok) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[direct-challenge] invalid username', trimmed, v.error);
      }
      return { ok: false, message: v.error, code: 'invalid_username' };
    }
    normalizedUsername = v.username;
  }

  const { data, error } = await supabase.rpc('resolve_profile_for_challenge_lookup', {
    p_username: normalizedUsername,
    p_email: isEmailShape ? trimmed.toLowerCase() : null,
  });
  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[direct-challenge] profile lookup rpc', error);
    }
    return { ok: false, message: 'Could not look up opponent. Try again.', code: 'lookup_failed' };
  }
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, message: 'User not found', code: 'user_not_found' };
  }
  const row = data as Record<string, unknown>;
  const id = row.id != null ? String(row.id) : '';
  if (!id) {
    return { ok: false, message: 'User not found', code: 'user_not_found' };
  }
  const ratingRaw = row.rating;
  const rating =
    typeof ratingRaw === 'number' && Number.isFinite(ratingRaw)
      ? ratingRaw
      : typeof ratingRaw === 'string' && Number.isFinite(Number(ratingRaw))
        ? Number(ratingRaw)
        : 0;
  return {
    ok: true,
    profile: {
      id,
      email: row.email != null && String(row.email).trim() !== '' ? String(row.email) : null,
      username: row.username != null && String(row.username).trim() !== '' ? String(row.username) : null,
      rating,
    },
  };
}

async function loadOpponentP1Snapshot(profile: Profile): Promise<{
  p1: PublicP1Read | null;
  legacyRating: number | null;
}> {
  const legacyRating =
    typeof profile.rating === 'number' && Number.isFinite(profile.rating) ? profile.rating : null;
  const { data, error } = await supabase.rpc('get_public_profile_snapshot', {
    p_profile_id: profile.id,
  });
  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[direct-challenge] get_public_profile_snapshot', error);
    }
    return { p1: null, legacyRating };
  }
  return { p1: parseP1FromSnapshotPayload(data), legacyRating };
}

export function DirectChallengePanel({ anchorId = 'direct-challenge', singleStep = false }: Props) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const openIdentity = useOpenPublicIdentityCard();
  const [opponentEmail, setOpponentEmail] = useState('');
  const [opponentUserId, setOpponentUserId] = useState('');
  const [opponentResolvedUsername, setOpponentResolvedUsername] = useState<string | null>(null);
  /** Used only to reject username == account email local-part; never rendered. */
  const [opponentProfileEmail, setOpponentProfileEmail] = useState<string | null>(null);
  const [opponentP1, setOpponentP1] = useState<PublicP1Read | null>(null);
  const [opponentLegacyRating, setOpponentLegacyRating] = useState<number | null>(null);
  const [challengeSentBanner, setChallengeSentBanner] = useState(false);
  const [challengeSentDetail, setChallengeSentDetail] = useState<string | null>(null);
  const [challengeBusy, setChallengeBusy] = useState(false);
  const [platMode, setPlatMode] = useState<PlatMode>('blitz');
  const [platClock, setPlatClock] = useState<string>(() => defaultPlatTimeControl('blitz'));
  const [challengeColorPreference, setChallengeColorPreference] =
    useState<ChallengeColorPreference>('white');
  const [challengeRated, setChallengeRated] = useState(true);

  const handlePlatModeChange = (m: PlatMode) => {
    setPlatMode(m);
    setPlatClock((prev) => coercePlatTimeForMode(m, prev));
  };
  const [message, setMessage] = useState('');
  const [findBusy, setFindBusy] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  /** When set, subscribe to this row so the challenger auto-navigates when it is accepted. */
  const [pendingChallengeRequestId, setPendingChallengeRequestId] = useState<string | null>(null);
  const urlOpponentSeeded = useRef(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setAuthUserId(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const raw = searchParams.get('mode')?.toLowerCase().trim();
    if (!raw) return;
    if (!(PLAT_MODE_ORDER as readonly string[]).includes(raw)) return;
    const m = raw as PlatMode;
    setPlatMode(m);
    setPlatClock((prev) => coercePlatTimeForMode(m, prev));
  }, [searchParams]);

  useEffect(() => {
    const rawRated = searchParams.get('rated')?.toLowerCase().trim();
    if (rawRated === 'true') setChallengeRated(true);
    else if (rawRated === 'false') setChallengeRated(false);
  }, [searchParams]);

  /** Prefill opponent from `/free/create?opponent=<username>` (no new routes). */
  useEffect(() => {
    if (urlOpponentSeeded.current) return;
    if (typeof window === 'undefined') return;
    const raw = new URLSearchParams(window.location.search).get('opponent')?.trim();
    if (!raw) return;
    urlOpponentSeeded.current = true;
    const decoded = decodeURIComponent(raw);
    void (async () => {
      setFindBusy(true);
      setMessage('');
      setChallengeSentBanner(false);
      setChallengeSentDetail(null);
      try {
        const result = await lookupProfileForChallenge(decoded);
        if (!result.ok) {
          setOpponentEmail(decoded);
          setMessage(result.message);
          setOpponentUserId('');
          setOpponentResolvedUsername(null);
          setOpponentProfileEmail(null);
          setOpponentP1(null);
          setOpponentLegacyRating(null);
          return;
        }
        const p = result.profile;
        const snap = await loadOpponentP1Snapshot(p);
        setOpponentUserId(p.id);
        setOpponentResolvedUsername(p.username?.trim() || null);
        setOpponentProfileEmail(p.email ?? null);
        setOpponentP1(snap.p1);
        setOpponentLegacyRating(snap.legacyRating);
        setOpponentEmail(p.username?.trim() ?? decoded);
      } finally {
        setFindBusy(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!pendingChallengeRequestId) return;
    const channel = supabase
      .channel(`challenge-accept-${pendingChallengeRequestId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'match_requests',
          filter: `id=eq.${pendingChallengeRequestId}`,
        },
        (payload) => {
          const p = payload as {
            eventType?: string;
            new: { status?: string; resolution_game_id?: string | null };
            old: { status?: string };
          };
          if (p.eventType !== 'UPDATE') return;
          const oldSt = p.old?.status;
          if (oldSt !== undefined && oldSt !== 'pending') return;
          const row = p.new;
          if (row.status === 'accepted' && row.resolution_game_id) {
            void (async () => {
              const gid = String(row.resolution_game_id).trim();
              const reqRow = row as { tempo?: string | null };
              const acceptedTempo = reqRow.tempo ?? null;
              const { data: auth } = await supabase.auth.getUser();
              await navigateAfterAcceptIfAllowed({
                flow: 'direct-challenge-panel',
                pathname,
                router,
                supabase,
                authUserId: auth.user?.id ?? null,
                acceptedGameId: gid,
                acceptedTempoHint: acceptedTempo,
                boardGameFromPage: null,
              });
              setPendingChallengeRequestId(null);
            })();
          }
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [pendingChallengeRequestId, router, pathname]);

  const findOpponent = async () => {
    if (findBusy || challengeBusy) return;
    setMessage('');
    setChallengeSentBanner(false);
    setChallengeSentDetail(null);

    setFindBusy(true);
    try {
      const result = await lookupProfileForChallenge(opponentEmail);
      if (!result.ok) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[direct-challenge] findOpponent failed', result.code, result.message);
        }
        setMessage(result.message);
        setOpponentUserId('');
        setOpponentResolvedUsername(null);
        setOpponentProfileEmail(null);
        setOpponentP1(null);
        setOpponentLegacyRating(null);
        return;
      }

      const p = result.profile;
      const snap = await loadOpponentP1Snapshot(p);
      setOpponentUserId(p.id);
      setOpponentResolvedUsername(p.username?.trim() || null);
      setOpponentProfileEmail(p.email ?? null);
      setOpponentP1(snap.p1);
      setOpponentLegacyRating(snap.legacyRating);
      setOpponentEmail(p.username?.trim() ?? '');
      setMessage('');
    } finally {
      setFindBusy(false);
    }
  };

  const sendChallengeForResolvedOpponent = async (opponentId: string) => {
    if (challengeBusy) return;

    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      setMessage('You must be logged in first');
      return;
    }

    const currentUserId = authData.user.id;
    const trimmedOpponent = opponentId.trim();

    if (trimmedOpponent === currentUserId) {
      setMessage('You cannot challenge yourself.');
      return;
    }

    const { whiteId: challengeWhiteId, blackId: challengeBlackId } = resolveChallengeSeatIds(
      challengeColorPreference,
      currentUserId,
      trimmedOpponent
    );

    let challengeTempo: string;
    let challengeLtc: string;
    try {
      const stored = platSelectionToStoredGameFields(platMode, platClock);
      challengeTempo = stored.tempo;
      const t = challengeTempo === 'daily' ? 'daily' : 'live';
      challengeLtc = canonicalLiveTimeControlForInsert(t, stored.live_time_control) ?? stored.live_time_control;
    } catch {
      setMessage('Invalid mode and time control. Pick a valid combination.');
      return;
    }

    const { data: pendingDup, error: dupErr } = await supabase
      .from('match_requests')
      .select('id')
      .eq('from_user_id', currentUserId)
      .eq('to_user_id', trimmedOpponent)
      .eq('tempo', challengeTempo)
      .eq('live_time_control', challengeLtc)
      .eq('status', 'pending')
      .eq('request_type', 'challenge')
      .eq('white_player_id', challengeWhiteId)
      .eq('black_player_id', challengeBlackId)
      .eq('rated', challengeRated)
      .limit(1)
      .maybeSingle();

    if (dupErr) {
      logSupabaseWriteError('Challenge opponent → match_requests duplicate check (select)', {
        table: 'match_requests',
        operation: 'select',
        payload: { tempo: challengeTempo, live_time_control: challengeLtc, platMode, platClock },
        error: dupErr,
      });
      if (process.env.NODE_ENV === 'development') {
        console.warn('[direct-challenge] duplicate check error', dupErr);
      }
      setMessage(dupErr.message);
      return;
    }
    if (pendingDup) {
      setMessage(
        'You already have a pending challenge for this mode, time control, color, and match type (rated/unrated).'
      );
      return;
    }

    setChallengeBusy(true);
    setMessage('');
    setChallengeSentBanner(false);
    setChallengeSentDetail(null);
    setPendingChallengeRequestId(null);
    try {
      logLiveTimeControlInsert('Challenge request create', {
        table: 'match_requests',
        operation: 'insert',
        tempo: challengeTempo,
        rawFromUiOrRow: coercePlatTimeForMode(platMode, platClock),
        finalForSupabase: challengeLtc,
      });
      const { data: inserted, error } = await supabase
        .from('match_requests')
        .insert({
          from_user_id: currentUserId,
          to_user_id: trimmedOpponent,
          request_type: 'challenge',
          source_game_id: null,
          white_player_id: challengeWhiteId,
          black_player_id: challengeBlackId,
          status: 'pending',
          visibility: 'direct',
          tempo: challengeTempo,
          live_time_control: challengeLtc,
          rated: challengeRated,
        })
        .select('id')
        .single();

      if (error) {
        logSupabaseWriteError('Challenge opponent → match_requests insert', {
          table: 'match_requests',
          operation: 'insert',
          payload: {
            tempo: challengeTempo,
            live_time_control: challengeLtc,
            raw_from_ui: coercePlatTimeForMode(platMode, platClock),
            request_type: 'challenge',
          },
          error,
        });
        if (process.env.NODE_ENV === 'development') {
          console.warn('[direct-challenge] match_requests insert failed', error);
        }
        setMessage(userMessageForMatchRequestInsertError(error));
        return;
      }
      if (!inserted?.id) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[direct-challenge] insert returned no id');
        }
        setMessage('Could not confirm challenge request was saved.');
        return;
      }
      const detail = `${challengeColorSummaryLine(challengeColorPreference)} They can accept or decline under Match requests. No board until they accept.`;
      setChallengeSentDetail(detail);
      setMessage('');
      setChallengeSentBanner(true);
      setPendingChallengeRequestId(inserted.id);
      setOpponentEmail('');
      setOpponentUserId('');
      setOpponentResolvedUsername(null);
      setOpponentProfileEmail(null);
      setOpponentP1(null);
      setOpponentLegacyRating(null);
    } finally {
      setChallengeBusy(false);
    }
  };

  const sendManualChallengeRequest = async () => {
    const opponentId = opponentUserId.trim();
    if (!opponentId) {
      setMessage('Set opponent first (use Find opponent)');
      return;
    }
    await sendChallengeForResolvedOpponent(opponentId);
  };

  const sendChallengeSingleStep = async () => {
    if (challengeBusy || findBusy) return;
    setChallengeSentBanner(false);
    setChallengeSentDetail(null);

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setMessage('You must be logged in first');
      return;
    }
    const currentUserId = authData.user.id;

    let resolvedOpponent: Profile | null = null;
    setFindBusy(true);
    try {
      const result = await lookupProfileForChallenge(opponentEmail);
      if (!result.ok) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[direct-challenge] single-step lookup failed', result.code, result.message);
        }
        setMessage(result.message);
        setOpponentUserId('');
        setOpponentResolvedUsername(null);
        setOpponentProfileEmail(null);
        setOpponentP1(null);
        setOpponentLegacyRating(null);
        return;
      }

      const p = result.profile;
      const snap = await loadOpponentP1Snapshot(p);
      setOpponentUserId(p.id);
      setOpponentResolvedUsername(p.username?.trim() || null);
      setOpponentProfileEmail(p.email ?? null);
      setOpponentP1(snap.p1);
      setOpponentLegacyRating(snap.legacyRating);
      setOpponentEmail(p.username?.trim() ?? '');

      if (p.id === currentUserId) {
        setMessage('You cannot challenge yourself.');
        return;
      }
      resolvedOpponent = p;
    } finally {
      setFindBusy(false);
    }

    if (resolvedOpponent) {
      await sendChallengeForResolvedOpponent(resolvedOpponent.id);
    }
  };

  const challengeOpponentIsSelf = Boolean(
    authUserId && opponentUserId && opponentUserId === authUserId
  );

  const { ratingTempo, ratingLtc } = useMemo(() => {
    try {
      const r = platSelectionToStoredGameFields(platMode, platClock);
      return { ratingTempo: r.tempo, ratingLtc: r.live_time_control };
    } catch {
      return { ratingTempo: 'live', ratingLtc: '5m' };
    }
  }, [platMode, platClock]);
  const opponentRatingForSelectedMode = modeRatingFromP1Context(
    opponentP1,
    'free',
    ratingTempo,
    ratingLtc,
    opponentLegacyRating,
  );

  const controlsDisabled = challengeBusy || findBusy;

  const opponentInputStyle: CSSProperties = {
    display: 'block',
    marginBottom: 8,
    padding: '10px 12px',
    width: '100%',
    maxWidth: 360,
    boxSizing: 'border-box',
    background: controlsDisabled ? '#0c0c0c' : '#0f0f0f',
    color: '#f5f5f5',
    border: '1px solid #4a4a4a',
    borderRadius: 6,
    fontSize: 14,
  };

  const opponentLookupBlock = (opts: { showMessageBelow: boolean }) => (
    <>
      <label
        htmlFor={`${anchorId}-lookup`}
        style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#bdbdbd', marginBottom: 6 }}
      >
        Opponent username
      </label>
      <input
        id={`${anchorId}-lookup`}
        data-testid="challenge-opponent-lookup"
        type="text"
        placeholder="@username"
        value={opponentEmail}
        onChange={(e) => {
          setOpponentEmail(e.target.value);
          setOpponentUserId('');
          setOpponentResolvedUsername(null);
          setOpponentProfileEmail(null);
          setOpponentP1(null);
          setOpponentLegacyRating(null);
          setChallengeSentBanner(false);
          setChallengeSentDetail(null);
        }}
        disabled={controlsDisabled}
        autoComplete="off"
        style={opponentInputStyle}
      />
      {opts.showMessageBelow && message ? (
        <p
          data-testid="challenge-opponent-error"
          style={{ color: '#fecaca', margin: '0 0 14px 0', fontSize: 14 }}
        >
          {message}
        </p>
      ) : null}
    </>
  );

  return (
    <section data-testid="direct-challenge-panel" style={{ marginBottom: 20 }}>
      <div
        id={anchorId}
        style={{
          padding: '16px 18px',
          border: '2px solid #7c3aed',
          borderRadius: 12,
          background: '#1a1025',
          boxShadow: '0 0 0 1px rgba(124, 58, 237, 0.25)',
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 22, color: '#f5f3ff' }}>
          Direct challenge (private)
        </h2>
        <p
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: '#c4b5fd',
            margin: '0 0 10px 0',
            letterSpacing: '0.08em',
          }}
        >
          INVITE ONE PERSON — NOT POSTED PUBLICLY
        </p>
        <p style={{ fontSize: 14, color: '#d4d4d8', margin: '0 0 14px 0', lineHeight: 1.5 }}>
          Find them by <strong>username</strong>, pick tempo and color, then send. They accept under{' '}
          <Link href="/requests" style={{ color: '#a5b4fc', fontWeight: 700 }}>
            Match requests
          </Link>
          . This is <em>not</em> the same as <strong>Find Match</strong> (open/public pairing on{' '}
          <Link href="/free/play" style={{ color: '#a5b4fc', fontWeight: 700 }}>
            /free/play
          </Link>
          ).
        </p>
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 14px 0', lineHeight: 1.45 }}>
          Mode and time controls match <strong>Find Match</strong> on Free play (bullet / blitz / rapid / daily).
          Same rules as open pairing — plus <strong>your color preference</strong> and opponent identity.
        </p>

        {!singleStep && message ? (
          <p style={{ color: '#fecaca', margin: '0 0 12px 0', fontSize: 14 }}>{message}</p>
        ) : null}

        {singleStep ? opponentLookupBlock({ showMessageBelow: true }) : null}

        <div
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #4c1d95',
            background: '#0f172a',
            fontSize: 13,
            color: '#e9d5ff',
          }}
          data-testid="direct-challenge-selection-summary"
        >
          <span style={{ color: '#94a3b8' }}>Selected: </span>
          <strong>
            {platModeLabel(platMode)} ·{' '}
            {platTimeOptionsForMode(platMode).find((o) => o.id === platClock)?.label ?? platClock} ·{' '}
            {challengeRated ? 'Rated' : 'Unrated'}
          </strong>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#d1d5db', marginBottom: 6 }}>Mode</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PLAT_MODE_ORDER.map((m) => (
              <button
                key={m}
                type="button"
                data-testid={`direct-challenge-mode-${m}`}
                disabled={controlsDisabled}
                aria-pressed={platMode === m}
                onClick={() => handlePlatModeChange(m)}
                style={tcChipStyle(platMode === m, controlsDisabled)}
              >
                {PLAT_MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#bdbdbd', marginBottom: 6 }}>Time control</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {platTimeOptionsForMode(platMode).map((opt) => (
              <button
                key={opt.id}
                type="button"
                data-testid={`direct-challenge-clock-${opt.id.replace(/\+/g, 'plus')}`}
                disabled={controlsDisabled}
                aria-pressed={platClock === opt.id}
                onClick={() => setPlatClock(opt.id)}
                style={tcChipStyle(platClock === opt.id, controlsDisabled)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <RatedUnratedToggle
          value={challengeRated}
          onChange={setChallengeRated}
          disabled={controlsDisabled}
          testIdPrefix={`${anchorId}-match`}
        />
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '-4px 0 14px 0', lineHeight: 1.45 }}>
          Carried into the game row when they accept — must match what both players expect.
        </p>

        <label
          htmlFor={`${anchorId}-color`}
          style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#bdbdbd', marginBottom: 6 }}
        >
          Your color
        </label>
        <select
          id={`${anchorId}-color`}
          value={challengeColorPreference}
          onChange={(e) => setChallengeColorPreference(e.target.value as ChallengeColorPreference)}
          disabled={controlsDisabled}
          style={{
            display: 'block',
            width: '100%',
            maxWidth: 360,
            marginBottom: 12,
            padding: '10px 12px',
            boxSizing: 'border-box',
            background: controlsDisabled ? '#0c0c0c' : '#0f0f0f',
            color: '#f5f5f5',
            border: '1px solid #4a4a4a',
            borderRadius: 6,
            fontSize: 14,
          }}
        >
          <option value="white">White — you move first</option>
          <option value="black">Black</option>
          <option value="random">Random — assigned when you send</option>
        </select>

        {singleStep && opponentUserId && !challengeOpponentIsSelf ? (
          <div
            data-testid="challenge-opponent-resolved-preview"
            style={{
              marginTop: 8,
              marginBottom: 12,
              padding: 12,
              borderRadius: 8,
              border: '1px solid #2d6a4f',
              background: '#0d1f15',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: '#7dce9e', marginBottom: 6 }}>OPPONENT</div>
            {openIdentity ? (
              <button
                type="button"
                data-testid={`challenge-opponent-name-${opponentUserId}`}
                onClick={() => openIdentity(opponentUserId)}
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: '#f4fff8',
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textDecorationStyle: 'dotted',
                  textUnderlineOffset: '3px',
                  textAlign: 'left',
                }}
              >
                {publicDisplayNameFromProfileUsername(
                  opponentResolvedUsername,
                  opponentUserId,
                  opponentProfileEmail,
                )}
              </button>
            ) : (
              <div style={{ fontSize: 17, fontWeight: 700, color: '#f4fff8' }}>
                {publicDisplayNameFromProfileUsername(
                  opponentResolvedUsername,
                  opponentUserId,
                  opponentProfileEmail,
                )}
              </div>
            )}
          </div>
        ) : null}

        {!singleStep ? opponentLookupBlock({ showMessageBelow: false }) : null}

        {!singleStep ? (
          <>
            <button
              type="button"
              data-testid="challenge-find-opponent"
              onClick={() => void findOpponent()}
              disabled={controlsDisabled}
              style={{
                padding: '10px 16px',
                minHeight: 44,
                marginBottom: 8,
                background: controlsDisabled ? '#1e3a5f' : '#2563eb',
                color: '#ffffff',
                border: `1px solid ${controlsDisabled ? '#2c5282' : '#3b82f6'}`,
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 14,
                cursor: controlsDisabled ? 'not-allowed' : 'pointer',
                touchAction: 'manipulation',
              }}
            >
              {findBusy ? 'Finding…' : 'Find opponent'}
            </button>

            {opponentUserId && challengeOpponentIsSelf ? (
              <p style={{ color: '#fecaca', margin: '8px 0' }}>You cannot challenge yourself.</p>
            ) : opponentUserId ? (
              <div
                data-testid={`user-row-${opponentUserId}`}
                style={{
                  marginTop: 8,
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid #2d6a4f',
                  background: '#0d1f15',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: '#7dce9e', marginBottom: 6 }}>
                  OPPONENT FOUND
                </div>
                {openIdentity ? (
                  <button
                    type="button"
                    data-testid={`challenge-opponent-name-${opponentUserId}`}
                    onClick={() => openIdentity(opponentUserId)}
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: '#f4fff8',
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      textDecorationStyle: 'dotted',
                      textUnderlineOffset: '3px',
                      textAlign: 'left',
                    }}
                  >
                    {publicDisplayNameFromProfileUsername(
                      opponentResolvedUsername,
                      opponentUserId,
                      opponentProfileEmail,
                    )}
                  </button>
                ) : (
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#f4fff8' }}>
                    {publicDisplayNameFromProfileUsername(
                      opponentResolvedUsername,
                      opponentUserId,
                      opponentProfileEmail,
                    )}
                  </div>
                )}
                <div style={{ marginTop: 6, color: '#b8e3c9' }}>
                  Rating: {formatRatingDisplay(opponentRatingForSelectedMode)}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: '#9ca3af', margin: '8px 0' }}>
            Run <strong>Find opponent</strong> after entering their username.
          </p>
            )}

            <button
              data-testid="challenge-send-submit"
              type="button"
              onClick={() => void sendManualChallengeRequest()}
              disabled={controlsDisabled || challengeOpponentIsSelf || !opponentUserId}
              style={{
                padding: '12px 16px',
                minHeight: 48,
                marginTop: 4,
                background:
                  controlsDisabled || challengeOpponentIsSelf || !opponentUserId ? '#3f3f46' : '#7c3aed',
                color: '#ffffff',
                border: '1px solid #8b5cf6',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 15,
                cursor:
                  controlsDisabled || challengeOpponentIsSelf || !opponentUserId
                    ? 'not-allowed'
                    : 'pointer',
                touchAction: 'manipulation',
              }}
            >
              {challengeBusy ? 'Sending…' : 'Send direct challenge'}
            </button>
          </>
        ) : (
          <button
            data-testid="challenge-send-submit"
            type="button"
            onClick={() => void sendChallengeSingleStep()}
            disabled={controlsDisabled}
            style={{
              padding: '12px 18px',
              minHeight: 48,
              marginTop: 4,
              width: '100%',
              maxWidth: 360,
              boxSizing: 'border-box',
              background: controlsDisabled ? '#3f3f46' : '#7c3aed',
              color: '#ffffff',
              border: '1px solid #8b5cf6',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 16,
              cursor: controlsDisabled ? 'not-allowed' : 'pointer',
              touchAction: 'manipulation',
            }}
          >
            {findBusy ? 'Looking up…' : challengeBusy ? 'Sending…' : 'Send challenge'}
          </button>
        )}
      </div>
      {challengeSentBanner ? (
        <div data-testid="challenge-sent-awaiting">
          <RequestSuccessBanner headline="Challenge sent — awaiting response" detail={challengeSentDetail ?? undefined} />
        </div>
      ) : null}
    </section>
  );
}
