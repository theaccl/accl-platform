function fmtVerificationRef(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      hour12: false,
    }) + " UTC";
  } catch {
    return "—";
  }
}

export default function IntegrityStatusBar({
  k12,
  generatedAt,
  activeTournamentsCount,
  liveGamesCount,
}: {
  k12: boolean;
  generatedAt: string;
  activeTournamentsCount: number;
  liveGamesCount: number;
}) {
  const monitoring = liveGamesCount > 0 || activeTournamentsCount > 0;
  const headline = k12
    ? "Games are fair and monitored"
    : monitoring
      ? "Active integrity monitoring"
      : "All systems normal";
  const sub = k12
    ? "Results are checked before they count"
    : "Review processes in place — tournament results verified before payouts";

  return (
    <div
      className={`rounded-xl border px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs ${
        k12 ? "border-[#2a4564] bg-[#0f1a2a]" : "border-[#2a3442] bg-[#111723]"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${k12 ? "bg-cyan-400/90" : "bg-emerald-500/90"}`} aria-hidden />
        <span className={`font-medium ${k12 ? "text-cyan-100" : "text-gray-100"}`}>{headline}</span>
        <span className="text-gray-500 hidden sm:inline">·</span>
        <span className="text-gray-400">{sub}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
        {!k12 && activeTournamentsCount > 0 ? (
          <span>
            Tournaments monitored: <span className="text-gray-300">{activeTournamentsCount}</span>
          </span>
        ) : null}
        <span className="hidden sm:inline">
          Snapshot: <span className="text-gray-400">{fmtVerificationRef(generatedAt)}</span>
        </span>
      </div>
    </div>
  );
}
