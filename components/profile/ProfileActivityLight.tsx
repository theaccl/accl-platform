'use client';

import { isUserOnline } from '@/lib/profile';

type Props = {
  lastActiveAt: string | null;
};

export function ProfileActivityLight({ lastActiveAt }: Props) {
  const online = isUserOnline(lastActiveAt);

  return (
    <div data-testid="profile-activity-light" className="flex items-center gap-2">
      <div className={`h-3 w-3 rounded-full ${online ? 'bg-green-500' : 'bg-gray-400'}`} />
      <span className="text-sm text-gray-300">{online ? 'Active' : 'Offline'}</span>
    </div>
  );
}
