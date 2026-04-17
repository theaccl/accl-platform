'use client';

import Image from 'next/image';
import { useState } from 'react';

import ProfileImage from '@/components/profile/ProfileImage';
import { ProfileActivityLight } from '@/components/profile/ProfileActivityLight';
import { publicIdentityFromProfileUsername } from '@/lib/profileIdentity';

export type ProfileHeaderProps = {
  /** Canonical public display label (never email). */
  displayName: string;
  /** Raw username for copy (may be null). */
  username: string | null;
  joinedAt: string | null;
  flagDisplay: string | null;
  lastActiveAt: string | null;
  profileImageUrl: string | null;
};

export default function ProfileHeader({
  displayName,
  username,
  joinedAt,
  flagDisplay,
  lastActiveAt,
  profileImageUrl,
}: ProfileHeaderProps) {
  const [copied, setCopied] = useState(false);

  const copyUsername = async () => {
    const text = publicIdentityFromProfileUsername(username, null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      data-testid="profile-header"
      className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6 shadow-lg shadow-black/20"
    >
      <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[auto_1fr_auto]">
        <div data-testid="profile-badge-slot" className="flex justify-center md:justify-start">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-red-500/40 bg-slate-900 ring-1 ring-red-500/30">
            <Image
              src="/accl-mark-v2.png"
              alt="ACCL badge"
              width={64}
              height={64}
              className="h-16 w-16 object-contain brightness-150 contrast-150"
              priority
            />
          </div>
        </div>

        <div data-testid="profile-identity-core" className="min-w-0 text-center md:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
            <h1 className="text-3xl font-semibold text-white" data-testid="profile-username">
              {displayName}
            </h1>
            <button
              type="button"
              onClick={() => void copyUsername()}
              className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm text-slate-300 md:justify-start">
            <span>Public ACCL player identity</span>
            {joinedAt ? <span>· Joined {joinedAt}</span> : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-3 md:justify-start">
            <div
              className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-sm text-slate-200"
              data-testid="profile-flag-pill"
            >
              {flagDisplay ?? '—'}
            </div>
            <ProfileActivityLight lastActiveAt={lastActiveAt} />
          </div>
        </div>

        <div data-testid="profile-uploaded-image-slot" className="flex justify-center md:justify-end">
          <ProfileImage url={profileImageUrl} />
        </div>
      </div>
    </section>
  );
}
