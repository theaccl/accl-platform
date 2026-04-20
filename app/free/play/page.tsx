import Link from "next/link";
import { redirect } from "next/navigation";
import NavigationBar from "@/components/NavigationBar";
import { FreePlayLobbyGrid } from "@/components/free/FreePlayLobbyGrid";
import { FreePlayLobbyClient } from "@/components/FreePlayLobbyClient";
import { getSupabaseUserFromCookies } from "@/lib/auth/getSupabaseUserFromCookies";
import { buildLoginRedirect } from "@/lib/nexus/nexusRouteHelpers";

/** Legacy full-width lobby: mode chips in chat column. Prefer `/free/lobby` for hub + mode rooms. */
export default async function FreePlayMatchPage() {
  const user = await getSupabaseUserFromCookies();
  if (!user) {
    redirect(buildLoginRedirect("/free/play"));
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#07080c] text-white">
      <NavigationBar />
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 text-sm text-amber-200/90">
        <p>
          <span className="font-semibold">Legacy lobby</span> — single page with inline mode chat switching.{" "}
          <Link href="/free/lobby" className="text-sky-400 underline hover:text-sky-300">
            Lobby Chat hub
          </Link>{" "}
          is the supported entry (mode rooms + mode-scoped chat).
        </p>
      </div>
      <FreePlayLobbyClient>
        <FreePlayLobbyGrid>
          <p className="text-center text-sm text-gray-500">
            Pick mode and clock below — chat follows mode chips on this legacy page.
          </p>
        </FreePlayLobbyGrid>
      </FreePlayLobbyClient>
    </div>
  );
}
