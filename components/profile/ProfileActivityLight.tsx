'use client';

import { formatLastSeenAgo, isUserOnline } from '@/lib/profile';

type Props = {
  lastActiveAt: string | null;
  /** True when the signed-in viewer is looking at their own profile. */
  isViewingOwnProfile: boolean;
  /** True when the viewer has a Supabase session (logged in). */
  viewerLoggedIn: boolean;
};

export function ProfileActivityLight({ lastActiveAt, isViewingOwnProfile, viewerLoggedIn }: Props) {
  if (isViewingOwnProfile && viewerLoggedIn) {
    return (
      <div data-testid="profile-activity-light" className="flex items-center gap-2">
        <div className="h-3 w-3 rounded-full bg-green-500" />
        <span className="text-sm text-gray-300">Online</span>
      </div>
    );
  }

  const lastSeen = formatLastSeenAgo(lastActiveAt);
  const recentlyActive = Boolean(lastActiveAt && isUserOnline(lastActiveAt));

  return (
    <div data-testid="profile-activity-light" className="flex items-center gap-2">
      <div
        className={`h-3 w-3 rounded-full ${recentlyActive ? 'bg-emerald-500' : 'bg-gray-500'}`}
      />
      <span className="text-sm text-gray-300">
        {recentlyActive ? 'Recently active' : lastSeen ? `Last seen ${lastSeen}` : 'No recent activity'}
      </span>
    </div>
  );
}
