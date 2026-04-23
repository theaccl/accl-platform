import Link from "next/link";

import { nexusPrestigeCard } from "@/components/nexus/nexusShellTheme";



const btn =

  "flex min-h-[48px] min-w-[120px] flex-1 items-center justify-center rounded-xl border border-red-900/60 bg-red-950/35 px-3 text-center text-sm font-semibold text-red-50 transition hover:border-red-700 hover:bg-red-950/55";



const btnSecondary =

  "flex min-h-[48px] min-w-[120px] flex-1 items-center justify-center rounded-xl border border-white/[0.12] bg-[#141820] px-3 text-center text-sm font-semibold text-gray-200 transition hover:border-sky-500/40 hover:bg-[#1a2230]";

const btnWatch =

  "flex min-h-[48px] min-w-[120px] flex-1 items-center justify-center rounded-xl border border-violet-500/45 bg-violet-950/35 px-3 text-center text-sm font-semibold text-violet-50 transition hover:border-violet-400/55 hover:bg-violet-950/55";



type NexusLobbyActionsBarProps = {

  /** Scroll target for the watch / spectate block (mode rooms). */

  watchSpectatorHref?: string;

  watchSpectatorLabel?: string;

  /** Public open-seat + queue (scroll target on pages that embed `FreePlayMatchPanel`). */

  publicGameHref?: string;

  /** Label for the scroll link (defaults to “Queue” — not only “Create game”). */

  publicGameScrollLabel?: string;

  /** Private invite by username — not the public queue. */

  directChallengeHref?: string;

  /** Incoming / outgoing challenge inbox. */

  challengesHref?: string;

};



/**

 * Sticky action strip for Free play — public queue vs direct challenge are separate.

 */

export default function NexusLobbyActionsBar({

  watchSpectatorHref,

  watchSpectatorLabel = "Watch live",

  publicGameHref = "#free-find-match-anchor",

  publicGameScrollLabel = "Queue",

  directChallengeHref = "/free/create",

  challengesHref = "/free/challenges",

}: NexusLobbyActionsBarProps) {

  return (

    <div

      className="sticky bottom-0 z-30 border-t border-white/[0.08] bg-[#07080c]/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm"

      data-testid="nexus-lobby-actions-bar"

    >

      <div

        className={`mx-auto flex max-w-6xl flex-wrap items-stretch justify-center gap-2 sm:gap-3 ${nexusPrestigeCard} p-2.5 sm:p-3`}

      >

        {watchSpectatorHref ? (
          <a
            href={watchSpectatorHref}
            className={btnWatch}
            data-testid="nexus-lobby-watch-spectator"
          >
            {watchSpectatorLabel}
          </a>
        ) : null}

        <a href={publicGameHref} className={btn} data-testid="nexus-lobby-public-game">

          {publicGameScrollLabel}

        </a>

        <Link href={directChallengeHref} className={btnSecondary} data-testid="nexus-lobby-direct-challenge">

          Direct challenge

        </Link>

        <Link href={challengesHref} className={btnSecondary} data-testid="nexus-lobby-challenges-inbox">

          Challenges

        </Link>

      </div>

    </div>

  );

}

