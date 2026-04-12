import ExpandablePanel from "@/components/nexus/ExpandablePanel";
import PlayerIdentityCard from "@/components/nexus/PlayerIdentityCard";
import type { NexusSeasonContext, NexusWinner } from "@/lib/nexus/getNexusData";
import { seasonIdForUtc } from "@/lib/season/seasonManager";
import type { NexusGlobalEvent } from "@/lib/events/globalEventBuilder";

type Props = {
  winners: NexusWinner[];
  k12?: boolean;
  seasonContext?: NexusSeasonContext;
  globalEvents?: NexusGlobalEvent[];
};

type SeasonGroup = {
  season: string;
  rows: NexusWinner[];
};

function buildSeasons(winners: NexusWinner[]): SeasonGroup[] {
  const by = new Map<string, NexusWinner[]>();
  for (const w of winners) {
    const key = seasonIdForUtc(w.utc);
    const list = by.get(key) ?? [];
    list.push(w);
    by.set(key, list);
  }
  return [...by.entries()]
    .map(([season, rows]) => ({
      season,
      rows: rows.sort((a, b) => Date.parse(b.utc) - Date.parse(a.utc)).slice(0, 8),
    }))
    .sort((a, b) => b.season.localeCompare(a.season));
}

function championRoleForUser(uid: string | null | undefined, ctx: NexusSeasonContext | undefined): "current" | "defending" | "former" | null {
  if (!ctx || !uid) return null;
  if (ctx.current_champion_user_id === uid) return "current";
  if (ctx.defending_champion_user_id === uid) return "defending";
  if (ctx.former_champion_user_ids.includes(uid)) return "former";
  return null;
}

export default function SeasonalArchiveModule({ winners, k12 = false, seasonContext, globalEvents = [] }: Props) {
  const seasons = buildSeasons(winners);
  const latest = seasons[0];
  const collapsed = (
    <div>
      {!latest ? <p className="text-sm text-gray-400">No seasonal data available.</p> : null}
      {latest && latest.rows[0] ? (
        <div className={`rounded-lg border p-2 space-y-2 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
          <p className="text-xs text-gray-400">{latest.season}</p>
          <PlayerIdentityCard
            label={latest.rows[0].player_label}
            tier={latest.rows[0].tier}
            achievement={`Seasonal champion · ${latest.season}`}
            seasonalChampion
            compact
            k12={k12}
            showVault={false}
            emphasis="high"
            championRole={championRoleForUser(latest.rows[0].winner_user_id, seasonContext)}
          />
          <p className={`text-xs ${k12 ? "text-cyan-200" : "text-red-300"}`}>
            Runner-up: {latest.rows[1]?.player_label ?? "TBD"}
          </p>
          {globalEvents.some((e) => e.headline_importance === "mega") ? (
            <p className="text-[10px] text-gray-500 mt-2">
              {k12
                ? "Season showcase moments tie into the same season window when schedules align."
                : "Season finale and major event surfaces use the same season clock when tournaments align."}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
  const expanded = (
    <div className="space-y-3 max-h-80 overflow-auto pr-1">
      {seasons.length === 0 ? <p className="text-sm text-gray-400">No seasonal data available.</p> : null}
      {seasons.map((s) => (
        <div key={s.season} className={`rounded-lg border p-3 space-y-2 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
          <p className="text-xs text-gray-400">{s.season}</p>
          {s.rows[0] ? (
            <PlayerIdentityCard
              label={s.rows[0].player_label}
              tier={s.rows[0].tier}
              achievement={`Champion · ${s.season}`}
              seasonalChampion
              compact
              k12={k12}
              showVault={false}
              emphasis="high"
              championRole={championRoleForUser(s.rows[0].winner_user_id, seasonContext)}
            />
          ) : (
            <p className="text-sm text-white">Champion: TBD</p>
          )}
          <div className="mt-1 text-sm text-white">
            <p>Runner-up: {s.rows[1]?.player_label ?? "TBD"}</p>
            <p className="text-gray-300 text-xs mt-1">Placements: {s.rows.slice(2).map((r) => r.player_label).join(", ") || "—"}</p>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <ExpandablePanel
      title="Seasonal Archive"
      subtitle="Half-year seasons (S1/S2) — champions from recorded results"
      statusText={`${seasons.length} seasons`}
      collapsed={collapsed}
      expanded={expanded}
      k12={k12}
    />
  );
}
