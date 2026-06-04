'use client';

import { useState } from 'react';

import { FLAG_PREFER_NOT_TO_SAY_LABEL, type FlagIdentityPresentation } from '@/lib/flagDisplay';

export type ProfileFlagPillProps = {
  identity: FlagIdentityPresentation | null;
};

/**
 * Public identity country pill: flag image + readable label (not emoji-only).
 * Regional-indicator emoji often renders as "US" letters on Windows; use PNG icon.
 */
export default function ProfileFlagPill({ identity }: ProfileFlagPillProps) {
  const [iconFailed, setIconFailed] = useState(false);

  const showIcon = Boolean(identity?.iconUrl) && !iconFailed;
  const showCodePrefix =
    Boolean(identity?.code) && identity.code !== 'OTHER' && identity.code.length === 2;

  if (!identity) {
    return <span data-testid="profile-flag-label">{FLAG_PREFER_NOT_TO_SAY_LABEL}</span>;
  }

  return (
    <span className="inline-flex max-w-full items-center gap-2">
      {showIcon ? (
        <img
          src={identity.iconUrl!}
          alt=""
          width={24}
          height={18}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-[18px] w-6 shrink-0 rounded-sm border border-slate-700/80 object-cover shadow-sm"
          data-testid="profile-flag-icon"
          onError={() => setIconFailed(true)}
        />
      ) : identity.emoji ? (
        <span
          className="shrink-0 text-base leading-none"
          aria-hidden
          data-testid="profile-flag-emoji-fallback"
        >
          {identity.emoji}
        </span>
      ) : null}
      <span className="min-w-0 truncate" data-testid="profile-flag-label">
        {showCodePrefix ? (
          <>
            <span className="font-medium text-slate-100">{identity.code}</span>
            <span className="text-slate-500"> · </span>
            <span>{identity.label}</span>
          </>
        ) : (
          identity.label
        )}
      </span>
    </span>
  );
}
