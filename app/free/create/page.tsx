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
        <h1 className="text-3xl font-bold mb-2">CREATE GAME</h1>
        <p className="text-gray-400 text-sm mb-6">
          Send a private direct challenge by opponent username. Pick tempo and options, then send.
        </p>
        <DirectChallengePanel anchorId="free-create" singleStep />
      </div>
    </div>
  );
}
