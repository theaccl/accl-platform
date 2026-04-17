import type { NexusHubPayload } from "@/lib/nexus/types";
import NexusHubLayout from "@/components/nexus/NexusHubLayout";
import { nexusPrestigeRoot } from "@/components/nexus/nexusShellTheme";

/** P3: layout orchestration lives in NexusHubLayout (client); data shape unchanged. */
export default function NexusShell({ data }: { data: NexusHubPayload }) {
  return (
    <main
      className={`mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-hidden px-4 py-5 sm:px-5 sm:py-7 ${nexusPrestigeRoot}`}
    >
      <div className="nexus-shell-enter flex flex-col">
        <NexusHubLayout data={data} />
      </div>
    </main>
  );
}
