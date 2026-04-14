import type { NexusHubPayload } from "@/lib/nexus/types";
import NexusActionCards from "@/components/nexus/NexusActionCards";
import NexusActiveTournaments from "@/components/nexus/NexusActiveTournaments";
import NexusHeader from "@/components/nexus/NexusHeader";
import NexusIdentitySummary from "@/components/nexus/NexusIdentitySummary";
import NexusQuickNav from "@/components/nexus/NexusQuickNav";
import NexusTesterBugReportRow from "@/components/nexus/NexusTesterBugReportRow";
import NexusRecentResults from "@/components/nexus/NexusRecentResults";
import NexusStandingContext from "@/components/nexus/NexusStandingContext";
import NexusSystemActivity from "@/components/nexus/NexusSystemActivity";

/** DOM order = tab order (header → modules → quick nav). Flex order restores visual: header, nav, content. */
export default function NexusShell({ data }: { data: NexusHubPayload }) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-6 lg:gap-7">
        <NexusHeader meta={data.meta} className="order-1" />

        <div className="order-3 nexus-shell-enter flex flex-col gap-6 lg:gap-7">
          {/* Command strip: identity + next actions */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-stretch lg:gap-6">
            <div className="order-1 lg:col-span-5">
              <NexusIdentitySummary data={data.identity} />
            </div>
            <div className="order-2 lg:col-span-7">
              <NexusActionCards cards={data.actionCards} />
            </div>
          </div>

          {/* Band 2: tournaments + standing */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
            <div className="order-3 lg:col-span-6">
              <NexusActiveTournaments state={data.activeTournaments} />
            </div>
            <div className="order-4 lg:col-span-6">
              <NexusStandingContext state={data.standingContext} />
            </div>
          </div>

          {/* Band 3: system activity + recent results (supporting context) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
            <div className="order-5 lg:col-span-6">
              <NexusSystemActivity state={data.systemActivity} />
            </div>
            <div className="order-6 lg:col-span-6">
              <NexusRecentResults state={data.recentResults} />
            </div>
          </div>

          {data.meta.placeholdersUsed.length > 0 ? (
            <p className="text-center text-[11px] text-gray-600 transition-opacity duration-150" role="status">
              Modules awaiting data: {data.meta.placeholdersUsed.join(", ")}
            </p>
          ) : null}
        </div>

        <div className="order-2 flex flex-col gap-2">
          <NexusTesterBugReportRow />
          <NexusQuickNav items={data.quickNav} />
        </div>
      </div>
    </main>
  );
}
