import type { NexusStanding } from "@/lib/nexus/getNexusData";
import ExpandablePanel from "@/components/nexus/ExpandablePanel";
import PlayerIdentityCard from "@/components/nexus/PlayerIdentityCard";
import Link from "next/link";

export default function StandingsPreview({
  rows,
  k12 = false,
  economyFunnelHint,
}: {
  rows: NexusStanding[];
  k12?: boolean;
  economyFunnelHint?: string;
}) {
  const top = rows.slice(0, 10);
  const body = (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-500 pb-1">
        <Link href="/tournaments/join" className={k12 ? "text-cyan-200 underline" : "text-red-200 underline"}>
          {k12 ? "School-safe tournaments" : "Ready for your first tournament?"}
        </Link>
        <span className="text-gray-600"> · </span>
        <span className="text-gray-400">Tiers reflect results — climb to unlock the next bracket.</span>
      </p>
      {economyFunnelHint ? <p className="text-[11px] text-gray-500 pb-1">{economyFunnelHint}</p> : null}
      {top.map((r) => (
        <PlayerIdentityCard
          key={r.user_id}
          label={`#${r.rank} ${r.username}`}
          rating={r.rating}
          tier={r.tier}
          earnings={r.earned}
          streak={r.streak}
          standingRank={r.rank}
          peakRating={r.rating}
          achievement={`${r.wins}W • ${r.games}G`}
          compact
          k12={k12}
          showVault={false}
        />
      ))}
    </div>
  );
  return (
    <ExpandablePanel
      title="Standings Preview"
      subtitle="Top leaderboard scan — progression sits behind consistent results"
      statusText={`${rows.length} ranked`}
      collapsed={body}
      expanded={body}
      k12={k12}
    />
  );
}

