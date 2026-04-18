"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import NavigationBar from "@/components/NavigationBar";
import { ProfileUsernameCallout } from "@/components/profile/ProfileUsernameCallout";
import { useProfileUsername } from "@/hooks/useProfileUsername";
import { identityPreviewFromUser, publicIdentityFromProfileUsername } from "@/lib/profileIdentity";
import { publicProfileHref } from "@/lib/profileHref";
import { supabase } from "@/lib/supabaseClient";

/**
 * Logged-in users are routed to `/profile/[id]` (canonical public profile).
 * Logged-out users see a sign-in prompt; identity hooks remain for static parity tests.
 */
export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

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

  const { username: profileUsername, ready: usernameReady } = useProfileUsername(user);
  const prev = identityPreviewFromUser(user, { profileUsername });

  useEffect(() => {
    if (!ready || !user?.id || !usernameReady) return;
    router.replace(publicProfileHref(profileUsername, user.id));
  }, [ready, user?.id, router, profileUsername, usernameReady]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#0D1117] text-white">
        <NavigationBar />
        <div className="mx-auto max-w-2xl px-6 py-8">
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </div>
    );
  }

  if (user?.id) {
    return (
      <div className="min-h-screen bg-[#0D1117] text-white">
        <NavigationBar />
        <div className="mx-auto max-w-2xl px-6 py-8">
          <p className="text-sm text-gray-500">Opening your profile…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-8">
        <p className="text-lg text-gray-200">Sign in to view your ACCL profile.</p>
        <Link
          href="/login"
          className="inline-flex w-fit rounded-xl bg-[#161b22] px-6 py-3 text-lg font-semibold transition hover:bg-[#21262d]"
        >
          Log in
        </Link>

        <ProfileUsernameCallout username={profileUsername} accountEmail={null} />

        <section className="rounded-2xl border border-[#2a3442] bg-gradient-to-br from-[#111723] to-[#1a2231] p-6 shadow-lg shadow-black/25">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500">Preview</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
            {publicIdentityFromProfileUsername(profileUsername, null)}
          </h1>
          <p className="mt-2 text-xs text-gray-500">
            ACCL {prev.elo} · {prev.rank}
          </p>
        </section>
      </div>
    </div>
  );
}
