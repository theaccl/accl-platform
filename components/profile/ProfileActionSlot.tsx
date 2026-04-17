import Link from 'next/link';

import AddFriendButton from '@/components/profile/AddFriendButton';
import DirectChallengeButton from '@/components/profile/DirectChallengeButton';

export type ProfileActionSlotProps = {
  isSelf: boolean;
  profileUserId: string;
  username: string | null;
};

export default function ProfileActionSlot({ isSelf, profileUserId, username }: ProfileActionSlotProps) {
  return (
    <section data-testid="profile-action-slot">
      {isSelf ? (
        <div className="flex flex-wrap gap-3" data-testid="profile-self-actions">
          <Link
            href="/players"
            data-testid="profile-player-lookup-link"
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 transition hover:bg-slate-800"
          >
            Player Lookup
          </Link>

          <Link
            href="/profile/edit"
            data-testid="profile-edit-link"
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 transition hover:bg-slate-800"
          >
            Edit Profile
          </Link>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3" data-testid="profile-visitor-actions">
          <AddFriendButton profileUserId={profileUserId} />
          <DirectChallengeButton userId={profileUserId} username={username} />
        </div>
      )}
    </section>
  );
}
