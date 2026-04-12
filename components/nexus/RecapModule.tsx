import Link from "next/link";
import ExpandablePanel from "@/components/nexus/ExpandablePanel";
import ShareCard from "@/components/nexus/ShareCard";
import type { NexusWinner } from "@/lib/nexus/getNexusData";

function eventRecap(winners: NexusWinner[]) {
  const byEvent = new Map<string, NexusWinner[]>();
  for (const w of winners) {
    const rows = byEvent.get(w.event_name) ?? [];
    rows.push(w);
    byEvent.set(w.event_name, rows);
  }
  const topEvent = [...byEvent.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (!topEvent) return null;
  const [name, rows] = topEvent;
  const sorted = [...rows].sort((a, b) => b.amount_won - a.amount_won);
  return { name, champion: sorted[0], runnerUp: sorted[1] ?? null, totalPayout: sorted.reduce((s, r) => s + r.amount_won, 0) };
}

export default function RecapModule({
  winners,
  k12 = false,
  championshipRecapAvailable = false,
}: {
  winners: NexusWinner[];
  k12?: boolean;
  /** Phase 24 — championship lifecycle reached recap with verified results */
  championshipRecapAvailable?: boolean;
}) {
  const latest = winners[0] ?? null;
  const ev = eventRecap(winners);
  const collapsed = (
    <div className="space-y-2">
      {!latest ? <p className="text-sm text-gray-400">No recap available yet.</p> : null}
      {latest ? (
        <div className={`rounded-lg border p-2 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
          {championshipRecapAvailable ? (
            <p className={`text-[10px] mb-1 ${k12 ? "text-cyan-200/85" : "text-amber-200/85"}`}>
              {k12 ? "Season showcase recap available" : "Championship recap available"}
            </p>
          ) : null}
          <p className="text-xs text-gray-400">Match Recap</p>
          <p className="text-sm text-white">{latest.player_label} won • {latest.event_name}</p>
          <p className={`text-xs ${k12 ? "text-cyan-200" : "text-red-300"}`}>${latest.amount_won} • {new Date(latest.utc).toUTCString()}</p>
        </div>
      ) : null}
    </div>
  );
  const expanded = (
    <div className="space-y-3">
      {latest ? (
        <ShareCard
          title="Match Recap"
          subtitle={latest.event_name}
          leftLabel={latest.player_label}
          rightLabel="Opponent"
          resultLabel={`RESULT • ${latest.tier}`}
          keyStat={`Payout: $${latest.amount_won}`}
          timestamp={latest.utc}
          linkUrl={typeof window !== "undefined" ? `${window.location.origin}/finished/${latest.id}` : `/finished/${latest.id}`}
          k12={k12}
          highlightMeta={{ game_id: latest.id, event_type: "recap", timestamp: latest.utc, tags: ["final", "result"] }}
        />
      ) : (
        <p className="text-sm text-gray-400">No recap available yet.</p>
      )}
      <p className="text-[11px] text-gray-500">
        <Link href="/trainer/lab" className={k12 ? "text-cyan-200/90 underline" : "text-red-200/90 underline"}>
          Trainer lab
        </Link>{" "}
        — review practice positions after the game (not for live events).
      </p>
      {ev ? (
        <ShareCard
          title="Event Recap"
          subtitle={ev.name}
          leftLabel={ev.champion.player_label}
          rightLabel={ev.runnerUp?.player_label ?? "Runner-up TBD"}
          resultLabel="Champion Crowned"
          keyStat={`Total Payout: $${ev.totalPayout}`}
          timestamp={ev.champion.utc}
          linkUrl="/tournaments"
          k12={k12}
          highlightMeta={{ game_id: ev.champion.id, event_type: "final", timestamp: ev.champion.utc, tags: ["final", "record"] }}
        />
      ) : null}
    </div>
  );

  return (
    <ExpandablePanel
      title="Recaps"
      subtitle="Post-game and post-event summaries"
      statusText={`${winners.length} results`}
      collapsed={collapsed}
      expanded={expanded}
      k12={k12}
    />
  );
}
