import Link from "next/link";
import NavigationBar from "@/components/NavigationBar";
import { FreePlayLobbyClient } from "@/components/FreePlayLobbyClient";
import { FreePlayMatchPanel } from "@/components/FreePlayMatchPanel";
import { getSupabaseUserFromCookies } from "@/lib/auth/getSupabaseUserFromCookies";
import { buildLoginRedirect } from "@/lib/nexus/nexusRouteHelpers";
import { redirect } from "next/navigation";

const navLinkClass =
  "text-sm font-medium text-gray-300 underline decoration-gray-600 underline-offset-2 hover:text-white";

export default async function FreePage() {
  const user = await getSupabaseUserFromCookies();
  if (!user) {
    redirect(buildLoginRedirect("/free"));
  }

  const createGameRoute = "/free/create";

  return (
    <div className="min-h-screen bg-[#0D1117] text-white flex flex-col">
      <NavigationBar />

      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-[#243244] px-4 py-3 text-center">
        <Link href={createGameRoute} className={navLinkClass}>
          Create game
        </Link>
        <span
          className="cursor-not-allowed text-sm font-medium text-gray-500 no-underline"
          title="Play computer is unavailable until bot identities are provisioned in this environment."
        >
          Play computer (unavailable)
        </span>
        <Link href="/free/active" className={navLinkClass}>
          Active games
        </Link>
        <Link href="/free/challenges" className={navLinkClass}>
          Direct challenges
        </Link>
      </div>

      <FreePlayLobbyClient>
        <FreePlayMatchPanel />
      </FreePlayLobbyClient>
    </div>
  );
}
