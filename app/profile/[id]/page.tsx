'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PublicP1Read } from '@/lib/p1PublicRatingRead';
import { PROFILE_FLAG_OPTIONS } from '@/lib/flagOptions';
import { publicIdentityFromProfileUsername } from '@/lib/profileIdentity';
import { supabase } from '@/lib/supabaseClient';
import { normalizeAcclUsername } from '@/lib/usernameRules';
import { touchProfileActivityThrottled } from '@/lib/touchProfileActivity';
import NavigationBar from '@/components/NavigationBar';
import ProfileActionSlot from '@/components/profile/ProfileActionSlot';
import ProfileBio from '@/components/profile/ProfileBio';
import ProfileHeader from '@/components/profile/ProfileHeader';
import ProfileLogOutButton from '@/components/profile/ProfileLogOutButton';
import { ProfileRatings } from '@/components/profile/ProfileRatings';
import { ProfileStats } from '@/components/profile/ProfileStats';
import { ProfileVaultButton } from '@/components/profile/ProfileVaultButton';
import { VaultRelicsSection } from '@/components/profile/VaultRelicsSection';

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

type PublicProfilePayload = {
  profile: {
    id: string;
    username: string | null;
    created_at: string | null;
    bio: string | null;
    avatar_path: string | null;
    flag: string | null;
    last_active_at: string | null;
    games_played: number;
    current_streak: number;
    highest_streak: number;
  };
  ratings: PublicRatingRow[];
  p1?: PublicP1Read;
  trophies: PublicTrophyRow[];
  vault_relics: PublicRelicRow[];
  prestige_frame: PublicPrestigeFrame;
  finished_games_count: number;
};

const PROFILE_AVATAR_BUCKET = 'profile-avatars';

/** Route segment is a UUID string (Postgres id) — not a public username. */
function isProfileParamUuid(id: string): boolean {
  return /^[0-9a-fA-F-]{36}$/.test(id);
}

function flagLabel(code: string | null | undefined): string | null {
  const c = code?.trim();
  if (!c) return null;
  const row = PROFILE_FLAG_OPTIONS.find((f) => f.code === c);
  return row?.label ?? c;
}

/**
 * Public profile (v2): merged ProfileHeader + ProfileActionSlot.
 * Auth must be resolved before computing `isSelf` — otherwise viewerId=null briefly
 * mis-classifies own profile as visitor (missing Add Friend / wrong actions).
 */
