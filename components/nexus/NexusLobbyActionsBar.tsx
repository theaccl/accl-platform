import Link from "next/link";
import { nexusPrestigeCard } from "@/components/nexus/nexusShellTheme";

const btn =
  "flex min-h-[48px] min-w-[120px] flex-1 items-center justify-center rounded-xl border border-red-900/60 bg-red-950/35 px-3 text-center text-sm font-semibold text-red-50 transition hover:border-red-700 hover:bg-red-950/55";

/**
 * Sticky action strip for Free play — links only; no new routes.
 */
export default function NexusLobbyActionsBar() {
  return (
    <div
      className="sticky bottom-0 z-30 border-t border-white/[0.08] bg-[#07080c]/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm"
      data-testid="nexus-lobby-actions-bar"
    >
      <div
        className={`mx-auto flex max-w-6xl flex-wrap items-stretch justify-center gap-2 sm:gap-3 ${nexusPrestigeCard} p-2.5 sm:p-3`}
      >
        <Link href="/free/create" className={btn} data-testid="nexus-lobby-create-game">
          Create game
        </Link>
        <a href="#free-find-match-anchor" className={btn} data-testid="nexus-lobby-find-match">
          Find match
        </a>
        <Link href="/free/challenges" className={btn} data-testid="nexus-lobby-direct-challenge">
          Direct challenges
        </Link>
      </div>
    </div>
  );
}
