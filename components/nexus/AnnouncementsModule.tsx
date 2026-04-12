import type { NexusAnnouncement } from "@/lib/nexus/getNexusData";
import ExpandablePanel from "@/components/nexus/ExpandablePanel";

export default function AnnouncementsModule({ items }: { items: NexusAnnouncement[] }) {
  const list = (
    <div className="space-y-2 max-h-52 overflow-auto pr-1">
      {items.map((a) => (
        <div key={a.id} className="rounded-lg border border-[#2a3442] bg-[#0f1420] p-2">
          <p className="text-sm text-white">{a.title}</p>
          <p className="text-xs text-gray-400">{a.body}</p>
        </div>
      ))}
    </div>
  );
  return <ExpandablePanel title="Announcements" subtitle="Curated system notices" collapsed={list} expanded={list} />;
}

