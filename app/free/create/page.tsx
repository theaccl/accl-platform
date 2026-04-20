import { Suspense } from "react";
import { redirect } from "next/navigation";
import NavigationBar from "@/components/NavigationBar";
import { DirectChallengePanel } from "@/components/DirectChallengePanel";
import { getSupabaseUserFromCookies } from "@/lib/auth/getSupabaseUserFromCookies";
import { buildLoginRedirect } from "@/lib/nexus/nexusRouteHelpers";

export default async function FreeCreateGamePage() {
  const user = await getSupabaseUserFromCookies();
  if (!user) {
    redirect(buildLoginRedirect("/free/create"));
  }

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-2">Direct challenge</h1>
        <p className="text-gray-400 text-sm mb-6">
          Invite a specific player by username — private, not the public queue. For open seats and the queue, use a{' '}
          <a href="/free/lobby" className="text-sky-400 underline hover:text-sky-300">
            mode room
          </a>
          .
        </p>
        <Suspense fallback={<p className="text-sm text-gray-500">Loading challenge form…</p>}>
          <DirectChallengePanel anchorId="free-create" singleStep />
        </Suspense>
      </div>
    </div>
  );
}
