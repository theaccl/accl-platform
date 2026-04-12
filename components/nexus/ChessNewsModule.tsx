import ExpandablePanel from "@/components/nexus/ExpandablePanel";

type Item = { id: string; title: string; blurb: string; utc: string };

export default function ChessNewsModule({ items }: { items: Item[] }) {
  const list = (
    <div className="space-y-2">
      {items.map((n) => (
        <div key={n.id} className="rounded-lg border border-[#2a3442] bg-[#0f1420] p-2">
          <p className="text-sm text-white">{n.title}</p>
          <p className="text-xs text-gray-400">{n.blurb}</p>
          <p className="text-xs text-red-300">{new Date(n.utc).toUTCString()}</p>
        </div>
      ))}
    </div>
  );
  return <ExpandablePanel title="Chess News & Highlights" subtitle="External chess layer (placeholder)" collapsed={list} expanded={list} />;
}

