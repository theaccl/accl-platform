import type { NexusWinner } from "@/lib/nexus/getNexusData";
import ExpandablePanel from "@/components/nexus/ExpandablePanel";
import PlayerIdentityCard from "@/components/nexus/PlayerIdentityCard";
import type { NexusGlobalEvent } from "@/lib/events/globalEventBuilder";

function fmtUtc(utc: string) {
  return new Date(utc).toUTCString();
}

export default function RecentWinnersModule({
  winners,
  k12 = false,
  globalEvents = [],
}: {
  winners: NexusWinner[];
  k12?: boolean;
  globalEvents?: NexusGlobalEvent[];
}) {
  const newest = [...winners].sort((a, b) => Date.parse(b.utc) - Date.parse(a.utc));
  const topEarners = [...winners]
    .reduce((acc, row) => {
      const key = row.player_label;
      if (!k12) acc.set(key, (acc.get(key) ?? 0) + row.amount_won);
      return acc;
    }, new Map<string, number>());
  const earners = [...topEarners.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([player, amount]) => ({ player, amount }));

  const tournamentWins = newest.filter((w) => w.tier === "Tournament");
  const otherFinishes = newest.filter((w) => w.tier !== "Tournament");

  const collapsed = (
    <div className="space-y-2 max-h-56 overflow-auto pr-1">
      {newest.length === 0 ? <p className="text-sm text-gray-400">No payouts recorded.</p> : null}
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">Recent</p>
      {globalEvents.length > 0 ? (
        <p className="text-[10px] text-gray-500 mb-1">
          {k12
            ? "Top performers can surface again in season showcase lines when schedules align."
            : "Championship and finale surfaces reference the same verified results feed."}
        </p>
      ) : null}
      {newest.slice(0, 8).map((w) => (
        <div key={w.id} className={`rounded-lg border p-2 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
          <PlayerIdentityCard
            label={w.player_label}
            tier={w.tier}
            earnings={k12 ? 0 : w.amount_won}
            achievement={`${w.event_name} • ${fmtUtc(w.utc)}`}
            tournamentWins={w.tier === "Tournament" || w.payout_category === "tournament_win" ? 1 : 0}
            compact
            k12={k12}
            showVault={false}
            emphasis={!k12 && w.amount_won >= 20 ? "high" : "base"}
          />
          {!k12 ? (
            <p className="text-[10px] text-gray-500 mt-1">
              {w.payout_category === "tournament_win" ? "Tournament win" : "Match finish"} · Structured event rewards
            </p>
          ) : (
            <p className="text-[10px] text-cyan-200/70 mt-1">Recognition result</p>
          )}
        </div>
      ))}
    </div>
  );
  const expanded = (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-gray-400 mb-1">Tournament & advancement</p>
        <div className="space-y-2 max-h-40 overflow-auto pr-1">
          {tournamentWins.length === 0 ? <p className="text-sm text-gray-400">None in this slice.</p> : null}
          {tournamentWins.map((w) => (
            <div key={`tw-${w.id}`} className={`rounded-lg border p-2 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
              <p className="text-sm text-white">{w.player_label}</p>
              <p className="text-xs text-gray-400">{w.event_name}</p>
              {!k12 ? <p className="text-xs text-red-300">${w.amount_won} · {fmtUtc(w.utc)}</p> : <p className="text-xs text-cyan-200">Recorded · {fmtUtc(w.utc)}</p>}
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-gray-400 mb-1">Other finishes</p>
        <div className="space-y-2 max-h-40 overflow-auto pr-1">
          {otherFinishes.length === 0 ? <p className="text-sm text-gray-400">None in this slice.</p> : null}
          {otherFinishes.map((w) => (
            <div key={`of-${w.id}`} className={`rounded-lg border p-2 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
              <p className="text-sm text-white">{w.player_label}</p>
              <p className="text-xs text-gray-400">{w.event_name}</p>
              {!k12 ? <p className="text-xs text-red-300">${w.amount_won} · {fmtUtc(w.utc)}</p> : <p className="text-xs text-cyan-200">Recorded · {fmtUtc(w.utc)}</p>}
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-gray-400 mb-1">Payout History (all)</p>
        <div className="space-y-2 max-h-60 overflow-auto pr-1">
          {newest.length === 0 ? <p className="text-sm text-gray-400">No payouts recorded.</p> : null}
          {newest.map((w) => (
            <div key={`hist-${w.id}`} className={`rounded-lg border p-2 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
              <p className="text-sm text-white">{w.player_label}</p>
              <p className="text-xs text-gray-400">{w.event_name} • {w.tier}</p>
              {!k12 ? (
                <p className="text-xs text-red-300">${w.amount_won} • {fmtUtc(w.utc)}</p>
              ) : (
                <p className="text-xs text-cyan-200">Recognition • {fmtUtc(w.utc)}</p>
              )}
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-gray-400 mb-1">Cumulative (top)</p>
        <div className="space-y-2">
          {earners.length === 0 ? <p className="text-sm text-gray-400">No earnings recorded.</p> : null}
          {earners.map((e) => (
            <div key={e.player} className={`rounded-lg border p-2 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
              <PlayerIdentityCard
                label={e.player}
                earnings={e.amount}
                tier="Earner"
                achievement={!k12 ? `Total: $${e.amount}` : "Season standing"}
                compact
                k12={k12}
                showVault={false}
                emphasis="high"
              />
            </div>
          ))}
        </div>
      </div>
      {!k12 ? <p className="text-[10px] text-gray-500">Confirmed payout record — not a statement of withdrawable funds.</p> : null}
    </div>
  );

  return (
    <ExpandablePanel
      title="Payout & Winners"
      subtitle="Wins, advancement, and seasonal totals"
      statusText={`${winners.length} payouts`}
      collapsed={collapsed}
      expanded={expanded}
      k12={k12}
    />
  );
}
