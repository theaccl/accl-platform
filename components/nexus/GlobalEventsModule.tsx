"use client";

import { memo, useMemo } from "react";
import Link from "next/link";
import ExpandablePanel from "@/components/nexus/ExpandablePanel";
import type { NexusGlobalEvent } from "@/lib/events/globalEventBuilder";

function stageLabel(e: NexusGlobalEvent, k12: boolean) {
  if (e.stage === "upcoming") return k12 ? "Scheduled" : "Upcoming";
  if (e.stage === "closing") return k12 ? "Closing window" : "Closing";
  if (e.stage === "completed") return "Completed";
  return k12 ? "Live" : "Live";
}

function typeLabel(e: NexusGlobalEvent, k12: boolean) {
  switch (e.event_type) {
    case "season_finale":
      return k12 ? "Season showcase" : "Season finale";
    case "cross_tier_showcase":
      return k12 ? "Showcase" : "Cross-tier showcase";
    case "championship_event":
      return k12 ? "Top showcase" : "Championship";
    case "redemption_spotlight":
      return k12 ? "Qualifier" : "Redemption";
    case "special_invitational":
      return k12 ? "Invited" : "Invitational";
    default:
      return "Event";
  }
}

function GlobalEventsModule({
  events,
  k12,
}: {
  events: NexusGlobalEvent[];
  k12: boolean;
}) {
  const sorted = useMemo(
    () => [...events].sort((a, b) => b.hero_priority - a.hero_priority || b.priority - a.priority),
    [events],
  );
  const top = sorted.slice(0, 3);
  const current = sorted.filter((e) => e.stage === "active" || e.stage === "closing");
  const future = sorted.filter((e) => e.stage === "upcoming");
  const past = sorted.filter((e) => e.stage === "completed").slice(0, 4);

  if (sorted.length === 0) {
    return null;
  }

  const collapsed = (
    <div className="space-y-2">
      {top.map((e) => (
        <div
          key={e.event_id}
          className={`rounded-lg border px-3 py-2 ${
            k12 ? "border-cyan-500/35 bg-[#0f2235]" : "border-amber-500/30 bg-[#1a1418]"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">{typeLabel(e, k12)}</p>
              <p className={`text-sm font-semibold leading-snug ${k12 ? "text-cyan-50" : "text-amber-50"}`}>
                {k12 ? e.title_k12 : e.title}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {stageLabel(e, k12)} · {e.lifecycle_state}
              </p>
              {!k12 && e.ecosystem_scope === "adult" && e.sponsor_label ? (
                <p className="text-[10px] text-gray-500 mt-1">
                  {e.sponsor_tag ? <span className="text-gray-500">{e.sponsor_tag} · </span> : null}
                  <span className="text-gray-400">{e.sponsor_label}</span>
                </p>
              ) : null}
            </div>
            <span
              className={`text-[10px] shrink-0 px-2 py-0.5 rounded border ${
                e.headline_importance === "mega"
                  ? k12
                    ? "border-cyan-400/60 text-cyan-100"
                    : "border-amber-400/40 text-amber-100"
                  : "border-gray-600 text-gray-300"
              }`}
            >
              {e.headline_importance === "mega" ? (k12 ? "Spotlight" : "Finale") : e.headline_importance === "high" ? "Major" : "Event"}
            </span>
          </div>
          <Link
            href="/tournaments/active"
            className={`inline-block mt-2 text-[11px] underline ${k12 ? "text-cyan-200" : "text-amber-200/90"}`}
          >
            View / watch
          </Link>
        </div>
      ))}
    </div>
  );

  const expanded = (
    <div className="space-y-4 max-h-80 overflow-auto pr-1">
      {current.length > 0 ? (
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">Current</p>
          <ul className="space-y-2">
            {current.map((e) => (
              <li
                key={`c-${e.event_id}`}
                className={`rounded-lg border p-2 ${k12 ? "border-cyan-500/30 bg-[#0f1b2a]" : "border-[#3a2a1a] bg-[#16100c]"}`}
              >
                <p className="text-xs font-semibold">{k12 ? e.title_k12 : e.title}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {typeLabel(e, k12)} · {stageLabel(e, k12)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {future.length > 0 ? (
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">Upcoming</p>
          <ul className="space-y-2">
            {future.map((e) => (
              <li
                key={`f-${e.event_id}`}
                className={`rounded-lg border p-2 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}
              >
                <p className="text-xs font-medium">{k12 ? e.title_k12 : e.title}</p>
                <p className="text-[10px] text-gray-500">{typeLabel(e, k12)}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {past.length > 0 ? (
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">Completed highlights</p>
          <ul className="space-y-1">
            {past.map((e) => (
              <li key={`p-${e.event_id}`} className="text-[11px] text-gray-400">
                {k12 ? e.title_k12 : e.title}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  return (
    <ExpandablePanel
      title="Major events"
      subtitle="Structured moments from real tournaments and schedules"
      statusText={`${sorted.length} tracked`}
      collapsed={collapsed}
      expanded={expanded}
      k12={k12}
    />
  );
}

export default memo(GlobalEventsModule);
