import ExpandablePanel from "@/components/nexus/ExpandablePanel";

export default function GovernanceModule({
  k12,
  activeTournaments,
  recentFinishes14d,
  generatedAt,
}: {
  k12: boolean;
  activeTournaments: number;
  recentFinishes14d: number;
  generatedAt: string;
}) {
  const snapshot = (() => {
    try {
      return new Date(generatedAt).toUTCString();
    } catch {
      return "—";
    }
  })();

  const collapsed = (
    <p className="text-xs text-gray-400 leading-relaxed py-1">
      {k12 ? "How your games stay fair and fair to count." : "Integrity & governance — high-level, non-sensitive."}
    </p>
  );

  const expanded = k12 ? (
    <div className="space-y-4 text-xs text-gray-300">
      <section>
        <p className="text-[11px] uppercase tracking-wide text-cyan-200/80 mb-1">Fair play</p>
        <ul className="list-disc list-inside space-y-1 text-gray-300">
          <li>Games are fair and monitored.</li>
          <li>Results are checked before they count.</li>
        </ul>
      </section>
      <section>
        <p className="text-[11px] uppercase tracking-wide text-cyan-200/80 mb-2">What happens next</p>
        <ul className="list-disc list-inside space-y-2 sm:space-y-1 text-gray-300">
          <li>Finished games update your standing when ready.</li>
          <li>Big events may take a moment to appear — that is normal.</li>
        </ul>
      </section>
      <section>
        <p className="text-[11px] uppercase tracking-wide text-cyan-200/80 mb-1">Activity</p>
        <p className="text-gray-400">Active tournaments: {activeTournaments}</p>
        <p className="text-[10px] text-gray-500 mt-1">Nexus snapshot: {snapshot}</p>
      </section>
    </div>
  ) : (
    <div className="space-y-5 sm:space-y-4 text-xs text-gray-300 leading-relaxed">
      <section>
        <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">A. System integrity</p>
        <ul className="list-disc list-inside space-y-2 sm:space-y-1">
          <li>Games are monitored for fair play.</li>
          <li>Tournament results are verified before payout.</li>
        </ul>
      </section>
      <section>
        <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">B. Review process</p>
        <ul className="list-disc list-inside space-y-2 sm:space-y-1">
          <li>Flagged games may undergo review.</li>
          <li>Results are confirmed before finalization.</li>
        </ul>
        <p className="text-[10px] text-gray-500 mt-2">No case detail, names, or triggers are shown here.</p>
      </section>
      <section>
        <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">C. System health</p>
        <ul className="list-none space-y-2 sm:space-y-1">
          <li>Active tournaments: {activeTournaments}</li>
          <li>Recorded finishes (14d): {recentFinishes14d}</li>
          <li>Nexus snapshot: {snapshot}</li>
        </ul>
        <p className="text-[10px] text-gray-500 mt-2">
          Aggregated counts only — not a substitute for support or appeals.
        </p>
      </section>
    </div>
  );

  return (
    <ExpandablePanel
      title="Integrity & Governance"
      subtitle={k12 ? "Simple, safe language" : "High-level transparency"}
      statusText={k12 ? "K–12" : "info"}
      collapsed={collapsed}
      expanded={expanded}
      k12={k12}
    />
  );
}
