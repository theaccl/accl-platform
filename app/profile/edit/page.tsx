'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';

import NavigationBar from '@/components/NavigationBar';
import EditProfileForm from '@/components/profile/EditProfileForm';
import { ProfileUsernameCallout } from '@/components/profile/ProfileUsernameCallout';
import { useProfileUsername } from '@/hooks/useProfileUsername';
import { supabase } from '@/lib/supabaseClient';

type ProfileRow = {
  username: string | null;
  bio: string | null;
  flag: string | null;
  avatar_path: string | null;
};

export default function EditProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const profileUsername = useProfileUsername(user);

  const loadProfile = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    if (!uid) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('username,bio,flag,avatar_path')
      .eq('id', uid)
      .maybeSingle();
    if (error) {
      setProfile(null);
    } else {
      setProfile(data as ProfileRow);
    }
    setProfileLoading(false);
  }, []);

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

  useEffect(() => {
    if (!user?.id) return;
    void loadProfile();
  }, [user?.id, loadProfile]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#0D1117] text-white">
        <NavigationBar />
        <div className="mx-auto max-w-xl px-6 py-8">
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0D1117] text-white">
        <NavigationBar />
        <div className="mx-auto max-w-xl px-6 py-8">
          <p className="mb-4 text-gray-200">Sign in to edit your profile.</p>
          <Link href="/login" className="text-sky-300">
            Log in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />
      <div className="mx-auto max-w-xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Edit profile</h1>
          <Link href={`/profile/${user.id}`} className="text-sm text-sky-300">
            View profile
          </Link>
        </div>

        <ProfileUsernameCallout username={profileUsername} accountEmail={user.email ?? null} />

        <div className="mt-8">
          {profileLoading || !profile ? (
            <p className="text-sm text-gray-500">Loading profile…</p>
          ) : (
            <EditProfileForm
              userId={user.id}
              initialUsername={profile.username}
              initialBio={profile.bio}
              initialFlag={profile.flag}
              initialAvatarPath={profile.avatar_path}
              onSaved={loadProfile}
            />
          )}
        </div>
      </div>
    </div>
  );
}
