import { redirect } from "next/navigation";
import NavigationBar from "@/components/NavigationBar";
import { FreePlayLobbyClient } from "@/components/FreePlayLobbyClient";
import { FreePlayMatchPanel } from "@/components/FreePlayMatchPanel";
import { getSupabaseUserFromCookies } from "@/lib/auth/getSupabaseUserFromCookies";
import { buildLoginRedirect } from "@/lib/nexus/nexusRouteHelpers";

export default async function FreePlayMatchPage() {
  const user = await getSupabaseUserFromCookies();
  if (!user) {
    redirect(buildLoginRedirect("/free/play"));
  }

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />
      <FreePlayLobbyClient>
        <FreePlayMatchPanel />
      </FreePlayLobbyClient>
    </div>
  );
}
