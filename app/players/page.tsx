'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { AppShellNav } from '@/components/AppShellNav';
import { supabase } from '@/lib/supabaseClient';

type PublicLookupRow = {
  id: string;
  username: string | null;
  avatar_path: string | null;
  created_at: string | null;
};

const PROFILE_AVATAR_BUCKET = 'profile-avatars';

function initialsFromUsername(username: string | null, id: string): string {
  const base = (username ?? '').trim() || id;
  const clean = base.replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
  if (!clean) return 'P';
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
}

export default function PlayersLookupPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [results, setResults] = useState<PublicLookupRow[]>([]);
  const cleaned = query.trim();
  const queryTooShort = cleaned.length > 0 && cleaned.length < 2;

  const resultCountLabel = useMemo(
    () => `${results.length} player${results.length === 1 ? '' : 's'}`,
    [results.length]
  );

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    setMessage('');
    if (cleaned.length < 2) {
      setResults([]);
      setMessage('Enter at least 2 characters to search by username.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.rpc('search_public_profiles', {
      p_query: cleaned,
      p_limit: 40,
    });
    setLoading(false);
    if (error) {
      setResults([]);
      setMessage(error.message);
      return;
    }
    setResults((data ?? []) as PublicLookupRow[]);
    if ((data ?? []).length === 0) {
      setMessage('No public players match this username query yet.');
    }
  };

  return (
    <main data-testid="players-lookup-root" style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px 48px' }}>
      <h1 style={{ marginTop: 0 }}>Player Lookup</h1>
      <p style={{ marginTop: 0, color: '#94a3b8', lineHeight: 1.55, maxWidth: 720 }}>
        Find public player identities by username. Results link to the existing public profile route and only show
        privacy-safe fields.
      </p>
      <AppShellNav>
        <Link href="/profile" style={{ color: '#93c5fd' }}>
          Your profile
        </Link>
      </AppShellNav>

      <section
        style={{
          marginTop: 14,
          border: '1px solid #243244',
          borderRadius: 12,
          background: '#111a27',
          padding: 14,
        }}
      >
        <form onSubmit={(e) => void handleSearch(e)} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search username"
            aria-label="Search public players by username"
            style={{
              flex: '1 1 260px',
              minWidth: 220,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #3b556f',
              background: '#0f172a',
              color: '#e2e8f0',
            }}
          />
          <button
            type="submit"
            disabled={loading || cleaned.length < 2}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #3b82f6',
              background: '#1d4ed8',
              color: '#fff',
              fontWeight: 700,
              cursor: loading || cleaned.length < 2 ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>
        <p style={{ margin: '8px 0 0 0', fontSize: 12, color: queryTooShort ? '#fca5a5' : '#64748b' }}>
          Username lookup only. No ranking/popularity inference is shown.
        </p>
      </section>

      {message ? (
        <p role="alert" style={{ color: '#cbd5e1', marginTop: 12 }}>
          {message}
        </p>
      ) : null}

      <section style={{ marginTop: 16 }}>
        <p style={{ margin: '0 0 10px 0', color: '#94a3b8', fontSize: 13 }}>
          {loading ? 'Searching…' : resultCountLabel}
        </p>

        {results.length === 0 ? (
          <div
            data-testid="players-lookup-empty"
            style={{ border: '1px dashed #334155', borderRadius: 10, padding: 12, color: '#94a3b8' }}
          >
            No results yet. Try a different username fragment.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {results.map((row) => {
              const avatarUrl = row.avatar_path
                ? supabase.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(row.avatar_path).data.publicUrl
                : null;
              const username = row.username?.trim() || `${row.id.slice(0, 8)}…`;
              return (
                <article
                  key={row.id}
                  data-testid={`players-lookup-row-${row.id}`}
                  style={{
                    border: '1px solid #2f3f54',
                    borderRadius: 10,
                    background: '#111a27',
                    padding: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        border: '1px solid #3b4f69',
                        background: '#1f3147',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#e2e8f0',
                        fontWeight: 700,
                        overflow: 'hidden',
                      }}
                    >
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={`${username} avatar`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        initialsFromUsername(row.username, row.id)
                      )}
                    </div>
                    <div>
                      <p style={{ margin: 0, color: '#f1f5f9', fontWeight: 700 }}>{username}</p>
                      <p style={{ margin: '2px 0 0 0', color: '#94a3b8', fontSize: 12 }}>
                        Joined {row.created_at ? new Date(row.created_at).toLocaleDateString() : 'unknown'}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/profile/${row.id}`}
                    style={{ color: '#93c5fd', fontWeight: 700, textDecoration: 'none' }}
                  >
                    Open public profile →
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

