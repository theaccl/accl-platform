import type { NexusEcosystem } from "@/lib/nexus/getNexusData";
import { redirect } from "next/navigation";

import NavigationBar from "@/components/NavigationBar";
import NexusBfcacheAuthGuard from "@/components/nexus/NexusBfcacheAuthGuard";
import NexusShell from "@/components/nexus/NexusShell";
import { getSupabaseUserFromCookies } from "@/lib/auth/getSupabaseUserFromCookies";
import { getNexusHubData } from "@/lib/nexus/getNexusHubData";
import { buildLoginRedirect } from "@/lib/nexus/nexusRouteHelpers";

/** Authenticated-only; no static shell for signed-out users (Back/direct URL must re-check auth). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function NexusPage({
  searchParams,
}: {
  searchParams: Promise<{ ecosystem?: string }>;
}) {
  const user = await getSupabaseUserFromCookies();
  if (!user) {
    redirect(buildLoginRedirect("/nexus"));
  }

  const sp = await searchParams;
  const ecosystem: NexusEcosystem = String(sp?.ecosystem ?? "").toLowerCase() === "k12" ? "k12" : "adult";
  const data = await getNexusHubData(ecosystem);

  return (
    <div className="flex min-h-screen flex-col bg-[#07080c] text-white antialiased">
      <NexusBfcacheAuthGuard />
      <NavigationBar variant="nexusShell" />
      <NexusShell data={data} />
    </div>
  );
}
