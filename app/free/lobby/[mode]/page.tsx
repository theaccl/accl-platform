import NavigationBar from '@/components/NavigationBar';
import { FreeLobbyModeRoomContent } from '@/components/free/FreeLobbyModeRoomContent';
import { FreePlayLobbyClient } from '@/components/FreePlayLobbyClient';
import { getSupabaseUserFromCookies } from '@/lib/auth/getSupabaseUserFromCookies';
import { PLAT_MODE_ORDER, type PlatMode } from '@/lib/freePlayModeTimeControl';
import { buildLoginRedirect } from '@/lib/nexus/nexusRouteHelpers';
import { notFound, redirect } from 'next/navigation';

const VALID = new Set<string>(PLAT_MODE_ORDER);

export default async function FreeLobbyModePage({ params }: { params: { mode: string } }) {
  const user = await getSupabaseUserFromCookies();
  const raw = String(params.mode ?? '').toLowerCase();
  if (!VALID.has(raw)) {
    notFound();
  }
  if (!user) {
    redirect(buildLoginRedirect(`/free/lobby/${raw}`));
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#07080c] text-white">
      <NavigationBar />

      <FreePlayLobbyClient>
        <FreeLobbyModeRoomContent mode={raw as PlatMode} />
      </FreePlayLobbyClient>
    </div>
  );
}
