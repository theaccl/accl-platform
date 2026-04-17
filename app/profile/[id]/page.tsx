'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { PublicP1Read } from '@/lib/p1PublicRatingRead';
import { publicIdentityFromProfileUsername } from '@/lib/profileIdentity';
import { supabase } from '@/lib/supabaseClient';
import NavigationBar from '@/components/NavigationBar';

type PublicRatingRow = {
  bucket: string;
  rating: number;
  games_played: number;
};

type PublicTrophyRow = {
  id: string;
  title: string;
  category: string;
  date_awarded: string | null;
  source_game_id: string | null;
  source_tournament_id: string | null;
  placement: number | null;
  level: string | null;
  description: string | null;
};

type PublicRelicRow = {
  id: string;
  title: string;
  category: 'free' | 'tournament';
  date_won: string | null;
  source_game_id: string | null;
  source_tournament_id: string | null;
  pace: 'live' | 'daily' | 'correspondence' | null;
  description: string | null;
};

type PublicPrestigeFrame = {
  current_tier: string;
  frame_name: string;
  motif_family: string;
  accent_tier: string;
  updated_at: string;
} | null;

type PublicP1BucketRow = {
  rating: number;
  games_played: number;
} | null;

type PublicProfilePayload = {
  profile: {
    id: string;
    username: string | null;
    created_at: string | null;
    bio: string | null;
    avatar_path: string | null;
  };
  ratings: PublicRatingRow[];
  /** P1 ratings (dual-write targets); legacy `ratings` array remains unchanged. */
  p1?: PublicP1Read;
  trophies: PublicTrophyRow[];
  vault_relics: PublicRelicRow[];
  prestige_frame: PublicPrestigeFrame;
  finished_games_count: number;
};

const PROFILE_AVATAR_BUCKET = 'profile-avatars';

const BUCKET_ORDER = [
  'free_live',
  'free_daily',
  'free_correspondence',
  'tournament_live',
  'tournament_daily',
  'tournament_correspondence',
] as const;

const BUCKET_LABEL: Record<(typeof BUCKET_ORDER)[number], string> = {
  free_live: 'Free · Live',
  free_daily: 'Free · Daily',
  free_correspondence: 'Free · Correspondence',
  tournament_live: 'Tournament · Live',
  tournament_daily: 'Tournament · Daily',
  tournament_correspondence: 'Tournament · Correspondence',
};

const P1_FREE_ORDER = [
  { key: 'free_bullet' as const, label: 'P1 · Bullet' },
  { key: 'free_blitz' as const, label: 'P1 · Blitz' },
  { key: 'free_rapid' as const, label: 'P1 · Rapid' },
  { key: 'free_day' as const, label: 'P1 · Daily (calendar)' },
];

function formatP1Row(row: PublicP1BucketRow): string {
  if (row == null) return '—';
  return `Rating ${row.rating} · Games ${row.games_played}`;
}

function initialsFromPublicName(username: string | null, id: string): string {
  const raw = (username ?? '').trim() || id;
  const clean = raw.replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
  if (!clean) return 'P';
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
}

