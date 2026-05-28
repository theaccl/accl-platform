import type { PublicP1Read } from '@/lib/p1PublicRatingRead';
import { ProfileRatingsDashboard } from '@/components/profile/ratings/ProfileRatingsDashboard';

type Props = {
  p1: PublicP1Read | null | undefined;
  profileUserId: string;
  isSelf: boolean;
};

/** Profile rating identity dashboard (ticker shell + P1 cards). */
export function ProfileRatings({ p1, profileUserId, isSelf }: Props) {
  return <ProfileRatingsDashboard p1={p1} profileUserId={profileUserId} isSelf={isSelf} />;
}
