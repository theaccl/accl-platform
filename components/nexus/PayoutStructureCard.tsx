import type { TournamentEconomicsSnapshot } from "@/lib/nexus/tournamentEconomics";

function fmtLock(utc: string | null) {
  if (!utc) return "—";
  try {
    return new Date(utc).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false }) + " UTC";
  } catch {
    return "—";
  }
}

export default function PayoutStructureCard({
  economics,
  k12,
  title = "Economics",
}: {
  economics: TournamentEconomicsSnapshot | null | undefined;
  k12: boolean;
  title?: string;
}) {
  if (k12) {
    return (
      <div className="rounded-lg border border-[#2a4564] bg-[#0f1b2a] p-3 overflow-hidden break-words">
        <p className="text-[11px] uppercase tracking-wide text-cyan-200/80 mb-1">{title}</p>
        <p className="text-xs text-gray-300 leading-relaxed">
          School events use recognition and skill growth on this surface. Cash entry and adult prize details are not shown in K–12 Nexus.
        </p>
      </div>
    );
  }

  if (!economics) {
    return (
      <div className="rounded-lg border border-[#2a3442] bg-[#0f1420] p-3 text-xs text-gray-400 overflow-hidden break-words">
        Prize structure details will appear when this event is linked to recorded economics.
      </div>
    );
  }

  const src = economics.source === "inferred" ? "Illustrative tier model" : "Recorded event fields";

  return (
    <div className="rounded-lg border border-[#2a3442] bg-[#0f1420] p-3 space-y-2 overflow-hidden break-words">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{title}</p>
      <ul className="text-xs text-gray-200 space-y-1.5 sm:space-y-1">
        <li>Entry: ${economics.entry_fee_usd}</li>
        <li>Prize pool (model): ${economics.prize_pool_usd}</li>
        {economics.first_advance_usd != null ? <li>1st advance reward (model): ${economics.first_advance_usd}</li> : null}
        <li>Bracket size: {economics.bracket_size}</li>
        <li>Lock / start: {fmtLock(economics.lock_utc)}</li>
        <li className="text-gray-400 pt-1">{economics.payout_structure_label}</li>
        <li className="text-gray-400">{economics.reward_type_label}</li>
      </ul>
      <p className="text-[10px] text-gray-500 border-t border-[#273246] pt-2">{economics.incomplete_event_note}</p>
      <p className="text-[10px] text-gray-600">{src} — confirm before paying entry.</p>
    </div>
  );
}
