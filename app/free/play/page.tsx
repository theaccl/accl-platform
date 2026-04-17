import { redirect } from "next/navigation";
import NavigationBar from "@/components/NavigationBar";
import { FreePlayLobbyGrid } from "@/components/free/FreePlayLobbyGrid";
import { FreePlayLobbyClient } from "@/components/FreePlayLobbyClient";
import { getSupabaseUserFromCookies } from "@/lib/auth/getSupabaseUserFromCookies";
import { buildLoginRedirect } from "@/lib/nexus/nexusRouteHelpers";

export default async function FreePlayMatchPage() {
  const user = await getSupabaseUserFromCookies();
  if (!user) {
    redirect(buildLoginRedirect("/free/play"));
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#07080c] text-white">
      <NavigationBar />
      <FreePlayLobbyClient>
        <FreePlayLobbyGrid>
          <p className="text-center text-sm text-gray-500">
            Pick mode and clock below — same mode as mode chat on Free play.
          </p>
        </FreePlayLobbyGrid>
      </FreePlayLobbyClient>
    </div>
  );
}
