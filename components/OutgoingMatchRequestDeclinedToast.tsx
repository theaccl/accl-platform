'use client';

import { useEffect, useRef, useState } from 'react';

import { outgoingDeclinedFeedbackMessage } from '@/lib/matchRequestPromptCopy';
import { supabase } from '@/lib/supabaseClient';

const TOAST_MS = 6000;

export function OutgoingMatchRequestDeclinedToast() {
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setAuthUserId(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthUserId(session?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authUserId) return;
    const uid = authUserId;

    const showToast = (requestType: string) => {
      setMessage(outgoingDeclinedFeedbackMessage(requestType));
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        setMessage(null);
        hideTimerRef.current = null;
      }, TOAST_MS);
    };

    const channel = supabase
      .channel(`outgoing-match-request-declined-${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'match_requests',
          filter: `from_user_id=eq.${uid}`,
        },
        (payload) => {
          const p = payload as {
            old?: { status?: string };
            new?: { status?: string; request_type?: string };
          };
          const oldSt = p.old?.status;
          if (oldSt !== undefined && oldSt !== 'pending') return;
          const row = p.new;
          if (String(row?.status ?? '') !== 'declined') return;
          showToast(String(row?.request_type ?? ''));
        },
      )
      .subscribe();

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [authUserId]);

  if (!message) return null;

  return (
    <div
      data-testid="outgoing-match-request-declined-toast"
      role="status"
      aria-live="assertive"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 210,
        maxWidth: 'min(92vw, 420px)',
        padding: '12px 18px',
        borderRadius: 10,
        background: '#1e293b',
        border: '1px solid #475569',
        color: '#f8fafc',
        fontSize: 14,
        fontWeight: 600,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        pointerEvents: 'none',
      }}
    >
      {message}
    </div>
  );
}
