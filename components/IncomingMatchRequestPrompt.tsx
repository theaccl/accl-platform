'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import {
  acceptMatchRequestViaApi,
  declineIncomingMatchRequest,
  type MatchRequestActionRow,
} from '@/lib/matchRequestClientActions';
import { notifyMatchRequestInboxChanged } from '@/lib/matchRequestInboxEvents';
import {
  incomingMatchRequestKind,
  incomingMatchRequestPromptBody,
  incomingMatchRequestPromptTitle,
} from '@/lib/matchRequestPromptCopy';
import { navigateAfterAcceptIfAllowed } from '@/lib/postAcceptGameNavigation';
import { publicDisplayNameFromProfileUsername } from '@/lib/profileIdentity';
import { supabase } from '@/lib/supabaseClient';

function isIncomingDirect(row: MatchRequestActionRow): boolean {
  return (row.visibility ?? '') !== 'open' && row.to_user_id.length > 0;
}

export function IncomingMatchRequestPrompt() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [pending, setPending] = useState<MatchRequestActionRow | null>(null);
  const [senderLabel, setSenderLabel] = useState('Opponent');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const actionInFlightRef = useRef(false);

  const loadOldestPending = useCallback(async (uid: string) => {
    const { data, error: qErr } = await supabase
      .from('match_requests')
      .select(
        'id,from_user_id,to_user_id,request_type,status,visibility,tempo,live_time_control,rated,created_at',
      )
      .eq('to_user_id', uid)
      .eq('status', 'pending')
      .neq('visibility', 'open')
      .order('created_at', { ascending: true })
      .limit(1);
    if (qErr) return;
    const row = (data?.[0] ?? null) as MatchRequestActionRow | null;
    if (!row || !isIncomingDirect(row)) {
      setPending(null);
      return;
    }
    setPending(row);
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', row.from_user_id)
      .maybeSingle();
    const username = (profile as { username?: string | null } | null)?.username ?? null;
    setSenderLabel(publicDisplayNameFromProfileUsername(username) || 'Opponent');
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const uid = data.session?.user?.id ?? null;
      setAuthUserId(uid);
      if (uid) await loadOldestPending(uid);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const uid = session?.user?.id ?? null;
      setAuthUserId(uid);
      if (uid) void loadOldestPending(uid);
      else {
        setPending(null);
        setError('');
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadOldestPending]);

  useEffect(() => {
    if (!authUserId) return;
    const uid = authUserId;
    const channel = supabase
      .channel(`incoming-match-request-prompt-${uid}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_requests',
          filter: `to_user_id=eq.${uid}`,
        },
        () => {
          void loadOldestPending(uid);
        },
      )
      .subscribe();
    const onInboxChanged = () => {
      void loadOldestPending(uid);
    };
    window.addEventListener('accl-match-requests-inbox-changed', onInboxChanged);
    return () => {
      void supabase.removeChannel(channel);
      window.removeEventListener('accl-match-requests-inbox-changed', onInboxChanged);
    };
  }, [authUserId, loadOldestPending]);

  const closePrompt = useCallback(() => {
    setPending(null);
    setError('');
    setBusy(false);
  }, []);

  const handleAccept = useCallback(async () => {
    if (!pending || !authUserId || actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await acceptMatchRequestViaApi(supabase, authUserId, pending);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      notifyMatchRequestInboxChanged();
      closePrompt();
      await navigateAfterAcceptIfAllowed({
        flow: 'incoming-match-request-prompt',
        pathname,
        router,
        supabase,
        authUserId,
        acceptedGameId: result.gameId,
        acceptedTempoHint: pending.tempo ?? null,
        boardGameFromPage: null,
      });
    } finally {
      actionInFlightRef.current = false;
      setBusy(false);
    }
  }, [authUserId, closePrompt, pathname, pending, router]);

  const handleDecline = useCallback(async () => {
    if (!pending || !authUserId || actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await declineIncomingMatchRequest(supabase, authUserId, pending.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      notifyMatchRequestInboxChanged();
      closePrompt();
      await loadOldestPending(authUserId);
    } finally {
      actionInFlightRef.current = false;
      setBusy(false);
    }
  }, [authUserId, closePrompt, loadOldestPending, pending]);

  if (!authUserId || pathname === '/login' || !pending) {
    return null;
  }

  const kind = incomingMatchRequestKind(pending.request_type);

  return (
    <div
      className="accl-incoming-match-request-prompt"
      data-testid="incoming-match-request-prompt"
      role="dialog"
      aria-modal="true"
      aria-labelledby="incoming-match-request-prompt-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        pointerEvents: 'none',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          pointerEvents: 'auto',
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 400,
          borderRadius: 12,
          border: '1px solid #334155',
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          padding: '20px 22px',
          color: '#f8fafc',
          pointerEvents: 'auto',
        }}
      >
        <p
          id="incoming-match-request-prompt-title"
          style={{
            margin: 0,
            fontSize: 11,
            letterSpacing: '0.12em',
            fontWeight: 700,
            color: '#fca5a5',
          }}
        >
          {incomingMatchRequestPromptTitle(kind)}
        </p>
        <p style={{ margin: '12px 0 18px', fontSize: 15, lineHeight: 1.45 }}>
          {incomingMatchRequestPromptBody(kind, senderLabel)}
        </p>
        {error ? (
          <p
            data-testid="incoming-match-request-prompt-error"
            style={{ margin: '0 0 12px', fontSize: 13, color: '#fecaca' }}
          >
            {error}
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            data-testid="incoming-match-request-decline"
            disabled={busy}
            onClick={() => void handleDecline()}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid #475569',
              background: 'transparent',
              color: '#e2e8f0',
              fontWeight: 600,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            Decline
          </button>
          <button
            type="button"
            data-testid="incoming-match-request-accept"
            disabled={busy}
            onClick={() => void handleAccept()}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#dc2626',
              color: '#fff',
              fontWeight: 700,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
