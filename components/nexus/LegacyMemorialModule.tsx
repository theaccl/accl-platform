import ExpandablePanel from "@/components/nexus/ExpandablePanel";
import type { NexusAnnouncement, NexusWinner } from "@/lib/nexus/getNexusData";

type Props = {
  announcements: NexusAnnouncement[];
  winners: NexusWinner[];
  k12?: boolean;
};

function legacyRows(announcements: NexusAnnouncement[], winners: NexusWinner[]) {
  const memorial = announcements.filter((a) => /memorial|legacy|tribute|honor/i.test(`${a.title} ${a.body}`)).slice(0, 6);
  const milestones = [...winners]
    .sort((a, b) => b.amount_won - a.amount_won)
    .slice(0, 4)
    .map((w) => ({
      id: `milestone-${w.id}`,
      title: "Legacy Highlight",
      body: `${w.player_label} claimed $${w.amount_won} in ${w.event_name}`,
      utc: w.utc,
    }));
  return { memorial, milestones };
}

export default function LegacyMemorialModule({ announcements, winners, k12 = false }: Props) {
  const { memorial, milestones } = legacyRows(announcements, winners);
  const collapsed = (
    <div className={`rounded-lg border p-2 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
      <p className="text-sm text-white">Legacy & Memorials</p>
      <p className="text-xs text-gray-400">Historical milestones and memorial events.</p>
    </div>
  );
  const expanded = (
    <div className="space-y-3 max-h-80 overflow-auto pr-1">
      <div>
        <p className="text-xs text-gray-400 mb-1">Memorial Events</p>
        {memorial.length === 0 ? <p className="text-sm text-gray-400">No memorial events recorded.</p> : null}
        {memorial.map((m) => (
          <div key={m.id} className={`rounded-lg border p-2 mb-2 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
            <p className="text-sm text-white">{m.title}</p>
            <p className="text-xs text-gray-300">{m.body}</p>
          </div>
        ))}
      </div>
      <div>
        <p className="text-xs text-gray-400 mb-1">Legacy Highlights</p>
        {milestones.length === 0 ? <p className="text-sm text-gray-400">No legacy highlights yet.</p> : null}
        {milestones.map((m) => (
          <div key={m.id} className={`rounded-lg border p-2 mb-2 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
            <p className="text-sm text-white">{m.title}</p>
            <p className={`text-xs ${k12 ? "text-cyan-200" : "text-red-300"}`}>{m.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <ExpandablePanel
      title="Legacy & Memorials"
      subtitle="Respectful permanence across seasons"
      statusText={`${memorial.length + milestones.length} entries`}
      collapsed={collapsed}
      expanded={expanded}
      k12={k12}
    />
  );
}
