"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { NexusActivityItem } from "@/lib/nexus/getNexusData";
import ExpandablePanel from "@/components/nexus/ExpandablePanel";
import Link from "next/link";
import ShareCard from "@/components/nexus/ShareCard";
import { trackGrowthEvent } from "@/lib/public/funnelTracking";

function formatUtc(utc: string) {
  const d = new Date(utc);
  return (
    d.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }) + " UTC"
  );
}

function isEventSignal(message: string) {
  return /final|semi|quarter|tier|championship|event|tournament/i.test(message);
}

/** Subtle “return” relevance — not every row; avoids noise. */
function isRetentionSignal(message: string, kind: string) {
  if (kind === "system") return false;
  const m = message.toLowerCase();
  if (kind === "tournament") return true;
  if (m.includes("changed to active")) return true;
  if (m.includes("changed to finished")) return true;
  if (/final|semi|championship|streak/.test(m)) return true;
  return false;
}

function isGovernanceSignal(kind: string) {
  return kind === "system";
}

function buildGovernanceSeed(generatedAt: string, ecosystem: "adult" | "k12"): NexusActivityItem[] {
  const utc = generatedAt || new Date().toISOString();
  if (ecosystem === "k12") {
    return [
      { id: "sys-gov-k12-a", kind: "system", message: "Games are fair and monitored.", utc },
      { id: "sys-gov-k12-b", kind: "system", message: "Results are checked before they count.", utc },
    ];
  }
  return [
    { id: "sys-gov-a1", kind: "system", message: "Tournament results verified for standings.", utc },
    { id: "sys-gov-a2", kind: "system", message: "Integrity review completed (system cycle).", utc },
    { id: "sys-gov-a3", kind: "system", message: "Season progression synced.", utc },
  ];
}

const MAX_FEED_ITEMS = 50;
const REALTIME_DEBOUNCE_MS = 120;

function mergeGovernance(initial: NexusActivityItem[], generatedAt: string, ecosystem: "adult" | "k12") {
  const seed = buildGovernanceSeed(generatedAt, ecosystem);
  return [...seed, ...initial].sort((a, b) => Date.parse(b.utc) - Date.parse(a.utc)).slice(0, MAX_FEED_ITEMS);
}

function dedupeKey(item: NexusActivityItem) {
  return `${item.kind}:${item.message}:${item.game_id ?? ""}:${item.narrative_kind ?? ""}`;
}

