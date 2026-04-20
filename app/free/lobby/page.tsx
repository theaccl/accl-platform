import NavigationBar from '@/components/NavigationBar';
import { FreeLobbyHubContent } from '@/components/free/FreeLobbyHubContent';
import { FreePlayLobbyClient } from '@/components/FreePlayLobbyClient';
import { getSupabaseUserFromCookies } from '@/lib/auth/getSupabaseUserFromCookies';
import { buildLoginRedirect } from '@/lib/nexus/nexusRouteHelpers';
import { redirect } from 'next/navigation';

export default async function FreeLobbyHubPage() {
  const user = await getSupabaseUserFromCookies();
  if (!user) {
    redirect(buildLoginRedirect('/free/lobby'));
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#07080c] text-white">
      <NavigationBar />

      <FreePlayLobbyClient>
        <FreeLobbyHubContent />
      </FreePlayLobbyClient>
    </div>
  );
}
