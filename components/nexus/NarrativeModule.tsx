import ExpandablePanel from "@/components/nexus/ExpandablePanel";
import type { NexusNarrativeBundle, NexusSeasonContext } from "@/lib/nexus/buildNexusSeasonNarrative";
import type { NexusGlobalEvent } from "@/lib/events/globalEventBuilder";

export default function NarrativeModule({
  narrative,
  season,
  k12,
  globalEvents = [],
}: {
  narrative: NexusNarrativeBundle;
  season: NexusSeasonContext;
  k12: boolean;
  globalEvents?: NexusGlobalEvent[];
}) {
  const h = narrative.headline;
  const top = narrative.events.slice(0, 6);
  const collapsed = (
    <div className="space-y-2">
      <p className={`text-sm font-semibold leading-snug ${k12 ? "text-cyan-100" : "text-amber-100/95"}`}>
        {k12 ? h.headline_k12 : h.headline}
      </p>
      {h.subline ? <p className="text-[11px] text-gray-400 line-clamp-2">{h.subline}</p> : null}
      <p className="text-[10px] text-gray-500">
        Season {season.current_season.season_id} · {season.current_season.status}
      </p>
      {globalEvents.some((e) => e.headline_importance === "mega") ? (
        <p className={`text-[10px] mt-1 ${k12 ? "text-cyan-200/85" : "text-amber-200/80"}`}>
          {k12 ? "Season showcase window — major events highlighted from real schedules." : "Season finale window — major events highlighted from real tournaments."}
        </p>
      ) : null}
    </div>
  );
  const expanded = (
    <div className="space-y-3 max-h-80 overflow-auto pr-1">
      <div>
        <p className={`text-sm font-semibold ${k12 ? "text-cyan-100" : "text-amber-100/95"}`}>
          {k12 ? h.headline_k12 : h.headline}
        </p>
        {h.subline ? <p className="text-[11px] text-gray-400 mt-1">{h.subline}</p> : null}
      </div>
      <div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Season window</p>
        <p className="text-xs text-gray-300">
          {season.current_season.season_id} · {season.current_season.status} · ends{" "}
          {new Date(season.current_season.end_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}{" "}
          UTC
        </p>
      </div>
      <div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Storylines (from results)</p>
        <ul className="space-y-2">
          {top.length === 0 ? <li className="text-xs text-gray-500">No extra signals yet — keep playing.</li> : null}
          {top.map((e) => (
            <li key={e.id} className={`text-xs rounded-lg border p-2 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
              {k12 ? e.message_k12 : e.message}
              <span className="block text-[10px] text-gray-500 mt-1">{e.kind.replace(/_/g, " ")}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
  return (
    <ExpandablePanel
      title="Season story"
      subtitle="Derived from real finishes — no scripted hype"
      statusText={season.current_season.season_id}
      collapsed={collapsed}
      expanded={expanded}
      k12={k12}
    />
  );
}