export default function PublicProfilePage() {
  const params = useParams<{ id: string }>();
  const profileId = String(params?.id ?? '').trim();
  const [payload, setPayload] = useState<PublicProfilePayload | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
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
      const { data, error } = await supabase.rpc('get_public_profile_snapshot', {
        p_profile_id: profileId,
      });
      if (cancelled) return;
      if (error) {
        setPayload(null);
        setMessage(error.message);
        setLoading(false);
        return;
      }
      if (!data) {
        setPayload(null);
        setMessage('Profile not found.');
        setLoading(false);
        return;
      }
      setPayload(data as PublicProfilePayload);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const ratingsByBucket = useMemo(() => {
    const map = new Map<string, PublicRatingRow>();
    for (const r of payload?.ratings ?? []) map.set(r.bucket, r);
    return map;
  }, [payload?.ratings]);

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

  if (!payload) {
    return (
      <div className="min-h-screen bg-[#0D1117] flex flex-col text-white">
        <NavigationBar />
        <main className="flex-1 w-full max-w-[860px] mx-auto px-4 pt-6 pb-12 sm:pb-16">
        <h1 style={{ marginTop: 0 }}>Public Profile</h1>
        <p style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/profile" style={{ color: '#93c5fd' }}>
            Your profile
          </Link>
        </p>
        <p style={{ color: '#fecaca' }}>{message || 'Profile unavailable.'}</p>
      </main>
      </div>
    );
  }

  const isSelf = viewerId != null && viewerId === payload.profile.id;
  const p1Read = payload.p1 ?? null;
  const displayName = publicIdentityFromProfileUsername(payload.profile.username, null);
  const initials = initialsFromPublicName(displayName, payload.profile.id);
  const avatarUrl = payload.profile.avatar_path
    ? supabase.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(payload.profile.avatar_path).data.publicUrl
    : null;
  const joined = payload.profile.created_at
    ? new Date(payload.profile.created_at).toLocaleDateString()
    : '—';
  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col text-white">
      <NavigationBar />
      <main
        data-testid="public-profile-root"
        className="flex-1 w-full max-w-[980px] mx-auto px-4 pt-6 pb-12 sm:pb-16"
      >
      <h1 style={{ marginTop: 0 }}>Public Player Profile</h1>
      <p style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 0 }}>
        <Link href="/players" style={{ color: '#93c5fd' }}>
          Player lookup
        </Link>
        <Link href="/free" style={{ color: '#93c5fd' }}>
          Free play
        </Link>
        <Link href="/trainer/review" style={{ color: '#93c5fd' }}>
          Trainer review
        </Link>
        <Link href="/profile" style={{ color: '#93c5fd' }}>
          Your profile
        </Link>
      </p>
      {message ? (
        <p role="alert" style={{ color: '#fecaca' }}>
          {message}
        </p>
      ) : null}

      <section
        data-testid="public-profile-identity"
        style={{ border: '1px solid #243244', borderRadius: 12, padding: 16, background: '#111a27' }}
      >
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div
            data-testid="public-profile-avatar"
            style={{
              width: 84,
              height: 84,
              borderRadius: '50%',
              border: '1px solid #3b4f69',
              background: '#1f3147',
              color: '#e2e8f0',
              display: 'grid',
              placeItems: 'center',
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={`${displayName} avatar`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
              />
            ) : (
              initials
            )}
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#f1f5f9' }}>{displayName}</p>
            <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#93a7c0' }}>
              Public ACCL player identity · Joined {joined}
            </p>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: 16 }}>About</h2>
          <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.5 }}>
            {payload.profile.bio?.trim() || 'This player has not added a public bio yet.'}
          </p>
        </div>
      </section>

      <section
        data-testid="public-profile-ratings"
        style={{ border: '1px solid #243244', borderRadius: 12, padding: 16, background: '#111a27', marginTop: 16 }}
      >
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Rating breakdown</h2>
        <p style={{ marginTop: 0, color: '#9fb0c5' }}>
          Legacy six-bucket pace ratings (public read model). Full row list remains in <code>ratings</code> for API
          compatibility.
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          {BUCKET_ORDER.map((bucket) => {
            const row = ratingsByBucket.get(bucket);
            return (
              <div
                key={bucket}
                style={{
                  border: '1px solid #2f3f54',
                  borderRadius: 10,
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{BUCKET_LABEL[bucket]}</span>
                <span style={{ color: '#cbd5e1', fontSize: 13 }}>
                  Rating <strong style={{ color: '#f8fafc' }}>{row?.rating ?? '—'}</strong> · Games{' '}
                  <strong style={{ color: '#f8fafc' }}>{row?.games_played ?? '—'}</strong>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {p1Read ? (
        <section
          data-testid="public-profile-p1-ratings"
          style={{
            border: '1px solid #243244',
            borderRadius: 12,
            padding: 16,
            background: '#111a27',
            marginTop: 16,
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: 16 }}>P1 ratings (read path)</h2>
          <p style={{ marginTop: 0, color: '#9fb0c5' }}>
            ACCL Rating and Tournament Rating use the same value (P1 tournament_unified). Shown below for verification.
          </p>
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <div
              style={{
                border: '1px solid #2f3f54',
                borderRadius: 10,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ color: '#e2e8f0', fontWeight: 600 }}>ACCL Rating</span>
              <span style={{ color: '#cbd5e1', fontSize: 13 }}>
                <strong style={{ color: '#f8fafc' }}>{p1Read.accl_rating ?? '—'}</strong>
              </span>
            </div>
            <div
              style={{
                border: '1px solid #2f3f54',
                borderRadius: 10,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ color: '#e2e8f0', fontWeight: 600 }}>Tournament Rating</span>
              <span style={{ color: '#cbd5e1', fontSize: 13 }}>
                <strong style={{ color: '#f8fafc' }}>{p1Read.tournament_rating ?? '—'}</strong>
              </span>
            </div>
            <div
              style={{
                border: '1px solid #2f3f54',
                borderRadius: 10,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ color: '#e2e8f0', fontWeight: 600 }}>Tournament unified</span>
              <span style={{ color: '#cbd5e1', fontSize: 13 }}>{formatP1Row(p1Read.tournament_unified)}</span>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {P1_FREE_ORDER.map(({ key, label }) => (
              <div
                key={key}
                style={{
                  border: '1px solid #2f3f54',
                  borderRadius: 10,
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{label}</span>
                <span style={{ color: '#cbd5e1', fontSize: 13 }}>{formatP1Row(p1Read[key])}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section
        data-testid="public-profile-history"
        style={{ border: '1px solid #243244', borderRadius: 12, padding: 16, background: '#111a27', marginTop: 16 }}
      >
        <h2 style={{ marginTop: 0, fontSize: 16 }}>History</h2>
        <p style={{ marginTop: 0, color: '#cbd5e1' }}>
          Finished records observed: <strong>{payload.finished_games_count ?? 0}</strong>
        </p>
        <p style={{ marginTop: 0 }}>
          <Link href={`/profile/${payload.profile.id}/history`} style={{ color: '#93c5fd', fontWeight: 700 }}>
            Open public match timeline
          </Link>
        </p>
        {isSelf ? (
          <Link href="/trainer/review" style={{ color: '#93c5fd', fontWeight: 700 }}>
            Open your finished game history
          </Link>
        ) : (
          <p style={{ margin: 0, color: '#93a7c0', fontSize: 13 }}>
            Public match-by-match history routing is deferred; count is shown for identity context.
          </p>
        )}
      </section>

      <section
        data-testid="public-profile-vault"
        style={{ border: '1px solid #243244', borderRadius: 12, padding: 16, background: '#111a27', marginTop: 16 }}
      >
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Vault / Relics</h2>
        {payload.vault_relics.length === 0 ? (
          <div style={{ border: '1px dashed #38506e', borderRadius: 10, padding: 12, color: '#cbd5e1' }}>
            No public relic records yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {payload.vault_relics.map((r) => (
              <article key={r.id} style={{ border: '1px solid #2f3f54', borderRadius: 10, padding: 12, background: '#0f1723' }}>
                <p style={{ margin: 0, color: '#f1f5f9', fontWeight: 700 }}>{r.title}</p>
                <p style={{ margin: '6px 0 0 0', color: '#cbd5e1', fontSize: 13 }}>
                  {r.category} · {r.pace ?? 'pace unspecified'} · {r.date_won ? new Date(r.date_won).toLocaleString() : 'date pending'}
                </p>
                {r.description ? <p style={{ margin: '4px 0 0 0', color: '#9fb0c5', fontSize: 12 }}>{r.description}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        data-testid="public-profile-trophies"
        style={{ border: '1px solid #243244', borderRadius: 12, padding: 16, background: '#111a27', marginTop: 16 }}
      >
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Trophies</h2>
        {payload.trophies.length === 0 ? (
          <div style={{ border: '1px dashed #38506e', borderRadius: 10, padding: 12, color: '#cbd5e1' }}>
            No public trophy records yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {payload.trophies.map((t) => (
              <article key={t.id} style={{ border: '1px solid #2f3f54', borderRadius: 10, padding: 12, background: '#0f1723' }}>
                <p style={{ margin: 0, color: '#f1f5f9', fontWeight: 700 }}>{t.title}</p>
                <p style={{ margin: '6px 0 0 0', color: '#cbd5e1', fontSize: 13 }}>
                  {t.category}
                  {t.placement ? ` · Placement #${t.placement}` : ''}
                  {t.level ? ` · ${t.level}` : ''}
                  {t.date_awarded ? ` · ${new Date(t.date_awarded).toLocaleString()}` : ''}
                </p>
                {t.description ? <p style={{ margin: '4px 0 0 0', color: '#9fb0c5', fontSize: 12 }}>{t.description}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        data-testid="public-profile-prestige"
        style={{ border: '1px solid #243244', borderRadius: 12, padding: 16, background: '#111a27', marginTop: 16 }}
      >
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Prestige / Frame</h2>
        {payload.prestige_frame ? (
          <article style={{ border: '1px solid #2f3f54', borderRadius: 10, padding: 12, background: '#0f1723' }}>
            <p style={{ margin: 0, color: '#f1f5f9', fontWeight: 700 }}>
              {payload.prestige_frame.frame_name} · Tier {payload.prestige_frame.current_tier}
            </p>
            <p style={{ margin: '6px 0 0 0', color: '#cbd5e1', fontSize: 13 }}>
              Motif: {payload.prestige_frame.motif_family} · Accent: {payload.prestige_frame.accent_tier}
            </p>
            <p style={{ margin: '4px 0 0 0', color: '#9fb0c5', fontSize: 12 }}>
              Updated: {new Date(payload.prestige_frame.updated_at).toLocaleString()}
            </p>
          </article>
        ) : (
          <div style={{ border: '1px dashed #38506e', borderRadius: 10, padding: 12, color: '#cbd5e1' }}>
            Prestige frame not yet unlocked.
          </div>
        )}
      </section>
    </main>
    </div>
  );
}
