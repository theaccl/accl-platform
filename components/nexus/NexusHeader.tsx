import type { NexusEcosystem } from "@/lib/nexus/getNexusData";

export default function NexusHeader({
  ecosystem,
  engagement,
  seasonHighlight,
  gamesToday,
}: {
  ecosystem: NexusEcosystem;
  engagement?: { rankedPlayers: number; liveGames: number; activeTournaments: number };
  /** Phase 22 — optional season line (derived, no hype). */
  seasonHighlight?: string;
  /** Phase 26 — optional derived count (public / growth surfaces). */
  gamesToday?: number;
}) {
  const k12 = ecosystem === "k12";
  return (
    <header
      className={`rounded-2xl border px-5 pt-3 pb-4 ${
        k12
          ? "border-[#1f3a5a] bg-gradient-to-r from-[#0f1a2b] to-[#14263f]"
          : "border-[#2a3442] bg-gradient-to-r from-[#111723] to-[#1a2231]"
      }`}
    >
      <p className="text-xs uppercase tracking-widest text-gray-400">ACCL Nexus</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-white">Live Command Center</h1>
          {seasonHighlight ? (
            <p className={`text-xs mt-1 ${k12 ? "text-cyan-200/80" : "text-amber-200/80"}`}>{seasonHighlight}</p>
          ) : null}
        </div>
        <span className={`text-xs uppercase px-2 py-1 rounded-full border ${k12 ? "text-cyan-200 border-cyan-500/40 bg-cyan-900/20" : "text-red-300 border-red-500/40 bg-red-900/20"}`}>
          {ecosystem === "k12" ? "K-12 Scoped" : "18+ Scoped"}
        </span>
      </div>
      {engagement ? (
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-gray-400">
          <span>
            Ranked players: <span className="text-gray-200">{engagement.rankedPlayers}</span>
          </span>
          <span>
            Live games: <span className="text-gray-200">{engagement.liveGames}</span>
          </span>
          <span>
            Active tournaments: <span className="text-gray-200">{engagement.activeTournaments}</span>
          </span>
          {!k12 && typeof gamesToday === "number" ? (
            <span>
              Games today (activity): <span className="text-gray-200">{gamesToday}</span>
            </span>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

