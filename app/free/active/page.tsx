import Link from "next/link";
import { redirect } from "next/navigation";
import NavigationBar from "@/components/NavigationBar";
import FreeActiveGamesList from "@/components/free/FreeActiveGamesList";
import {
  DAILY_ASYNC_SECTION_TITLE,
  LIVE_NOW_SECTION_TITLE,
  freeActiveGamesHref,
} from "@/lib/gameContinuityPresentation";
import { getSupabaseUserFromCookies } from "@/lib/auth/getSupabaseUserFromCookies";
import { buildLoginRedirect } from "@/lib/nexus/nexusRouteHelpers";

export default async function FreeActiveGamesPage() {
  const user = await getSupabaseUserFromCookies();
  if (!user) {
    redirect(buildLoginRedirect("/free/active"));
  }

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Your games</h1>
        <p className="mb-4 text-sm text-gray-400">
          Live boards and daily games are listed separately. Live games expect you to reconnect while the clock runs;
          daily and correspondence games stay on your queue until finished.
        </p>
        <nav className="mb-6 flex flex-wrap gap-3 text-sm" aria-label="Jump to section">
          <Link href={freeActiveGamesHref("live")} className="font-medium text-sky-400 hover:text-sky-300">
            {LIVE_NOW_SECTION_TITLE}
          </Link>
          <span className="text-gray-600" aria-hidden>
            ·
          </span>
          <Link href={freeActiveGamesHref("async")} className="font-medium text-violet-300 hover:text-violet-200">
            {DAILY_ASYNC_SECTION_TITLE}
          </Link>
        </nav>
        <FreeActiveGamesList />
        <p className="mt-8 text-center text-sm text-gray-500">
          <Link href="/free/lobby" className="text-gray-400 underline-offset-2 hover:text-white hover:underline">
            Back to Lobby Chat
          </Link>
        </p>
      </div>
    </div>
  );
}
