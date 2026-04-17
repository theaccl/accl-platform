"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const cardBase =
  "group flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl border px-4 py-3.5 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07080c] sm:min-h-[56px] sm:py-4";

function cardClass(active: boolean): string {
  if (active) {
    return `${cardBase} border-red-500/75 bg-gradient-to-b from-red-950/55 to-[#151922] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07)]`;
  }
  return `${cardBase} border-white/[0.12] bg-[#10131a] text-gray-100 hover:border-red-500/40 hover:bg-[#161b26]`;
}

/**
 * Primary navigation for authenticated /free — high-contrast actions only (no dead-end CTAs).
 */
export function FreeTopActionStrip() {
  const pathname = usePathname() ?? "";

  const createActive = pathname.startsWith("/free/create");
  const activeGamesActive = pathname === "/free/active" || pathname.startsWith("/free/active/");
  const challengesActive = pathname.startsWith("/free/challenges");

  return (
    <header className="border-b border-white/[0.09] bg-[#07080c]">
      <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-5">
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 sm:mb-4">
          Free play
        </p>
        <nav
          className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4"
          aria-label="Free play main actions"
          data-testid="free-top-action-strip"
        >
          <Link
            href="/free/create"
            className={cardClass(createActive)}
            aria-current={createActive ? "page" : undefined}
            data-testid="free-top-create-game"
          >
            <span className="text-sm font-semibold sm:text-base">Create game</span>
            <span className="max-w-[14rem] text-[11px] font-normal leading-snug text-gray-500 group-hover:text-gray-400 sm:text-xs">
              Open seat or custom match
            </span>
          </Link>
          <Link
            href="/free/active"
            className={cardClass(activeGamesActive)}
            aria-current={activeGamesActive ? "page" : undefined}
            data-testid="free-top-active-games"
          >
            <span className="text-sm font-semibold sm:text-base">Active games</span>
            <span className="max-w-[14rem] text-[11px] font-normal leading-snug text-gray-500 group-hover:text-gray-400 sm:text-xs">
              Resume games in progress
            </span>
          </Link>
          <Link
            href="/free/challenges"
            className={cardClass(challengesActive)}
            aria-current={challengesActive ? "page" : undefined}
            data-testid="free-top-direct-challenges"
          >
            <span className="text-sm font-semibold sm:text-base">Direct challenges</span>
            <span className="max-w-[14rem] text-[11px] font-normal leading-snug text-gray-500 group-hover:text-gray-400 sm:text-xs">
              Invite a specific player
            </span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
