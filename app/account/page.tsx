'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';

import AccountBillingPanel from '@/components/account/AccountBillingPanel';
import AccountPrivateDetailsPanel from '@/components/account/AccountPrivateDetailsPanel';
import NavigationBar from '@/components/NavigationBar';
import EditProfileForm from '@/components/profile/EditProfileForm';
import { useProfileUsername } from '@/hooks/useProfileUsername';
import { loadOrCreateOwnProfile } from '@/lib/loadOwnProfileForAccount';
import { publicProfileHref } from '@/lib/profileHref';
import { supabase } from '@/lib/supabaseClient';

type ProfileRow = {
  username: string | null;
  bio: string | null;
  flag: string | null;
  avatar_path: string | null;
};

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const { username: usernameFromHook } = useProfileUsername(user);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setUser(data.session?.user ?? null);
        setReady(true);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const loadProfile = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const u = auth.user;
    if (!u?.id) {
      setProfile(null);
      setProfileError(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    setProfileError(null);
    try {
      const result = await loadOrCreateOwnProfile(supabase, u);
      if (!result.ok) {
        setProfile(null);
        setProfileError(result.message);
        return;
      }
      setProfile(result.profile);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    void loadProfile();
  }, [user?.id, loadProfile]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#0D1117] text-white">
        <NavigationBar />
        <main className="mx-auto max-w-5xl px-6 py-8">
          <p className="text-sm text-gray-500">Loading…</p>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0D1117] text-white">
        <NavigationBar />
        <main className="mx-auto max-w-5xl px-6 py-8">
          <p className="text-slate-300">Sign in to manage your account.</p>
          <Link href="/login" className="mt-4 inline-block text-sky-400 underline">
            Log in
          </Link>
        </main>
      </div>
    );
  }

  const publicProfileLink = publicProfileHref(profile?.username ?? usernameFromHook, user.id);

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
          <h1 className="text-3xl font-semibold text-white">Manage account</h1>
          <p className="mt-4 text-slate-300">
            This screen is for account/login identity and private profile management. Public profile identity stays
            username-based on{' '}
            <Link href={publicProfileLink} className="text-sky-400 underline">
              your profile page
            </Link>
            .
          </p>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
          <h2 className="text-xl font-semibold text-white">Account identity</h2>
          <p className="mt-4 text-slate-300">Sign-in email (private — never shown on public profile)</p>
          <p className="mt-1 font-mono text-lg text-white">{user.email ?? '—'}</p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link href={publicProfileLink} className="text-sky-400 underline">
              View public profile
            </Link>
            <Link href="/onboarding/username" className="text-sky-400 underline">
              Username onboarding
            </Link>
          </div>
        </section>

        <section
          className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6"
          data-testid="account-profile-controls"
        >
          <h2 className="text-xl font-semibold text-white">Public profile controls</h2>
          <p className="mt-2 text-slate-300">
            Update your bio, profile image, and flag. These fields are visible on your public profile.
          </p>

          <div className="mt-6">
            {profileLoading ? (
              <p className="text-sm text-slate-500">Loading profile…</p>
            ) : profileError ? (
              <p className="text-sm text-red-300" role="alert">
                {profileError}
              </p>
            ) : profile ? (
              <EditProfileForm
                userId={user.id}
                initialUsername={profile.username}
                initialBio={profile.bio}
                initialFlag={profile.flag}
                initialAvatarPath={profile.avatar_path}
                onSaved={loadProfile}
              />
            ) : (
              <p className="text-sm text-slate-400">Failed to load profile.</p>
            )}
          </div>
        </section>

        <AccountPrivateDetailsPanel />
        <AccountBillingPanel />
      </main>
    </div>
  );
}
