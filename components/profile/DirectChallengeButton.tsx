import Link from 'next/link';

type Props = {
  userId: string;
  username: string | null;
};

export default function DirectChallengeButton({ userId: _userId, username }: Props) {
  const href = username ? `/free/create?opponent=${encodeURIComponent(username)}` : '/free/create';

  return (
    <Link
      href={href}
      className="inline-flex rounded-xl border border-violet-600/50 bg-violet-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-600"
      data-testid="profile-direct-challenge"
    >
      Direct Challenge
    </Link>
  );
}
