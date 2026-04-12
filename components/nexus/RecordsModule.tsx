import ExpandablePanel from "@/components/nexus/ExpandablePanel";
import type { NexusStanding, NexusWinner } from "@/lib/nexus/getNexusData";
import PlayerIdentityCard from "@/components/nexus/PlayerIdentityCard";

type Props = {
  standings: NexusStanding[];
  winners: NexusWinner[];
  k12?: boolean;
};

type RecordRow = {
  id: string;
  title: string;
  player: string;
  value: string;
  occurred: string;
  rating: number | null;
  tier: string | null;
  streak: number | null;
  earned: number | null;
};

function top<T>(items: T[], score: (item: T) => number) {
  return [...items].sort((a, b) => score(b) - score(a))[0] ?? null;
}

function buildRecords(standings: NexusStanding[], winners: NexusWinner[]): RecordRow[] {
  const highest = top(standings, (s) => s.rating);
  const streak = top(standings, (s) => s.streak);
  const mostWins = top(standings, (s) => s.wins);
  const largestPayout = top(winners, (w) => w.amount_won);
  const fastAdv = top(standings, (s) => (s.games > 0 ? s.wins / s.games : 0));

  const rows: Array<RecordRow | null> = [
    highest
      ? {
          id: "highest-rating",
          title: "Highest Rating",
          player: highest.username,
          value: `${highest.rating}`,
          occurred: "Current Era",
          rating: highest.rating,
          tier: highest.tier,
          streak: highest.streak,
          earned: highest.earned,
        }
      : null,
    streak
      ? {
          id: "longest-streak",
          title: "Longest Win Streak",
          player: streak.username,
          value: `${streak.streak} wins`,
          occurred: "Current Era",
          rating: streak.rating,
          tier: streak.tier,
          streak: streak.streak,
          earned: streak.earned,
        }
      : null,
    mostWins
      ? {
          id: "most-wins",
          title: "Most Tournament Wins",
          player: mostWins.username,
          value: `${mostWins.wins} wins`,
          occurred: "Current Era",
          rating: mostWins.rating,
          tier: mostWins.tier,
          streak: mostWins.streak,
          earned: mostWins.earned,
        }
      : null,
    largestPayout
      ? {
          id: "largest-payout",
          title: "Largest Payout",
          player: largestPayout.player_label,
          value: `$${largestPayout.amount_won}`,
          occurred: new Date(largestPayout.utc).toISOString().slice(0, 10),
          rating: null,
          tier: largestPayout.tier,
          streak: null,
          earned: largestPayout.amount_won,
        }
      : null,
    fastAdv
      ? {
          id: "fast-advancement",
          title: "Fastest Advancement",
          player: fastAdv.username,
          value: `${Math.round((fastAdv.wins / Math.max(1, fastAdv.games)) * 100)}% win rate`,
          occurred: "Current Era",
          rating: fastAdv.rating,
          tier: fastAdv.tier,
          streak: fastAdv.streak,
          earned: fastAdv.earned,
        }
      : null,
  ];
  return rows.filter(Boolean) as RecordRow[];
}

function heldForDays(occurred: string) {
  const ts = Date.parse(occurred);
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, Math.floor((Date.now() - ts) / 86_400_000));
}

export default function RecordsModule({ standings, winners, k12 = false }: Props) {
  const records = buildRecords(standings, winners);
  const collapsed = (
    <div className="space-y-2">
      {records.length === 0 ? <p className="text-sm text-gray-400">No records yet.</p> : null}
      {records.slice(0, 4).map((r) => (
        <div key={r.id} className={`rounded-lg border p-2 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
          <p className="text-xs text-gray-400">{r.title}</p>
          <PlayerIdentityCard
            label={r.player}
            rating={r.rating}
            tier={r.tier}
            streak={r.streak}
            earnings={r.earned}
            achievement={r.value}
            compact
            k12={k12}
            showVault={false}
            emphasis="high"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Held for {heldForDays(r.occurred)} days • {r.id === "highest-rating" || r.id === "longest-streak" ? "Still active" : "Historical"}
          </p>
        </div>
      ))}
    </div>
  );
  const expanded = (
    <div className="space-y-2 max-h-72 overflow-auto pr-1">
      {records.length === 0 ? <p className="text-sm text-gray-400">No records yet.</p> : null}
      {records.map((r) => (
        <div key={r.id} className={`rounded-lg border p-3 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
          <p className="text-xs text-gray-400">{r.title}</p>
          <PlayerIdentityCard
            label={r.player}
            rating={r.rating}
            tier={r.tier}
            streak={r.streak}
            earnings={r.earned}
            achievement={r.value}
            compact
            k12={k12}
            showVault={false}
            emphasis="high"
          />
          <p className="text-xs text-gray-300">
            Set: {r.occurred} • Held for {heldForDays(r.occurred)} days • {r.id === "highest-rating" || r.id === "longest-streak" ? "Still active" : "Historical"}
          </p>
        </div>
      ))}
    </div>
  );
  return (
    <ExpandablePanel
      title="Records"
      subtitle="System-defining prestige markers"
      statusText={`${records.length} records`}
      collapsed={collapsed}
      expanded={expanded}
      k12={k12}
    />
  );
}