export default function PublicProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const paramId = String(params?.id ?? '').trim();
  const isUuid = isProfileParamUuid(paramId);
  const [payload, setPayload] = useState<PublicProfilePayload | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  /** False until first session resolution — do not render identity/actions until true. */
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  /** For username URLs: resolve to UUID (redirect) or show not found before snapshot fetch. */
  const [usernameLookup, setUsernameLookup] = useState<'idle' | 'resolving' | 'done'>('idle');

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setViewerId(data.session?.user?.id ?? null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setViewerId(session?.user?.id ?? null);
      setAuthReady(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (viewerId) {
      touchProfileActivityThrottled(supabase);
    }
  }, [viewerId]);

  useEffect(() => {
    if (!paramId) {
      setUsernameLookup('done');
      return;
    }
    if (isUuid) {
      setUsernameLookup('done');
      return;
    }
    let cancelled = false;
    setUsernameLookup('resolving');
    void (async () => {
      const normalized = normalizeAcclUsername(paramId);
      if (normalized.length < 2) {
        setPayload(null);
        setMessage('User not found.');
        setUsernameLookup('done');
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.rpc('search_public_profiles', {
        p_query: normalized,
        p_limit: 50,
      });
      if (cancelled) return;
      if (error) {
        setPayload(null);
        setMessage(error.message);
        setUsernameLookup('done');
        setLoading(false);
        return;
      }
      const rows = Array.isArray(data) ? data : [];
      const hit = rows.find(
        (r: { id?: unknown; username?: string | null }) =>
          typeof r.id === 'string' && normalizeAcclUsername(r.username ?? '') === normalized,
      );
      if (hit && typeof hit.id === 'string') {
        router.replace(`/profile/${hit.id}`);
        return;
      }
      setPayload(null);
      setMessage('User not found.');
      setUsernameLookup('done');
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [paramId, isUuid, router]);

  useEffect(() => {
    if (!paramId) {
      setLoading(false);
      setMessage('Invalid profile id.');
      return;
    }
    if (!isUuid) {
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setMessage('');
      const { data, error } = await supabase.rpc('get_public_profile_snapshot', {
        p_profile_id: paramId,
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
  }, [paramId, isUuid]);

  const waitingForUsernameResolution = Boolean(paramId && !isUuid && usernameLookup !== 'done');

  if (loading || !authReady || waitingForUsernameResolution) {
    return (
      <div className="flex min-h-screen flex-col bg-[#0D1117] text-white">
        <NavigationBar />
        <main className="flex-1 p-6">
          <p className="text-sm text-gray-500">Loading...</p>
        </main>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="flex min-h-screen flex-col bg-[#0D1117] text-white">
        <NavigationBar />
        <main className="mx-auto w-full max-w-[860px] flex-1 px-4 pb-12 pt-6 sm:pb-16">
          <h1 className="mt-0">Public Profile</h1>
          <p className="flex flex-wrap gap-3">
            <Link href="/profile" className="text-sky-300">
              Your profile
            </Link>
          </p>
          <p className="text-red-300">{message || 'Profile unavailable.'}</p>
        </main>
      </div>
    );
  }

  const isSelf = Boolean(viewerId && viewerId === payload.profile.id);
  const p1Read = payload.p1 ?? null;
  const displayName = publicIdentityFromProfileUsername(payload.profile.username, null);
  const profileImageUrl = payload.profile.avatar_path
    ? supabase.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(payload.profile.avatar_path).data.publicUrl
    : null;

  const gamesPlayed = Math.max(
    payload.finished_games_count ?? 0,
    typeof payload.profile.games_played === 'number' ? payload.profile.games_played : 0,
  );

  const joinedAt = payload.profile.created_at
    ? new Date(payload.profile.created_at).toLocaleDateString()
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-[#0D1117] text-white">
      <NavigationBar />
      <main
        data-testid="public-profile-root"
        data-profile-layout="v2"
        className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8 pb-16"
      >
        {isSelf ? (
          <nav
            className="flex flex-wrap gap-3 text-sm text-slate-400"
            data-testid="public-profile-self-quicklinks"
            aria-label="Signed-in profile shortcuts"
          >
            <Link href="/players" className="text-sky-300 hover:underline">
              Player lookup
            </Link>
            <Link href="/free" className="text-sky-300 hover:underline">
              Free play
            </Link>
            <Link href="/trainer/review" className="text-sky-300 hover:underline">
              Trainer review
            </Link>
            <Link href="/profile" className="text-sky-300 hover:underline">
              Your profile
            </Link>
            <Link href="/account" className="text-sky-300 hover:underline">
              Account
            </Link>
          </nav>
        ) : null}

        {message ? (
          <p role="alert" className="text-red-300">
            {message}
          </p>
        ) : null}

        {isSelf ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <ProfileLogOutButton />
          </div>
        ) : null}

        <ProfileHeader
          displayName={displayName}
          username={payload.profile.username}
          joinedAt={joinedAt}
          flagDisplay={flagLabel(payload.profile.flag)}
          lastActiveAt={payload.profile.last_active_at ?? null}
          profileImageUrl={profileImageUrl}
        />

        <ProfileActionSlot
          isSelf={isSelf}
          profileUserId={payload.profile.id}
          username={payload.profile.username}
        />

        <ProfileBio bio={payload.profile.bio} isSelf={isSelf} />

        <div className="grid gap-6 rounded-2xl border border-[#243244] bg-[#111a27] p-6">
          <ProfileRatings p1={p1Read} />
          <ProfileStats
            gamesPlayed={gamesPlayed}
            currentStreak={payload.profile.current_streak ?? 0}
            highestStreak={payload.profile.highest_streak ?? 0}
          />
        </div>

        {isSelf ? <ProfileVaultButton /> : null}

        <section
          data-testid="public-profile-history"
          className="rounded-xl border border-[#243244] bg-[#111a27] p-4"
        >
          <h2 className="mt-0 text-base font-semibold">History</h2>
          <p className="mt-0 text-gray-300">
            Finished records observed: <strong>{payload.finished_games_count ?? 0}</strong>
          </p>
          <p className="mt-2">
            <Link href={`/profile/${payload.profile.id}/history`} className="font-bold text-sky-300">
              Open public match timeline
            </Link>
          </p>
          {isSelf ? (
            <Link href="/trainer/review" className="mt-2 inline-block font-bold text-sky-300">
              Open your finished game history
            </Link>
          ) : (
            <p className="mt-2 text-sm text-gray-500">
              Public match-by-match history routing is deferred; count is shown for identity context.
            </p>
          )}
        </section>

        <VaultRelicsSection relics={payload.vault_relics} />

        <section
          data-testid="public-profile-trophies"
          className="rounded-xl border border-[#243244] bg-[#111a27] p-4"
        >
          <h2 className="mt-0 text-base font-semibold">Trophies</h2>
          {payload.trophies.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#38506e] p-3 text-gray-300">No public trophy records yet.</div>
          ) : (
            <div className="grid gap-2">
              {payload.trophies.map((t) => (
                <article key={t.id} className="rounded-lg border border-[#2f3f54] bg-[#0f1723] p-3">
                  <p className="m-0 font-bold text-slate-100">{t.title}</p>
                  <p className="mt-1 text-sm text-gray-300">
                    {t.category}
                    {t.placement ? ` · Placement #${t.placement}` : ''}
                    {t.level ? ` · ${t.level}` : ''}
                    {t.date_awarded ? ` · ${new Date(t.date_awarded).toLocaleString()}` : ''}
                  </p>
                  {t.description ? <p className="mt-1 text-xs text-gray-500">{t.description}</p> : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section
          data-testid="public-profile-prestige"
          className="rounded-xl border border-[#243244] bg-[#111a27] p-4"
        >
          <h2 className="mt-0 text-base font-semibold">Prestige / Frame</h2>
          {payload.prestige_frame ? (
            <article className="rounded-lg border border-[#2f3f54] bg-[#0f1723] p-3">
              <p className="m-0 font-bold text-slate-100">
                {payload.prestige_frame.frame_name} · Tier {payload.prestige_frame.current_tier}
              </p>
              <p className="mt-1 text-sm text-gray-300">
                Motif: {payload.prestige_frame.motif_family} · Accent: {payload.prestige_frame.accent_tier}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Updated: {new Date(payload.prestige_frame.updated_at).toLocaleString()}
              </p>
            </article>
          ) : (
            <div className="rounded-lg border border-dashed border-[#38506e] p-3 text-gray-300">Prestige frame not yet unlocked.</div>
          )}
        </section>
      </main>
    </div>
  );
}
