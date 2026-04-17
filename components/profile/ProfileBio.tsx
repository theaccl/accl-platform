import Link from 'next/link';

import { countWords } from '@/lib/profile';

function trimDisplay(bio: string, maxWords = 250): string {
  const t = bio.trim();
  if (!t) return '';
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return t;
  return `${words.slice(0, maxWords).join(' ')}…`;
}

export type ProfileBioProps = {
  bio: string | null;
  isSelf?: boolean;
};

export default function ProfileBio({ bio, isSelf = false }: ProfileBioProps) {
  const raw = bio?.trim() ?? '';
  const display = raw ? trimDisplay(raw) : '';

  return (
    <section
      className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6"
      data-testid="profile-bio"
      aria-labelledby="profile-about-heading"
    >
      <h2 id="profile-about-heading" className="text-xl font-semibold text-white">
        About
      </h2>

      {display ? (
        <>
          <p className="mt-4 whitespace-pre-wrap text-slate-200">{display}</p>
          {raw && countWords(raw) > 250 ? (
            <p className="mt-2 text-xs text-slate-500">Showing first 250 words.</p>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-slate-300">
          {isSelf ? (
            <>
              No bio yet. Add one under{' '}
              <Link href="/account" className="font-medium text-sky-400 underline">
                Account
              </Link>{' '}
              or{' '}
              <Link href="/profile/edit" className="font-medium text-sky-400 underline">
                Edit Profile
              </Link>
              .
            </>
          ) : (
            'This player has not added a public bio yet.'
          )}
        </p>
      )}
    </section>
  );
}
