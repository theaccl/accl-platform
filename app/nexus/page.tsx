import type { NexusEcosystem } from "@/lib/nexus/getNexusData";
import { redirect } from "next/navigation";

import NavigationBar from "@/components/NavigationBar";
import NexusBfcacheAuthGuard from "@/components/nexus/NexusBfcacheAuthGuard";
import NexusShell from "@/components/nexus/NexusShell";
import { getSupabaseUserFromCookies } from "@/lib/auth/getSupabaseUserFromCookies";
import { resolveUserNexusEcosystemFromAuthMetadata } from "@/lib/auth/resolveUserNexusEcosystem";
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
  const showAlbert = resolveUserNexusEcosystemFromAuthMetadata(user) === "adult";
  const data = await getNexusHubData(ecosystem);
  const nexusPendingMr = Number(data.nexusData.matchRequests.pendingCount) || 0;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--accl-bg-arena)] text-white antialiased">
      {/*
        Inline: lets PendingMatchRequestsBanner read the hub-fetched count on /nexus before its first
        client refresh, avoiding a duplicate match_requests round-trip. Cleared in the banner after use.
      */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{window.__accl_nexusHub={pendingMatchRequestCount:${nexusPendingMr}}}catch(e){}`,
        }}
      />
      <NexusBfcacheAuthGuard />
      <NavigationBar variant="nexusShell" />
      <NexusShell data={data} showAlbert={showAlbert} />
    </div>
  );
}
