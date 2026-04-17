'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { gameDisplayTempoLabel } from '@/lib/gameDisplayLabel';
import { gameRatedListLabel } from '@/lib/gameRated';
import { supabase } from '@/lib/supabaseClient';
import NavigationBar from '@/components/NavigationBar';

type PublicHistoryRow = {
  game_id: string;
  opponent_id: string | null;
  opponent_username: string | null;
  result: string | null;
  end_reason: string | null;
  finished_at: string | null;
  tempo: string | null;
  live_time_control: string | null;
  rated: boolean | null;
  play_context: string | null;
  source_type: string | null;
  public_replay?: boolean | null;
};

type PublicProfileLite = {
  profile: { id: string; username: string | null; created_at: string | null };
};

function resultLabel(r: string | null): string {
  if (!r) return 'Unknown';
  if (r === 'white_win') return 'White win';
  if (r === 'black_win') return 'Black win';
  if (r === 'draw' || r === '1/2-1/2') return 'Draw';
  return r.replace(/_/g, ' ');
}

function endReasonLabel(er: string | null): string {
  if (!er) return '';
  return er.replace(/_/g, ' ');
}

export default function PublicProfileHistoryPage() {
  const params = useParams<{ id: string }>();
  const profileId = String(params?.id ?? '').trim();
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfileLite['profile'] | null>(null);
  const [rows, setRows] = useState<PublicHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setViewerId(data.user?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!profileId) {
      setLoading(false);
      setMessage('Invalid profile id.');
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setMessage('');

      const { data: pData, error: pErr } = await supabase.rpc('get_public_profile_snapshot', {
        p_profile_id: profileId,
      });
      if (cancelled) return;
      if (pErr) {
        setMessage(pErr.message);
        setLoading(false);
        return;
      }
      if (!pData) {
        setMessage('Profile not found.');
        setLoading(false);
        return;
      }
      const lite = pData as PublicProfileLite;
      setProfile(lite.profile);

      const { data: hData, error: hErr } = await supabase.rpc('get_public_profile_history', {
        p_profile_id: profileId,
        p_limit: 80,
      });
      if (hErr) {
        setRows([]);
        setMessage(hErr.message);
        setLoading(false);
        return;
      }
      setRows((hData ?? []) as PublicHistoryRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const isSelf = useMemo(() => viewerId != null && viewerId === profileId, [viewerId, profileId]);
  const titleName = profile?.username?.trim() || 'Player';

  if (loading) {
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
        data-testid="public-profile-history-root"
        className="flex-1 w-full max-w-[980px] mx-auto px-4 pt-6 pb-12 sm:pb-16"
      >
      <h1 style={{ marginTop: 0 }}>Public Match History</h1>
      <p style={{ marginTop: 0, color: '#cbd5e1' }}>
        {titleName} · finished timeline
      </p>
      <p style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 0 }}>
        <Link href={`/profile/${profileId}`} style={{ color: '#93c5fd' }}>
          Public profile
        </Link>
        {isSelf ? (
          <Link href="/trainer/review" style={{ color: '#93c5fd' }}>
            Your finished games
          </Link>
        ) : null}
      </p>
      {message ? (
        <p role="alert" style={{ color: '#fecaca' }}>
          {message}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <section
          data-testid="public-profile-history-empty"
          style={{ border: '1px dashed #38506e', borderRadius: 10, padding: 12, color: '#cbd5e1' }}
        >
          No public finished history yet.
        </section>
      ) : (
        <section data-testid="public-profile-history-list" style={{ display: 'grid', gap: 10 }}>
          {rows.map((r) => (
            <article
              key={r.game_id}
              data-testid={`public-history-row-${r.game_id}`}
              style={{ border: '1px solid #2f3f54', borderRadius: 10, padding: 12, background: '#111a27' }}
            >
              <p style={{ margin: 0, color: '#f1f5f9', fontWeight: 700 }}>
                {resultLabel(r.result)}
                {r.end_reason ? ` · ${endReasonLabel(r.end_reason)}` : ''}
              </p>
              <p style={{ margin: '6px 0 0 0', color: '#cbd5e1', fontSize: 13 }}>
                {gameDisplayTempoLabel({ tempo: r.tempo, liveTimeControl: r.live_time_control })} ·{' '}
                {gameRatedListLabel(r.rated)} · {r.play_context ?? 'context n/a'}
              </p>
              <p style={{ margin: '4px 0 0 0', color: '#9fb0c5', fontSize: 12 }}>
                Opponent: {r.opponent_username?.trim() || r.opponent_id || 'Unknown'} · Finished:{' '}
                {r.finished_at ? new Date(r.finished_at).toLocaleString() : 'unknown'}
              </p>
              <p style={{ margin: '4px 0 0 0', color: '#9fb0c5', fontSize: 12 }}>
                Game ID: <code>{r.game_id}</code>
              </p>
              <p style={{ margin: '8px 0 0 0', fontSize: 12, color: r.public_replay ? '#86efac' : '#fca5a5' }}>
                {r.public_replay ? 'Replay available (public, read-only)' : 'Replay unavailable'}
              </p>
              <p style={{ margin: '10px 0 0 0' }}>
                {r.public_replay ? (
                  <Link
                    href={`/game/${r.game_id}?public=1&back=${encodeURIComponent(`/profile/${profileId}/history`)}`}
                    style={{ color: '#93c5fd', fontWeight: 700, textDecoration: 'none' }}
                  >
                    Open replay (read-only) →
                  </Link>
                ) : (
                  <span style={{ color: '#64748b' }}>Replay not published.</span>
                )}
              </p>
            </article>
          ))}
        </section>
      )}
    </main>
    </div>
  );
}
