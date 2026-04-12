import type { NexusUpcomingEvent } from "@/lib/nexus/getNexusData";
import ExpandablePanel from "@/components/nexus/ExpandablePanel";
import PayoutStructureCard from "@/components/nexus/PayoutStructureCard";

export default function UpcomingEventsModule({ items, k12 = false }: { items: NexusUpcomingEvent[]; k12?: boolean }) {
  const list = (
    <div className="space-y-2">
      {items.map((e) => (
        <div key={e.id} className={`rounded-lg border p-2 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
          <p className="text-sm text-white">{e.title}</p>
          <p className="text-xs text-gray-400">{e.event_type}</p>
          <p className={`text-xs ${k12 ? "text-cyan-200" : "text-red-300"}`}>{new Date(e.utc_start).toUTCString()}</p>
          {!k12 && e.economics ? (
            <p className="text-[11px] text-gray-500 mt-1">
              Entry ${e.economics.entry_fee_usd} · Pool ${e.economics.prize_pool_usd} · Lock aligned to start
            </p>
          ) : k12 ? (
            <p className="text-[11px] text-cyan-200/70 mt-1">Schedule only — no buy-in on this surface</p>
          ) : null}
        </div>
      ))}
    </div>
  );
  const expanded = (
    <div className="space-y-3">
      {list}
      {items[0] ? (
        <PayoutStructureCard economics={items[0].economics} k12={k12} title="Next event economics" />
      ) : null}
    </div>
  );
  return (
    <ExpandablePanel
      title="Upcoming Events (UTC)"
      subtitle="Time-locked schedule — economics when available"
      collapsed={list}
      expanded={expanded}
      k12={k12}
    />
  );
}
