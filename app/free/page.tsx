import NavigationBar from "@/components/NavigationBar";
import { FreePlayLobbyGrid } from "@/components/free/FreePlayLobbyGrid";
import { FreeTopActionStrip } from "@/components/free/FreeTopActionStrip";
import { FreePlayLobbyClient } from "@/components/FreePlayLobbyClient";
import { HomePlaySection } from "@/components/HomePlaySection";
import { getSupabaseUserFromCookies } from "@/lib/auth/getSupabaseUserFromCookies";
import { buildLoginRedirect } from "@/lib/nexus/nexusRouteHelpers";
import { redirect } from "next/navigation";

export default async function FreePage() {
  const user = await getSupabaseUserFromCookies();
  if (!user) {
    redirect(buildLoginRedirect("/free"));
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#07080c] text-white">
      <NavigationBar />

      <FreeTopActionStrip />

      <FreePlayLobbyClient>
        <FreePlayLobbyGrid>
          <div className="mx-auto flex w-full max-w-md flex-col gap-4">
            <HomePlaySection />
          </div>
        </FreePlayLobbyGrid>
      </FreePlayLobbyClient>
    </div>
  );
}
