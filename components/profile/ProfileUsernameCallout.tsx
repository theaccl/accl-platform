'use client';

import Link from 'next/link';
import { useState } from 'react';
import { publicIdentityFromProfileUsername, sanitizePublicIdentityCandidate } from '@/lib/profileIdentity';

type Props = {
  /** Raw `profiles.username` (may be invalid for public display). */
  username: string | null;
  /** Session email — used to reject email local-part stored as username (never shown). */
  accountEmail: string | null;
};

/**
 * Labeled, copyable **public** username — never shows email, local-part, or raw invalid DB values.
 */
export function ProfileUsernameCallout({ username, accountEmail }: Props) {
  const [copied, setCopied] = useState(false);
  const raw = username?.trim() ?? '';
  const visible = publicIdentityFromProfileUsername(username, accountEmail);
  const rejected = Boolean(raw && !sanitizePublicIdentityCandidate(username, accountEmail));
  const hasPublicUsername = Boolean(raw && !rejected);

  const copy = async () => {
    if (!hasPublicUsername) return;
    try {
      await navigator.clipboard.writeText(visible);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      data-testid="profile-username-callout"
      className="rounded-2xl border border-amber-500/35 bg-amber-950/25 px-5 py-4 shadow-sm shadow-black/20"
      aria-labelledby="profile-username-heading"
    >
      <h2 id="profile-username-heading" className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/90">
        Username
      </h2>
      {rejected ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm leading-relaxed text-amber-100/95">
            Your saved username matches your sign-in email and cannot be shown as public identity. Choose a real ACCL
            username.
          </p>
          <Link
            href="/onboarding/username"
            className="inline-block text-sm font-medium text-amber-300 underline decoration-amber-500/50 underline-offset-2 hover:text-amber-200"
          >
            Set a new username
          </Link>
        </div>
      ) : hasPublicUsername ? (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="min-w-0 font-mono text-xl font-semibold tracking-tight text-white break-all">
            <span className="sr-only">Username: </span>
            {visible}
          </p>
          <button
            type="button"
            data-testid="profile-username-copy"
            onClick={() => void copy()}
            className="shrink-0 rounded-lg border border-amber-500/50 bg-amber-900/40 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-gray-300">
          No username yet.{' '}
          <Link
            href="/onboarding/username"
            className="font-medium text-amber-300 underline decoration-amber-500/50 underline-offset-2 hover:text-amber-200"
          >
            Claim your username
          </Link>{' '}
          — public identity will show as &quot;Player&quot; until then.
        </p>
      )}
      <p className="mt-3 text-xs leading-relaxed text-gray-500">
        Public identity is only this username or &quot;Player&quot;. Not your email or email local-part. Same value in
        nav, NEXUS, games, and chat.
      </p>
    </section>
  );
}
