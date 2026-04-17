import Link from "next/link";
import { redirect } from "next/navigation";
import NavigationBar from "@/components/NavigationBar";
import FreeActiveGamesList from "@/components/free/FreeActiveGamesList";
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
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Current games</h1>
        <p className="mb-6 text-sm text-gray-400">
          Every game where you still have an active seat — in progress, waiting for an opponent, or open seat.
        </p>
        <FreeActiveGamesList />
        <p className="mt-8 text-center text-sm text-gray-500">
          <Link href="/free" className="text-gray-400 underline-offset-2 hover:text-white hover:underline">
            Back to Free play
          </Link>
        </p>
      </div>
    </div>
  );
}
