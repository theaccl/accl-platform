import type { NexusTournament } from "@/lib/nexus/getNexusData";
import ExpandablePanel from "@/components/nexus/ExpandablePanel";
import PayoutStructureCard from "@/components/nexus/PayoutStructureCard";
import Link from "next/link";

function fmtLock(utc: string | null) {
  if (!utc) return "—";
  try {
    return (
      new Date(utc).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false }) + " UTC"
    );
  } catch {
    return "—";
  }
}

export default function ActiveTournamentsModule({
  tournaments,
  k12 = false,
}: {
  tournaments: NexusTournament[];
  k12?: boolean;
}) {
  const collapsed = (
    <div className="space-y-2">
      {tournaments.length === 0 ? <p className="text-sm text-gray-400">No active tournaments.</p> : null}
      {tournaments.map((t) => (
        <div key={t.id} className={`rounded-lg border p-2 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
          <p className="text-sm text-white">{t.name}</p>
          <p className="text-xs text-gray-400">{t.tier} • {t.round_status}</p>
          {!k12 && t.economics ? (
            <p className="text-[11px] text-gray-500 mt-1">
              Entry ${t.economics.entry_fee_usd} · Pool ${t.economics.prize_pool_usd} · Lock {fmtLock(t.economics.lock_utc)}
            </p>
          ) : k12 ? (
            <p className="text-[11px] text-cyan-200/80 mt-1">School-safe bracket — no cash shown</p>
          ) : null}
        </div>
      ))}
    </div>
  );
  const expanded = (
    <div className="space-y-3">
      {tournaments.map((t) => (
        <div key={t.id} className={`rounded-xl border p-3 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
          <p className="text-white font-semibold">{t.name}</p>
          <p className="text-xs text-gray-400 mt-1">
            {t.tier} • {t.stage} • {t.participants} players
          </p>
          {!k12 ? <p className="text-xs text-red-300 mt-1">Round: {t.round_status}</p> : null}
          <div className="mt-2">
            <PayoutStructureCard economics={t.economics} k12={k12} title="Bracket economics" />
          </div>
          <p className="mt-2 text-[11px]">
            <Link href="/tournaments/join" className={k12 ? "text-cyan-200 underline" : "text-red-200 underline"}>
              View registration
            </Link>
            {!k12 && t.economics ? (
              <span className="text-gray-500"> · Prize details available before entry</span>
            ) : null}
          </p>
        </div>
      ))}
    </div>
  );
  return (
    <ExpandablePanel
      title="Active Tournaments"
      subtitle="Current brackets — entry and pool where applicable"
      statusText={`${tournaments.length} active`}
      collapsed={collapsed}
      expanded={expanded}
      k12={k12}
    />
  );
}