export default function ActivityFeedModule({
  initial,
  ecosystem,
  generatedAt,
  publicSurface = false,
}: {
  initial: NexusActivityItem[];
  ecosystem: "adult" | "k12";
  generatedAt: string;
  /** Landing / public Nexus — no governance seed rows, no realtime subscription. */
  publicSurface?: boolean;
}) {
  const [items, setItems] = useState(() =>
    publicSurface
      ? [...initial].sort((a, b) => Date.parse(b.utc) - Date.parse(a.utc)).slice(0, MAX_FEED_ITEMS)
      : mergeGovernance(initial, generatedAt, ecosystem)
  );
  const [shareOpenId, setShareOpenId] = useState<string | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<NexusActivityItem[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seededRef = useRef(false);

  const flushQueue = useCallback(() => {
    flushTimerRef.current = null;
    const batch = queueRef.current;
    queueRef.current = [];
    if (batch.length === 0) return;
    setItems((prev) => {
      const merged = [...batch, ...prev];
      const seen = new Set<string>();
      const out: NexusActivityItem[] = [];
      for (const item of merged) {
        const k = dedupeKey(item);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(item);
      }
      return out.sort((a, b) => Date.parse(b.utc) - Date.parse(a.utc)).slice(0, MAX_FEED_ITEMS);
    });
  }, []);

  const push = useCallback(
    (item: NexusActivityItem) => {
      const k = dedupeKey(item);
      if (seenRef.current.has(k)) return;
      seenRef.current.add(k);
      if (seenRef.current.size > 600) {
        seenRef.current = new Set([...seenRef.current].slice(-320));
      }
      queueRef.current.push(item);
      if (flushTimerRef.current == null) {
        flushTimerRef.current = setTimeout(flushQueue, REALTIME_DEBOUNCE_MS);
      }
    },
    [flushQueue]
  );

  useLayoutEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    for (const i of items) {
      seenRef.current.add(dedupeKey(i));
    }
  }, [items]);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current != null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (publicSurface) return;
    const ecoFilter = `ecosystem_scope=eq.${ecosystem}`;
    const channel = supabase
      .channel(`nexus-activity-${ecosystem}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: ecoFilter }, (payload) => {
        const row = (payload.new ?? payload.old) as { id?: string; status?: string; updated_at?: string };
        const status = String(row.status ?? "");
        if (!["active", "finished"].includes(status)) return;
        push({
          id: `rt-${String(row.id ?? Math.random())}-${Date.now()}`,
          kind: "live",
          message: `Game ${String(row.id ?? "").slice(0, 6)} changed to ${status}`,
          utc: String(row.updated_at ?? new Date().toISOString()),
          game_id: String(row.id ?? ""),
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: ecoFilter }, (payload) => {
        const row = (payload.new ?? payload.old) as { id?: string; name?: string; status?: string; updated_at?: string };
        const label = String(row.name ?? `Tournament ${String(row.id ?? "").slice(0, 6)}`);
        push({
          id: `rt-t-${String(row.id ?? Math.random())}-${Date.now()}`,
          kind: "tournament",
          message: `${label} now ${String(row.status ?? "updated")}`,
          utc: String(row.updated_at ?? new Date().toISOString()),
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "finished_game_analysis_jobs" }, (payload) => {
        const row = (payload.new ?? payload.old) as { id?: string; status?: string; updated_at?: string };
        const status = String(row.status ?? "");
        if (!["completed", "failed"].includes(status)) return;
        push({
          id: `rt-q-${String(row.id ?? Math.random())}-${Date.now()}`,
          kind: "analysis",
          message: `Analysis job ${String(row.id ?? "").slice(0, 6)} ${status}`,
          utc: String(row.updated_at ?? new Date().toISOString()),
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "nexus_announcements", filter: ecoFilter }, (payload) => {
        const row = (payload.new ?? payload.old) as { id?: string; title?: string; created_at?: string };
        push({
          id: `rt-n-${String(row.id ?? Math.random())}-${Date.now()}`,
          kind: "announcement",
          message: `Announcement: ${String(row.title ?? "System update")}`,
          utc: String(row.created_at ?? new Date().toISOString()),
        });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [ecosystem, push, publicSurface]);

  const content = useMemo(
    () => {
      const spectateGamePath = (gameId: string) =>
        ecosystem === "k12" ? `/game/${gameId}?spectate=1&eco=k12` : `/game/${gameId}?spectate=1`;
      return (
      <div className="space-y-3 sm:space-y-2 max-h-72 overflow-y-auto overflow-x-hidden touch-pan-y pr-1 -mr-1">
        {items.map((a) => {
          const eventTone = isEventSignal(a.message);
          const govTone = isGovernanceSignal(a.kind);
          const narrativeTone = a.kind === "narrative";
          const globalTone = a.kind === "global_event" || a.feed_priority === "global";
          const returnTone = isRetentionSignal(a.message, a.kind);
          const card = (
            <div
              className={`rounded-lg border p-3 sm:p-2 min-h-[48px] ${
                govTone
                  ? ecosystem === "k12"
                    ? "border-cyan-500/30 bg-[#0f2235]"
                    : "border-slate-600/50 bg-[#0f141c]"
                  : globalTone
                    ? ecosystem === "k12"
                      ? "border-emerald-500/35 bg-[#0f2a24]"
                      : "border-amber-500/40 bg-[#1c140e]"
                    : narrativeTone
                    ? ecosystem === "k12"
                      ? "border-cyan-500/35 bg-[#102a3d]"
                      : "border-violet-500/35 bg-[#1a1424]"
                    : eventTone
                      ? ecosystem === "k12"
                        ? "border-cyan-500/40 bg-[#13324a]"
                        : "border-red-500/40 bg-[#24161f]"
                      : returnTone
                        ? ecosystem === "k12"
                          ? "border-cyan-600/50 bg-[#0d2838]"
                          : "border-amber-700/50 bg-[#1c1410]"
                        : ecosystem === "k12"
                          ? "border-[#2a4564] bg-[#0f1b2a]"
                          : "border-[#2a3442] bg-[#0f1420]"
              }`}
            >
              <p className="text-xs text-gray-200 flex items-center gap-2">
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${govTone ? "" : "animate-pulse"} ${ecosystem === "k12" ? "bg-cyan-300" : "bg-red-400"}`}
                />
                {a.message}
              </p>
              {govTone ? (
                <p className="text-[11px] text-gray-400">System · governance signal</p>
              ) : null}
              {globalTone ? (
                <p className="text-[11px] text-gray-400">System · major event signal</p>
              ) : null}
              {narrativeTone ? (
                <p className="text-[11px] text-gray-400">
                  Narrative signal{a.narrative_kind ? ` · ${String(a.narrative_kind).replace(/_/g, " ")}` : ""}
                </p>
              ) : null}
              {returnTone && !eventTone ? (
                <p className="text-[11px] text-amber-200/90">Return signal</p>
              ) : null}
              {eventTone ? <p className="text-[11px] text-gray-300">Event Spotlight</p> : null}
              <p className={`text-[11px] ${ecosystem === "k12" ? "text-cyan-200" : "text-red-300"}`}>{formatUtc(a.utc)}</p>
              {(eventTone || a.game_id) && !govTone ? (
                <button
                  type="button"
                  onClick={() => setShareOpenId((curr) => (curr === a.id ? null : a.id))}
                  className="mt-2 inline-flex min-h-[44px] min-w-[44px] items-center px-2 -ml-2 text-[11px] text-gray-300 underline touch-manipulation active:opacity-80"
                >
                  Share
                </button>
              ) : null}
              {shareOpenId === a.id ? (
                <div className="mt-2">
                  <ShareCard
                    title="Nexus Feed Highlight"
                    subtitle={a.kind}
                    leftLabel={a.message.slice(0, 30)}
                    rightLabel={a.game_id ? "Live Match" : "System"}
                    resultLabel={eventTone ? "Event Update" : "System Update"}
                    keyStat={`Source: ${a.kind}`}
                    timestamp={a.utc}
                    linkUrl={
                      a.game_id
                        ? `/share/game/${a.game_id}${ecosystem === "k12" ? "?eco=k12" : ""}`
                        : "/nexus"
                    }
                    k12={ecosystem === "k12"}
                    onCopyLink={() =>
                      trackGrowthEvent({
                        event_type: "share_click",
                        ecosystem,
                        meta: { source: "nexus_feed", game_id: a.game_id ?? null },
                      })
                    }
                    highlightMeta={{
                      game_id: a.game_id ?? null,
                      event_type: eventTone ? "final" : "recap",
                      timestamp: a.utc,
                      tags: eventTone ? ["final", "broadcast"] : ["activity"],
                    }}
                  />
                </div>
              ) : null}
            </div>
          );
          return a.game_id ? (
            <Link key={a.id} href={spectateGamePath(a.game_id!)} prefetch className="block transition hover:opacity-95 active:scale-[0.995]">
              {card}
            </Link>
          ) : (
            <div key={a.id}>{card}</div>
          );
        })}
      </div>
      );
    },
    [items, ecosystem, shareOpenId]
  );

  return (
    <ExpandablePanel
      title="Live Activity Feed"
      subtitle={publicSurface ? "Major events and championship updates (public)" : "Operational activity and system governance signals"}
      statusText={`${items.length} items`}
      collapsed={content}
      expanded={content}
      k12={ecosystem === "k12"}
    />
  );
}

