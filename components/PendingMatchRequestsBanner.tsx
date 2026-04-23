'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { acclPerfMark, acclPerfTime } from '@/lib/acclPerfDebug';
import { supabase } from '@/lib/supabaseClient';

/**
 * Global surface for incoming pending match requests (direct challenges, rematches, etc.).
 * The home page also shows a count on the /requests link, but that sits far below the fold.
 */
export function PendingMatchRequestsBanner() {
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const [count, setCount] = useState(0);

  const refresh = useCallback(async (uid: string) => {
    const t = acclPerfTime('PendingMatchRequestsBanner.refresh');
    const { count: c, error } = await supabase
      .from('match_requests')
      .select('id', { count: 'exact', head: true })
      .eq('to_user_id', uid)
      .eq('status', 'pending');
    if (error) {
      if (typeof console !== 'undefined' && typeof console.log === 'function') {
        console.log('Pending match requests count:', error.message);
      }
      t.end({ error: error.message });
      return;
    }
    setCount(c ?? 0);
    t.end({ count: c ?? 0 });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      setResolved(true);
      if (id) await refresh(id);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const id = session?.user?.id ?? null;
      setUserId(id);
      if (id) void refresh(id);
      else setCount(0);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    acclPerfMark('PendingMatchRequestsBanner.realtime.subscribe', { userId });
    const channel = supabase
      .channel(`global-pending-mr-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_requests',
          /** Was unfiltered → every row worldwide triggered refresh (major prod perf hit). */
          filter: `to_user_id=eq.${userId}`,
        },
        () => {
          void refresh(userId);
        }
      )
      .subscribe();
    /** Backup poll only — realtime handles inbox changes. */
    const poll = window.setInterval(() => {
      void refresh(userId);
    }, 30_000);
    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(poll);
    };
  }, [userId, refresh]);

  if (!resolved || !userId || pathname === '/login') return null;
  if (count <= 0) return null;

  const label = count > 99 ? '99+' : String(count);

  return (
    <div
      data-testid="pending-match-requests-banner"
      role="status"
      aria-live="polite"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        width: '100%',
        boxSizing: 'border-box',
        padding: '10px 16px',
        background: 'linear-gradient(180deg, #7f1d1d 0%, #991b1b 100%)',
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        borderBottom: '1px solid rgba(0,0,0,0.2)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          minWidth: 22,
          height: 22,
          padding: '0 7px',
          borderRadius: 11,
          background: '#fff',
          color: '#991b1b',
          fontSize: 12,
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
        }}
      >
        {label}
      </span>
      <span>
        Pending match request{count === 1 ? '' : 's'} — respond to accept or decline
      </span>
      <Link
        href="/requests"
        style={{
          marginLeft: 4,
          padding: '6px 12px',
          borderRadius: 6,
          background: '#fff',
          color: '#991b1b',
          textDecoration: 'none',
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        Open inbox
      </Link>
    </div>
  );
}
