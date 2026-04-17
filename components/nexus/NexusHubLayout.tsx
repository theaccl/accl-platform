"use client";

import type { NexusHubPayload } from "@/lib/nexus/types";
import NexusActionCards from "@/components/nexus/NexusActionCards";
import NexusActiveTournaments from "@/components/nexus/NexusActiveTournaments";
import NexusHeader from "@/components/nexus/NexusHeader";
import NexusOpenGamesColumn from "@/components/nexus/NexusOpenGamesColumn";
import NexusPlayerSnapshotCard from "@/components/nexus/NexusPlayerSnapshotCard";
import NexusRankingsCollapsible from "@/components/nexus/NexusRankingsCollapsible";
import NexusRecentResults from "@/components/nexus/NexusRecentResults";
import NexusStandingContext from "@/components/nexus/NexusStandingContext";
import NexusSystemActivity from "@/components/nexus/NexusSystemActivity";
import NexusTesterBugReportRow from "@/components/nexus/NexusTesterBugReportRow";
import NexusIdentitySummary from "@/components/nexus/NexusIdentitySummary";

/** P3.5 — hub: NEXUS header → Next actions → modules (no duplicate chrome rows under the title). */
export default function NexusHubLayout({ data }: { data: NexusHubPayload }) {
  return (
    <div className="flex min-w-0 flex-col gap-5 sm:gap-6 lg:gap-8">
      <NexusHeader meta={data.meta} />

      <div className="min-w-0">
        <NexusActionCards cards={data.actionCards} />
      </div>

      <div className="min-w-0 border-t border-white/[0.06] pt-5 sm:pt-6">
        <NexusPlayerSnapshotCard />
      </div>

      <div className="min-w-0 border-t border-white/[0.06] pt-4 sm:pt-5">
        <NexusRankingsCollapsible>
          <div className="min-w-0">
            <NexusStandingContext state={data.standingContext} />
          </div>
        </NexusRankingsCollapsible>
      </div>

      <div className="min-w-0 border-t border-white/[0.06] pt-5 sm:pt-6">
        <div className="grid min-w-0 grid-cols-1 gap-4 gap-y-5 lg:grid-cols-12 lg:gap-6 lg:gap-y-6">
          <div className="min-w-0 lg:col-span-12">
            <NexusOpenGamesColumn />
          </div>
          <div className="min-w-0 lg:col-span-12">
            <NexusActiveTournaments state={data.activeTournaments} />
          </div>
          <div className="min-w-0 lg:col-span-6">
            <NexusIdentitySummary data={data.identity} variant="nameOnly" />
          </div>
          <div className="min-w-0 lg:col-span-6">
            <NexusSystemActivity state={data.systemActivity} />
          </div>
          <div className="min-w-0 lg:col-span-12">
            <NexusRecentResults state={data.recentResults} />
          </div>
        </div>
      </div>

      {data.meta.placeholdersUsed.length > 0 ? (
        <p className="text-center text-[11px] text-gray-600 transition-opacity duration-150" role="status">
          Modules awaiting data: {data.meta.placeholdersUsed.join(", ")}
        </p>
      ) : null}

      <div className="flex min-w-0 flex-col gap-4 border-t border-white/[0.06] pt-5 sm:pt-6">
        <NexusTesterBugReportRow />
      </div>
    </div>
  );
}
