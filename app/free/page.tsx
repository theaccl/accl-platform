import { redirect } from 'next/navigation';

import { getSupabaseUserFromCookies } from '@/lib/auth/getSupabaseUserFromCookies';
import { buildLoginRedirect } from '@/lib/nexus/nexusRouteHelpers';

/** Free play entry — structured Lobby Chat hub (mode rooms + queue filters). */
export default async function FreePage() {
  const user = await getSupabaseUserFromCookies();
  if (!user) {
    redirect(buildLoginRedirect('/free'));
  }
  redirect('/free/lobby');
}
