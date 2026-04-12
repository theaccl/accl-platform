import ExpandablePanel from "@/components/nexus/ExpandablePanel";
import type { NexusStanding, NexusWinner } from "@/lib/nexus/getNexusData";

type Insight = { id: string; label: string; detail: string; tone?: "up" | "down" | "neutral" };

function trend(wins: number, games: number, streak: number) {
  const wr = games > 0 ? (wins / games) * 100 : 50;
  return Math.round((wr - 50) / 2 + streak);
}

function buildInsights(standings: NexusStanding[], winners: NexusWinner[]): Insight[] {
  const moversUp = [...standings].sort((a, b) => trend(b.wins, b.games, b.streak) - trend(a.wins, a.games, a.streak))[0];
  const moversDown = [...standings].sort((a, b) => trend(a.wins, a.games, a.streak) - trend(b.wins, b.games, b.streak))[0];
  const hottest = [...standings].sort((a, b) => b.streak - a.streak)[0];
  const active = [...standings].sort((a, b) => b.games - a.games)[0];
  const repeat = [...winners]
    .reduce((m, w) => m.set(w.player_label, (m.get(w.player_label) ?? 0) + 1), new Map<string, number>());
  const repeatTop = [...repeat.entries()].sort((a, b) => b[1] - a[1])[0];

  const out: Insight[] = [];
  if (moversUp) out.push({ id: "up", label: "Most Improved", detail: `${moversUp.username} trending up`, tone: "up" });
  if (moversDown) out.push({ id: "down", label: "Cooling", detail: `${moversDown.username} trending down`, tone: "down" });
  if (hottest) out.push({ id: "streak", label: "Hottest Streak", detail: `${hottest.username} on ${hottest.streak}W`, tone: "up" });
  if (active) out.push({ id: "active", label: "Most Active", detail: `${active.username} played ${active.games} games`, tone: "neutral" });
  if (repeatTop) out.push({ id: "repeat", label: "Repeat Champion Signal", detail: `${repeatTop[0]} won ${repeatTop[1]} recent events`, tone: "neutral" });
  return out.slice(0, 8);
}

export default function MetaInsightsModule({
  standings,
  winners,
  k12 = false,
}: {
  standings: NexusStanding[];
  winners: NexusWinner[];
  k12?: boolean;
}) {
  const insights = buildInsights(standings, winners);
  const collapsed = (
    <div className="space-y-2">
      {insights.slice(0, 5).map((i) => (
        <div key={i.id} className={`rounded-lg border p-2 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
          <p className="text-xs text-gray-400">{i.label}</p>
          <p className={`text-sm ${i.tone === "up" ? "text-emerald-300" : i.tone === "down" ? "text-rose-300" : "text-gray-200"}`}>{i.detail}</p>
        </div>
      ))}
      {insights.length === 0 ? <p className="text-sm text-gray-400">No meta insights yet.</p> : null}
    </div>
  );
  const expanded = (
    <div className="space-y-2 max-h-80 overflow-auto pr-1">
      {insights.map((i) => (
        <div key={`e-${i.id}`} className={`rounded-lg border p-3 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
          <p className="text-xs text-gray-400">{i.label}</p>
          <p className={`text-sm ${i.tone === "up" ? "text-emerald-300" : i.tone === "down" ? "text-rose-300" : "text-gray-200"}`}>{i.detail}</p>
        </div>
      ))}
      {insights.length === 0 ? <p className="text-sm text-gray-400">No meta insights yet.</p> : null}
    </div>
  );
  return (
    <ExpandablePanel
      title="Meta Insights"
      subtitle="Ecosystem momentum and pattern signals"
      statusText={`${insights.length} signals`}
      collapsed={collapsed}
      expanded={expanded}
      k12={k12}
    />
  );
}
